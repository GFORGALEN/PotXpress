import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { StoreProvider } from './contexts/StoreContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { LayoutEditorProvider } from './contexts/LayoutEditorContext.jsx';
import { SoundProvider } from './contexts/SoundContext.jsx';
import { ErrorProvider } from './contexts/ErrorContext.jsx';
import { AppErrorBoundary } from './components/error/AppErrorBoundary.jsx';
import { setupGlobalErrorHandlers } from './utils/setupGlobalErrorHandlers.js';
import './index.css';

setupGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <ToastProvider>
          <AuthProvider>
            <StoreProvider>
              <SoundProvider>
                <ErrorProvider>
                  <LayoutEditorProvider>
                    <App />
                  </LayoutEditorProvider>
                </ErrorProvider>
              </SoundProvider>
            </StoreProvider>
          </AuthProvider>
        </ToastProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
