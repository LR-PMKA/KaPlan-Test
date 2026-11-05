/**
 * Einstiegspunkt des Bereichs „Baubetriebsplanung“: baubetriebliche
 * Anmeldungen für Sperrpausen je Projekt verfolgen. Der Datenbestand des
 * Bereichs wird hier bereitgestellt – eigener Speicherort, eigene
 * Einstellungen, eigener Router, unabhängig vom Planlaufmanagement.
 */
import { App } from './App';
import { StoreProvider } from './store/store';

export function BereichBaubetrieb() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
