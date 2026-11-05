/**
 * Einstiegspunkt des Bereichs „Projektsteuerung“: Projektbeteiligte mit
 * projektübergreifenden Funktionen und Besprechungsprotokolle je Projekt.
 * Eigener Speicherort, eigene Einstellungen, eigener Router – unabhängig von
 * den anderen Bereichen.
 */
import { App } from './App';
import { StoreProvider } from './store/store';
import './projektsteuerung.css';

export function BereichProjektsteuerung() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
