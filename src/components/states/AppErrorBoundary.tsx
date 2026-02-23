import React from "react";
import { ErrorState } from "@/components/states/PageState";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string | null;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("AppErrorBoundary caught an error", { error, info });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <ErrorState
            title="Something went wrong"
            description={this.state.errorMessage ?? "The app encountered an unexpected error."}
            action={<Button onClick={this.handleReload}>Reload</Button>}
            className="w-full max-w-lg"
          />
        </div>
      );
    }

    return this.props.children;
  }
}

