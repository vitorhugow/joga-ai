import { Component, type ErrorInfo, type ReactNode } from "react";
import { JogaButton, JogaPage } from "@/components/joga";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => void r.unregister());
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <JogaPage theme="dark" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-display font-black text-white text-xl">Algo correu mal ao carregar</p>
          <p className="text-white/50 text-sm max-w-sm">
            Isto costuma acontecer após um deploy — o cache da app ficou desactualizado.
          </p>
          <JogaButton variant="primary" onClick={this.handleRetry}>
            Actualizar app
          </JogaButton>
        </JogaPage>
      );
    }
    return this.props.children;
  }
}
