/** Kurze Bestätigungsmeldungen am unteren Bildschirmrand. */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

const ToastContext = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);

  const zeige = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((alt) => [...alt, { id, text }]);
    setTimeout(() => setItems((alt) => alt.filter((i) => i.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={zeige}>
      {children}
      <div className="toast-wrap">
        {items.map((i) => (
          <div key={i.id} className="toast">
            {i.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
