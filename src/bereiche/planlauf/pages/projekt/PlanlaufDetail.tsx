/**
 * Detailansicht eines Planlaufs: Kopf mit Fortschritt, voraussichtlichem Ende
 * und Verzug; der Verlauf (domain/ablauf.ts) mit parallelen Blöcken als Gruppe,
 * je Schritt Eingang, Frist, Soll, Ist, Verzug, Seite, Erinnerungen und frühere
 * Durchläufe; Aktionen an jedem anstehenden Schritt; Wieder öffnen,
 * Schritt anpassen bzw. einfügen; Terminnachweis und Protokoll.
 *
 * Dialoge merken sich nur IDs und lesen Lauf und Schritt nach jedem
 * Store-Update frisch – der Lauf kommt bei jeder Änderung neu aus `data`.
 */
import { useMemo, useState } from 'react';
import {
  ampelFuerSchritt,
  erledigteUebernehmen,
  fortschritt,
  funktionenFuerGewerk,
  kontaktFuerRolleUndGewerk,
  kontaktName,
  laufSchritteAusVorlage,
  massgeblicheAntwort,
  neueLaufFelder,
  nichtImPfad,
  seiteFuerSchritt,
  verlaufDerKette,
  vorlagenSchritte,
  type Verlauf,
} from '../../domain/engine';
import {
  aktuelleSchritte,
  blockTitel,
  einfuegenMoeglich,
  folgeImVerlauf,
  istBegonnen,
  istErledigt,
  zweigTitel,
  type Abschnitt,
  type EinfuegePosition,
} from '../../domain/ablauf';
import { wiederOeffnenArt, type Aenderung, type WiederOeffnenArt } from '../../domain/abschluss';
import { tage, tageText, terminnachweis, verzugBisHeute, zeitrahmen, type Zeitrahmen } from '../../domain/nachweis';
import { formatDate, tageLabel, today } from '../../../../shared/dates';
import {
  INDEX_LABEL,
  NACHWEIS_LABEL,
  SEITE_LABEL,
  STEP_STATUS_LABEL,
  STEP_TYPE_LABEL,
  ANLIEGEN_OPTIONEN,
  hatEigenenPlanlauf,
  istPrueferRolle,
  verzeichnisGebuendelt,
  type AbbruchArt,
  type ID,
  type Nachweis,
  type PlanDocument,
  type PlanRun,
  type ProcessTemplate,
  type ProcessTemplateStep,
  type Project,
  type RunStep,
  type StepType,
  type VersandAnliegen,
} from '../../domain/types';
import { newId, useStore } from '../../store/store';
import { useToast } from '../../../../shared/toast';
import {
  AmpelBadge,
  DocKindIcon,
  Kennzahl,
  RunStatusBadge,
  SeiteBadge,
  StepTypBadge,
  erinnerungText,
  zeitpunktText,
} from '../../components/common';
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  Field,
  Modal,
  Progress,
  Select,
  TextArea,
  TextInput,
} from '../../../../shared/ui';
import { BuendelnDialog, planeMitEigenemLauf } from '../../components/BuendelnDialog';
import { EmailDialog } from '../../components/EmailDialog';
import { useSchrittStatus } from '../../components/SchrittStatus';
import { LaufSchritte } from '../../components/AblaufVorschau';
import { TerminnachweisKarte } from '../../components/Terminnachweis';
import { ProtokollKarte } from '../../components/Protokoll';
import { Icon } from '../../../../shared/icons';
import '../../components/planlauf.css';

/**
 * Wie ein Schritt im laufenden Durchlauf einging: nach einem Rücksprung bzw.
 * einer erneuten Bearbeitung (Wiedereingang) – null beim gewöhnlichen Eingang.
 * Wiedereingang ist es, wenn der Schritt einen weiteren Durchlauf hat und seine
 * Vorgänger im Verlauf nicht mit ihm wiederholt wurden.
 */
function wiedereingang(
  step: RunStep,
  verlauf: Verlauf<RunStep>,
  steps: RunStep[],
): 'ruecksprung' | 'wieder_geoeffnet' | null {
  const historie = step.historie ?? [];
  if ((step.durchlauf ?? 1) <= 1 || historie.length === 0) return null;
  const vor = verlauf.vorgaenger.get(step.id) ?? [];
  const neu = vor.every((id) => (steps.find((s) => s.id === id)?.durchlauf ?? 1) < (step.durchlauf ?? 1));
  return neu ? historie[historie.length - 1].grund : null;
}

/**
 * Folgt ein laufender Lauf noch einer früheren Fassung seines Workflows?
 * Verglichen werden Bezeichnung, Funktion und Zugehörigkeit zu einem
 * parallelen Block; im Lauf geänderte Schritte (Abweichung) zählen nicht.
 */
function alteFassung(run: PlanRun, vorlage: ProcessTemplate | undefined): boolean {
  if (!vorlage || run.status !== 'laufend' || vorlage.steps.length === 0) return false;
  const norm = (t: string) => t.trim().toLowerCase();
  const merkmal = (s: { name: string; roleName: string; parallel?: unknown }) =>
    `${norm(s.name)}|${norm(s.roleName)}|${s.parallel ? 'parallel' : ''}`;
  const imWorkflow = new Set(vorlage.steps.map(merkmal));
  if (run.steps.some((s) => !s.abweichung && !imWorkflow.has(merkmal(s)))) return true;
  const namen = new Set(run.steps.map((s) => norm(s.name)));
  return vorlage.steps.some((s) => !namen.has(norm(s.name)));
}

/** Abschluss eines Schritts: das spätere von Ist und Eingang (siehe recalcSollDaten). */
function fertigAm(s: Pick<RunStep, 'istDatum' | 'eingangIst'>): string | null {
  return [s.istDatum, s.eingangIst].filter((x): x is string => Boolean(x)).sort().pop() ?? null;
}

