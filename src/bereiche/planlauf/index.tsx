/**
 * Einstiegspunkt des Bereichs „Planlaufmanagement“. Der Datenbestand dieses
 * Bereichs wird hier bereitgestellt und nicht mehr in main.tsx – damit hängt
 * er am Bereich und nicht an der Anwendung.
 */
import { App } from './App';
import { StoreProvider } from './store/store';

export function BereichPlanlauf() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
