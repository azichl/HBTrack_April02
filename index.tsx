import React, { ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error | null;
}

class GlobalErrorBoundary extends (React.Component as any) {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
          <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl max-w-md w-full shadow-2xl">
            <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              ⚠️
            </div>
            <h1 className="text-xl font-bold mb-2">RAF Tracking</h1>
            <p className="text-slate-400 text-sm mb-4">The application encountered an unexpected issue while loading.</p>
            {this.state.error && (
              <pre className="text-xs text-red-400 bg-slate-950 p-3 rounded-lg overflow-x-auto text-left mb-6 font-mono">
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-3 bg-brand-600 hover:bg-brand-500 font-bold rounded-xl transition-all shadow-lg text-sm"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);