export function PlanlaufDetail({
  project,
  run,
  onZurueck,
  oeffneLauf,
}: {
  project: Project;
  run: PlanRun;
  onZurueck: () => void;
  /** Öffnet einen anderen Planlauf – etwa den Nachfolger nach einem Abbruch. */
  oeffneLauf?: (runId: string) => void;
}) {
  const {
    data,
    aenderungenAnwenden,
    deleteRun,
    abbrechenRun,
    neuerIndexStarten,
    planHerausloesen,
    verzeichnisAufteilen,
  } = useStore();
  const toast = useToast();
  const [mailStepId, setMailStepId] = useState<ID | null>(null);
  const [bearbeitenId, setBearbeitenId] = useState<ID | null>(null);
  const [wiederOeffnenId, setWiederOeffnenId] = useState<ID | null>(null);
  const [neuerSchritt, setNeuerSchritt] = useState(false);
  const [laufLoeschen, setLaufLoeschen] = useState(false);
  const [abbrechen, setAbbrechen] = useState(false);
  /** Neustart: „neu“ – Workflow ändern; „umstellen“ – auf die aktuelle Fassung, erledigte Schritte übernehmen. */
  const [neustart, setNeustart] = useState<'neu' | 'umstellen' | null>(null);
  const { setzeStatus, nachweisDialog } = useSchrittStatus();
  const [aufgeklappt, setAufgeklappt] = useState<string[]>([]);
  const [durchlaeufeOffen, setDurchlaeufeOffen] = useState<string[]>([]);
  /** Die Pläne eines Verzeichnisses sind zunächst zugeklappt. */
  const [plaeneOffen, setPlaeneOffen] = useState(false);
  const [nachtrag, setNachtrag] = useState<
    { art: 'herausloesen'; plan: PlanDocument } | { art: 'aufteilen' } | { art: 'buendeln' } | null
  >(null);

  const doc = data.documents.find((d) => d.id === run.documentId);
  // Pläne eines Verzeichnisses: laufen mit oder haben einen eigenen Lauf
  const plaene =
    doc?.kind === 'verzeichnis' ? data.documents.filter((d) => d.kind === 'plan' && d.parentId === doc.id) : [];
  const eigenerLaufVon = (planId: string) =>
    data.runs.find((r) => r.documentId === planId && r.status !== 'abgebrochen');
  const mitlaufend = plaene.filter((p) => !hatEigenenPlanlauf(p, data.documents));
  const ohneEigenenLauf = plaene.filter((p) => !eigenerLaufVon(p.id));
  /** Nur ein laufender, gebündelter Verzeichnislauf lässt sich herauslösen bzw. aufteilen. */
  const nachtraeglich = doc?.kind === 'verzeichnis' && verzeichnisGebuendelt(doc) && run.status === 'laufend';
  /** Pläne mit eigenem Lauf lassen sich wieder bündeln – auch nach dem Aufteilen. */
  const buendelbar = doc?.kind === 'verzeichnis' ? planeMitEigenemLauf(data.documents, data.runs, doc.id).length : 0;

  const rollen = useMemo(() => data.roles.filter((r) => r.projectId === project.id), [data.roles, project.id]);
  const kontakte = useMemo(
    () => data.contacts.filter((c) => c.projectId === project.id),
    [data.contacts, project.id],
  );
  const gewerk = doc?.gewerk ?? '';
  const rahmen = zeitrahmen(project);
  const verlauf = verlaufDerKette(run.steps);
  /** Laufende Nummer im Verlauf (Blöcke: Zweig 0, dann Zweig 1 …). */
  const nummer = new Map(verlauf.schritte.map((s, i) => [s.id, i + 1]));
  const abseits = nichtImPfad(run.steps);
  // In parallelen Zweigen stehen mehrere Schritte zugleich an – jeder ist bedienbar.
  // Ein abgebrochener Lauf hat keine anstehenden Schritte mehr (keine Ampel, kein Verzug).
  const anstehendeListe = run.status === 'laufend' ? aktuelleSchritte(run) : [];
  const anstehend = new Set(anstehendeListe.map((s) => s.id));
  const vorlauf = project.settings.erinnerungVorlaufTage;
  const abweichungen = run.steps.filter((s) => s.abweichung).length;
  const beendet = run.status !== 'laufend';
  const nw = useMemo(() => terminnachweis(run, project, rollen, kontakte, doc), [run, project, rollen, kontakte, doc]);
  const fortschrittWert = fortschritt(run, project, doc);
  const erledigtImVerlauf = verlauf.schritte.filter(istErledigt).length;
  const vorlage = data.templates.find((t) => t.id === run.templateId);
  const veraltet = alteFassung(run, vorlage);
  // Größter aktueller Verzug unter den anstehenden Schritten
  let ueberfaellig: { step: RunStep; tage: number } | null = null;
  for (const s of anstehendeListe) {
    const n = verzugBisHeute(s, rahmen);
    if (n > 0 && (!ueberfaellig || n > ueberfaellig.tage)) ueberfaellig = { step: s, tage: n };
  }

  /**
   * Die Kette der Neustarts vor diesem Lauf: rückwärts die neu gestarteten
   * Läufe desselben Eintrags bis zum ersten anderen Lauf. Neue Läufe werden
   * stets angehängt, die Reihenfolge im Bestand ist also die zeitliche.
   */
  const vorherige: PlanRun[] = [];
  const position = data.runs.findIndex((x) => x.id === run.id);
  for (const r of (position < 0 ? [] : data.runs.slice(0, position)).reverse()) {
    if (r.documentId !== run.documentId) continue;
    if (r.status !== 'abgebrochen' || r.abbruchArt !== 'neu_gestartet') break;
    vorherige.unshift(r);
  }
  /** Der Lauf, der nach einem Neustart an die Stelle dieses Laufs getreten ist. */
  const nachfolger =
    run.abbruchArt === 'neu_gestartet'
      ? (data.runs.find((r) => r.documentId === run.documentId && r.status === 'laufend') ??
        data.runs.find((r) => r.documentId === run.documentId && r.status === 'abgeschlossen'))
      : undefined;

  /** Klappt einen erledigten oder künftigen Schritt auf bzw. wieder zu. */
  const klappen = (stepId: string) =>
    setAufgeklappt((a) => (a.includes(stepId) ? a.filter((x) => x !== stepId) : [...a, stepId]));
  const durchlaeufeKlappen = (stepId: string) =>
    setDurchlaeufeOffen((a) => (a.includes(stepId) ? a.filter((x) => x !== stepId) : [...a, stepId]));

  const waehleAntwort = (step: RunStep, antwortId: string) =>
    aenderungenAnwenden(run.id, [{ art: 'step', stepId: step.id, patch: { gewaehlteAntwortId: antwortId } }]);

  /* ---------------- Ein Schritt ---------------- */

  const schrittDetails = (step: RunStep, istAktiv: boolean, imVerlauf: boolean) => {
    const erledigt = istErledigt(step);
    const dauerhaftOffen = istAktiv && !beendet;
    const kontakt = data.contacts.find((c) => c.id === step.contactId);
    // Abgeschlossene Schritte zeigen die Momentaufnahme beim Abschluss
    const info = erledigt ? step.abschlussInfo : null;
    const person = info ? info.kontaktName || 'nicht zugeordnet' : kontakt ? kontaktName(kontakt) : 'nicht zugeordnet';
    const seite = info ? info.seite : seiteFuerSchritt(step.roleName, rollen, gewerk);
    const wieder = imVerlauf ? wiedereingang(step, verlauf, run.steps) : null;
    const ersterMitEingangSoll =
      Boolean(doc?.eingangSoll) &&
      imVerlauf &&
      (verlauf.vorgaenger.get(step.id) ?? []).length === 0 &&
      (step.durchlauf ?? 1) === 1;
    const kuenftig = !erledigt && !istAktiv;
    const verzugJetzt = istAktiv ? verzugBisHeute(step, rahmen) : 0;
    const abweichung = erledigt && step.sollDatum && step.istDatum ? tage(step.sollDatum, step.istDatum, rahmen) : 0;
    const erinnerungen = (step.erinnerungen ?? []).filter(
      (e) => e.durchlauf === null || e.durchlauf === (step.durchlauf ?? 1),
    );
    const historie = step.historie ?? [];
    const historieOffen = durchlaeufeOffen.includes(step.id);
    return (
      <>
        <div className="pl-angaben">
          <span>
            Verantwortlich: <b>{info?.roleName || step.roleName || '–'}</b>
          </span>
          <span>
            Person: <b>{person}</b>
          </span>
          <span>
            Seite: <SeiteBadge seite={seite} />
          </span>
          {step.eingangIst ? (
            <span>
              {wieder ? (
                <>
                  Wiedereingang am <b>{formatDate(step.eingangIst)}</b>{' '}
                  {wieder === 'ruecksprung' ? '(aus Rücksprung)' : '(wieder geöffnet)'}
                </>
              ) : (
                <>
                  Eingang: <b>{formatDate(step.eingangIst)}</b>
                </>
              )}
              {step.eingangGeschaetzt ? (
                <>
                  {' '}
                  <Badge ton="gelb">geschätzt</Badge>
                </>
              ) : null}
            </span>
          ) : step.eingangDatum ? (
            <span className="pl-voraussichtlich">
              Eingang: voraussichtlich <b>{formatDate(step.eingangDatum)}</b>
            </span>
          ) : null}
          <span>
            Frist: <b>{ersterMitEingangSoll ? 'Eingang laut Eintrag' : tageLabel(step.fristTage)}</b>
          </span>
          <span className={kuenftig ? 'pl-voraussichtlich' : ''}>
            Soll: {kuenftig ? 'voraussichtlich ' : ''}
            <b>{formatDate(step.sollDatum)}</b>
            {step.sollManuell ? ' (von Hand)' : ''}
          </span>
          {erledigt || step.istDatum ? (
            <span>
              Ist: <b>{formatDate(step.istDatum)}</b>
            </span>
          ) : null}
          {verzugJetzt > 0 ? (
            <span className="pl-verzug">Verzug: {tageText(verzugJetzt, rahmen.arbeitstage)}</span>
          ) : null}
          {abweichung > 0 ? (
            <span className="pl-verzug">{tageText(abweichung, rahmen.arbeitstage)} nach dem Soll</span>
          ) : abweichung < 0 ? (
            <span className="pl-frueher">{tageText(-abweichung, rahmen.arbeitstage)} vor dem Soll</span>
          ) : null}
          {step.nachweisNummer ? (
            <span>
              {NACHWEIS_LABEL[step.nachweis]} <b>{step.nachweisNummer}</b>
            </span>
          ) : step.nachweis !== 'keine' && !erledigt ? (
            <span className="tertiary">{NACHWEIS_LABEL[step.nachweis]} wird beim Erledigen erfasst</span>
          ) : null}
        </div>

        {step.typ === 'entscheidung' && step.antworten.length > 0 ? (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="small muted">Antwort:</span>
            {step.antworten.map((a) => {
              const gewaehlt = massgeblicheAntwort(step)?.id === a.id;
              const gesetzt = step.gewaehlteAntwortId === a.id;
              const ziel =
                a.ziel === 'ende'
                  ? 'beendet den Planlauf'
                  : a.ziel
                    ? `weiter mit „${run.steps.find((s) => s.id === a.ziel)?.name ?? '?'}“`
                    : 'weiter mit dem nächsten Schritt';
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`antwort-chip ${gewaehlt ? 'gewaehlt' : ''}`}
                  onClick={() => waehleAntwort(step, a.id)}
                  disabled={!dauerhaftOffen}
                  title={a.nacharbeit ? `${ziel} – führt zu Nacharbeit` : ziel}
                >
                  {a.text}
                  {gesetzt ? ' ✓' : ''}
                </button>
              );
            })}
            {dauerhaftOffen && !step.gewaehlteAntwortId ? (
              <span className="small tertiary">(Vorschau: erste Möglichkeit)</span>
            ) : null}
          </div>
        ) : null}

        {step.bemerkung ? <p className="small tertiary">{step.bemerkung}</p> : null}

        {erinnerungen.length > 0 ? (
          <div className="pl-liste">
            {erinnerungen.length > 3 ? <span>… {erinnerungen.length - 3} frühere Erinnerungen</span> : null}
            {erinnerungen.slice(-3).map((e, i) => (
              <span key={`${e.zeitpunkt}-${i}`}>{erinnerungText(e)}</span>
            ))}
          </div>
        ) : null}

        {historie.length > 0 ? (
          <>
            <button type="button" className="pl-link" onClick={() => durchlaeufeKlappen(step.id)}>
              {historieOffen ? 'Frühere Durchläufe ausblenden' : `Frühere Durchläufe (${historie.length})`}
            </button>
            {historieOffen ? <FruehereDurchlaeufe step={step} rahmen={rahmen} /> : null}
          </>
        ) : null}

        {dauerhaftOffen ? (
          <div className="step-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setzeStatus(run, step, 'erledigt')}>
              <Icon name="check" size={13} /> Erledigt
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setzeStatus(run, step, 'uebersprungen')}>
              Überspringen
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setMailStepId(step.id)}
              title="Vorbereitete E-Mail an die zuständige Person"
            >
              <Icon name="mail" size={13} /> Erinnern
            </button>
          </div>
        ) : imVerlauf && erledigt && run.status !== 'abgebrochen' ? (
          <div className="step-actions">
            <button type="button" className="btn btn-sm" onClick={() => setWiederOeffnenId(step.id)}>
              Wieder öffnen …
            </button>
          </div>
        ) : null}
      </>
    );
  };

  const zeile = (step: RunStep, mitLinie: boolean, imVerlauf = true) => {
    const istAktiv = anstehend.has(step.id);
    const ampel = ampelFuerSchritt(step, vorlauf, istAktiv);
    const erledigt = istErledigt(step);
    // Anstehende Schritte sind stets offen; erledigte und künftige bleiben auf
    // Titel und Nummer reduziert und lassen sich per Klick aufklappen.
    const dauerhaftOffen = istAktiv && !beendet;
    const details = dauerhaftOffen || aufgeklappt.includes(step.id);
    const nr = nummer.get(step.id);
    return (
      <div
        className={`step-row mit-aktion ${dauerhaftOffen ? 'aktiv' : ''} ${details ? '' : 'kompakt'}`}
        key={step.id}
      >
        <div className="step-marker">
          <div
            className={`step-num ${
              ampel === 'erledigt' ? 'done' : ampel === 'ueberfaellig' ? 'late' : istAktiv ? 'current' : ''
            }`}
          >
            {erledigt ? <Icon name="check" size={12} strokeWidth={2.4} /> : (nr ?? '·')}
          </div>
          {mitLinie ? <div className="step-line" /> : null}
        </div>

        <div className="step-body">
          <div className="step-title">
            {dauerhaftOffen ? (
              <strong>{step.name}</strong>
            ) : (
              <button
                type="button"
                className={`step-aufklappen ${details ? 'offen' : ''}`}
                onClick={() => klappen(step.id)}
                title={details ? 'Details ausblenden' : 'Details anzeigen'}
              >
                <strong>{step.name}</strong>
                <span className="chev">
                  <Icon name="chevron" size={13} />
                </span>
              </button>
            )}
            {details ? (
              <>
                <StepTypBadge typ={step.typ} />
                {step.status === 'uebersprungen' ? <Badge>Übersprungen</Badge> : <AmpelBadge ampel={ampel} />}
                {step.abweichung ? <Badge ton="orange">Abweichung</Badge> : null}
                {(step.durchlauf ?? 1) > 1 ? <Badge ton="purple">{step.durchlauf}. Durchlauf</Badge> : null}
              </>
            ) : (
              <span className="small tertiary">
                {erledigt
                  ? `Ist ${formatDate(step.istDatum)}`
                  : imVerlauf && step.sollDatum
                    ? `Soll voraussichtlich ${formatDate(step.sollDatum)}`
                    : (step.historie ?? []).length > 0
                      ? `${step.historie.length} frühere${step.historie.length === 1 ? 'r' : ''} Durchl${step.historie.length === 1 ? 'auf' : 'äufe'}`
                      : ''}
              </span>
            )}
          </div>
          {details ? schrittDetails(step, istAktiv, imVerlauf) : null}
        </div>

        {!beendet ? (
          <button
            type="button"
            className="btn-icon step-anpassen"
            title="Schritt anpassen"
            aria-label="Schritt anpassen"
            onClick={() => setBearbeitenId(step.id)}
          >
            <Icon name="bearbeiten" size={15} />
          </button>
        ) : null}
      </div>
    );
  };

  /* ---------------- Paralleler Block ---------------- */

  const blockAnsicht = (a: Extract<Abschnitt<RunStep>, { art: 'parallel' }>) => {
    const name = (id: ID | null) => (id ? (run.steps.find((s) => s.id === id)?.name ?? '?') : '');
    const durchgang = a.zweige.flatMap((z) => z.schritte)[0]?.blockDurchgang ?? 1;
    return (
      <div className="pl-block" key={`${a.block}-${durchgang}`}>
        <div className="pl-block-kopf">
          <strong>{blockTitel(a.name, a.zweige.length)}</strong>
          {durchgang > 1 ? <Badge ton="purple">{durchgang}. Durchgang</Badge> : null}
          <span>Die Zweige laufen gleichzeitig.</span>
        </div>
        <div className="pl-zweige">
          {a.zweige.map((z) => {
            const fertig = z.schritte.filter(istErledigt).length;
            return (
              <div className="pl-zweig" key={z.zweig}>
                <div className="pl-zweig-kopf">
                  <span title={z.name ? `Zweig ${z.zweig + 1}` : undefined}>{zweigTitel(z.name, z.zweig)}</span>
                  <span>
                    {fertig} von {z.schritte.length} erledigt
                  </span>
                </div>
                {z.schritte.length === 0 ? <div className="pl-zweig-leer">Keine Schritte in diesem Zweig.</div> : null}
                {z.schritte.map((s, i) => zeile(s, i < z.schritte.length - 1))}
                {z.rueckSprungZu ? (
                  <div className="pl-hinweis schleife">
                    ↺ Rücksprung im Zweig zu „{z.rueckSprungZu.name}“ – ist der Zweig bis hier erledigt, beginnt dort ein
                    weiterer Durchlauf.
                  </div>
                ) : null}
                {z.abgeschnitten ? (
                  <div className="pl-hinweis">
                    Der Block wird über einen anderen Zweig verlassen – hier wird Laufendes noch erledigt, Neues beginnt
                    nicht mehr.
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {a.ausstiegVon && a.ausstiegNach ? (
          <div className="pl-hinweis ausstieg">
            Der Block wird über „{name(a.ausstiegVon)}“ verlassen – nach diesem Schritt geht es bei „
            {name(a.ausstiegNach)}“ weiter.
            {a.ausstiegWirksam ? ' Die übrigen Zweige beginnen nichts Neues mehr.' : ''}
          </div>
        ) : null}
        <div className="pl-block-fuss">Weiter, wenn alle Zweige erledigt sind.</div>
      </div>
    );
  };

  /* ---------------- Kopf ---------------- */

  const gv = nw.gesamtverzug;
  const ende =
    run.status === 'abgebrochen'
      ? { label: 'Abgebrochen am', wert: formatDate(run.abbruchDatum) }
      : run.status === 'abgeschlossen'
        ? { label: 'Abgeschlossen am', wert: formatDate(nw.ende) }
        : { label: 'Voraussichtliches Ende', wert: nw.ende ? formatDate(nw.ende) : '–' };
  const abseitsMitVergangenheit = abseits.filter((s) => (s.historie ?? []).length > 0 || istBegonnen(s));
  const abseitsUebrige = abseits.filter((s) => !abseitsMitVergangenheit.includes(s));

  return (
    <div className="stack">
      <div className="row-between wrap">
        <button type="button" className="btn btn-ghost" onClick={onZurueck}>
          <Icon name="zurueck" size={14} /> Planläufe
        </button>
        <div className="row wrap">
          {run.status === 'laufend' ? (
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setNeustart('neu')}
                title="Anderen Workflow wählen und den Planlauf von vorn beginnen"
              >
                Workflow ändern …
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setAbbrechen(true)}>
                Planlauf abbrechen
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-danger" onClick={() => setLaufLoeschen(true)}>
            <Icon name="loeschen" size={14} /> Lauf löschen
          </button>
        </div>
      </div>

      {run.status === 'abgebrochen' && run.abbruchArt === 'aufgeteilt' ? (
        <Callout>
          <strong>
            In Einzelläufe der Pläne aufgeteilt{run.abbruchDatum ? ` am ${formatDate(run.abbruchDatum)}` : ''}.
          </strong>
          <div>Jeder Plan des Verzeichnisses führt den Planlauf seither mit dem übernommenen Stand selbst fort.</div>
        </Callout>
      ) : run.status === 'abgebrochen' && run.abbruchArt === 'neu_gestartet' ? (
        <Callout>
          <div className="row-between wrap" style={{ gap: 10 }}>
            <span>
              <strong>
                Mit geändertem Workflow neu gestartet{run.abbruchDatum ? ` am ${formatDate(run.abbruchDatum)}` : ''}.
              </strong>
              <div>{run.abbruchGrund}</div>
            </span>
            {nachfolger ? (
              <button type="button" className="btn btn-sm btn-outline" onClick={() => oeffneLauf?.(nachfolger.id)}>
                Aktuellen Planlauf öffnen
              </button>
            ) : null}
          </div>
        </Callout>
      ) : run.status === 'abgebrochen' && run.abbruchArt === 'gebuendelt' ? (
        <Callout>
          <strong>
            Wieder im Planlauf des Verzeichnisses gebündelt
            {run.abbruchDatum ? ` am ${formatDate(run.abbruchDatum)}` : ''}.
          </strong>
          <div>Der Plan läuft seither im gebündelten Lauf seines Verzeichnisses mit.</div>
        </Callout>
      ) : run.status === 'abgebrochen' ? (
        <Callout ton="error" icon="!">
          <strong>Planlauf abgebrochen{run.abbruchDatum ? ` am ${formatDate(run.abbruchDatum)}` : ''}.</strong>
          <div>{run.abbruchGrund || 'Ohne Begründung.'}</div>
        </Callout>
      ) : null}

      <Card>
        <CardHeader
          titel={doc ? `${doc.nummer} · ${doc.titel}` : run.name}
          sub={
            <>
              {doc
                ? `${doc.nummer} · ${doc.titel}${
                    doc.index ? ` (${INDEX_LABEL[doc.kind]} ${doc.index})` : ''
                  }`
                : 'ohne Plan'}{' '}
              · Start{' '}
              {formatDate(run.start)} · Vorlage: {run.templateName}
            </>
          }
          actions={<RunStatusBadge status={run.status} />}
        />
        <div className="pl-kennzahlen">
          <Kennzahl
            label="Fortschritt"
            wert={`${fortschrittWert} %`}
            sub={`${erledigtImVerlauf} von ${verlauf.schritte.length} Schritten im Verlauf erledigt`}
          >
            <Progress wert={fortschrittWert} />
          </Kennzahl>
          <Kennzahl
            label={ende.label}
            wert={ende.wert}
            sub={nw.basisEnde ? `geplant ${formatDate(nw.basisEnde)}` : 'ohne Basisplan'}
          />
          <Kennzahl
            label="Verzug gegenüber Basis"
            wert={
              gv === null
                ? '–'
                : gv > 0
                  ? tageText(gv, rahmen.arbeitstage)
                  : gv < 0
                    ? `${tageText(-gv, rahmen.arbeitstage)} früher`
                    : 'im Plan'
            }
            ton={gv === null ? '' : gv > 0 ? 'rot' : 'gruen'}
            sub={
              ueberfaellig
                ? `„${ueberfaellig.step.name}“ ${tageText(ueberfaellig.tage, rahmen.arbeitstage)} überfällig`
                : run.status === 'laufend' && nw.endeIstPrognose
                  ? 'nach Prognose'
                  : undefined
            }
          />
        </div>
        {abweichungen > 0 || run.bemerkung || vorherige.length > 0 || veraltet ? (
          <div className="card-pad" style={{ borderTop: '1px solid var(--separator)' }}>
            {veraltet && vorlage ? (
              <Callout icon="i">
                <div className="row-between wrap" style={{ gap: 10 }}>
                  <span>
                    Der Workflow „{vorlage.name}“ wurde seit dem Start dieses Planlaufs geändert – der Lauf folgt noch
                    der früheren Fassung.
                  </span>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setNeustart('umstellen')}>
                    Auf aktuelle Fassung umstellen …
                  </button>
                </div>
              </Callout>
            ) : null}
            {abweichungen > 0 ? (
              <Callout ton="warn" icon="!">
                {abweichungen} Schritt(e) weichen vom Standard-Workflow ab. Änderungen wirken nur in diesem
                Planlauf.
              </Callout>
            ) : null}
            {run.bemerkung ? <p className="small muted" style={{ marginTop: 10 }}>{run.bemerkung}</p> : null}
            {vorherige.length > 0 ? (
              <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                <span className="small muted">Frühere Läufe vor dem Neustart:</span>
                {vorherige.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => oeffneLauf?.(r.id)}
                    title="Bisherigen Lauf zum Nachschlagen öffnen"
                  >
                    Workflow „{r.templateName}“{r.abbruchDatum ? ` · bis ${formatDate(r.abbruchDatum)}` : ''}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {plaene.length > 0 && doc ? (
        <Card>
          <CardHeader
            titel="Pläne dieses Verzeichnisses"
            sub={
              verzeichnisGebuendelt(doc)
                ? `${plaene.length} ${plaene.length === 1 ? 'Plan' : 'Pläne'} · ${mitlaufend.length} ${
                    mitlaufend.length === 1 ? 'läuft' : 'laufen'
                  } in diesem Planlauf mit · ${plaene.length - mitlaufend.length} mit eigenem Lauf`
                : `${plaene.length} ${plaene.length === 1 ? 'Plan' : 'Pläne'} · jeder mit eigenem Planlauf`
            }
            actions={
              <span className="row" style={{ gap: 6 }}>
                {buendelbar > 0 ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setNachtrag({ art: 'buendeln' })}
                  >
                    Pläne wieder bündeln …
                  </button>
                ) : null}
                {nachtraeglich && ohneEigenenLauf.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setNachtrag({ art: 'aufteilen' })}
                  >
                    Alle Pläne einzeln weiterführen …
                  </button>
                ) : null}
                <button type="button" className="btn btn-sm" onClick={() => setPlaeneOffen((o) => !o)}>
                  {plaeneOffen ? 'Ausblenden' : 'Anzeigen'}
                </button>
              </span>
            }
          />
          {plaeneOffen
            ? plaene.map((plan) => {
                const eigener = eigenerLaufVon(plan.id);
                return (
                  <div className="list-row" key={plan.id}>
                    <DocKindIcon kind="plan" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="num">
                        {plan.nummer}
                        {plan.index ? ` · ${INDEX_LABEL.plan} ${plan.index}` : ''}
                      </span>
                      <div>
                        <strong>{plan.titel}</strong>
                      </div>
                    </div>
                    {eigener ? (
                      <>
                        <RunStatusBadge status={eigener.status} />
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => oeffneLauf?.(eigener.id)}
                        >
                          Planlauf öffnen
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="small tertiary">läuft mit</span>
                        {nachtraeglich ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => setNachtrag({ art: 'herausloesen', plan })}
                          >
                            Herauslösen …
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })
            : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader
          titel="Prozessschritte"
          sub="Die Frist zählt ab dem tatsächlichen Eingang – dem Abschluss des vorherigen Schritts."
          actions={
            !beendet ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setNeuerSchritt(true)}>
                <Icon name="plus" size={13} /> Schritt einfügen
              </button>
            ) : null
          }
        />
        {verlauf.abschnitte.map((a, k) =>
          a.art === 'schritt'
            ? zeile(a.step, k < verlauf.abschnitte.length - 1 || Boolean(verlauf.rueckSprungZu))
            : blockAnsicht(a),
        )}

        {verlauf.rueckSprungZu ? (
          <div className="step-row">
            <div className="step-marker">
              <div className="step-num" title="Rücksprung">
                ↺
              </div>
            </div>
            <div className="step-body">
              <div className="step-title">
                <strong>Rücksprung zu „{verlauf.rueckSprungZu.name}“</strong>
                <Badge ton="purple">Schleife</Badge>
              </div>
              <p className="small muted">
                Der Ablauf führt hier zurück. Sobald der Schritt davor erledigt wird, beginnt ab diesem Schritt
                ein weiterer Durchlauf.
              </p>
            </div>
          </div>
        ) : null}

        {abseits.length > 0 ? (
          <div className="pl-abseits">
            <div className="small muted">
              Nicht im aktuellen Verlauf – werden bei anderer Entscheidung durchlaufen:
            </div>
            {abseitsMitVergangenheit.length > 0 ? (
              <div>{abseitsMitVergangenheit.map((s) => zeile(s, false, false))}</div>
            ) : null}
            {abseitsUebrige.length > 0 ? (
              <div className="row wrap" style={{ gap: 6 }}>
                {abseitsUebrige.map((s) => (
                  <span key={s.id} className="badge">
                    {s.name}
                    {s.roleName ? ` · ${s.roleName}` : ''}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <TerminnachweisKarte project={project} run={run} doc={doc} nw={nw} />

      <ProtokollKarte run={run} />

      {mailStepId && run.steps.some((s) => s.id === mailStepId) ? (
        <EmailDialog project={project} runId={run.id} stepId={mailStepId} onClose={() => setMailStepId(null)} />
      ) : null}

      {bearbeitenId && run.steps.some((s) => s.id === bearbeitenId) ? (
        <SchrittDialog
          key={bearbeitenId}
          project={project}
          run={run}
          stepId={bearbeitenId}
          verlauf={verlauf}
          nummer={nummer}
          onClose={() => setBearbeitenId(null)}
        />
      ) : null}

      {neuerSchritt ? (
        <SchrittDialog
          project={project}
          run={run}
          verlauf={verlauf}
          nummer={nummer}
          onClose={() => setNeuerSchritt(false)}
        />
      ) : null}

      {wiederOeffnenId && run.steps.some((s) => s.id === wiederOeffnenId) ? (
        <WiederOeffnenDialog run={run} stepId={wiederOeffnenId} onClose={() => setWiederOeffnenId(null)} />
      ) : null}

      {nachweisDialog}

      {nachtrag?.art === 'herausloesen' ? (
        <ConfirmDialog
          titel="Plan herauslösen?"
          text={`„${nachtrag.plan.titel}“ erhält einen eigenen Planlauf und übernimmt dazu den Stand dieses Laufs – erledigte Schritte bleiben erledigt. Dieser Lauf geht für die übrigen Pläne weiter.`}
          bestaetigenLabel="Herauslösen"
          onConfirm={() => {
            if (planHerausloesen(nachtrag.plan.id)) toast('Plan herausgelöst – er läuft jetzt einzeln weiter.');
          }}
          onClose={() => setNachtrag(null)}
        />
      ) : null}

      {nachtrag?.art === 'buendeln' && doc ? (
        <BuendelnDialog
          verzeichnis={doc}
          onClose={() => setNachtrag(null)}
          onGebuendelt={(runId) => {
            setPlaeneOffen(true);
            // Ist ein neuer Verzeichnislauf entstanden, dorthin wechseln
            if (runId !== run.id) oeffneLauf?.(runId);
          }}
        />
      ) : null}

      {nachtrag?.art === 'aufteilen' ? (
        <ConfirmDialog
          titel="Alle Pläne einzeln weiterführen?"
          text={`${ohneEigenenLauf.length === 1 ? 'Ein Plan erhält' : `${ohneEigenenLauf.length} Pläne erhalten`} einen eigenen Planlauf mit dem Stand dieses Laufs. Dieser gebündelte Lauf endet, das Verzeichnis ordnet die Pläne danach nur noch. Das lässt sich nicht rückgängig machen.`}
          bestaetigenLabel="Einzeln weiterführen"
          onConfirm={() => {
            const anzahl = verzeichnisAufteilen(run.documentId);
            toast(
              anzahl === 1 ? 'Ein Plan läuft jetzt einzeln weiter.' : `${anzahl} Pläne laufen jetzt einzeln weiter.`,
            );
            setPlaeneOffen(true);
          }}
          onClose={() => setNachtrag(null)}
        />
      ) : null}

      {neustart ? (
        <NeustartDialog
          project={project}
          run={run}
          doc={doc}
          umstellen={neustart === 'umstellen'}
          onClose={() => setNeustart(null)}
          onNeuGestartet={(id) => oeffneLauf?.(id)}
        />
      ) : null}

      {abbrechen ? (
        <AbbruchDialog
          run={run}
          doc={doc}
          onClose={() => setAbbrechen(false)}
          onAbbrechen={(grund, art, neuerIndex) => {
            if (art === 'neuer_index' && doc) {
              // Abbrechen, Eintrag auf den neuen Index heben und neu beginnen – ein Schritt im Store
              const id = neuerIndexStarten(run.id, grund, neuerIndex);
              if (id) {
                toast(`Neuer Planlauf mit ${INDEX_LABEL[doc.kind]} ${neuerIndex} gestartet.`);
                oeffneLauf?.(id);
              }
              return;
            }
            abbrechenRun(run.id, grund, art, null);
            toast('Planlauf abgebrochen – er bleibt in der Projektansicht sichtbar.');
          }}
        />
      ) : null}

      {laufLoeschen ? (
        <ConfirmDialog
          titel="Planlauf löschen?"
          text={`„${run.name}“ wird mit allen Terminen dauerhaft gelöscht.`}
          onConfirm={() => {
            deleteRun(run.id);
            toast('Planlauf gelöscht.');
            onZurueck();
          }}
          onClose={() => setLaufLoeschen(false)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Frühere Durchläufe eines Schritts (Historie), neueste zuerst. */
function FruehereDurchlaeufe({ step, rahmen }: { step: RunStep; rahmen: Zeitrahmen }) {
  return (
    <div className="pl-durchlaeufe">
      {[...(step.historie ?? [])].reverse().map((h, i) => {
        const erinnerungen = (step.erinnerungen ?? []).filter((e) => e.durchlauf === h.durchlauf);
        const abw = h.soll && h.ist ? tage(h.soll, h.ist, rahmen) : 0;
        return (
          <div className="pl-durchlauf" key={`${h.durchlauf}-${i}`}>
            <div className="pl-durchlauf-titel">
              {h.durchlauf}. Durchlauf
              <Badge ton={h.status === 'erledigt' ? 'green' : ''}>{STEP_STATUS_LABEL[h.status]}</Badge>
              <span className="small muted" style={{ fontWeight: 400 }}>
                {h.grund === 'ruecksprung' ? 'beendet durch Rücksprung' : 'beendet durch Wieder öffnen'} am{' '}
                {zeitpunktText(h.beendetAm)}
              </span>
            </div>
            <div className="pl-angaben">
              {h.name !== step.name ? (
                <span>
                  als <b>{h.name}</b>
                </span>
              ) : null}
              <span>
                Person: <b>{h.kontaktName || '–'}</b>
                {h.roleName ? ` (${h.roleName})` : ''}
              </span>
              <span>
                Seite: <b>{h.seite ? SEITE_LABEL[h.seite] : 'Seite fehlt'}</b>
              </span>
              <span>
                Eingang: <b>{formatDate(h.eingang)}</b>
                {h.eingangGeschaetzt ? ' (geschätzt)' : ''}
              </span>
              <span>
                Frist: <b>{tageLabel(h.fristTage)}</b>
              </span>
              <span>
                Soll: <b>{formatDate(h.soll)}</b>
                {h.sollManuell ? ' (von Hand)' : ''}
              </span>
              <span>
                Ist: <b>{formatDate(h.ist)}</b>
              </span>
              {abw > 0 ? (
                <span className="pl-verzug">{tageText(abw, rahmen.arbeitstage)} nach dem Soll</span>
              ) : null}
              {h.antwort ? (
                <span>
                  Antwort: <b>{h.antwort}</b>
                  {h.antwortNacharbeit ? ' (führt zu Nacharbeit)' : ''}
                </span>
              ) : null}
              {h.nachweisNummer ? (
                <span>
                  Nachweis: <b>{h.nachweisNummer}</b>
                </span>
              ) : null}
            </div>
            {h.bemerkung ? <span className="small tertiary">{h.bemerkung}</span> : null}
            {erinnerungen.map((e, k) => (
              <span className="small muted" key={`${e.zeitpunkt}-${k}`}>
                {erinnerungText(e)}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Wieder öffnen mit Erklärung der beiden Fälle (abschluss.ts):
 * Korrektur – solange kein Nachfolger ein Ist hat; sonst erneute Bearbeitung
 * mit einem weiteren Durchlauf ab diesem Schritt.
 */
function WiederOeffnenDialog({ run, stepId, onClose }: { run: PlanRun; stepId: ID; onClose: () => void }) {
  const { wiederOeffnen } = useStore();
  const toast = useToast();
  const step = run.steps.find((s) => s.id === stepId);
  const moeglich: WiederOeffnenArt = step ? wiederOeffnenArt(run, step) : 'korrektur';
  const [modus, setModus] = useState<WiederOeffnenArt>(moeglich);
  const [eingang, setEingang] = useState(today());
  if (!step) return null;

  const folge = (folgeImVerlauf(verlaufDerKette(run.steps), step.id) ?? []).filter((s) => s.id !== step.id);
  const mitIst = folge.filter((s) => s.istDatum);
  const betroffen = folge.filter((s) => istBegonnen(s));
  const namen = (liste: RunStep[]) => liste.map((s) => `„${s.name}“`).join(', ');

  const bestaetigen = () => {
    if (modus === 'erneut' && !eingang) {
      toast('Bitte den Eingang des neuen Durchlaufs angeben.');
      return;
    }
    const ergebnis = wiederOeffnen(run.id, step.id, modus, modus === 'erneut' ? eingang : undefined);
    if (ergebnis?.art === 'aenderung') toast(ergebnis.meldung);
    onClose();
  };

  return (
    <Modal
      titel="Schritt wieder öffnen"
      sub={step.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={bestaetigen}>
            {modus === 'korrektur' ? 'Als Korrektur wieder öffnen' : 'Erneut bearbeiten'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {moeglich === 'korrektur' ? (
          <Field label="Wie soll der Schritt wieder geöffnet werden?">
            <div className="stack" style={{ gap: 10 }}>
              <label className="checkbox" style={{ alignItems: 'flex-start' }}>
                <input type="radio" name="wiederoeffnen" checked={modus === 'korrektur'} onChange={() => setModus('korrektur')} />
                <span>
                  <strong>Korrektur</strong> – etwa nach einer Fehlbedienung: Das Ist-Datum wird entfernt, der Schritt
                  läuft wieder, die nachfolgenden Schritte warten erneut auf ihn. Es entsteht kein neuer Durchlauf.
                  Das geht, solange kein nachfolgender Schritt ein Ist-Datum hat.
                </span>
              </label>
              <label className="checkbox" style={{ alignItems: 'flex-start' }}>
                <input type="radio" name="wiederoeffnen" checked={modus === 'erneut'} onChange={() => setModus('erneut')} />
                <span>
                  <strong>Erneute Bearbeitung</strong> – der Schritt wird noch einmal bearbeitet: Ab hier beginnt ein
                  weiterer Durchlauf, der bisherige Stand bleibt unter „Frühere Durchläufe“ erhalten.
                </span>
              </label>
            </div>
          </Field>
        ) : (
          <Callout icon="i">
            <strong>Erneute Bearbeitung.</strong> Eine Korrektur ist nicht mehr möglich, weil nachfolgende Schritte
            schon ein Ist-Datum haben ({namen(mitIst)}). Ab diesem Schritt beginnt deshalb ein weiterer Durchlauf; der
            bisherige Stand bleibt unter „Frühere Durchläufe“ erhalten.
          </Callout>
        )}
        {modus === 'erneut' ? (
          <>
            {betroffen.length > 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Zurückgesetzt und neu durchlaufen werden außerdem: {namen(betroffen)}.
              </p>
            ) : null}
            <Field label="Eingang des neuen Durchlaufs" hint="Ab diesem Tag zählt die Frist des Schritts erneut.">
              <TextInput value={eingang} onChange={setEingang} type="date" />
            </Field>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Workflow eines laufenden Planlaufs ändern: Workflow wählen, seine Schritte
 * für diesen Lauf anpassen und von vorn beginnen – auf Wunsch mit den bereits
 * erledigten Schritten (gleiche Bezeichnung und Funktion, siehe
 * erledigteUebernehmen). Der bisherige Lauf endet als „neu gestartet“ und
 * bleibt zum Nachschlagen erhalten.
 */
function NeustartDialog({
  project,
  run,
  doc,
  umstellen,
  onClose,
  onNeuGestartet,
}: {
  project: Project;
  run: PlanRun;
  doc: PlanDocument | undefined;
  /** Auf die aktuelle Fassung desselben Workflows umstellen (erledigte Schritte übernehmen). */
  umstellen: boolean;
  onClose: () => void;
  onNeuGestartet: (runId: string) => void;
}) {
  const { data, planlaufNeuStarten } = useStore();
  const toast = useToast();
  const vorlagen = data.templates.filter((t) => t.projectId === null || t.projectId === project.id);
  const kontakte = data.contacts.filter((c) => c.projectId === project.id);
  const rollen = data.roles.filter((r) => r.projectId === project.id);
  const gewerk = doc?.gewerk ?? '';

  const anfang = vorlagen.find((t) => t.id === run.templateId) ?? vorlagen[0];
  const [templateId, setTemplateId] = useState(anfang?.id ?? '');
  const [steps, setSteps] = useState<ProcessTemplateStep[]>(() => vorlagenSchritte(anfang, newId));
  /** Die Schritte wurden über „Individueller Workflow“ für den neuen Lauf angepasst. */
  const [angepasst, setAngepasst] = useState(false);
  const [uebernehmen, setUebernehmen] = useState(umstellen);
  const [start, setStart] = useState(umstellen ? run.start : today());
  const [grund, setGrund] = useState(umstellen ? 'Auf die aktuelle Fassung des Workflows umgestellt' : '');
  // Ein vergangenes Eingang Soll machte den neuen Lauf sofort überfällig – dann leer lassen
  const [eingangSoll, setEingangSoll] = useState(
    doc?.eingangSoll && (umstellen || doc.eingangSoll >= today()) ? doc.eingangSoll : '',
  );

  const vorlage = vorlagen.find((t) => t.id === templateId);
  const fertig = run.steps.filter(istErledigt).length;
  const wechseln = (id: string) => {
    setTemplateId(id);
    setSteps(vorlagenSchritte(vorlagen.find((t) => t.id === id), newId));
    setAngepasst(false);
  };

  /** Laufschritte des neuen Laufs (IDs vor dem Store-Aufruf erzeugt). */
  const laufSchritte = () => {
    const neu = laufSchritteAusVorlage(
      vorlage,
      steps,
      (rolle) => kontaktFuerRolleUndGewerk(kontakte, rollen, rolle, gewerk),
      () => newId('rs'),
    );
    return uebernehmen ? erledigteUebernehmen(run.steps, neu) : neu;
  };
  // Vorschau: wie viele Schritte übernommen würden
  const uebernommen = uebernehmen ? laufSchritte().filter(istErledigt).length : 0;

  const starten = () => {
    if (steps.length === 0 || steps.some((s) => !s.name.trim())) {
      toast('Bitte jeden Schritt der Workflow benennen.');
      return;
    }
    const name = vorlage?.name ?? 'Individuelle Kette';
    const id = planlaufNeuStarten(run.id, {
      templateId: vorlage?.id ?? null,
      templateName: name,
      steps: laufSchritte(),
      start,
      grund,
      // Nur ein geändertes Eingang Soll wird am Eintrag nachgetragen
      eingangSoll: doc && eingangSoll !== (doc.eingangSoll ?? '') ? eingangSoll || null : undefined,
    });
    if (!id) return;
    toast(`Planlauf mit Workflow „${name}“ neu gestartet.`);
    onClose();
    onNeuGestartet(id);
  };

  return (
    <Modal
      titel={umstellen ? 'Auf aktuelle Fassung umstellen' : 'Workflow ändern und neu starten'}
      sub={run.name}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={starten}>
            Neu starten
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <Callout ton="warn" icon="!">
          {uebernehmen
            ? `Der Planlauf beginnt mit dem gewählten Workflow neu; erledigte Schritte gleicher Bezeichnung und Funktion werden übernommen (${uebernommen} von ${fertig}) – ab dem ersten Schritt ohne Gegenstück geht es weiter.`
            : 'Der Planlauf beginnt von vorn – alle Schritte starten neu.'}{' '}
          Der bisherige Lauf mit Workflow „{run.templateName}“ ({fertig} von {run.steps.length} Schritten
          abgeschlossen) bleibt zum Nachschlagen erhalten und ist über den neuen Planlauf erreichbar.
        </Callout>
        <div className="form-grid">
          <Field label="Workflow" full hint={vorlage?.beschreibung}>
            <Select
              value={templateId}
              onChange={wechseln}
              options={vorlagen.map((t) => ({ value: t.id, label: `${t.name} (${t.steps.length} Schritte)` }))}
            />
          </Field>
          <Field
            label="Erledigte Schritte übernehmen"
            full
            hint="Entlang des neuen Ablaufs ab Beginn, solange der bisherige Lauf einen erledigten Schritt gleicher Bezeichnung und Funktion hat – mit Ist, Eingang, Antwort und Nachweis."
          >
            <label className="checkbox">
              <input
                type="checkbox"
                checked={uebernehmen}
                onChange={(e) => {
                  setUebernehmen(e.target.checked);
                  setStart(e.target.checked ? run.start : today());
                }}
              />
              Erledigte Schritte übernehmen
            </label>
          </Field>
          <Field label="Start des Planlaufs">
            <TextInput value={start} onChange={setStart} type="date" />
          </Field>
          {doc ? (
            <Field
              label="Eingang Soll"
              hint="Soll-Termin des ersten Schritts; gilt für den Eintrag – leer: Termine ab dem Start"
            >
              <TextInput value={eingangSoll} onChange={setEingangSoll} type="date" />
            </Field>
          ) : null}
          <Field label="Grund" hint="optional – steht am bisherigen und am neuen Lauf">
            <TextInput value={grund} onChange={setGrund} placeholder="z.B. Prüfstatik erforderlich" />
          </Field>
        </div>
        <LaufSchritte
          vorlage={vorlage}
          steps={steps}
          angepasst={angepasst}
          rollen={funktionenFuerGewerk(rollen, gewerk)}
          arbeitstage={project.settings.fristenInArbeitstagen}
          onUebernehmen={(neu) => {
            setSteps(neu);
            setAngepasst(true);
          }}
          onZuruecksetzen={() => wechseln(templateId)}
          neuerLauf
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function AbbruchDialog({
  run,
  doc,
  onClose,
  onAbbrechen,
}: {
  run: PlanRun;
  doc: PlanDocument | undefined;
  onClose: () => void;
  onAbbrechen: (grund: string, art: AbbruchArt, neuerIndex: string) => void;
}) {
  const toast = useToast();
  const [grund, setGrund] = useState('');
  const [art, setArt] = useState<AbbruchArt>('ersatzlos');
  const [neuerIndex, setNeuerIndex] = useState('');

  const indexBezeichnung = doc ? INDEX_LABEL[doc.kind] : 'Index';

  return (
    <Modal
      titel="Planlauf abbrechen"
      sub={run.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Zurück
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: 'var(--red)' }}
            onClick={() => {
              if (!grund.trim()) {
                toast('Bitte einen Grund angeben.');
                return;
              }
              if (art === 'neuer_index' && !neuerIndex.trim()) {
                toast(`Bitte ${indexBezeichnung} angeben.`);
                return;
              }
              onAbbrechen(grund.trim(), art, neuerIndex.trim());
              onClose();
            }}
          >
            {art === 'neuer_index' ? 'Abbrechen und neu starten' : 'Planlauf abbrechen'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Art des Abbruchs">
          <div className="stack" style={{ gap: 8 }}>
            <label className="checkbox">
              <input
                type="radio"
                name="abbruchart"
                checked={art === 'ersatzlos'}
                onChange={() => setArt('ersatzlos')}
              />
              Ersatzlos – der Eintrag wird nicht weiterverfolgt
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="abbruchart"
                checked={art === 'neuer_index'}
                onChange={() => setArt('neuer_index')}
              />
              {doc?.kind === 'verzeichnis' ? 'Neue Ausgabe' : 'Neuer Index'} – der Planlauf beginnt damit von vorn
            </label>
          </div>
        </Field>

        {art === 'neuer_index' ? (
          <Field
            label={`${indexBezeichnung} des neuen Planlaufs`}
            hint={`Der Eintrag erhält ${indexBezeichnung} „${neuerIndex || '…'}“; der Planlauf wird mit denselben Schritten neu begonnen.`}
          >
            <TextInput
              value={neuerIndex}
              onChange={setNeuerIndex}
              autoFocus
              placeholder={doc?.kind === 'verzeichnis' ? 'z.B. 03' : 'z.B. D'}
            />
          </Field>
        ) : (
          <Callout icon="i">
            Der Lauf bleibt im Reiter „Planläufe“ ausgegraut sichtbar, sein Grund steht hier am Planlauf. In den
            übergeordneten Ansichten (Übersicht, Fristen) erscheint er nicht mehr.
          </Callout>
        )}

        <Field label="Grund des Abbruchs" hint="steht am Planlauf und in der Langfassung des Exports">
          <TextArea
            value={grund}
            onChange={setGrund}
            rows={3}
            placeholder={
              art === 'neuer_index'
                ? 'z.B. Planinhalt geändert, Neuvorlage erforderlich'
                : 'z.B. Planinhalt entfällt, Leistung neu beauftragt'
            }
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

/** Mögliche Stelle für einen eingefügten Schritt (siehe einfuegenMoeglich). */
interface EinfuegeOrt {
  wert: string;
  label: string;
  nachId: ID | null;
  position: EinfuegePosition;
}

/**
 * Zulässige Stellen zum Einfügen: hinter jedem Schritt des Verlaufs, in einem
 * parallelen Block auch am Ende eines Zweigs bzw. nach dem Block – nur dort,
 * wo der neue Schritt nichts Erledigtes überholt.
 */
function einfuegeOrte(run: PlanRun, verlauf: Verlauf<RunStep>, nummer: Map<ID, number>): EinfuegeOrt[] {
  const orte: EinfuegeOrt[] = [];
  const dazu = (nachId: ID | null, position: EinfuegePosition, label: string) => {
    if (einfuegenMoeglich(run.steps, nachId, position)) orte.push({ wert: `${position}:${nachId ?? ''}`, label, nachId, position });
  };
  dazu(null, 'danach', '– an den Anfang –');
  for (const a of verlauf.abschnitte) {
    if (a.art === 'schritt') {
      dazu(a.step.id, 'danach', `nach ${nummer.get(a.step.id)}. ${a.step.name}`);
      continue;
    }
    for (const z of a.zweige) {
      for (const s of z.schritte) dazu(s.id, 'danach', `nach ${nummer.get(s.id)}. ${s.name} (${zweigTitel(z.name, z.zweig)})`);
      const letzter = z.schritte[z.schritte.length - 1];
      // Endet der Zweig nicht einfach mit dem letzten Schritt (Rücksprung, Ausstieg), eigens ans Zweigende
      if (letzter && (z.rueckSprungZu || z.ausstieg)) {
        dazu(letzter.id, 'zweigende', z.name ? `am Ende von „${z.name}“` : `am Ende von Zweig ${z.zweig + 1}`);
      }
    }
    const erster = a.zweige.flatMap((z) => z.schritte)[0];
    if (erster) {
      dazu(
        erster.id,
        'nach_block',
        a.name ? `nach dem parallelen Block „${a.name}“ (bevor es weitergeht)` : 'nach dem parallelen Block (bevor es weitergeht)',
      );
    }
  }
  return orte;
}

type SchrittForm = {
  name: string;
  typ: StepType;
  roleName: string;
  contactId: string | null;
  /** Person von Hand gewählt – sie bleibt trotz neuer Besetzung stehen. */
  contactManuell: boolean;
  fristTage: number;
  sollManuell: boolean;
  sollDatum: string;
  istDatum: string;
  eingangIst: string;
  nachweisNummer: string;
  bemerkung: string;
  nachweis: Nachweis;
  versandAnliegen: VersandAnliegen | null;
};

/**
 * Schritt anpassen (mit `stepId`) bzw. einfügen. Kein Statusfeld – der Status
 * ändert sich nur über Erledigt, Überspringen und Wieder öffnen. Das Ist ist
 * nur bei erledigten Schritten änderbar, der Eingang bei anstehenden und
 * erledigten. Alles in einem Schritt über `aenderungenAnwenden` bzw.
 * `schrittImLaufEinfuegen`.
 */
function SchrittDialog({
  project,
  run,
  stepId,
  verlauf,
  nummer,
  onClose,
}: {
  project: Project;
  run: PlanRun;
  stepId?: ID;
  /** Verlauf des Laufs – Grundlage der Einfügeposition und der Nachfolger. */
  verlauf: Verlauf<RunStep>;
  nummer: Map<ID, number>;
  onClose: () => void;
}) {
  const { data, aenderungenAnwenden, schrittImLaufEinfuegen } = useStore();
  const toast = useToast();
  const step = stepId ? run.steps.find((s) => s.id === stepId) : undefined;
  const rollen = data.roles.filter((r) => r.projectId === project.id);
  const kontakte = data.contacts.filter((c) => c.projectId === project.id);

  const [form, setForm] = useState<SchrittForm>({
    name: step?.name ?? '',
    typ: step?.typ ?? 'aufgabe',
    roleName: step?.roleName ?? '',
    contactId: step?.contactId ?? null,
    contactManuell: step?.contactManuell ?? false,
    fristTage: step?.fristTage ?? 5,
    sollManuell: step?.sollManuell ?? false,
    sollDatum: step?.sollDatum ?? today(),
    istDatum: step?.istDatum ?? '',
    eingangIst: step?.eingangIst ?? '',
    nachweisNummer: step?.nachweisNummer ?? '',
    bemerkung: step?.bemerkung ?? '',
    nachweis: step?.nachweis ?? 'keine',
    versandAnliegen: step?.versandAnliegen ?? null,
  });
  const [frage, setFrage] = useState(false);

  // Einfügeposition: Vorgabe direkt hinter dem (ersten) anstehenden Schritt
  const orte = useMemo(() => (step ? [] : einfuegeOrte(run, verlauf, nummer)), [step, run, verlauf, nummer]);
  const [ortWert, setOrtWert] = useState<string>(() => {
    if (step) return '';
    const erster = aktuelleSchritte(run)[0];
    return (
      orte.find((o) => o.position === 'danach' && erster && o.nachId === erster.id)?.wert ??
      orte[orte.length - 1]?.wert ??
      ''
    );
  });

  // Wer die Funktion im Projekt ausfüllt – Grundlage der automatischen Zuordnung
  const gewerk = data.documents.find((d) => d.id === run.documentId)?.gewerk ?? '';
  const automatischId = kontaktFuerRolleUndGewerk(kontakte, rollen, form.roleName, gewerk);
  // Auswahl: Funktionen des Gewerks und die übergreifenden, je Name einmal.
  // Eine bereits gesetzte Funktion bleibt wählbar, auch wenn sie nicht passt.
  const rollenNamen = [
    ...new Set([...funktionenFuerGewerk(rollen, gewerk), ...(form.roleName ? [form.roleName] : [])]),
  ];
  const automatischKontakt = kontakte.find((c) => c.id === automatischId);
  const automatisch = automatischKontakt ? `${automatischKontakt.vorname} ${automatischKontakt.nachname}` : '';

  const set = <K extends keyof SchrittForm>(k: K, v: SchrittForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Prüfende Rollen verlangen regelmäßig einen Prüfbericht. */
  const rolleWechseln = (roleName: string) =>
    setForm((f) => ({
      ...f,
      roleName,
      nachweis: f.nachweis === 'keine' && istPrueferRolle(roleName) ? 'pruefbericht' : f.nachweis,
    }));

  const erledigt = step ? istErledigt(step) : false;
  const eingangAenderbar = Boolean(step?.eingangIst);
  const wieder = step ? wiedereingang(step, verlauf, run.steps) : null;
  const eingangJetzt = form.eingangIst || step?.eingangIst || '';
  const istVorEingang = erledigt && Boolean(form.istDatum) && Boolean(eingangJetzt) && form.istDatum < eingangJetzt;
  // Nachfolger, deren Eingang dem bisherigen Ist entsprach (Rückfrage beim Ändern des Ist)
  const nachfolgerMitAltemIst =
    step && erledigt && step.istDatum
      ? run.steps.filter(
          (s) => (verlauf.vorgaenger.get(s.id) ?? []).includes(step.id) && s.eingangIst === step.istDatum,
        )
      : [];

  /** Neuer Eingang eines Nachfolgers: das späteste Ende seiner Vorgänger, mit dem geänderten Schritt. */
  const neuerEingangFuer = (n: RunStep, ich: Pick<RunStep, 'istDatum' | 'eingangIst'>): string | null =>
    (verlauf.vorgaenger.get(n.id) ?? [])
      .map((id) => (id === step?.id ? fertigAm(ich) : fertigAm(run.steps.find((s) => s.id === id) ?? ich)))
      .filter((x): x is string => Boolean(x))
      .sort()
      .pop() ?? null;

  const anwenden = (mitNachfolgern: boolean) => {
    if (!step) return;
    const veraendert =
      form.name !== step.name ||
      form.fristTage !== step.fristTage ||
      form.roleName !== step.roleName ||
      form.typ !== step.typ ||
      form.sollManuell !== step.sollManuell;
    const patch: Partial<RunStep> = {
      name: form.name.trim(),
      typ: form.typ,
      roleName: form.roleName,
      contactId: form.contactId,
      contactManuell: form.contactManuell,
      fristTage: Number(form.fristTage) || 0,
      sollManuell: form.sollManuell,
      sollDatum: form.sollManuell ? form.sollDatum : step.sollDatum,
      bemerkung: form.bemerkung,
      nachweis: form.nachweis,
      versandAnliegen: form.versandAnliegen,
      abweichung: step.abweichung || veraendert,
    };
    if (erledigt && form.istDatum !== (step.istDatum ?? '')) patch.istDatum = form.istDatum;
    if (erledigt && form.nachweisNummer.trim() !== (step.nachweisNummer ?? '')) {
      patch.nachweisNummer = form.nachweisNummer.trim() || null;
    }
    if (eingangAenderbar && form.eingangIst && form.eingangIst !== step.eingangIst) {
      patch.eingangIst = form.eingangIst;
      patch.eingangGeschaetzt = false;
    }
    const aenderungen: Aenderung[] = [{ art: 'step', stepId: step.id, patch }];
    if (mitNachfolgern) {
      const ich = { istDatum: patch.istDatum ?? step.istDatum, eingangIst: patch.eingangIst ?? step.eingangIst };
      for (const n of nachfolgerMitAltemIst) {
        const eingang = neuerEingangFuer(n, ich);
        if (eingang && eingang !== n.eingangIst) {
          aenderungen.push({ art: 'step', stepId: n.id, patch: { eingangIst: eingang, eingangGeschaetzt: false } });
        }
      }
    }
    aenderungenAnwenden(run.id, aenderungen);
    toast(
      aenderungen.length > 1
        ? `Schritt angepasst – Eingang von ${aenderungen.length - 1} Nachfolger${aenderungen.length > 2 ? 'n' : ''} nachgezogen.`
        : 'Schritt angepasst.',
    );
    onClose();
  };

  const einfuegen = () => {
    const ort = orte.find((o) => o.wert === ortWert);
    if (!ort) {
      toast('Bitte eine Stelle zum Einfügen wählen.');
      return;
    }
    // Die ID entsteht vor dem Store-Aufruf (StrictMode)
    const neu: RunStep = {
      ...neueLaufFelder(),
      id: newId('rs'),
      name: form.name.trim(),
      typ: form.typ,
      roleName: form.roleName,
      contactId: form.contactId,
      contactManuell: form.contactManuell,
      fristTage: Number(form.fristTage) || 0,
      bemerkung: form.bemerkung,
      abweichung: true,
      antworten: [],
      naechster: null,
      nachweis: form.nachweis,
      mailFrage: false,
      mailVorlageId: null,
      versandAnliegen: form.versandAnliegen,
      parallel: null,
    };
    const ergebnis = schrittImLaufEinfuegen(run.id, ort.nachId, neu, ort.position);
    toast(
      ergebnis?.art === 'aenderung' && ergebnis.aenderungen.length > 0
        ? 'Schritt eingefügt – als Abweichung markiert.'
        : ergebnis?.art === 'aenderung'
          ? ergebnis.meldung
          : 'Der Schritt ließ sich nicht einfügen.',
    );
    onClose();
  };

  const speichern = () => {
    if (!form.name.trim()) {
      toast('Bitte einen Namen angeben.');
      return;
    }
    if (form.sollManuell && !form.sollDatum) {
      toast('Bitte den Soll-Termin angeben.');
      return;
    }
    if (!step) {
      einfuegen();
      return;
    }
    if (erledigt && !form.istDatum) {
      toast('Bitte ein Ist-Datum angeben – zum Zurücknehmen „Wieder öffnen“ verwenden.');
      return;
    }
    if (erledigt && form.istDatum !== step.istDatum && nachfolgerMitAltemIst.length > 0) {
      setFrage(true);
      return;
    }
    anwenden(false);
  };

  if (stepId && !step) return null;

  if (frage && step) {
    const n = nachfolgerMitAltemIst.length;
    return (
      <Modal
        titel="Eingang der Nachfolger ebenfalls anpassen?"
        sub={step.name}
        onClose={() => setFrage(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setFrage(false)}>
              Zurück
            </button>
            <button type="button" className="btn btn-outline" onClick={() => anwenden(false)}>
              Nein, nur diesen Schritt
            </button>
            <button type="button" className="btn btn-primary" onClick={() => anwenden(true)}>
              Ja, Eingang anpassen
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Das Ist ändert sich von {formatDate(step.istDatum)} auf {formatDate(form.istDatum)}.{' '}
          {n === 1 ? 'Der nachfolgende Schritt' : 'Die nachfolgenden Schritte'}{' '}
          {nachfolgerMitAltemIst.map((s) => `„${s.name}“`).join(', ')} {n === 1 ? 'ging' : 'gingen'} am{' '}
          {formatDate(step.istDatum)} ein. Soll {n === 1 ? 'sein Eingang' : 'ihr Eingang'} ebenfalls angepasst werden?
          Davon hängen Fristen und Soll-Termine ab.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      titel={step ? 'Schritt anpassen' : 'Schritt einfügen'}
      sub="Änderungen gelten nur für diesen Planlauf (individuelle Abweichung)"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Speichern
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Bezeichnung" full>
          <TextInput value={form.name} onChange={(v) => set('name', v)} />
        </Field>
        <Field label="Art">
          <Select
            value={form.typ}
            onChange={(v) => set('typ', v as StepType)}
            options={Object.entries(STEP_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="Verantwortlicher" hint="Prüfer werden hier ergänzt (z.B. Erdungsprüfer)">
          <Select
            value={form.roleName}
            onChange={rolleWechseln}
            placeholder="– keine Funktion –"
            options={rollenNamen.map((name) => ({ value: name, label: name }))}
          />
        </Field>
        <Field label="Nachweis bei Abschluss" hint="wird beim Erledigen abgefragt">
          <Select
            value={form.nachweis}
            onChange={(v) => set('nachweis', v as Nachweis)}
            options={Object.entries(NACHWEIS_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label="Anliegen in der Versandmail" hint="nach dem Erledigen schlägt „E-Mail senden“ die Vorlage „Versand“ vor">
          <Select
            value={form.versandAnliegen ?? ''}
            onChange={(v) => set('versandAnliegen', (v || null) as VersandAnliegen | null)}
            options={ANLIEGEN_OPTIONEN}
          />
        </Field>
        {!step ? (
          <Field
            label="Einfügen"
            full
            hint="Der Schritt wird in den laufenden Verlauf eingehängt – nicht vor Schritten, die schon erledigt sind; im parallelen Block in den Zweig des gewählten Schritts."
          >
            {orte.length > 0 ? (
              <Select
                value={ortWert}
                onChange={setOrtWert}
                options={orte.map((o) => ({ value: o.wert, label: o.label }))}
              />
            ) : (
              <span className="small muted">Im Verlauf gibt es keine Stelle, an der sich noch ein Schritt einfügen lässt.</span>
            )}
          </Field>
        ) : null}
        <Field
          label="Zuständige Person"
          hint={
            form.contactManuell
              ? 'Von Hand gewählt – eine andere Besetzung der Funktion wirkt hier nicht.'
              : automatisch
                ? `Laut Reiter „Funktion“: ${automatisch}`
                : 'Diese Funktion ist im Projekt nicht besetzt – die Person wird übernommen, sobald sie eingetragen ist.'
          }
        >
          <Select
            value={form.contactManuell ? (form.contactId ?? '') : ''}
            onChange={(v) => setForm((f) => ({ ...f, contactId: v || null, contactManuell: Boolean(v) }))}
            placeholder="– laut Funktion –"
            options={kontakte.map((c) => ({ value: c.id, label: `${c.vorname} ${c.nachname} (${c.firma})` }))}
          />
        </Field>
        <Field label="Frist in Tagen" hint="ab dem tatsächlichen Eingang">
          <TextInput
            value={String(form.fristTage)}
            onChange={(v) => set('fristTage', Number(v.replace(/\D/g, '')) || 0)}
            inputMode="numeric"
          />
        </Field>
        {step && eingangAenderbar ? (
          <Field
            label={
              wieder === 'ruecksprung'
                ? 'Wiedereingang (aus Rücksprung)'
                : wieder === 'wieder_geoeffnet'
                  ? 'Wiedereingang (wieder geöffnet)'
                  : 'Eingang'
            }
            hint={
              wieder
                ? `Wiedereingang am ${formatDate(step.eingangIst)} (${wieder === 'ruecksprung' ? 'aus Rücksprung' : 'wieder geöffnet'}) – ab hier zählt die Frist des neuen Durchlaufs.`
                : step.eingangGeschaetzt
                  ? 'Bei der Umstellung geschätzt – bitte prüfen. Ab hier zählt die Frist.'
                  : 'Tatsächlicher Eingang – ab hier zählt die Frist.'
            }
          >
            <TextInput value={form.eingangIst} onChange={(v) => set('eingangIst', v)} type="date" />
          </Field>
        ) : null}
        {step && erledigt ? (
          <Field label="Ist-Termin" hint="Tag der Erledigung">
            <TextInput value={form.istDatum} onChange={(v) => set('istDatum', v)} type="date" />
          </Field>
        ) : null}
        {step && erledigt && step.nachweis !== 'keine' ? (
          <Field label={NACHWEIS_LABEL[step.nachweis]}>
            <TextInput value={form.nachweisNummer} onChange={(v) => set('nachweisNummer', v)} />
          </Field>
        ) : null}
        {istVorEingang ? (
          <div className="full">
            <Callout ton="warn" icon="!">
              Das Ist ({formatDate(form.istDatum)}) liegt vor dem Eingang ({formatDate(eingangJetzt)}). Für die
              Nachfolger zählt dann der Eingang als Abschluss.
            </Callout>
          </div>
        ) : null}
        {step ? (
          <Field label="Soll-Termin festsetzen" full hint="Überschreibt die Fristenrechnung ab diesem Schritt.">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.sollManuell}
                onChange={(e) => set('sollManuell', e.target.checked)}
              />
              Soll-Termin manuell vorgeben
            </label>
            {form.sollManuell ? (
              <div style={{ marginTop: 8 }}>
                <TextInput value={form.sollDatum ?? ''} onChange={(v) => set('sollDatum', v)} type="date" />
              </div>
            ) : null}
          </Field>
        ) : null}
        <Field label="Bemerkung" full>
          <TextArea value={form.bemerkung} onChange={(v) => set('bemerkung', v)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
