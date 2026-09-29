# Google integration

ADPULSE reads from Google Ads (REST, `searchStream` with GAQL) and, optionally, GA4 (Admin API for property
discovery, Data API `runReport` for landing-page engagement). It never calls a mutate endpoint: campaigns,
budgets, bids, keywords, targeting and negative keywords are only ever _suggested_.

The real providers live in `packages/core/src/providers/google-ads.provider.ts`,
`google-analytics.provider.ts` and `google-oauth.ts`. `INTEGRATION_MODE=mock` swaps them for deterministic
mock providers with the same interface, which is what local development, CI and the demo seed use.

## What you need

| Item                           | Notes                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Cloud project           | With **Google Ads API**, **Google Analytics Admin API** and **Google Analytics Data API** enabled                                                                                                                                                                 |
| OAuth consent screen           | External or Internal. Scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/adwords`, `https://www.googleapis.com/auth/analytics.readonly`. The `adwords` scope is sensitive and requires Google verification before non-test users can connect. |
| OAuth client                   | Type _Web application_                                                                                                                                                                                                                                            |
| Google Ads developer token     | From the API Center of a Google Ads **manager** account. A test token only works against test accounts; request Basic or Standard access for production data.                                                                                                     |
| Manager customer ID (optional) | Needed when the connecting user reaches client accounts through an MCC                                                                                                                                                                                            |

## Configuration

1. In the OAuth client, add both authorized redirect URIs (they must match exactly, including scheme and port):
   - `<API_URL>/api/v1/auth/google/callback` — Google sign-in
   - `<API_URL>/api/v1/integrations/google/callback` — Ads / GA4 connection

   Locally `API_URL` is `http://localhost:3000`. Behind the production nginx proxy it is the public web origin,
   e.g. `https://app.example.com`.

2. Set the environment:

   ```dotenv
   INTEGRATION_MODE=google
   GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=<client secret>
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
   GOOGLE_INTEGRATION_REDIRECT_URI=http://localhost:3000/api/v1/integrations/google/callback
   GOOGLE_ADS_DEVELOPER_TOKEN=<developer token>
   GOOGLE_ADS_LOGIN_CUSTOMER_ID=<manager id without dashes, optional>
   GOOGLE_ADS_API_VERSION=v21
   ```

   With `NODE_ENV=production` the API refuses to start in `google` mode if the client ID, secret or developer
   token is missing; in development the Google option is simply shown as not configured. Never commit these
   values; in Azure they are stored in Key Vault (see `DEPLOYMENT.md`).

3. Restart the API and worker. **Integrations → Connect Google Ads** (or the onboarding wizard) now redirects to
   Google's consent screen.

## Connection flow

1. `POST /integrations/google/connect` returns the consent URL (`access_type=offline`, `prompt=consent`) with a
   random `state` nonce and a PKCE challenge. The nonce, PKCE verifier, user and organization are kept in a
   signed, HttpOnly cookie that expires after 10 minutes.
2. Google redirects to the integration callback. The API accepts it only if the signed cookie is valid and its
   nonce matches `state`; user and organization are taken from the cookie, never from the query string. It
   exchanges the code with the PKCE verifier, encrypts the refresh token with AES-256-GCM (`ENCRYPTION_KEY`)
   and stores only the ciphertext. Access tokens are derived from the refresh token when needed and are never
   persisted.
3. The browser lands on `/integrations?connected=GOOGLE_ADS`; the user selects which accessible accounts to
   import (manager accounts are listed but have no metrics of their own). For GA4, the user links properties.
4. Selecting accounts queues an initial import of `INITIAL_SYNC_DAYS`; afterwards the scheduler syncs daily at
   `SYNC_LOCAL_HOUR` in the organization time zone, re-reading `SYNC_LOOKBACK_DAYS` for late conversions.
5. Disconnecting revokes the grant at Google and deletes the encrypted token.

If a refresh token is revoked or expires, sync jobs fail with an authorization error, the connection moves to
`NEEDS_ATTENTION` (which also raises an integration alert), and the Integrations page offers **Reconnect**.

## Data imported

| Report            | GAQL resource                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts          | `customer_client` (level ≤ 1)                                                                                                                |
| Structure         | `campaign`, `ad_group`, `keyword_view` (non-removed)                                                                                         |
| Daily performance | `campaign` (incl. impression share), `ad_group`, `keyword_view`, `search_term_view`, `geographic_view`, `landing_page_view`, device segments |
| Location names    | `geo_target_constant`                                                                                                                        |
| GA4               | Sessions, engagement rate and bounce rate by landing page                                                                                    |

Requests carry the `developer-token` header and, when configured, `login-customer-id`. Quota (`429`,
`RESOURCE_EXHAUSTED`) and `5xx` responses are retried with exponential backoff and honour `Retry-After`.

## Troubleshooting

| Symptom                             | Likely cause                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch`             | The redirect URI in `.env` differs from the OAuth client configuration                                                        |
| `DEVELOPER_TOKEN_NOT_APPROVED`      | Test developer token used against a production account                                                                        |
| `USER_PERMISSION_DENIED`            | Missing or wrong `GOOGLE_ADS_LOGIN_CUSTOMER_ID` for accounts under a manager                                                  |
| No refresh token returned           | The user previously granted access without `prompt=consent`; remove the app at myaccount.google.com/permissions and reconnect |
| `/integrations?error=access_denied` | The user declined consent                                                                                                     |

## Steps that require real credentials

Everything above except the final consent screen can be verified in mock mode. Connecting a live account,
importing real data and Google's OAuth verification of the `adwords` scope require the credentials listed in
"What you need" and cannot be exercised by the automated test suites.
