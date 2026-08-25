import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React Error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 20px', fontFamily: 'sans-serif', textAlign: 'center', background: '#0f172a', color: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>RAF Tracking</h1>
          <p style={{ color: '#94a3b8', marginBottom: '20px', maxWidth: '400px', fontSize: '14px' }}>
            {this.state.error?.message || "An error occurred while loading the application."}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: '12px 24px', background: '#b79355', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
          >
            Reload Application
          </button>
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
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);