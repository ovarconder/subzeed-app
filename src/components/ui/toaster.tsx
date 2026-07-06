'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  persistent?: boolean;
}

interface ToastContextType {
  addToast: (message: string, type?: Toast['type'], persistent?: boolean) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {}, dismissToast: () => {} });

export const useToast = () => useContext(ToastContext);

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info', persistent: boolean = false) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type, persistent }]);
    if (!persistent) {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, dismissToast }}>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-[subtitleFadeIn_0.2s_ease-out] max-w-sm ${
              toast.type === 'success' ? 'bg-success' :
              toast.type === 'error' ? 'bg-danger' :
              toast.type === 'warning' ? 'bg-warning' :
              'bg-primary'
            } ${toast.persistent ? 'border-2 border-white/30' : ''}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{toast.message}</span>
              {toast.persistent && (
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
