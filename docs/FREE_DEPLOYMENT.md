# Free deployment (Oracle Cloud Always Free)

Runs the full stack from `docker-compose.production.yml` on a single free VM, with a free DuckDNS subdomain and
Caddy for HTTPS. No code changes are required. See [DEPLOYMENT.md](DEPLOYMENT.md) for the general production
reference.

Serverless free tiers (Vercel, Render, Railway) do not fit this stack: the worker is a long-running BullMQ
process with Chromium, the api and worker share a report volume, and the queues need an unmetered Redis.

| Component | Service                                                                 |
| --------- | ----------------------------------------------------------------------- |
| Server    | Oracle Cloud Always Free, Ampere A1 (up to 4 OCPU / 24 GB RAM, ARM64)   |
| Domain    | [DuckDNS](https://www.duckdns.org) subdomain                            |
| HTTPS     | Caddy with automatic Let's Encrypt certificates                         |
| Data      | Postgres, Redis and report storage as Compose services / volumes on the VM |

## 1. Push the code to GitHub

Create a **private** repository. `.env` and `storage/` are already git-ignored.

```powershell
cd C:\project\PlayBook
git add .
git commit -m "Prepare for deployment"
git remote add origin https://github.com/<you>/adpulse.git
git push -u origin main
```

## 2. Create the VM

1. Sign up at [cloud.oracle.com](https://www.oracle.com/cloud/free/). A card is required for verification;
   Always Free resources are not charged.
2. **Compute → Instances → Create instance**:
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **Ampere `VM.Standard.A1.Flex`**, 4 OCPU, 24 GB RAM ("Always Free eligible")
   - SSH keys: **Generate a key pair** and download the private key
   - On "Out of capacity", choose another Availability Domain or retry later.
3. Note the instance's **public IP address**.
4. **Instance → Subnet → Default Security List → Add Ingress Rules**: source `0.0.0.0/0`, TCP ports **80**
   and **443**.

## 3. Get a domain

Sign in at [duckdns.org](https://www.duckdns.org), create a subdomain (for example `adpulse.duckdns.org`) and
point it at the VM's public IP. The rest of this guide uses `adpulse.duckdns.org`; replace it with yours.

## 4. Prepare the VM

```powershell
ssh -i C:\path\to\ssh-key.key ubuntu@<VM_PUBLIC_IP>
```

```bash
# Oracle's Ubuntu image also filters traffic with iptables
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
```

Reconnect over SSH so the `docker` group membership applies.

## 5. Configure the environment

```bash
git clone https://github.com/<you>/adpulse.git
cd adpulse
cp .env.example .env.production

openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET (must differ)
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -hex 24      # REDIS_PASSWORD

nano .env.production
```

For a private repository, `git clone` asks for your GitHub username and a
[personal access token](https://github.com/settings/tokens) as the password.

Set the following values and keep the remaining defaults:

```env
NODE_ENV=production
WEB_URL=https://adpulse.duckdns.org
API_URL=https://adpulse.duckdns.org
TRUST_PROXY=true
COOKIE_SECURE=true
SWAGGER_ENABLED=false

POSTGRES_PASSWORD=<generated>
REDIS_PASSWORD=<generated>
DATABASE_URL=postgresql://adpulse:<POSTGRES_PASSWORD>@postgres:5432/adpulse?schema=public
REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379

JWT_ACCESS_SECRET=<generated>
JWT_REFRESH_SECRET=<generated>
ENCRYPTION_KEY=<generated>

INTEGRATION_MODE=mock
STORAGE_PROVIDER=local
EMAIL_PROVIDER=console
```

**Back up `ENCRYPTION_KEY`.** Without it the stored Google refresh tokens cannot be decrypted and every
connection must be re-authorized.

## 6. Build and start

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

The first build takes roughly 10–15 minutes. The `migrate` service applies database migrations before `api` and
`worker` start.

```bash
docker compose -f docker-compose.production.yml ps          # every service should be healthy
docker compose -f docker-compose.production.yml logs -f api
```

## 7. Enable HTTPS

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

echo 'adpulse.duckdns.org {
  reverse_proxy localhost:8080
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Open `https://adpulse.duckdns.org` and register the first account.

## Optional integrations

**Email.** With `EMAIL_PROVIDER=console` nothing is sent, so password reset and email verification do not work;
registration and sign-in still do. Free SMTP options:

- Gmail with an App Password: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`
- [Brevo](https://www.brevo.com/): 300 emails per day

Set `EMAIL_PROVIDER=smtp` and the `SMTP_*` values.

**Google Ads / GA4.** Set `INTEGRATION_MODE=google` and the `GOOGLE_*` values, and register these redirect URIs
in the Google OAuth client (details in [GOOGLE_INTEGRATION.md](GOOGLE_INTEGRATION.md)):

- `https://adpulse.duckdns.org/api/v1/auth/google/callback`
- `https://adpulse.duckdns.org/api/v1/integrations/google/callback`

Apply configuration changes by rerunning the command from step 6.

## Updates

```bash
cd ~/adpulse && git pull
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

## Backups and caveats

- Schedule the `pg_dump` command from [DEPLOYMENT.md](DEPLOYMENT.md#backup-and-restore) with cron and copy the
  dumps off the VM.
- Oracle may reclaim Always Free instances that stay idle for long periods.
