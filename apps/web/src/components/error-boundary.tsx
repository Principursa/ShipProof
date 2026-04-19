import { Component, type ReactNode } from "react";
import { Button } from "@ShipProof/ui/components/button";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="border border-destructive/20 bg-destructive/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            <p className="font-mono text-[11px] text-destructive">
              Something went wrong loading this component.
            </p>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {this.state.error.message}
          </p>
          <Button
            size="xs"
            variant="outline"
            onClick={() => this.setState({ error: null })}
            className="font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
