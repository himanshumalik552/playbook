import { ErrorState } from '@adpulse/ui';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this value clears a caught error (e.g. the current route path). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <ErrorState
        title="This page ran into a problem"
        description="The error has been contained so the rest of the app keeps working. Try again, or reload the page."
        action={
          <Stack direction="row" spacing={1} justifyContent="center">
            <Button variant="contained" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </Stack>
        }
      />
    );
  }
}
