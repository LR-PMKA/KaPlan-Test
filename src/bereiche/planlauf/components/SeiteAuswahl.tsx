/**
 * Seite einer Funktion für den Verzug im Terminnachweis: Auswahlfeld der
 * Funktionsdialoge (projektübergreifend und im Projekt), Abzeichen der Listen
 * und das Lesen der Angabe im Excel-Import.
 */
import { SEITE_LABEL, type Seite } from '../domain/types';
import { Field, Select } from '../../../shared/ui';

/** Auswahl samt „nicht festgelegt“ (leerer Wert). */
const OPTIONEN = [
  ...(Object.keys(SEITE_LABEL) as Seite[]).map((s) => ({ value: s, label: SEITE_LABEL[s] })),
  { value: '', label: 'nicht festgelegt' },
];

/**
 * Feld „Seite für den Verzug“. `vorbelegt`: Die Seite folgt noch der
 * Bezeichnung (seiteAusFunktion), bis sie von Hand gewählt wird.
 */
export function SeiteFeld({
  value,
  onChange,
  vorbelegt = false,
}: {
  value: Seite | null;
  onChange: (seite: Seite | null) => void;
  vorbelegt?: boolean;
}) {
  return (
    <Field
      label="Seite für den Verzug"
      full
      hint={`Wem der Terminnachweis einen Verzug in Schritten dieser Funktion zurechnet.${
        vorbelegt ? ' Vorbelegt aus der Bezeichnung.' : ''
      }`}
    >
      <Select value={value ?? ''} onChange={(v) => onChange(v ? (v as Seite) : null)} options={OPTIONEN} />
    </Field>
  );
}

/** Abzeichen der Seite in den Funktionslisten. */
export function SeiteBadge({ seite }: { seite: Seite | null }) {
  return seite ? (
    <span className="badge" title="Seite für den Verzug im Terminnachweis">
      {SEITE_LABEL[seite]}
    </span>
  ) : (
    <span
      className="badge gelb"
      title="Seite für den Verzug nicht festgelegt – der Terminnachweis führt Verzug dieser Funktion ohne Seite"
    >
      Seite offen
    </span>
  );
}

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z]/g, '');

/** Gebräuchliche Schreibweisen je Seite (normalisiert). */
const SCHREIBWEISEN: Record<string, Seite | null> = {
  planer: 'planer',
  pruefer: 'pruefer',
  auftraggeber: 'auftraggeber',
  ag: 'auftraggeber',
  plm: 'plm',
  planlaufmanagement: 'plm',
  nichtfestgelegt: null,
  offen: null,
  keine: null,
};

/**
 * Seite aus einer Zellangabe des Imports: `undefined`, wenn die Zelle leer
 * oder die Angabe unbekannt ist; `null` für „nicht festgelegt“.
 */
export function seiteAusText(text: string): Seite | null | undefined {
  const n = norm(text);
  if (!n || !(n in SCHREIBWEISEN)) return undefined;
  return SCHREIBWEISEN[n];
}
