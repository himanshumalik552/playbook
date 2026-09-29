import { ErrorState, ForbiddenState } from '@adpulse/ui';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError, errorMessage } from '@/api/client';

interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  /** Rendered instead of children when the data is considered empty. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
}

export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.isForbidden) return <ForbiddenState description={error.message} />;
  if (error instanceof ApiError && error.isNotFound)
    return (
      <ErrorState
        title="Not found"
        description="This item does not exist or you no longer have access to it."
      />
    );
  return (
    <ErrorState title="Could not load this section" description={errorMessage(error)} onRetry={onRetry} />
  );
}

export function DefaultSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Stack spacing={1.25} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          variant="rounded"
          height={i === 0 ? 40 : 22}
          width={i === 0 ? '60%' : `${90 - i * 8}%`}
        />
      ))}
    </Stack>
  );
}

/** Standard rendering of a query's loading, error, empty and success states. */
export function QueryState<T>({ query, children, loading, empty, isEmpty }: QueryStateProps<T>) {
  if (query.isPending) return <>{loading ?? <DefaultSkeleton />}</>;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (empty && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
