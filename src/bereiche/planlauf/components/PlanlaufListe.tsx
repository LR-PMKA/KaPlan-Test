/**
 * Übersicht der Planläufe eines Projekts (Reiter „Planläufe“).
 *
 * Gliederung und Zeilenwerte folgen domain/uebersicht.ts – dieselben Regeln
 * gelten für den Export.
 * Einträge eines Planpakets stehen unter einer aufklappbaren Paketzeile; das
 * Paket selbst hat keinen Planlauf und darum auch keinen Erledigt-Haken.
 *
 * Mit `auswahl` erhält die Liste vorn eine Kästchen-Spalte: Lauf-Zeilen und
 * mitlaufende Pläne werden einzeln gewählt (Schlüssel wie `zeilenSchluessel`
 * im Export), Paket, „Ohne Planpaket“, Verzeichnisklammer und gebündeltes
 * Verzeichnis wählen ihren Inhalt (dreistufig), die Überschrift alle
 * angezeigten Einträge. Abgebrochene Läufe sind nicht wählbar.
 *
 * Stehen in parallelen Zweigen mehrere Schritte eines Laufs an, zeigt „Nächster
 * Schritt“ den führenden (frühestes Soll) mit „+n parallel“; Erinnern und der
 * Erledigt-Haken fragen dann nach dem Schritt.
 */
import { Fragment, useState } from 'react';
import { abbruchHinweis } from '../domain/engine';
import { formatDate, relativeLabel } from '../../../shared/dates';
import {
  INDEX_LABEL,
  SCHRITT_EINGANG,
  hatEigenenPlanlauf,
  type PlanDocument,
  type PlanRun,
  type Project,
  type RunStep,
} from '../domain/types';
import {
  auswahlSchluessel,
  eintraegeVon,
  gliederungBilden,
  knotenBilden,
  laufAmpel,
  laufFortschritt,
  letzterAbgeschlossenerSchritt,
  paketStand as paketStandVon,
  paketVon as paketVonIn,
  statusWert,
  verzeichnisStand as verzeichnisStandVon,
  wartetAufEingang as wartetAufEingangVon,
  type Knoten,
  type UebersichtEintrag as Eintrag,
} from '../domain/uebersicht';
import './auswahl.css';
import { useStore } from '../store/store';
import { AmpelBadge, AngekuendigtBadge, DocKindIcon, RunStatusBadge } from './common';
import { BuendelnDialog } from './BuendelnDialog';
import { EmailDialog } from './EmailDialog';
import { ErledigtButton, useSchrittStatus } from './SchrittStatus';
import { ConfirmDialog, EmptyState, Progress } from '../../../shared/ui';
import { useToast } from '../../../shared/toast';
import { Icon } from '../../../shared/icons';

/** Spalten, nach denen sich die Liste sortieren lässt. */
type SortFeld = 'titel' | 'gewerk' | 'stand' | 'schritt' | 'zustaendig' | 'fortschritt' | 'status';

/** Spalten mit Filter in der Überschrift. */
export type FilterFeld = 'gewerk' | 'zustaendig' | 'status';

/**
 * Filter, die in den Spaltenüberschriften angeboten werden. Gefiltert wird
 * außerhalb der Liste – hier steht nur die Bedienung.
 */
export interface SpaltenFilter {
  werte: Record<FilterFeld, string>;
  setzen: (feld: FilterFeld, wert: string) => void;
  optionen: Record<FilterFeld, { value: string; label: string }[]>;
}

/** Dringlichkeit als Zahl – überfällige Läufe stehen vorn. */
const STATUS_RANG: Record<string, number> = {
  ueberfaellig: 0,
  faellig: 1,
  geplant: 2,
  angekuendigt: 3,
  neutral: 4,
  abgeschlossen: 5,
  abgebrochen: 6,
};

