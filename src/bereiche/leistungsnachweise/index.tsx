/**
 * Einstiegspunkt des Bereichs „Leistungsnachweise“: Jede angemeldete Person
 * erfasst ihre eigenen Leistungen je Projekt – von Hand oder per Excel-Import
 * aus der Zeiterfassung –, und daraus entstehen gemeinsame tages-, wochen- oder
 * monatsscharfe Leistungsnachweise für den Auftraggeber. Abschluss,
 * Aufschläge, Export und Auswertung übernimmt das Controlling. Eigener
 * Speicherort, eigene Einstellungen, eigener Router – unabhängig von den
 * anderen Bereichen.
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
