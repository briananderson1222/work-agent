import { Component, type ErrorInfo, type ReactNode } from 'react';

class MonitoringErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MonitoringView error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="monitoring-view"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p>Something went wrong in the monitoring view.</p>
            <button
              className="btn-secondary"
              onClick={() => this.setState({ hasError: false })}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function MonitoringViewBoundary({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <MonitoringErrorBoundary>
      {children}
    </MonitoringErrorBoundary>
  );
}
