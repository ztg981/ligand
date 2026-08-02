import { Component } from "react";

/* ScreenBoundary — the tab content's safety net.

   Without one of these, a render error anywhere in a tab unmounts the WHOLE
   React tree: the page goes blank, nothing says why, and the only way back is
   a reload — which is also the moment unsaved work is most likely to be lost.
   A blank page is the worst possible failure because it looks identical to a
   hang, so nobody knows whether waiting will help.

   Scoped to the tab rather than the app on purpose. The nav, the sidebar and
   the sync keep working, so one broken screen costs you that screen and not
   the session, and switching tabs is enough to recover.

   `resetKey` (the active tab) clears the error, so navigating away and back
   retries rather than leaving the boundary stuck on a stale failure.

   Must be a class: componentDidCatch has no hook equivalent. */
export default class ScreenBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    // Guarded on both the key CHANGING and an error being present, so this
    // can't loop: the second pass finds no error and stops.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    // Left in deliberately. This is the only trace of what went wrong, and a
    // silently swallowed stack is how a bug like this survives for weeks.
    console.error("[Ligand] screen crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card tab-missing" role="alert">
        <div className="tab-missing-title">This view hit a problem</div>
        <p className="tab-missing-sub">
          Your data is safe and still saved — only this screen stopped. Switch
          tabs, or try it again.
        </p>
        <div className="row" style={{ gap: 8, justifyContent: "center" }}>
          <button className="btn primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          {this.props.onHome && (
            <button className="btn ghost" onClick={this.props.onHome}>
              Back to home
            </button>
          )}
        </div>
      </div>
    );
  }
}
