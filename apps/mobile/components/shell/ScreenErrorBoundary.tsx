import { Component, type ReactNode } from "react";
import CrashScreen from "./CrashScreen";

type Props = {
  children: ReactNode;
  /** Where "Go to Home" leads from this navigator — back to the tabs from a stacked screen,
   *  or to the Home tab from another tab. */
  onHome: () => void;
};

type State = { error: Error | null };

// One per screen, attached through each navigator's `screenLayout` (see app/_layout and
// app/(tabs)/_layout). A screen that throws while rendering is swapped for the crash screen
// in place — the navigator above it, its history, and the tab bar stay exactly as they were,
// so every way out (✕, back, a tab) still works. The root ErrorBoundary is only the fallback
// for a crash in a layout itself.
export default class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <CrashScreen
        error={error}
        onRetry={this.reset}
        onHome={() => {
          this.reset();
          this.props.onHome();
        }}
      />
    );
  }
}
