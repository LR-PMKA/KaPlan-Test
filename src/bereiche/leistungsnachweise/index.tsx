/**
 * Einstiegspunkt des Bereichs „Leistungsnachweise“: Mitarbeiter erfassen ihre
 * Leistungen je Projekt – von Hand oder per Excel-Import aus der
 * Zeiterfassung –, und daraus entstehen tages-, wochen- oder monatsscharfe
 * Leistungsnachweise für den Auftraggeber. Eigener Speicherort, eigene
 * Einstellungen, eigener Router – unabhängig von den anderen Bereichen.
 */
import { App } from './App';
import { StoreProvider } from './store/store';
import './leistungsnachweise.css';

export function BereichLeistungsnachweise() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
