import type { RouteObject } from 'react-router-dom';
import { AcceptInvitationPage, OAuthCallbackPage } from './CallbackPages';

/** Routes reached from emails and OAuth redirects; they work whether or not the user is signed in. */
export const CallbackRoutes: RouteObject[] = [
  { path: '/auth/callback', element: <OAuthCallbackPage /> },
  { path: '/invitations/accept', element: <AcceptInvitationPage /> },
];
