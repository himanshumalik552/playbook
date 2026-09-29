import { ConfirmDialog } from '@adpulse/ui';
import { useUnsavedChangesWarning } from '@/hooks/common';

export function UnsavedChangesDialog({ dirty }: { dirty: boolean }) {
  const blocker = useUnsavedChangesWarning(dirty);
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Discard unsaved changes?"
      description="You have edits on this page that have not been saved. Leaving now will discard them."
      confirmLabel="Discard changes"
      destructive
      onConfirm={() => blocker.proceed?.()}
      onClose={() => blocker.reset?.()}
    />
  );
}
