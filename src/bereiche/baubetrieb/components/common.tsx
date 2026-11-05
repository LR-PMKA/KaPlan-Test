/** Fachliche Anzeige-Bausteine der Baubetriebsplanung, die mehrere Ansichten brauchen. */
import { formatDate, relativeLabel } from '../../../shared/dates';
import { Badge } from '../../../shared/ui';
import { AMPEL_LABEL, type Ampel, type Terminfrist } from '../domain/fristen';
import { LOESCHEN, type ID, type StatusArt, type StatusZiel, type Workflow } from '../domain/types';
import { istUebernahme, nachfolgerVon, statusInfo, statusVon, statusText } from '../domain/workflow';
import { useStore } from '../store/store';

type Ton = '' | 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'gelb';

export const STATUS_TON: Record<StatusArt, Ton> = {
  entwurf: '',
  abstimmung: 'blue',
  angemeldet: 'blue',
  // Eine verspätete Anmeldung ist kein Fehler, verdient aber Aufmerksamkeit.
  verspaetet: 'orange',
  genehmigt: 'green',
  abgelehnt: 'red',
  aenderung: 'purple',
  // Erledigt und zum Löschen vorgemerkt – rot, damit sie auffällt.
  leiche: 'red',
};

/**
 * Status einer Anmeldung, eingefärbt nach seiner Art. Ohne `ohneWorkflow`
 * steht der Workflow davor („MKM · Angemeldet“), weil Status wie „Entwurf“ in
 * mehreren Workflows vorkommen.
 */
export function StatusBadge({ statusId, ohneWorkflow = false }: { statusId: ID; ohneWorkflow?: boolean }) {
  const { data } = useStore();
  const info = statusVon(data.workflows, statusId);
  return (
    <span title={`${info.workflow.name}: ${info.status.name}`}>
      <Badge ton={STATUS_TON[info.status.art]}>{ohneWorkflow ? info.status.name : statusText(info)}</Badge>
    </span>
  );
}

const AMPEL_TON: Record<Ampel, Ton> = {
  ueberfaellig: 'red',
  faellig: 'orange',
  geplant: 'blue',
  ohne: '',
};

export function AmpelBadge({ ampel }: { ampel: Ampel }) {
  return <Badge ton={AMPEL_TON[ampel]}>{AMPEL_LABEL[ampel]}</Badge>;
}

export function AmpelPunkt({ ampel }: { ampel: Ampel }) {
  // Als Inline-Element hätte der Punkt in einer Tabellenzelle keine Größe
  return <span className={`dot ${AMPEL_TON[ampel]}`} title={AMPEL_LABEL[ampel]} style={{ display: 'inline-block' }} />;
}

export function NachhakenBadge() {
  return <Badge ton="purple">Zum Nachhaken</Badge>;
}

/** Terminfrist in Tabellen: Datum, Abstand und Regel. */
export function TerminZelle({ frist, mitRegel = true }: { frist: Terminfrist; mitRegel?: boolean }) {
  if (!frist.datum) return <span className="small tertiary">{frist.regel === '.-.' ? 'keine' : 'nicht berechenbar'}</span>;
  return (
    <span className="small">
      <b>{formatDate(frist.datum)}</b>
      <div className="tertiary small">{relativeLabel(frist.datum)}</div>
      {mitRegel ? (
        <div className="tertiary small" title={frist.erlaeuterung}>
          {frist.manuell ? 'von Hand' : frist.regel}
          {frist.platzhalter ? ' · Platzhalter' : ''}
        </div>
      ) : null}
    </span>
  );
}

const EINZEILIG = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

/**
 * Terminfrist in höchstens zwei Zeilen: Ampelpunkt und Datum, darunter der
 * Abstand. Regel und Rechenweg stehen im Tooltip. Für Tabellen, deren Zeilen
 * nicht höher werden sollen.
 */
export function TerminKompakt({ frist, ampel }: { frist: Terminfrist; ampel: Ampel }) {
  if (!frist.datum) {
    return <span className="small tertiary">{frist.regel === '.-.' ? 'keine' : 'nicht berechenbar'}</span>;
  }
  const regel = `${frist.manuell ? 'von Hand' : frist.regel}${frist.platzhalter ? ' · Platzhalter' : ''}`;
  return (
    <div className="small" title={`${regel}\n${frist.erlaeuterung}`}>
      <div style={EINZEILIG}>
        <AmpelPunkt ampel={ampel} /> <b>{formatDate(frist.datum)}</b>
      </div>
      <div className="tertiary" style={EINZEILIG}>
        {relativeLabel(frist.datum)}
      </div>
    </div>
  );
}

/**
 * Auswahl des nächsten Status – angeboten werden nur die möglichen
 * Nachfolger des aktuellen Status.
 */
export function NachfolgerAuswahl({
  statusId,
  onWaehle,
}: {
  statusId: ID;
  onWaehle: (nach: StatusZiel) => void;
}) {
  const { data } = useStore();
  const nachfolger = nachfolgerVon(data.workflows, statusId);
  if (nachfolger.length === 0) return null;
  return (
    <select
      className="select"
      value=""
      aria-label="Status ändern"
      title="Nur die möglichen Nachfolge-Status stehen zur Wahl"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        if (e.target.value) onWaehle(e.target.value);
      }}
      style={{ minWidth: 150 }}
    >
      <option value="">Status ändern …</option>
      {nachfolger.map((n) => (
        <option key={n} value={n}>
          {nachfolgerText(data.workflows, statusId, n)}
        </option>
      ))}
    </select>
  );
}

/** „Genehmigt“, „→ MKM: Entwurf (Übernahme)“ bzw. „Eintrag löschen“. */
export function nachfolgerText(workflows: Workflow[], von: ID, nach: StatusZiel): string {
  if (nach === LOESCHEN) return 'Eintrag löschen';
  const ziel = statusInfo(workflows, nach);
  if (!ziel) return 'Unbekannter Status';
  if (nach === von) return `${ziel.status.name} (erneut)`;
  if (istUebernahme(workflows, von, nach)) return `→ ${ziel.workflow.kurz || ziel.workflow.name}: ${ziel.status.name} (Übernahme)`;
  return ziel.status.name;
}
