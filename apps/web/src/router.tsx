import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { RedirectIfSignedIn, RequireAuth, RequireOrganization } from '@/components/RouteGuards';
import { CallbackRoutes } from '@/features/auth/routes';
import { NotFoundPage, PrivacyPage, RouteErrorPage, TermsPage } from '@/features/public/StaticPages';
import { AppShell } from '@/layout/AppShell';
import { PublicLayout } from '@/layout/PublicLayout';

function page<M, K extends keyof M>(loader: () => Promise<M>, name: K): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await loader())[name] as ComponentType }) };
}

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          {
            element: <RedirectIfSignedIn />,
            children: [
              { path: '/sign-in', ...page(() => import('@/features/auth/SignInPage'), 'SignInPage') },
              { path: '/register', ...page(() => import('@/features/auth/RegisterPage'), 'RegisterPage') },
              {
                path: '/forgot-password',
                ...page(() => import('@/features/auth/PasswordPages'), 'ForgotPasswordPage'),
              },
            ],
          },
          {
            path: '/reset-password',
            ...page(() => import('@/features/auth/PasswordPages'), 'ResetPasswordPage'),
          },
          {
            path: '/verify-email',
            ...page(() => import('@/features/auth/PasswordPages'), 'VerifyEmailPage'),
          },
          ...CallbackRoutes,
        ],
      },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/terms', element: <TermsPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/onboarding',
            ...page(() => import('@/features/onboarding/OnboardingPage'), 'OnboardingPage'),
          },
          {
            element: <RequireOrganization />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { index: true, element: <Navigate to="/dashboard" replace /> },
                  {
                    path: '/dashboard',
                    ...page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
                  },
                  {
                    path: '/campaigns',
                    ...page(() => import('@/features/campaigns/CampaignsPage'), 'CampaignsPage'),
                  },
                  {
                    path: '/campaigns/:id',
                    ...page(() => import('@/features/campaigns/CampaignDetailPage'), 'CampaignDetailPage'),
                  },
                  {
                    path: '/search-terms',
                    ...page(() => import('@/features/search-terms/SearchTermsPage'), 'SearchTermsPage'),
                  },
                  { path: '/alerts', ...page(() => import('@/features/alerts/AlertsPage'), 'AlertsPage') },
                  {
                    path: '/recommendations',
                    ...page(
                      () => import('@/features/recommendations/RecommendationsPage'),
                      'RecommendationsPage',
                    ),
                  },
                  {
                    path: '/actions',
                    ...page(() => import('@/features/actions/ActionsPage'), 'ActionsPage'),
                  },
                  {
                    path: '/reports',
                    ...page(() => import('@/features/reports/ReportsPage'), 'ReportsPage'),
                  },
                  {
                    path: '/targets',
                    ...page(() => import('@/features/targets/TargetsPage'), 'TargetsPage'),
                  },
                  {
                    path: '/integrations',
                    ...page(() => import('@/features/integrations/IntegrationsPage'), 'IntegrationsPage'),
                  },
                  { path: '/team', ...page(() => import('@/features/team/TeamPage'), 'TeamPage') },
                  {
                    path: '/settings',
                    ...page(() => import('@/features/settings/SettingsPage'), 'SettingsPage'),
                  },
                  {
                    path: '/profile',
                    ...page(() => import('@/features/profile/ProfilePage'), 'ProfilePage'),
                  },
                  { path: '/admin', ...page(() => import('@/features/admin/AdminPage'), 'AdminPage') },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
