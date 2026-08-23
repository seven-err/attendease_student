import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Aggressive cache & SW synchronization for PWA reliability
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.update().catch(() => {});
    }
  }).catch(() => {});
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AttendEase] Unhandled render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          padding: '2rem',
          background: '#f5f5f4',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          gap: '1rem',
        }}>
          <img src="/attendease.png" alt="AttendEase" width={64} height={64} style={{ borderRadius: 16 }} />
          <h1 style={{ color: '#8b0000', fontSize: '1.25rem', margin: 0 }}>AttendEase</h1>
          <p style={{ color: '#3f3f46', margin: 0, fontSize: '0.9rem' }}>
            Something went wrong loading the portal.
          </p>
          <p style={{ color: '#71717a', margin: 0, fontSize: '0.85rem' }}>
            Please try again. If the problem continues, check your internet connection.
          </p>
          <button
            onClick={() => { window.location.reload(); }}
            style={{ background: '#8b0000', color: '#fff', border: 'none', borderRadius: 8, padding: '0.75rem 1.75rem', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem', minHeight: 44, minWidth: 44 }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
