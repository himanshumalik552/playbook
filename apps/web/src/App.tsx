import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { AuthProvider } from '@/providers/AuthProvider';
import { OrgProvider } from '@/providers/OrgProvider';
import { ThemeModeProvider } from '@/providers/ThemeModeProvider';
import { FullPageLoader } from '@/components/FullPageLoader';
import { createRouter } from '@/router';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
    },
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createRouter);
  return (
    <ThemeModeProvider>
      <SnackbarProvider
        maxSnack={3}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        autoHideDuration={4000}
      >
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <OrgProvider>
              <RouterProvider
                router={router}
                fallbackElement={<FullPageLoader />}
                future={{ v7_startTransition: true }}
              />
            </OrgProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SnackbarProvider>
    </ThemeModeProvider>
  );
}
