/** Fachliche Anzeige-Bausteine, die in mehreren Ansichten gebraucht werden. */
import type { ReactNode } from 'react';
import { AMPEL_LABEL, type Ampel } from '../domain/engine';
import { formatDate, relativeLabel } from '../../../shared/dates';
import {
  DOCUMENT_KIND_LABEL,
  RUN_STATUS_LABEL,
  SEITE_LABEL,
  STEP_TYPE_LABEL,
  type DocumentKind,
  type Erinnerung,
  type ISODate,
  type Role,
  type RunStatus,
  type Seite,
  type StepType,
} from '../domain/types';
import { Badge } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';

const AMPEL_TON: Record<Ampel, '' | 'green' | 'orange' | 'red' | 'blue'> = {
  erledigt: 'green',
  ueberfaellig: 'red',
  faellig: 'orange',
  geplant: 'blue',
  neutral: '',
};

export function AmpelBadge({ ampel }: { ampel: Ampel }) {
  return <Badge ton={AMPEL_TON[ampel]}>{AMPEL_LABEL[ampel]}</Badge>;
}

/** Der Plan ist angekündigt: Der Eingang beim Planlaufmanagement steht aus. */
export function AngekuendigtBadge() {
  return <Badge ton="gelb">Angekündigt</Badge>;
}

export function AmpelPunkt({ ampel }: { ampel: Ampel }) {
  return <span className={`dot ${AMPEL_TON[ampel] || ''}`} title={AMPEL_LABEL[ampel]} />;
}

const RUN_STATUS_TON: Record<RunStatus, '' | 'green' | 'orange' | 'red' | 'blue'> = {
  laufend: 'blue',
  abgeschlossen: 'green',
  // Ein Abbruch ist kein Fehler, sondern erledigte Vergangenheit – daher grau
  abgebrochen: '',
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge ton={RUN_STATUS_TON[status]}>{RUN_STATUS_LABEL[status]}</Badge>;
}

const KIND_ICON: Record<DocumentKind, string> = {
  plan: 'plan',
  paket: 'paket',
  verzeichnis: 'verzeichnis',
};

export function DocKindIcon({ kind }: { kind: DocumentKind }) {
  return (
    <span className="tertiary" title={DOCUMENT_KIND_LABEL[kind]} style={{ display: 'flex' }}>
      <Icon name={KIND_ICON[kind]} size={16} />
    </span>
  );
}

export function StepTypBadge({ typ }: { typ: StepType }) {
  return <Badge ton={typ === 'entscheidung' ? 'purple' : ''}>{STEP_TYPE_LABEL[typ]}</Badge>;
}

export function RollenChips({ roles }: { roles: Role[] }) {
  if (roles.length === 0) return <span className="tertiary small">keine Funktion</span>;
  return (
    <span className="row wrap" style={{ gap: 5 }}>
      {roles.map((r) => (
        <span key={r.id} className="role-chip" style={{ color: r.farbe }}>
          {r.name}
        </span>
      ))}
    </span>
  );
}

export function Termin({ soll, ist }: { soll: ISODate | null; ist: ISODate | null }) {
  return (
    <span className="small">
      <span className="muted">Soll </span>
      <b>{formatDate(soll)}</b>
      {ist ? (
        <>
          <span className="muted"> · Ist </span>
          <b>{formatDate(ist)}</b>
        </>
      ) : (
        <span className="tertiary"> · {relativeLabel(soll)}</span>
      )}
    </span>
  );
}

/** Wie eine vorbereitete E-Mail auf den Weg gebracht wurde. */
export const WEG_LABEL: Record<Erinnerung['weg'], string> = {
  outlook: 'Outlook',
  web: 'Outlook im Web',
  kopie: 'kopiert',
  sammel: 'Sammel-E-Mail',
};

/** Zeitstempel als „TT.MM.JJJJ, hh:mm“. */
export function zeitpunktText(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** „E-Mail vorbereitet am 12.03.2026 an Erika Muster“. */
export function erinnerungText(e: Pick<Erinnerung, 'zeitpunkt' | 'kontaktName' | 'an'>): string {
  const d = new Date(e.zeitpunkt);
  const datum = Number.isNaN(d.getTime()) ? e.zeitpunkt : d.toLocaleDateString('de-DE');
  const an = e.kontaktName || e.an;
  return `E-Mail vorbereitet am ${datum}${an ? ` an ${an}` : ''}`;
}

/** Seite, der ein Verzug zugerechnet wird; ohne Seite der Hinweis „Seite fehlt“. */
export function SeiteBadge({ seite }: { seite: Seite | null }) {
  return seite ? <Badge>{SEITE_LABEL[seite]}</Badge> : <Badge ton="gelb">Seite fehlt</Badge>;
}

/** Kennzahl im Kopf des Planlaufs bzw. im Terminnachweis (Gestaltung in planlauf.css). */
export function Kennzahl({
  label,
  wert,
  sub,
  ton = '',
  children,
}: {
  label: string;
  wert: ReactNode;
  sub?: ReactNode;
  ton?: '' | 'rot' | 'orange' | 'gruen';
  children?: ReactNode;
}) {
  return (
    <div className={`pl-kennzahl ${ton}`}>
      <span className="pl-kennzahl-label">{label}</span>
      <span className="pl-kennzahl-wert">{wert}</span>
      {children}
      {sub ? <span className="pl-kennzahl-sub">{sub}</span> : null}
    </div>
  );
}