export function PlanlaufListe({
  project,
  runs,
  alleRuns,
  ebene = 2,
  spaltenFilter,
  auswahl,
  onAuswahl,
  oeffneLauf,
}: {
  project: Project;
  /** Anzuzeigende Planläufe des Projekts. */
  runs: PlanRun[];
  /** Alle Läufe des Projekts – Grundlage für den Stand der Planpakete. */
  alleRuns?: PlanRun[];
  /**
   * Gliederungstiefe: 1 = nur die Planpakete, 2 = mit ihren Plänen und
   * Planverzeichnissen.
   */
  ebene?: 1 | 2;
  /** Auswahl je Spalte; ohne Angabe bleibt die Überschrift ohne Filter. */
  spaltenFilter?: SpaltenFilter;
  /**
   * Mehrfachauswahl: gewählte Schlüssel (Lauf-ID bzw. ID eines mitlaufenden
   * Plans). Ohne Angabe hat die Liste keine Kästchen-Spalte.
   */
  auswahl?: Set<string>;
  /** Wählt die Schlüssel aus (`true`) bzw. ab. */
  onAuswahl?: (ids: string[], gewaehlt: boolean) => void;
  oeffneLauf: (runId: string) => void;
}) {
  const { data, planHerausloesen } = useStore();
  const toast = useToast();
  const { setzeStatus, nachweisDialog } = useSchrittStatus();
  /** Plan, der aus dem laufenden Lauf seines Verzeichnisses herausgelöst werden soll. */
  const [herausloesen, setHerausloesen] = useState<{ plan: PlanDocument; lauf: PlanRun } | null>(null);
  /** Verzeichnis, dessen einzeln laufende Pläne wieder gebündelt werden sollen. */
  const [buendeln, setBuendeln] = useState<PlanDocument | null>(null);
  const [mail, setMail] = useState<{ run: PlanRun; step: RunStep } | null>(null);
  /**
   * Stehen mehrere Schritte an, fragt ein kleines Menü am Erledigt-Haken bzw.
   * an der Erinnern-Schaltfläche nach dem Schritt.
   */
  const [schrittWahl, setSchrittWahl] = useState<{
    art: 'erledigt' | 'mail';
    run: PlanRun;
    schritte: RunStep[];
    x: number;
    y: number;
  } | null>(null);
  /** Paketzeilen, die von Hand abweichend auf- bzw. zugeklappt sind. */
  const [abweichend, setAbweichend] = useState<string[]>([]);
  /** Aufgeklappte Planverzeichnisse – zunächst sind alle zugeklappt. */
  const [offeneVerzeichnisse, setOffeneVerzeichnisse] = useState<string[]>([]);
  /** Die abgebrochenen Läufe am Ende der Liste sind zunächst zugeklappt. */
  const [verworfeneOffen, setVerworfeneOffen] = useState(false);
  /** Sortierung; ohne Angabe gilt die vorgegebene Reihenfolge. */
  const [sortFeld, setSortFeld] = useState<SortFeld | null>(null);
  const [absteigend, setAbsteigend] = useState(false);
  /**
   * Offene Filterauswahl samt Position. Das Menü liegt fest im Fenster, weil
   * Karte und Tabelle ihren Inhalt beschneiden.
   */
  const [filterOffen, setFilterOffen] = useState<{ feld: FilterFeld; x: number; y: number } | null>(null);
  const [zuletzt, setZuletzt] = useState(String(ebene));

  // Beim Umschalten der Gliederung gilt wieder die einheitliche Darstellung.
  if (zuletzt !== String(ebene)) {
    setZuletzt(String(ebene));
    setAbweichend([]);
    setOffeneVerzeichnisse([]);
  }

  /** Paketzeilen folgen der Ebene, einzelne Abweichungen stechen. */
  const istOffen = (id: string) => (ebene >= 2) !== abweichend.includes(id);

  const eintraege: Eintrag[] = eintraegeVon(data.documents, runs);

  /** Maßgebliches Paket – bei Plänen eines Verzeichnisses dessen Paket. */
  const paketVon = (doc: PlanDocument | undefined) => paketVonIn(data.documents, doc);

  // Abgebrochene Läufe – ersatzlos wie ersetzt – stehen gesammelt am Ende der
  // Liste und nicht mehr zwischen den laufenden Einträgen ihres Pakets.
  // Einträge eines Planpakets stehen unter ihrer Paketzeile.
  const gliederung = gliederungBilden(data.documents, eintraege);
  const verworfene = gliederung.verworfene;
  const laufende = eintraege.filter((e) => e.run.status !== 'abgebrochen');
  const pakete = gliederung.pakete.map((g) => g.paket);
  const ohnePaket = gliederung.ohnePaket;

  const klappen = (id: string) =>
    setAbweichend((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const verzeichnisKlappen = (id: string) =>
    setOffeneVerzeichnisse((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  /**
   * Stand einer Klammer – eines Planpakets oder eines Verzeichnisses mit
   * einzeln laufenden Plänen: Sie laufen selbst nicht, Fortschritt und Status
   * ergeben sich aus den enthaltenen Einträgen mit eigenem Lauf.
   */
  const vorlauf = project.settings.erinnerungVorlaufTage;
  const paketStand = (paketId: string) => paketStandVon(data.documents, paketId, alleRuns ?? runs, project);
  const verzeichnisStand = (verzeichnisId: string) =>
    verzeichnisStandVon(data.documents, verzeichnisId, alleRuns ?? runs, project);

  /** Sortierschlüssel eines Eintrags je Spalte. */
  const schluessel = (e: Eintrag, feld: SortFeld): string | number => {
    switch (feld) {
      case 'gewerk':
        return e.doc?.gewerk?.toLowerCase() ?? '';
      case 'stand':
        // Nach dem Abschlussdatum des zuletzt erledigten Schritts
        return e.run.status === 'abgebrochen' ? '' : (letzterAbgeschlossenerSchritt(e.run)?.istDatum ?? '');
      case 'schritt':
        // Nach Soll-Termin: was zuerst ansteht, steht oben
        return e.step?.sollDatum ?? '9999-99-99';
      case 'zustaendig': {
        const kontakt = data.contacts.find((c) => c.id === e.step?.contactId);
        return `${e.step?.roleName ?? ''} ${kontakt ? kontakt.nachname : ''}`.trim().toLowerCase();
      }
      case 'fortschritt':
        return laufFortschritt(data, e.run);
      case 'status':
        // Der dringlichste anstehende Schritt zählt; ein angekündigter Eintrag,
        // dessen Eingang überfällig ist, zählt als überfällig.
        return STATUS_RANG[statusWert(e.run, e.schritte, vorlauf)] ?? 9;
      default:
        return `${e.doc?.nummer ?? ''} ${e.doc?.titel ?? e.run.name}`.toLowerCase();
    }
  };

  const vergleich = (a: string | number, b: string | number) =>
    (typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'de', { numeric: true })) * (absteigend ? -1 : 1);

  /** Sortiert eine Gruppe von Einträgen nach der gewählten Spalte. */
  const sortieren = (liste: Eintrag[]) =>
    sortFeld ? [...liste].sort((a, b) => vergleich(schluessel(a, sortFeld), schluessel(b, sortFeld))) : liste;

  /** Eigener Lauf eines Plans in der angezeigten Liste – sofern vorhanden. */
  const laufDesPlans = (planId: string) => laufende.find((e) => e.doc?.id === planId);

  /* ---------------------------- Auswahl ---------------------------- */

  /** Mit Kästchen-Spalte – Zeilen über die ganze Breite erhalten davor eine (leere) Kästchen-Zelle. */
  const mitAuswahl = Boolean(auswahl && onAuswahl);

  /**
   * Schlüssel, die das Kästchen einer Lauf-Zeile wählt: der Lauf, bei einem
   * gebündelten Verzeichnis dazu seine mitlaufenden Pläne und die darunter
   * stehenden herausgelösten Pläne mit eigenem Lauf.
   */
  const idsVon = (e: Eintrag): string[] => {
    const ids = auswahlSchluessel(data.documents, e);
    if (ids.length > 0 && e.doc?.kind === 'verzeichnis') {
      for (const plan of data.documents.filter((d) => d.parentId === e.doc!.id)) {
        if (!hatEigenenPlanlauf(plan, data.documents)) continue;
        const eigener = laufDesPlans(plan.id);
        if (eigener) ids.push(eigener.run.id);
      }
    }
    return ids;
  };
  const idsVonListe = (liste: Eintrag[]) => [...new Set(liste.flatMap(idsVon))];

  /**
   * Kästchen-Zelle für eine Zeile bzw. Gruppe: gesetzt, wenn alle ihre
   * Schlüssel gewählt sind, „teilweise“, wenn einige. Ein Klick wählt alle –
   * bzw. alle ab, wenn schon alle gewählt sind. Ohne Schlüssel bleibt die
   * Zelle leer. Der Klick öffnet die Zeile nicht.
   */
  const kaestchen = (ids: string[], bezeichnung: string) => {
    if (!mitAuswahl) return null;
    if (ids.length === 0) return <td className="pll-wahl" />;
    const alle = ids.every((id) => auswahl!.has(id));
    const einige = !alle && ids.some((id) => auswahl!.has(id));
    return (
      <td className="pll-wahl" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={alle}
          title={bezeichnung}
          aria-label={bezeichnung}
          ref={(el) => {
            if (el) el.indeterminate = einige;
          }}
          onChange={() => onAuswahl!(ids, !alle)}
        />
      </td>
    );
  };

  /** Öffnet das Menü zur Schrittwahl an der angeklickten Schaltfläche. */
  const schrittWaehlen = (art: 'erledigt' | 'mail', run: PlanRun, schritte: RunStep[], ziel: HTMLElement) => {
    const platz = ziel.getBoundingClientRect();
    setSchrittWahl({
      art,
      run,
      schritte,
      x: Math.max(8, Math.min(platz.right - 240, window.innerWidth - 248)),
      y: platz.bottom + 6,
    });
  };

  /** Person eines Schritts für Anzeige und Tooltip. */
  const personVon = (step: RunStep) => {
    const kontakt = data.contacts.find((c) => c.id === step.contactId);
    return kontakt ? `${kontakt.vorname} ${kontakt.nachname}` : 'keine Person';
  };
  /** Tooltip mit allen anstehenden Schritten eines Laufs. */
  const parallelTitel = (schritte: RunStep[]) =>
    `Parallel anstehend:\n${schritte
      .map((s) => `• ${s.name} – Soll ${formatDate(s.sollDatum)} (${s.roleName || 'ohne Funktion'}, ${personVon(s)})`)
      .join('\n')}`;

  /**
   * Oberste Ebene einer Gruppe. Pläne mit eigenem Lauf stehen unter ihrem
   * Verzeichnis: unter dessen Zeile, wenn es gebündelt läuft, sonst unter einer
   * Klammerzeile. Ist das Verzeichnis ausgefiltert, steht der Plan für sich.
   */
  const knotenVon = (liste: Eintrag[]): Knoten[] => {
    const knoten = knotenBilden(data.documents, liste);
    if (!sortFeld) return knoten;
    const wert = (k: Knoten): string | number => {
      if (k.art === 'lauf') return schluessel(k.eintrag, sortFeld);
      if (sortFeld === 'titel') return `${k.verzeichnis.nummer} ${k.verzeichnis.titel}`.toLowerCase();
      if (sortFeld === 'gewerk') return k.verzeichnis.gewerk.toLowerCase();
      // Sonst zählt der Plan, der in der gewählten Richtung zuerst käme
      return schluessel(sortieren(k.kinder)[0], sortFeld);
    };
    return [...knoten].sort((a, b) => vergleich(wert(a), wert(b)));
  };

  const spalteWaehlen = (feld: SortFeld) => {
    if (feld === sortFeld) {
      // dritter Klick hebt die Sortierung wieder auf
      if (absteigend) {
        setSortFeld(null);
        setAbsteigend(false);
      } else setAbsteigend(true);
    } else {
      setSortFeld(feld);
      setAbsteigend(false);
    }
  };

  /**
   * Spaltenüberschrift: Klick auf die Bezeichnung sortiert, der Trichter
   * daneben öffnet die Auswahl der Spalte. Der gewählte Wert steht
   * anschließend in der Überschrift.
   */
  const Kopf = ({
    feld,
    children,
    klasse = '',
    titel,
    stil,
    filter,
  }: {
    feld: SortFeld;
    children: React.ReactNode;
    klasse?: string;
    titel?: string;
    stil?: React.CSSProperties;
    filter?: FilterFeld;
  }) => {
    const optionen = filter && spaltenFilter ? spaltenFilter.optionen[filter] : null;
    const wert = filter && spaltenFilter ? spaltenFilter.werte[filter] : '';
    const gewaehlt = optionen?.find((o) => o.value === wert);
    const offen = filter !== undefined && filterOffen?.feld === filter;
    return (
      <th className={`${klasse} ${gewaehlt ? 'gefiltert' : ''}`} style={stil}>
        <span className="th-inhalt">
          <button type="button" className="sort-btn" onClick={() => spalteWaehlen(feld)} title={titel}>
            {children}
            {gewaehlt ? <span className="th-wert">{gewaehlt.label}</span> : null}
            <span className={`sort-pfeil ${sortFeld === feld ? 'aktiv' : ''}`}>
              {sortFeld === feld ? (absteigend ? '▾' : '▴') : '▴'}
            </span>
          </button>
          {optionen && optionen.length > 0 ? (
            <button
              type="button"
              className={`filter-btn ${gewaehlt ? 'aktiv' : ''} ${offen ? 'offen' : ''}`}
              title={gewaehlt ? `Filter: ${gewaehlt.label}` : 'Filtern'}
              aria-label="Spalte filtern"
              onClick={(e) => {
                if (offen) {
                  setFilterOffen(null);
                  return;
                }
                const platz = e.currentTarget.getBoundingClientRect();
                setFilterOffen({
                  feld: filter!,
                  // Nach rechts hinaus stehende Menüs klappen nach links auf
                  x: Math.min(platz.left, window.innerWidth - 200),
                  y: platz.bottom + 6,
                });
              }}
            >
              <Icon name="filter" size={11} />
            </button>
          ) : null}
        </span>

        {offen && optionen ? (
          <>
            <div className="filter-schatten" onClick={() => setFilterOffen(null)} />
            <div className="filter-menu" style={{ top: filterOffen!.y, left: filterOffen!.x }}>
              <button
                type="button"
                className={wert === '' ? 'aktiv' : ''}
                onClick={() => {
                  spaltenFilter!.setzen(filter!, '');
                  setFilterOffen(null);
                }}
              >
                Alle
              </button>
              {optionen.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={wert === o.value ? 'aktiv' : ''}
                  onClick={() => {
                    spaltenFilter!.setzen(filter!, o.value);
                    setFilterOffen(null);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </th>
    );
  };

  /**
   * Die Paketzeilen folgen derselben Sortierung, soweit sie auf ein Paket
   * anwendbar ist – Schritt und Zuständigkeit gibt es je Paket nicht.
   */
  const paketeSortiert = !sortFeld
    ? pakete
    : [...pakete].sort((a, b) => {
        const wert = (p: PlanDocument): string | number => {
          if (sortFeld === 'gewerk') return p.gewerk.toLowerCase();
          if (sortFeld === 'fortschritt') return paketStand(p.id).pct;
          if (sortFeld === 'status') {
            const stand = paketStand(p.id);
            if (stand.status && stand.status !== 'laufend') return STATUS_RANG[stand.status];
            return STATUS_RANG[stand.ampel ?? 'neutral'] ?? 9;
          }
          return `${p.nummer} ${p.titel}`.toLowerCase();
        };
        return vergleich(wert(a), wert(b));
      });

  if (eintraege.length === 0) {
    return (
      <EmptyState icon="kette" titel="Kein Planlauf aktiv" text="Starten Sie einen Planlauf für einen Eintrag." />
    );
  }

  const zeile = (eintrag: Eintrag, eingerueckt = false, unterVerzeichnis = false) => {
    const { run, doc } = eintrag;
    // Ein abgebrochener Lauf ist abgeschlossene Vergangenheit: kein aktueller
    // Schritt, kein Fortschritt und nichts mehr zu erledigen.
    const abgebrochen = run.status === 'abgebrochen';
    const schritte = abgebrochen ? [] : eintrag.schritte;
    const step = schritte[0];
    const weitere = schritte.slice(1);
    // Farbe der Zeile: angekündigt (gelb) bzw. abgeschlossen (grün)
    const wartetAufEingang = wartetAufEingangVon(run, schritte);
    const fertig = run.status === 'abgeschlossen';
    // Die Ampel des dringlichsten anstehenden Schritts
    const ampel = laufAmpel(schritte, vorlauf);
    const pct = laufFortschritt(data, run);
    const kontakt = data.contacts.find((c) => c.id === step?.contactId);
    // Aktueller Stand: der zuletzt erledigte Schritt des Verlaufs (übersprungene zählen nicht),
    // nach einem Rücksprung der Schritt, der den Wiedereingang auslöste
    const stand = letzterAbgeschlossenerSchritt(run);
    // Pläne eines gebündelten Verzeichnisses stehen aufklappbar darunter –
    // mitlaufend oder, wenn herausgelöst, mit eigenem Stand.
    const plaene =
      doc?.kind === 'verzeichnis' ? data.documents.filter((d) => d.parentId === doc.id) : [];
    // Die Pläne eines Verzeichnisses hängen an der eigenen Schaltfläche und
    // sind zunächst zugeklappt.
    const aufgeklappt = doc ? offeneVerzeichnisse.includes(doc.id) : false;
    const anzeigeIndex = abgebrochen ? run.index : doc?.index;
    // Position von Symbol und Titel; der Pfeil liegt 29 px davor und braucht
    // darum auch ohne Planpakete etwas Vorlauf.
    // Pläne mit eigenem Lauf unter ihrem Verzeichnis rücken eine Stufe weiter ein.
    const einzug = (eingerueckt ? 46 : 36) + (unterVerzeichnis ? 28 : 0);
    return (
      <Fragment key={run.id}>
      <tr
        className={`clickable ${abgebrochen ? 'zeile-verworfen' : ''} ${
          fertig ? 'zeile-fertig' : wartetAufEingang ? 'zeile-eingang' : ''
        }`}
        onClick={() => oeffneLauf(run.id)}
        title={
          abgebrochen
            ? 'Abgebrochener Planlauf – nur noch zum Nachschlagen'
            : wartetAufEingang
              ? `Angekündigt – „${SCHRITT_EINGANG}“ steht noch aus`
              : undefined
        }
      >
        {kaestchen(idsVon(eintrag), `${doc?.nummer ?? ''} ${doc?.titel ?? run.name} auswählen`.trim())}
        <td style={{ paddingLeft: einzug }}>
          <span className="row" style={{ gap: 9 }}>
            {plaene.length > 0 ? (
              <button
                type="button"
                className={`chev-btn chev-vorn ${aufgeklappt ? 'offen' : ''}`}
                title={aufgeklappt ? 'Pläne ausblenden' : 'Pläne anzeigen'}
                aria-label="Pläne des Verzeichnisses anzeigen"
                onClick={(e) => {
                  e.stopPropagation();
                  verzeichnisKlappen(doc!.id);
                }}
              >
                <Icon name="chevron" size={13} />
              </button>
            ) : null}
            {doc ? <DocKindIcon kind={doc.kind} /> : null}
            <span style={{ minWidth: 0 }}>
              <span className="num">
                {doc?.nummer}
                {/* Ein abgebrochener Lauf trägt seinen eigenen Index – der
                    Eintrag selbst steht längst auf dem Nachfolgeindex. */}
                {anzeigeIndex && doc ? ` · ${INDEX_LABEL[doc.kind]} ${anzeigeIndex}` : ''}
              </span>
              <div>
                <strong>{doc?.titel ?? run.name}</strong>
                {plaene.length > 0 ? (
                  <span className="small tertiary">
                    {' '}
                    · {plaene.length} {plaene.length === 1 ? 'Plan' : 'Pläne'}
                  </span>
                ) : null}
              </div>
            </span>
          </span>
        </td>
        <td className="small muted">{doc?.gewerk || '–'}</td>
        {abgebrochen ? (
          <td className="small tertiary" colSpan={4}>
            <div>Abgebrochen{run.abbruchDatum ? ` am ${formatDate(run.abbruchDatum)}` : ''}</div>
            <span className="small">{abbruchHinweis(run, doc?.kind ?? 'plan')}</span>
          </td>
        ) : (
          <>
            <td className="small">
              {stand ? (
                <>
                  <div>{stand.name}</div>
                  <span className="tertiary small">{stand.istDatum ? formatDate(stand.istDatum) : 'ohne Datum'}</span>
                </>
              ) : (
                <span className="tertiary">–</span>
              )}
            </td>
            <td className="small">
              {step ? (
                <>
                  <div>
                    {step.name}
                    {weitere.length > 0 ? (
                      <span className="pll-parallel" title={parallelTitel(schritte)}>
                        +{weitere.length} parallel
                      </span>
                    ) : null}
                  </div>
                  <span className="tertiary small">{relativeLabel(step.sollDatum)}</span>
                </>
              ) : (
                <span className="tertiary">–</span>
              )}
            </td>
            <td className="small col-optional" title={weitere.length > 0 ? parallelTitel(schritte) : undefined}>
              {step ? (
                <>
                  <div>{step.roleName || '–'}</div>
                  <span className="tertiary small">
                    {kontakt ? `${kontakt.vorname} ${kontakt.nachname}` : 'keine Person'}
                    {weitere.length > 0 ? ` · +${weitere.length}` : ''}
                  </span>
                </>
              ) : (
                <span className="tertiary">–</span>
              )}
            </td>
            <td className="col-optional">
              <span className="row" style={{ gap: 8 }}>
                <Progress wert={pct} />
                <span className="small tertiary">{pct}%</span>
              </span>
            </td>
          </>
        )}
        <td>
          {run.status !== 'laufend' ? (
            <RunStatusBadge status={run.status} />
          ) : wartetAufEingang && ampel !== 'ueberfaellig' ? (
            <AngekuendigtBadge />
          ) : (
            // Ist der Eingang überfällig, zählt die Frist – die Bezeichnung
            // der Zeile bleibt gelb und weist den Eintrag als angekündigt aus.
            <AmpelBadge ampel={ampel} />
          )}
        </td>
        <td className="actions">
          {step ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                title={
                  weitere.length > 0
                    ? 'Vorbereitete E-Mail – Schritt wählen'
                    : 'Vorbereitete E-Mail an die zuständige Person'
                }
                aria-label="Erinnerung vorbereiten"
                onClick={(e) => {
                  e.stopPropagation();
                  if (weitere.length > 0) schrittWaehlen('mail', run, schritte, e.currentTarget);
                  else setMail({ run, step });
                }}
              >
                <Icon name="mail" size={13} />
              </button>{' '}
              {weitere.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-haken"
                  title={`${schritte.length} Schritte stehen an – welcher ist erledigt?`}
                  aria-label="Schritt als erledigt vermerken"
                  onClick={(e) => {
                    e.stopPropagation();
                    schrittWaehlen('erledigt', run, schritte, e.currentTarget);
                  }}
                >
                  <Icon name="check" size={13} />
                </button>
              ) : (
                <ErledigtButton run={run} step={step} onErledigen={(r, sch) => setzeStatus(r, sch, 'erledigt')} />
              )}
            </>
          ) : null}
        </td>
      </tr>

      {aufgeklappt
        ? plaene.map((plan) => {
            // Herausgelöst: der Plan zeigt seinen eigenen Stand. Ist sein Lauf
            // ausgefiltert, bleibt die Zeile weg.
            if (hatEigenenPlanlauf(plan, data.documents)) {
              const eigener = laufDesPlans(plan.id);
              return eigener ? zeile(eigener, eingerueckt, true) : null;
            }
            return (
            <tr key={plan.id} className="unterzeile">
              {kaestchen(abgebrochen ? [] : [plan.id], `${plan.nummer} ${plan.titel} auswählen`.trim())}
              <td style={{ paddingLeft: einzug + 28 }}>
                <span className="row" style={{ gap: 9 }}>
                  <DocKindIcon kind={plan.kind} />
                  <span style={{ minWidth: 0 }}>
                    <span className="num">
                      {plan.nummer}
                      {plan.index ? ` · ${INDEX_LABEL[plan.kind]} ${plan.index}` : ''}
                    </span>
                    <div className="small">{plan.titel}</div>
                  </span>
                </span>
              </td>
              <td className="small muted">{plan.gewerk || '–'}</td>
              <td className="small tertiary" colSpan={3}>
                läuft im Planlauf des Verzeichnisses mit
              </td>
              <td className="col-optional" />
              <td />
              <td className="actions">
                {run.status === 'laufend' ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    title="Eigenen Planlauf mit dem Stand des Verzeichnislaufs starten"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHerausloesen({ plan, lauf: run });
                    }}
                  >
                    Herauslösen …
                  </button>
                ) : null}
              </td>
            </tr>
            );
          })
        : null}
      </Fragment>
    );
  };

  /**
   * Planverzeichnis, dessen Pläne einzeln laufen: Es läuft selbst nicht und
   * fasst seine Pläne zusammen – Fortschritt und Status wie bei einem Paket.
   */
  const klammerZeile = (verzeichnis: PlanDocument, kinder: Eintrag[], eingerueckt: boolean) => {
    const offen = offeneVerzeichnisse.includes(verzeichnis.id);
    const stand = verzeichnisStand(verzeichnis.id);
    const einzug = eingerueckt ? 46 : 36;
    return (
      <Fragment key={`klammer-${verzeichnis.id}`}>
        <tr className="klammer-zeile">
          {kaestchen(idsVonListe(kinder), `Pläne von ${verzeichnis.nummer} ${verzeichnis.titel} auswählen`)}
          <td style={{ paddingLeft: einzug }}>
            <span className="row" style={{ gap: 9 }}>
              <button
                type="button"
                className={`chev-btn chev-vorn ${offen ? 'offen' : ''}`}
                title={offen ? 'Pläne ausblenden' : 'Pläne anzeigen'}
                aria-label="Pläne des Verzeichnisses anzeigen"
                onClick={() => verzeichnisKlappen(verzeichnis.id)}
              >
                <Icon name="chevron" size={13} />
              </button>
              <DocKindIcon kind="verzeichnis" />
              <span style={{ minWidth: 0 }}>
                <span className="num">
                  {verzeichnis.nummer}
                  {verzeichnis.index ? ` · ${INDEX_LABEL.verzeichnis} ${verzeichnis.index}` : ''}
                </span>
                <div>
                  <strong>{verzeichnis.titel}</strong>
                  <span className="small tertiary"> · Pläne einzeln</span>
                </div>
              </span>
            </span>
          </td>
          <td className="small muted">{verzeichnis.gewerk || '–'}</td>
          <td className="small tertiary" colSpan={3}>
            {kinder.length} {kinder.length === 1 ? 'laufender Plan' : 'laufende Pläne'}
          </td>
          <td className="col-optional">
            <span className="row" style={{ gap: 8 }}>
              <Progress wert={stand.pct} />
              <span className="small tertiary">{stand.pct}%</span>
            </span>
          </td>
          <td>
            {stand.status === 'laufend' && stand.ampel ? (
              <AmpelBadge ampel={stand.ampel} />
            ) : stand.status ? (
              <RunStatusBadge status={stand.status} />
            ) : null}
          </td>
          <td className="actions">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              title="Ausgewählte Pläne wieder in einem gemeinsamen Verzeichnislauf führen"
              onClick={() => setBuendeln(verzeichnis)}
            >
              Bündeln …
            </button>
          </td>
        </tr>
        {offen ? sortieren(kinder).map((k) => zeile(k, eingerueckt, true)) : null}
      </Fragment>
    );
  };

  /** Rendert die oberste Ebene einer Gruppe. */
  const knotenZeilen = (liste: Eintrag[], eingerueckt: boolean) =>
    knotenVon(liste).map((k) =>
      k.art === 'lauf' ? zeile(k.eintrag, eingerueckt) : klammerZeile(k.verzeichnis, k.kinder, eingerueckt),
    );

  return (
    <>
      <div className="table-scroll">
        <table className="table planlauf-tabelle">
          <thead>
            <tr>
              {mitAuswahl
                ? (() => {
                    // Überschrift: alle angezeigten Einträge (ohne abgebrochene)
                    const ids = idsVonListe(laufende);
                    const alle = ids.length > 0 && ids.every((id) => auswahl!.has(id));
                    const einige = !alle && ids.some((id) => auswahl!.has(id));
                    return (
                      <th className="pll-wahl">
                        <input
                          type="checkbox"
                          checked={alle}
                          disabled={ids.length === 0}
                          title={alle ? 'Auswahl aufheben' : 'Alle angezeigten Einträge auswählen'}
                          aria-label="Alle angezeigten Einträge auswählen"
                          ref={(el) => {
                            if (el) el.indeterminate = einige;
                          }}
                          onChange={() => onAuswahl!(ids, !alle)}
                        />
                      </th>
                    );
                  })()
                : null}
              <Kopf feld="titel">Plan / Planverzeichnis</Kopf>
              <Kopf feld="gewerk" filter="gewerk">
                Gewerk
              </Kopf>
              <Kopf feld="stand" titel="Nach dem Datum des zuletzt erledigten Schritts sortieren">
                Aktueller Stand
              </Kopf>
              <Kopf feld="schritt" titel="Nach Soll-Termin des nächsten Schritts sortieren">
                Nächster Schritt
              </Kopf>
              <Kopf feld="zustaendig" klasse="col-optional" filter="zustaendig">
                Zuständig
              </Kopf>
              <Kopf feld="fortschritt" klasse="col-optional" stil={{ width: 112 }}>
                Fortschritt
              </Kopf>
              <Kopf feld="status" titel="Überfällige zuerst" filter="status">
                Status
              </Kopf>
              <th className="actions" />
            </tr>
          </thead>
          <tbody>
            {paketeSortiert.map((paket) => {
              const inhalt = sortieren(laufende.filter((e) => paketVon(e.doc) === paket.id));
              const aufgeklappt = istOffen(paket.id);
              const stand = paketStand(paket.id);
              return (
                <Fragment key={paket.id}>
                  <tr className="paket-zeile">
                    {kaestchen(idsVonListe(inhalt), `Einträge des Planpakets ${paket.titel} auswählen`)}
                    <td>
                      <button
                        type="button"
                        className={`gruppe-btn ${aufgeklappt ? 'offen' : ''}`}
                        onClick={() => klappen(paket.id)}
                        title={aufgeklappt ? 'Einträge ausblenden' : 'Einträge anzeigen'}
                      >
                        <span className="chev">
                          <Icon name="chevron" size={13} />
                        </span>
                        <DocKindIcon kind="paket" />
                        <span style={{ minWidth: 0 }}>
                          {paket.nummer ? <span className="num">{paket.nummer}</span> : null}
                          <div>
                            <strong>{paket.titel}</strong>
                          </div>
                        </span>
                      </button>
                    </td>
                    <td className="small muted">{paket.gewerk || '–'}</td>
                    <td className="small tertiary" colSpan={3}>
                      Planpaket · {inhalt.length} {inhalt.length === 1 ? 'laufender Eintrag' : 'laufende Einträge'}
                    </td>
                    <td className="col-optional">
                      <span className="row" style={{ gap: 8 }}>
                        <Progress wert={stand.pct} />
                        <span className="small tertiary">{stand.pct}%</span>
                      </span>
                    </td>
                    <td>
                      {stand.status === 'laufend' && stand.ampel ? (
                        <AmpelBadge ampel={stand.ampel} />
                      ) : stand.status ? (
                        <RunStatusBadge status={stand.status} />
                      ) : null}
                    </td>
                    <td className="actions" />
                  </tr>
                  {aufgeklappt ? knotenZeilen(inhalt, true) : null}
                </Fragment>
              );
            })}

            {ohnePaket.length > 0 && pakete.length > 0 ? (
              <tr className="paket-zeile ohne-paket">
                {kaestchen(idsVonListe(ohnePaket), 'Einträge ohne Planpaket auswählen')}
                <td colSpan={8}>
                  <button
                    type="button"
                    className={`gruppe-btn ${istOffen('ohne-paket') ? 'offen' : ''}`}
                    onClick={() => klappen('ohne-paket')}
                  >
                    <span className="chev">
                      <Icon name="chevron" size={13} />
                    </span>
                    <span className="small muted">
                      Ohne Planpaket · {ohnePaket.length} {ohnePaket.length === 1 ? 'Eintrag' : 'Einträge'}
                    </span>
                  </button>
                </td>
              </tr>
            ) : null}
            {pakete.length === 0 || istOffen('ohne-paket')
              ? knotenZeilen(ohnePaket, pakete.length > 0)
              : null}

            {verworfene.length > 0 ? (
              <tr className="paket-zeile ohne-paket">
                {/* Abgebrochene Läufe sind nicht wählbar */}
                {kaestchen([], '')}
                <td colSpan={8}>
                  <button
                    type="button"
                    className={`gruppe-btn ${verworfeneOffen ? 'offen' : ''}`}
                    onClick={() => setVerworfeneOffen((o) => !o)}
                    title={verworfeneOffen ? 'Abgebrochene ausblenden' : 'Abgebrochene anzeigen'}
                  >
                    <span className="chev">
                      <Icon name="chevron" size={13} />
                    </span>
                    <span className="small muted">
                      Abgebrochen · {verworfene.length}{' '}
                      {verworfene.length === 1 ? 'Planlauf' : 'Planläufe'}
                    </span>
                  </button>
                </td>
              </tr>
            ) : null}
            {verworfeneOffen ? sortieren(verworfene).map((e) => zeile(e, pakete.length > 0)) : null}
          </tbody>
        </table>
      </div>

      {schrittWahl ? (
        <>
          <div className="filter-schatten" onClick={() => setSchrittWahl(null)} />
          <div className="filter-menu" style={{ top: schrittWahl.y, left: schrittWahl.x, width: 240 }} role="menu">
            <div className="pll-menu-titel">
              {schrittWahl.art === 'erledigt' ? 'Welcher Schritt ist erledigt?' : 'Erinnerung zu welchem Schritt?'}
            </div>
            {schrittWahl.schritte.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  const { art, run } = schrittWahl;
                  setSchrittWahl(null);
                  if (art === 'erledigt') setzeStatus(run, s, 'erledigt');
                  else setMail({ run, step: s });
                }}
              >
                {s.name}
                <span className="pll-menu-sub">
                  {personVon(s)} · {relativeLabel(s.sollDatum)}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      {mail ? (
        <EmailDialog project={project} run={mail.run} step={mail.step} onClose={() => setMail(null)} />
      ) : null}
      {nachweisDialog}
      {buendeln ? <BuendelnDialog verzeichnis={buendeln} onClose={() => setBuendeln(null)} /> : null}
      {herausloesen ? (
        <ConfirmDialog
          titel="Plan herauslösen?"
          text={`„${herausloesen.plan.titel}“ erhält einen eigenen Planlauf und übernimmt dazu den Stand von „${herausloesen.lauf.name}“ – erledigte Schritte bleiben erledigt. Der Lauf des Verzeichnisses geht für die übrigen Pläne weiter.`}
          bestaetigenLabel="Herauslösen"
          onConfirm={() => {
            if (planHerausloesen(herausloesen.plan.id)) toast('Plan herausgelöst – er läuft jetzt einzeln weiter.');
          }}
          onClose={() => setHerausloesen(null)}
        />
      ) : null}
    </>
  );
}
