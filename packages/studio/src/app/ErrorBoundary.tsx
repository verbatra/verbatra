import { Button, Icon } from "@verbatra/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly reload?: () => void;
}

export interface ErrorBoundaryState {
  readonly message: string | undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== "") {
    return error.message;
  }
  if (typeof error === "string" && error !== "") {
    return error;
  }
  return "An unknown error was thrown during render.";
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { message: undefined };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: describeError(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Verbatra Studio: a render error was caught by the error boundary.", error, info);
  }

  private readonly handleReload = (): void => {
    const { reload } = this.props;
    if (reload !== undefined) {
      reload();
      return;
    }
    window.location.reload();
  };

  override render(): ReactNode {
    const { message } = this.state;
    if (message === undefined) {
      return this.props.children;
    }
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center" role="alert">
        <div className="max-w-md">
          <Icon name="alert" size={20} className="mx-auto mb-3 text-danger" />
          <h1 className="mb-3 text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="mb-4 text-muted-foreground">
            The dashboard stopped rendering. Reloading usually clears it. If it comes back, the
            browser console has the full details.
          </p>
          <p className="mb-4 rounded-md border-s-[3px] border-danger bg-danger-soft px-4 py-3 text-start font-mono text-xs text-danger">
            {message}
          </p>
          <Button variant="primary" size="md" onClick={this.handleReload}>
            Reload the dashboard
          </Button>
        </div>
      </div>
    );
  }
}
