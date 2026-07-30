import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { StoreProvider } from './contexts/StoreContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { LayoutEditorProvider } from './contexts/LayoutEditorContext.jsx';
import { SoundProvider } from './contexts/SoundContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <StoreProvider>
            <SoundProvider>
              <LayoutEditorProvider>
                <App />
              </LayoutEditorProvider>
            </SoundProvider>
          </StoreProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
