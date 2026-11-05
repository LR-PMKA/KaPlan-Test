/**
 * Grafischer Workflow-Editor.
 *
 * Links die Arbeitsfläche mit dem Ablaufbild: der Standardverlauf als Spalte
 * von Karten (Weg mit der jeweils ersten Antwort), daneben die Abweichungen –
 * Schritte, die nur über eine andere Antwort erreicht werden. Übergänge
 * abseits des Standardverlaufs zeichnet eine SVG-Ebene aus den gemessenen
 * Kartenpositionen. Ein paralleler Block steht als eine Containerkarte im
 * Standardverlauf: seine Zweige nebeneinander (untereinander, wenn der Platz
 * nicht reicht), Abweichungen im Zweig gestrichelt darunter; Übergänge aus
 * einem Zweig heraus stehen als Text auf der Karte, nie als Linie. Block und
 * Zweige tragen ihren Namen im Kopf (bearbeitet im Abschnitt „Parallel“ der
 * Schrittdetails; ein Klick auf den Kopf der Containerkarte führt dorthin).
 * Rechts stehen die Schrittdetails des gewählten Schritts,
 * ohne Auswahl die Übersicht über den Workflow. Auf schmalen Bildschirmen
 * stehen die Abweichungen unter dem Standardverlauf und die Details öffnen
 * sich als Blatt von unten.
 *
 * Der Editor arbeitet auf einer eigenen Kopie der Schritte (mit Rückgängig
 * und Wiederholen) und gibt sie erst mit „Speichern“ bzw. „Übernehmen“ zurück.
 * Er wird über ein Portal an `document.body` gehängt, weil er auch aus einem
 * Dialog heraus geöffnet wird, dessen Hintergrundfilter fest positionierte
 * Elemente sonst einschließt.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  EIGENE_ROLLE,
  NACHWEIS_LABEL,
  STANDARD_ANTWORTEN,
  STEP_TYPE_LABEL,
  ANLIEGEN_OPTIONEN,
  type ID,
  type Nachweis,
  type ProcessTemplateStep,
  type StepType,
  type VersandAnliegen,
} from '../domain/types';
import {
  alsStandard,
  anzahlBloecke,
  artSetzen,
  ausBlockLoesen,
  bereinigen,
  blockAufloesen,
  blockBenennen,
  dauerImStandardverlauf,
  duplizieren,
  einfuegenAn,
  entfernenMitHinweis,
  funktionSetzen,
  gliedern,
  imVerlaufVerschieben,
  istBlockAnzeige,
  neuerSchritt,
  parallelBlockEinfuegen,
  parallelDazu,
  pruefen,
  standardKante,
  verschiebbar,
  zielSetzen,
  zweigBenennen,
  zweigHinzufuegen,
  type Anzeige,
  type Bearbeitung,
  type Einfuegestelle,
  type Gliederung,
  type Kante,
  type Ziel,
  type ZweigGliederung,
} from '../domain/workflowGraph';
import { blockTitel, nachfolger, strukturVon, zweigTitel } from '../domain/ablauf';
import { newId, useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { ConfirmDialog } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import './workflowEditor.css';

export interface WorkflowErgebnis {
  steps: ProcessTemplateStep[];
  name: string;
  beschreibung: string;
  /** Im Editor wurde etwas geändert. */
  geaendert: boolean;
}

interface Stand {
  steps: ProcessTemplateStep[];
  name: string;
  beschreibung: string;
}

interface Verlauf {
  vorher: Stand[];
  jetzt: Stand;
  nachher: Stand[];
  /** Zuletzt bearbeitetes Feld – Tippen im selben Feld ergibt nur einen Rückgängig-Schritt. */
  feld: string | null;
}

const nr = (i: number) => String(i + 1).padStart(2, '0');
const tage = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
const schritteText = (n: number) => `${n} ${n === 1 ? 'Schritt' : 'Schritte'}`;
const bloeckeText = (n: number) => `${n} ${n === 1 ? 'paralleler Block' : 'parallele Blöcke'}`;

/**
 * Was im Bild unter „Nicht erreichbar“ steht: einzelne Schritte und ganze
 * Blöcke, die nie erreicht werden. Unerreichbare Schritte in einem erreichten
 * Block stehen bei ihrem Zweig.
 */
function unerreichbarOben(g: Gliederung, steps: ProcessTemplateStep[]): Anzeige[] {
  const blockVon = new Map(steps.map((s) => [s.id, s.parallel?.block ?? null]));
  const ergebnis: Anzeige[] = [];
  const gesehen = new Set<ID>();
  for (const id of g.unerreichbar) {
    const b = blockVon.get(id) ?? null;
    if (!b || !g.bloecke[b]) {
      ergebnis.push(id);
      continue;
    }
    if (g.bloecke[b].erreichbar || gesehen.has(b)) continue;
    gesehen.add(b);
    ergebnis.push({ block: b });
  }
  return ergebnis;
}

/** Bildschirm schmaler als die Arbeitsfläche mit zwei Spalten. */
function useSchmal(grenze = 820): boolean {
  const abfrage = `(max-width: ${grenze}px)`;
  const [schmal, setSchmal] = useState(() => window.matchMedia(abfrage).matches);
  useEffect(() => {
    const mq = window.matchMedia(abfrage);
    const wechsel = () => setSchmal(mq.matches);
    mq.addEventListener('change', wechsel);
    return () => mq.removeEventListener('change', wechsel);
  }, [abfrage]);
  return schmal;
}

export function WorkflowEditor({
  titel,
  untertitel,
  hinweis,
  steps: anfangsSchritte,
  name: anfangsName,
  beschreibung: anfangsBeschreibung = '',
  rollen,
  arbeitstage = false,
  speichernLabel,
  onSpeichern,
  onClose,
}: {
  titel: string;
  untertitel?: ReactNode;
  /** Hinweis über der Arbeitsfläche, etwa bei Standard-Workflows. */
  hinweis?: ReactNode;
  steps: ProcessTemplateStep[];
  /** Mit Namen bearbeitet der Editor einen Workflow samt Name und Beschreibung. */
  name?: string;
  beschreibung?: string;
  /** Vorschläge für die verantwortliche Funktion. */
  rollen: string[];
  /** Fristen werden in Arbeitstagen gerechnet (nur Anzeige). */
  arbeitstage?: boolean;
  speichernLabel: string;
  onSpeichern: (ergebnis: WorkflowErgebnis) => void;
  onClose: () => void;
}) {
  const { data } = useStore();
  const toast = useToast();
  const schmal = useSchmal();
  // Bis zu dieser Breite liegen die Details als Schublade über der Fläche
  const mittel = useSchmal(1279) && !schmal;
  const mitStammdaten = anfangsName !== undefined;

  const [verlauf, setVerlauf] = useState<Verlauf>(() => ({
    vorher: [],
    jetzt: { steps: anfangsSchritte, name: anfangsName ?? '', beschreibung: anfangsBeschreibung },
    nachher: [],
    feld: null,
  }));
  const { steps, name, beschreibung } = verlauf.jetzt;
  const geaendert = verlauf.vorher.length > 0;

  /** Auswahl: ein Schritt, die Übersicht oder (nur schmal) nichts. */
  const [auswahl, setAuswahl] = useState<ID | 'uebersicht' | null>(() =>
    anfangsSchritte.length === 1 && !anfangsSchritte[0].name ? anfangsSchritte[0].id : null,
  );
  const [menuOffen, setMenuOffen] = useState(false);
  const [verwerfenFrage, setVerwerfenFrage] = useState(false);
  const [hover, setHover] = useState<ID | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Solange der Editor offen ist, bleibt die Seite dahinter unbedienbar
  useEffect(() => {
    const vorher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    (nameRef.current ?? dialogRef.current)?.focus();
    return () => {
      root?.removeAttribute('inert');
      vorher?.focus();
    };
  }, []);

  /** Übernimmt eine Änderung in den Verlauf; `feld` fasst Tippen zusammen. */
  const aendern = useCallback((f: (s: Stand) => Stand, feld: string | null = null) => {
    setVerlauf((v) => {
      const neu = f(v.jetzt);
      if (feld !== null && feld === v.feld) return { ...v, jetzt: neu };
      return { vorher: [...v.vorher, v.jetzt].slice(-150), jetzt: neu, nachher: [], feld };
    });
  }, []);
  const aendernSchritte = useCallback(
    (f: (s: ProcessTemplateStep[]) => ProcessTemplateStep[], feld: string | null = null) =>
      aendern((s) => ({ ...s, steps: f(s.steps) }), feld),
    [aendern],
  );
  const schrittAendern = (id: ID, f: (s: ProcessTemplateStep) => ProcessTemplateStep, feld: string | null = null) =>
    aendernSchritte((alle) => alle.map((s) => (s.id === id ? f(s) : s)), feld);

  const rueckgaengig = useCallback(
    () =>
      setVerlauf((v) =>
        v.vorher.length === 0
          ? v
          : { vorher: v.vorher.slice(0, -1), jetzt: v.vorher[v.vorher.length - 1], nachher: [v.jetzt, ...v.nachher], feld: null },
      ),
    [],
  );
  const wiederholen = useCallback(
    () =>
      setVerlauf((v) =>
        v.nachher.length === 0
          ? v
          : { vorher: [...v.vorher, v.jetzt], jetzt: v.nachher[0], nachher: v.nachher.slice(1), feld: null },
      ),
    [],
  );

  const gliederung = useMemo(() => gliedern(steps), [steps]);
  const hinweise = useMemo(() => pruefen(steps), [steps]);
  const fehlend = useMemo(() => new Set(hinweise.filter((h) => h.sperrt && h.stepId).map((h) => h.stepId!)), [hinweise]);
  const dauer = dauerImStandardverlauf(steps);
  // Zählungen über alle Schritte – auch die in parallelen Blöcken
  const entscheidungen = steps.filter((s) => s.typ === 'entscheidung').length;
  const bloecke = anzahlBloecke(steps);

  // Gewählter Schritt verschwindet (Rückgängig, Entfernen) → Auswahl aufheben
  const gewaehlt = typeof auswahl === 'string' && auswahl !== 'uebersicht' ? steps.find((s) => s.id === auswahl) : undefined;
  useEffect(() => {
    if (auswahl && auswahl !== 'uebersicht' && !steps.some((s) => s.id === auswahl)) setAuswahl(null);
  }, [auswahl, steps]);

  /**
   * Reihenfolge der Karten im Bild: Standardverlauf (ein Block mit seinen
   * Zweigen samt deren Abweichungen), Abweichungen, nicht erreichbar.
   */
  const bildFolge = useMemo(() => {
    const folge: ID[] = [];
    const gesehen = new Set<ID>();
    const dazu = (id: ID) => {
      if (gesehen.has(id)) return;
      gesehen.add(id);
      folge.push(id);
    };
    const anzeige = (e: Anzeige) => {
      if (!istBlockAnzeige(e)) return dazu(e);
      for (const z of gliederung.bloecke[e.block]?.zweige ?? []) [...z.standard, ...z.abweichungen, ...z.unerreichbar].forEach(dazu);
    };
    gliederung.hauptAnzeige.forEach(anzeige);
    gliederung.abweichungen.forEach((a) => anzeige(gliederung.bloecke[a.id] ? { block: a.id } : a.id));
    unerreichbarOben(gliederung, steps).forEach(anzeige);
    steps.forEach((s) => dazu(s.id));
    return folge;
  }, [gliederung, steps]);

  /* ---------------------------------------------------------------- */
  /* Bearbeitungen                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Übernimmt das Ergebnis einer Bearbeitung, die einen Hinweis liefern kann
   * (etwa: anderer Anschluss hinter einem Block). Ohne Änderung bleibt es beim
   * Hinweis; sonst `meldung`, wenn kein Hinweis vorliegt.
   */
  const bearbeitungUebernehmen = (e: Bearbeitung, neueAuswahl?: ID | null, meldung?: string) => {
    if (e.steps !== steps) {
      aendernSchritte(() => e.steps);
      if (neueAuswahl !== undefined) setAuswahl(neueAuswahl);
    }
    const text = e.hinweis ?? (e.steps !== steps ? meldung : undefined);
    if (text) toast(text);
  };

  const einfuegenIn = (stelle: Einfuegestelle, typ: StepType = 'aufgabe') => {
    const neu = neuerSchritt(typ, newId);
    aendernSchritte((alle) => einfuegenAn(alle, stelle, neu));
    setAuswahl(neu.id);
    setMenuOffen(false);
  };

  /** Wo „Schritt hinzufügen“ einfügt: hinter dem gewählten Schritt, sonst am Ende des Standardverlaufs. */
  const hinzufuegeStelle = (): Einfuegestelle => {
    const nachSchritt = (id: ID): Einfuegestelle => ({
      art: 'uebergang',
      vonId: id,
      antwortId: standardKante(steps, steps.findIndex((s) => s.id === id)).antwortId,
    });
    if (gewaehlt) return nachSchritt(gewaehlt.id);
    const letzte = gliederung.hauptAnzeige[gliederung.hauptAnzeige.length - 1];
    if (letzte === undefined) return steps.length > 0 ? nachSchritt(steps[steps.length - 1].id) : { art: 'anfang' };
    return istBlockAnzeige(letzte) ? { art: 'nachBlock', block: letzte.block } : nachSchritt(letzte);
  };

  const hinzufuegen = (typ: StepType) => einfuegenIn(steps.length === 0 ? { art: 'anfang' } : hinzufuegeStelle(), typ);

  /** „Parallele Zweige“: ein neuer Block mit zwei leeren Aufgaben. */
  const parallelHinzufuegen = () => {
    // IDs vor der Änderung erzeugen (StrictMode)
    const a = neuerSchritt('aufgabe', newId);
    const b = neuerSchritt('aufgabe', newId);
    const ergebnis = parallelBlockEinfuegen(steps, steps.length === 0 ? { art: 'anfang' } : hinzufuegeStelle(), a, b, newId('blk'));
    bearbeitungUebernehmen(ergebnis, a.id, 'Paralleler Block mit zwei Zweigen angelegt.');
    setMenuOffen(false);
  };
  const parallelGesperrt = Boolean(gewaehlt?.parallel);

  const entfernenMitMeldung = (id: ID) => {
    const ergebnis = entfernenMitHinweis(steps, id);
    aendernSchritte(() => ergebnis.steps);
    setAuswahl(null);
    toast(ergebnis.hinweis ? `Schritt entfernt. ${ergebnis.hinweis}` : 'Schritt entfernt – „Rückgängig“ holt ihn zurück.');
  };

  const speichern = () => {
    if (mitStammdaten && !name.trim()) {
      toast('Bitte einen Namen angeben.');
      nameRef.current?.focus();
      return;
    }
    const sperrend = hinweise.find((h) => h.sperrt);
    if (sperrend) {
      toast(sperrend.text);
      if (sperrend.stepId) setAuswahl(sperrend.stepId);
      return;
    }
    onSpeichern({ steps: bereinigen(steps), name: name.trim(), beschreibung, geaendert });
  };

  const schliessen = useCallback(() => {
    if (geaendert) setVerwerfenFrage(true);
    else onClose();
  }, [geaendert, onClose]);

  /* ---------------------------------------------------------------- */
  /* Tastatur                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Der Editor liegt über anderen Dialogen – Escape gilt nur ihm
        e.stopPropagation();
        if (verwerfenFrage) setVerwerfenFrage(false);
        else if (menuOffen) setMenuOffen(false);
        else if (schmal && auswahl) setAuswahl(null);
        else schliessen();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      // Tippen ist je Feld zu einem Schritt zusammengefasst – Rückgängig gilt daher auch in Feldern
      if (!mod || verwerfenFrage) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        rueckgaengig();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        wiederholen();
      }
    };
    window.addEventListener('keydown', taste, true);
    return () => window.removeEventListener('keydown', taste, true);
  }, [auswahl, menuOffen, rueckgaengig, schliessen, schmal, verwerfenFrage, wiederholen]);

  /* ---------------------------------------------------------------- */
  /* Darstellung                                                       */
  /* ---------------------------------------------------------------- */

  const kuerzel = useMemo(() => {
    const m = new Map<string, string>([[EIGENE_ROLLE.toLowerCase(), 'PLM']]);
    for (const r of [...data.standardRollen, ...data.roles]) if (r.kuerzel) m.set(r.name.toLowerCase(), r.kuerzel);
    return (rolle: string) => m.get(rolle.trim().toLowerCase()) ?? rolle.trim().slice(0, 3).toUpperCase();
  }, [data.standardRollen, data.roles]);

  const rollenListe = useMemo(
    () => [...new Set([EIGENE_ROLLE, ...rollen].map((r) => r.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')),
    [rollen],
  );

  /** Nach einem Klick auf den Kopf einer Containerkarte: das Feld „Name des Blocks“ fokussieren. */
  const [blockNameFokus, setBlockNameFokus] = useState(false);
  const blockBenennenWaehlen = (blockId: ID) => {
    const b = gliederung.bloecke[blockId];
    if (!b) return;
    setAuswahl(b.erster);
    setBlockNameFokus(true);
  };

  const detailsSichtbar = (!schmal && !mittel) || auswahl !== null;
  const panel =
    gewaehlt ? (
      <SchrittDetails
        key={gewaehlt.id}
        step={gewaehlt}
        steps={steps}
        gliederung={gliederung}
        bildFolge={bildFolge}
        rollenListe={rollenListe}
        onAuswahl={setAuswahl}
        onSchrittAendern={schrittAendern}
        onSchritteAendern={aendernSchritte}
        onBearbeitung={bearbeitungUebernehmen}
        onEntfernen={entfernenMitMeldung}
        onSchliessen={() => setAuswahl(null)}
        blockNameFokus={blockNameFokus}
        onBlockNameFokussiert={() => setBlockNameFokus(false)}
        schmal={schmal || mittel}
      />
    ) : (
      <Uebersicht
        mitStammdaten={mitStammdaten}
        beschreibung={beschreibung}
        onBeschreibung={(v) => aendern((s) => ({ ...s, beschreibung: v }), 'beschreibung')}
        steps={steps}
        gliederung={gliederung}
        hinweise={hinweise}
        dauer={dauer}
        bloecke={bloecke}
        arbeitstage={arbeitstage}
        onAuswahl={setAuswahl}
        onSchliessen={schmal || mittel ? () => setAuswahl(null) : undefined}
      />
    );

  return createPortal(
    <div className="wf-overlay" onMouseDown={(e) => e.target === e.currentTarget && schliessen()}>
      <div className="wf-dialog" role="dialog" aria-modal="true" aria-label={titel} ref={dialogRef} tabIndex={-1}>
        <header className="wf-kopf">
          <div className="wf-kopf-titel">
            <div className="wf-kopf-oben">{titel}</div>
            {mitStammdaten ? (
              <input
                ref={nameRef}
                className={`wf-name ${name.trim() ? '' : 'wf-pflicht'}`}
                value={name}
                placeholder="Name des Workflows"
                aria-label="Name des Workflows"
                onChange={(e) => aendern((s) => ({ ...s, name: e.target.value }), 'name')}
              />
            ) : null}
            {untertitel ? <div className="wf-kopf-sub">{untertitel}</div> : null}
          </div>
          <div className="wf-werkzeuge">
            <span className="wf-kennzahl">
              {schritteText(steps.length)}
              {bloecke > 0 ? ` · ${bloeckeText(bloecke)}` : ''} · {tage(dauer)} im Standardverlauf
            </span>
            <div className="wf-knopfgruppe">
              <button
                type="button"
                className="btn-icon"
                onClick={rueckgaengig}
                disabled={verlauf.vorher.length === 0}
                title="Rückgängig (Strg+Z)"
                aria-label="Rückgängig"
              >
                <Icon name="rueckgaengig" size={17} />
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={wiederholen}
                disabled={verlauf.nachher.length === 0}
                title="Wiederholen (Strg+Y)"
                aria-label="Wiederholen"
              >
                <Icon name="wiederholen" size={17} />
              </button>
            </div>
            {schmal || mittel ? (
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setAuswahl('uebersicht')}>
                <Icon name="info" size={13} /> Übersicht
              </button>
            ) : null}
            <div className="wf-menu-anker">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setMenuOffen((o) => !o)}
                aria-expanded={menuOffen}
              >
                <Icon name="plus" size={13} /> Schritt hinzufügen
              </button>
              {menuOffen ? (
                <>
                  <div className="wf-menu-schatten" onMouseDown={() => setMenuOffen(false)} />
                  <div className="wf-menu" role="menu">
                    <div className="wf-menu-hinweis">
                      {gewaehlt
                        ? `Hinter „${gewaehlt.name || 'Schritt ' + nr(steps.indexOf(gewaehlt))}“${gewaehlt.parallel ? ' (im selben Zweig)' : ''}`
                        : 'Am Ende des Standardverlaufs'}
                    </div>
                    <button type="button" role="menuitem" onClick={() => hinzufuegen('aufgabe')}>
                      <span className="wf-typ-zeichen aufgabe">
                        <Icon name="aufgabe" size={15} />
                      </span>
                      <span>
                        <b>Aufgabe</b>
                        <small>Ein Arbeitsschritt mit Frist und Zuständigkeit</small>
                      </span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => hinzufuegen('entscheidung')}>
                      <span className="wf-typ-zeichen entscheidung">
                        <Icon name="raute" size={15} />
                      </span>
                      <span>
                        <b>Entscheidung</b>
                        <small>Verzweigt je nach Antwort, z. B. Ja / Nein</small>
                      </span>
                    </button>
                    <button type="button" role="menuitem" onClick={parallelHinzufuegen} disabled={parallelGesperrt}>
                      <span className="wf-typ-zeichen wf-parallel-typ">
                        <span className="wf-parallel-zeichen">‖</span>
                      </span>
                      <span>
                        <b>Parallele Zweige</b>
                        <small>
                          {parallelGesperrt
                            ? 'Nicht innerhalb eines parallelen Blocks – Blöcke lassen sich nicht schachteln'
                            : 'Zwei Aufgaben laufen gleichzeitig; weiter, wenn beide erledigt sind'}
                        </small>
                      </span>
                    </button>
                  </div>
                </>
              ) : null}
            </div>
            <button type="button" className="btn-icon wf-zu" onClick={schliessen} aria-label="Schließen">
              ✕
            </button>
          </div>
        </header>

        <div className={`wf-rumpf ${schmal ? 'schmal' : mittel ? 'mittel' : ''}`}>
          <div
            className="wf-flaeche"
            inert={(schmal || mittel) && auswahl !== null}
            onMouseDown={(e) => e.target === e.currentTarget && setAuswahl(null)}
          >
            {hinweis ? <div className="wf-banner">{hinweis}</div> : null}
            {steps.length === 0 ? (
              <div className="wf-leer">
                <Icon name="kette" size={30} strokeWidth={1.3} />
                <strong>Noch kein Schritt</strong>
                <span>Legen Sie den ersten Schritt an.</span>
                <div className="row">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => hinzufuegen('aufgabe')}>
                    <Icon name="plus" size={13} /> Aufgabe
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => hinzufuegen('entscheidung')}>
                    <Icon name="plus" size={13} /> Entscheidung
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={parallelHinzufuegen}>
                    <Icon name="plus" size={13} /> Parallele Zweige
                  </button>
                </div>
              </div>
            ) : (
              <Ablaufbild
                steps={steps}
                gliederung={gliederung}
                auswahl={gewaehlt?.id ?? null}
                hover={hover}
                fehlend={fehlend}
                schmal={schmal}
                kuerzel={kuerzel}
                onAuswahl={(id, perTastatur) => {
                  setAuswahl(id);
                  if (perTastatur) setTimeout(() => panelRef.current?.focus(), 0);
                }}
                onBlockBenennen={blockBenennenWaehlen}
                onHover={setHover}
                onEinfuegen={einfuegenIn}
              />
            )}
          </div>
          {detailsSichtbar ? (
            <>
              {schmal || mittel ? (
                <div className={schmal ? 'wf-blatt-schatten' : 'wf-schublade-schatten'} onMouseDown={() => setAuswahl(null)} />
              ) : null}
              <aside ref={panelRef} tabIndex={-1} className={`wf-panel ${schmal ? 'blatt' : mittel ? 'schublade' : ''}`}>
                {panel}
              </aside>
            </>
          ) : null}
        </div>

        <footer className="wf-fuss">
          <span className="wf-fuss-info">
            {hinweise.length > 0 ? (
              <button
                type="button"
                className={`wf-hinweis-knopf ${hinweise.some((h) => h.sperrt) ? 'sperrt' : ''}`}
                onClick={() => setAuswahl('uebersicht')}
              >
                {hinweise.length} {hinweise.length === 1 ? 'Hinweis' : 'Hinweise'}
              </button>
            ) : (
              <span className="wf-ok">
                <Icon name="check" size={13} /> Vollständig
              </span>
            )}
            {entscheidungen > 0 ? (
              <span className="tertiary">
                {entscheidungen} {entscheidungen === 1 ? 'Entscheidung' : 'Entscheidungen'} ·{' '}
                {gliederung.abweichungenGesamt} {gliederung.abweichungenGesamt === 1 ? 'Abweichung' : 'Abweichungen'}
              </span>
            ) : null}
            {bloecke > 0 ? <span className="tertiary">{bloeckeText(bloecke)}</span> : null}
            {arbeitstage ? <span className="tertiary">Fristen in Arbeitstagen</span> : null}
          </span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={schliessen}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            {speichernLabel}
          </button>
        </footer>
      </div>

      {verwerfenFrage ? (
        <ConfirmDialog
          titel="Änderungen verwerfen?"
          text="Die Änderungen an diesem Workflow gehen verloren."
          bestaetigenLabel="Verwerfen"
          abbrechenLabel="Weiter bearbeiten"
          onConfirm={onClose}
          onClose={() => setVerwerfenFrage(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Ablaufbild                                                          */
/* ------------------------------------------------------------------ */

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

interface Geometrie {
  breite: number;
  hoehe: number;
  karten: Record<ID, Box>;
  /** Rechte Kante der Standardspalte, linke und rechte Kante der Abweichungsspalte. */
  hauptRechts: number;
  abwLinks: number;
  abwRechts: number;
}

/** Breite eines Zweigs, wenn die Zweige nebeneinander stehen, und Abstand zwischen ihnen (siehe .wf-parallel-*). */
const ZWEIG_BREITE = 240;
const ZWEIG_ABSTAND = 12;
/** Innenrand und Rahmen der Containerkarte. */
const CONTAINER_RAND = 2 * 12 + 2;
/** Mindestbreite der übrigen Spalten des Rasters samt Rand der Fläche (siehe .wf-raster, .wf-flaeche). */
const UEBRIGE_BREITE = 110 + 230 + 70 + 2 * 26;

/** Breite eines Blocks mit n Zweigen nebeneinander. */
const blockBreite = (n: number) => n * ZWEIG_BREITE + (n - 1) * ZWEIG_ABSTAND + CONTAINER_RAND;

/** Wo eine Karte steht: oben im Bild oder in einem Zweig (Standardweg bzw. Abweichung im Zweig). */
type KartenOrt = 'haupt' | 'abweichung' | 'unerreichbar' | 'zweig' | 'zweigabw';

function Ablaufbild({
  steps,
  gliederung,
  auswahl,
  hover,
  fehlend,
  schmal,
  kuerzel,
  onAuswahl,
  onBlockBenennen,
  onHover,
  onEinfuegen,
}: {
  steps: ProcessTemplateStep[];
  gliederung: Gliederung;
  auswahl: ID | null;
  hover: ID | null;
  fehlend: Set<ID>;
  schmal: boolean;
  kuerzel: (rolle: string) => string;
  onAuswahl: (id: ID, perTastatur: boolean) => void;
  /** Kopf einer Containerkarte: ersten Schritt des Blocks wählen und den Blocknamen bearbeiten. */
  onBlockBenennen: (blockId: ID) => void;
  onHover: (id: ID | null) => void;
  onEinfuegen: (stelle: Einfuegestelle) => void;
}) {
  const rasterRef = useRef<HTMLDivElement>(null);
  const hauptRef = useRef<HTMLDivElement>(null);
  const abwRef = useRef<HTMLDivElement>(null);
  const karten = useRef(new Map<ID, HTMLElement>());
  const [geo, setGeo] = useState<Geometrie | null>(null);
  /** Breite der Arbeitsfläche – entscheidet, ob die Zweige eines Blocks nebeneinander passen. */
  const [platz, setPlatz] = useState<number | null>(null);

  const index = useMemo(() => new Map(steps.map((s, i) => [s.id, i])), [steps]);
  const schritt = (id: ID) => steps[index.get(id)!];
  const { hauptAnzeige, abweichungen, rueckSprungZu, kanten, bloecke } = gliederung;
  const unerreichbar = useMemo(() => unerreichbarOben(gliederung, steps), [gliederung, steps]);

  /** Block eines Schritts; null = außerhalb von Blöcken. */
  const blockVon = (id: ID): ID | null => {
    const i = index.get(id);
    const b = i === undefined ? null : (steps[i].parallel?.block ?? null);
    return b && bloecke[b] ? b : null;
  };
  /** Stelle im Bild: der Schritt selbst bzw. sein Block. */
  const einheit = (id: ID) => blockVon(id) ?? id;

  const messen = useCallback(() => {
    const raster = rasterRef.current;
    if (!raster || schmal) return;
    const basis = raster.getBoundingClientRect();
    // Während der Öffnungsanimation ist der Dialog skaliert – Maßstab herausrechnen
    const mx = basis.width ? raster.offsetWidth / basis.width : 1;
    const my = basis.height ? raster.offsetHeight / basis.height : 1;
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return {
        l: (r.left - basis.left) * mx,
        t: (r.top - basis.top) * my,
        r: (r.right - basis.left) * mx,
        b: (r.bottom - basis.top) * my,
      };
    };
    const neu: Geometrie = {
      breite: raster.offsetWidth,
      hoehe: raster.offsetHeight,
      karten: {},
      hauptRechts: hauptRef.current ? box(hauptRef.current).r : 0,
      abwLinks: abwRef.current ? box(abwRef.current).l : 0,
      abwRechts: abwRef.current ? box(abwRef.current).r : 0,
    };
    karten.current.forEach((el, id) => {
      if (el.isConnected) neu.karten[id] = box(el);
    });
    setGeo((alt) => (alt && JSON.stringify(alt) === JSON.stringify(neu) ? alt : neu));
  }, [schmal]);

  useLayoutEffect(() => {
    messen();
  });
  useEffect(() => {
    const raster = rasterRef.current;
    if (!raster) return;
    const ro = new ResizeObserver(() => messen());
    ro.observe(raster);
    return () => ro.disconnect();
  }, [messen]);
  // Breite der Fläche (Elternelement des Rasters) – vor dem ersten Zeichnen und bei jeder Größenänderung
  useLayoutEffect(() => {
    const flaeche = rasterRef.current?.parentElement;
    if (!flaeche || schmal) return;
    setPlatz(flaeche.clientWidth);
    const ro = new ResizeObserver(() => setPlatz(flaeche.clientWidth));
    ro.observe(flaeche);
    return () => ro.disconnect();
  }, [schmal]);

  /** Die Zweige eines Blocks mit n Zweigen passen nebeneinander in die Spalte des Standardverlaufs. */
  const nebeneinander = (n: number) => !schmal && platz !== null && blockBreite(n) <= platz - UEBRIGE_BREITE;

  const merke = (id: ID) => (el: HTMLElement | null) => {
    if (el) karten.current.set(id, el);
    else karten.current.delete(id);
  };

  const titel = (id: ID) => `${nr(index.get(id)!)} · ${schritt(id).name || 'ohne Bezeichnung'}`;

  /* --------------------------- Rang und Rücksprünge --------------------------- */

  const hauptPos = new Map<ID, number>(hauptAnzeige.map((e, k) => [istBlockAnzeige(e) ? e.block : e, k]));
  /** Stelle im Ablauf: Index im Standardverlauf (ein Block als eine Stelle), bei Abweichungen ihr Anker + ½. */
  const rang = new Map<ID, number>([...hauptPos, ...abweichungen.map((a): [ID, number] => [a.id, a.anker + 0.5])]);
  /** Rücksprung: Übergang zu einer Stelle des Standardverlaufs, die nicht später kommt. */
  const istRueck = (von: ID, nach: Ziel) => {
    if (nach === 'ende') return false;
    const z = einheit(nach);
    const v = einheit(von);
    return hauptPos.has(z) && rang.has(v) && hauptPos.get(z)! <= rang.get(v)!;
  };
  /** Stelle im Zweig: Standardweg, danach die Abweichungen im Zweig. */
  const zweigRang = new Map<ID, number>();
  for (const b of Object.values(bloecke)) {
    for (const z of b.zweige) [...z.standard, ...z.abweichungen].forEach((id, j) => zweigRang.set(id, j));
  }
  /** Rücksprung im Zweig (etwa zur erneuten Nachreichung). */
  const zweigRueck = (k: Kante) =>
    k.art === 'schritt' && k.nach !== 'ende' && zweigRang.has(k.von) && zweigRang.has(k.nach) && zweigRang.get(k.nach)! <= zweigRang.get(k.von)!;

  /**
   * Übergänge, die als Linie gezeichnet werden: abseits des Standardverlaufs,
   * zwischen Stellen des Bilds (Ziel in einem Block: der ganze Block). Aus
   * einem Zweig heraus wird nichts gezeichnet – das steht als Text auf der Karte.
   */
  const gezeichnet = (k: Kante) =>
    !schmal && !k.standard && k.nach !== 'ende' && !blockVon(k.von) && rang.has(k.von) && rang.has(einheit(k.nach));
  const seitenKanten: Kante[] = kanten.filter(gezeichnet).map((k) => ({ ...k, nach: einheit(k.nach as ID) }));

  /** Ziel eines Übergangs als Text auf der Karte. */
  const zielText = (k: Kante): string => {
    if (k.unzulaessig) return 'anderer Zweig – nicht zulässig';
    if (k.art === 'zweigende') return 'Zweig beendet';
    if (k.nach === 'ende') return 'Planlauf endet';
    return k.art === 'ausstieg' ? `Ausstieg: ${titel(k.nach)}` : titel(k.nach);
  };

  /* --------------------------------- Bausteine --------------------------------- */

  const karte = (id: ID, ort: KartenOrt) => {
    const s = schritt(id);
    const imBlock = blockVon(id) !== null;
    const eigene = kanten.filter((k) => k.von === id && !k.standard);
    // Übergänge als Text: im Block und auf schmalen Bildschirmen alle, sonst die nicht gezeichneten
    const zweige = eigene.filter((k) => imBlock || !gezeichnet(k));
    return (
      <KarteAnzeige
        key={id}
        step={s}
        nummer={index.get(id)!}
        ort={ort}
        aktiv={auswahl === id}
        hervor={hover !== null && (hover === id || kanten.some((k) => (k.von === hover && k.nach === id) || (k.nach === hover && k.von === id)))}
        fehlt={fehlend.has(id)}
        kuerzel={kuerzel(s.roleName)}
        zweige={zweige.map((k) => ({
          text: k.text,
          ziel: zielText(k),
          rueck: imBlock && k.art === 'schritt' ? zweigRueck(k) : istRueck(id, k.nach),
          unzulaessig: k.unzulaessig,
        }))}
        refFn={merke(id)}
        onClick={(perTastatur) => onAuswahl(id, perTastatur)}
        onHover={onHover}
      />
    );
  };

  /** Übergang im Standardverlauf bzw. im Zweig mit „+“ zum Einfügen an dieser Stelle. */
  const verbinder = (stelle: Einfuegestelle, beschriftung: string | null = null, klasse = '') => (
    <div className={`wf-verbinder ${klasse}`}>
      <span className="wf-linie" />
      {beschriftung ? <span className="wf-antwort standard">{beschriftung}</span> : null}
      <button
        type="button"
        className="wf-einfuegen"
        tabIndex={-1}
        title="Schritt hier einfügen"
        aria-label="Schritt hier einfügen"
        onClick={() => onEinfuegen(stelle)}
      >
        <Icon name="plus" size={12} strokeWidth={2.2} />
      </button>
      <span className="wf-pfeil" />
    </div>
  );
  /** Übergang hinter einem Schritt: sein Standardübergang (bei Entscheidungen mit Antwort). */
  const verbinderNach = (id: ID) => {
    const std = kanten.find((k) => k.von === id);
    return verbinder(
      { art: 'uebergang', vonId: id, antwortId: std?.antwortId ?? null },
      schritt(id).typ === 'entscheidung' ? (std?.text ?? null) : null,
    );
  };

  const zweigSchluss = (z: ZweigGliederung) => (
    <div className={`wf-knoten wf-parallel-schluss ${z.schluss.art}`}>
      {z.schluss.art === 'zweigende' ? (
        <>
          <Icon name="check" size={12} /> Zweig beendet
        </>
      ) : z.schluss.art === 'ausstieg' ? (
        <>
          <Icon name="chevron" size={12} /> Ausstieg: {titel(z.schluss.nach)}
        </>
      ) : (
        <>
          <Icon name="schleife" size={12} /> Schleife zurück zu {titel(z.schluss.nach)}
        </>
      )}
    </div>
  );

  /**
   * Containerkarte eines parallelen Blocks: Kopf, Gabelbalken, die Zweige
   * (nebeneinander, wenn genug Platz ist, sonst untereinander) mit ihrem
   * Standardweg und den Abweichungen im Zweig, Zusammenführungsbalken.
   */
  const blockKarte = (blockId: ID, ort: 'haupt' | 'abweichung' | 'unerreichbar') => {
    const b = bloecke[blockId];
    const n = b.zweige.length;
    const seite = ort === 'haupt' && nebeneinander(n);
    const stil = seite ? ({ '--wf-parallel-n': n } as CSSProperties) : undefined;
    const bezug = auswahl !== null && blockVon(auswahl) === blockId;
    return (
      <div
        key={blockId}
        ref={merke(blockId)}
        role="group"
        aria-label={`Paralleler Block${b.name ? ` „${b.name}“` : ''} mit ${n} Zweigen`}
        className={`wf-parallel wf-parallel-${ort} ${seite ? 'wf-parallel-nebeneinander' : 'wf-parallel-gestapelt'} ${bezug ? 'wf-parallel-aktiv' : ''}`}
        style={stil}
      >
        <button
          type="button"
          className="wf-parallel-kopf"
          title={b.name ? 'Block umbenennen' : 'Block benennen'}
          onClick={() => onBlockBenennen(blockId)}
        >
          <span className="wf-parallel-zeichen">‖</span>
          <span className="wf-parallel-titel">{blockTitel(b.name, n)}</span>
          <span className="wf-parallel-kopf-text">laufen gleichzeitig</span>
        </button>
        <div className="wf-parallel-balken" aria-hidden="true" />
        <div className="wf-parallel-zweige">
          {b.zweige.map((z) => (
            <div key={z.zweig} className="wf-parallel-zweig">
              <div className="wf-parallel-zweig-kopf" title={z.name ? `Zweig ${z.zweig + 1}: ${z.name}` : undefined}>
                {zweigTitel(z.name, z.zweig)}
              </div>
              {verbinder({ art: 'zweiganfang', block: blockId, zweig: z.zweig }, null, 'wf-parallel-anfang')}
              {z.standard.map((id) => (
                <Fragment key={id}>
                  {karte(id, 'zweig')}
                  {verbinderNach(id)}
                </Fragment>
              ))}
              {zweigSchluss(z)}
              <div className={`wf-parallel-rest ${z.abweichungen.length + z.unerreichbar.length === 0 ? 'mit-linie' : ''}`} />
              {z.abweichungen.length > 0 ? (
                <div className="wf-parallel-abw">
                  <div className="wf-parallel-abw-kopf">Abweichungen im Zweig</div>
                  {z.abweichungen.map((id) => karte(id, 'zweigabw'))}
                </div>
              ) : null}
              {z.unerreichbar.length > 0 ? (
                <div className="wf-parallel-abw wf-parallel-weg">
                  <div className="wf-parallel-abw-kopf">Im Zweig nicht erreichbar</div>
                  {z.unerreichbar.map((id) => karte(id, 'unerreichbar'))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="wf-parallel-balken" aria-hidden="true" />
        <div className="wf-parallel-fuss">Weiter, wenn alle Zweige erledigt sind</div>
      </div>
    );
  };

  /** Eine Stelle des Standardverlaufs samt Übergang zur nächsten. */
  const stelle = (e: Anzeige) =>
    istBlockAnzeige(e) ? (
      <>
        {blockKarte(e.block, 'haupt')}
        {verbinder({ art: 'nachBlock', block: e.block })}
      </>
    ) : (
      <>
        {karte(e, 'haupt')}
        {verbinderNach(e)}
      </>
    );
  const schluessel = (e: Anzeige) => (istBlockAnzeige(e) ? e.block : e);
  const abweichung = (id: ID) => (bloecke[id] ? blockKarte(id, 'abweichung') : karte(id, 'abweichung'));
  const nichtErreicht = (e: Anzeige) => (istBlockAnzeige(e) ? blockKarte(e.block, 'unerreichbar') : karte(e, 'unerreichbar'));

  const endknoten = (
    <div className="wf-knoten wf-ende">
      {rueckSprungZu ? (
        <>
          <Icon name="schleife" size={14} /> Schleife zurück zu {titel(rueckSprungZu)}
        </>
      ) : (
        <>
          <Icon name="ziel" size={14} /> Planlauf abgeschlossen
        </>
      )}
    </div>
  );

  /* -------------------------- schmal: untereinander -------------------------- */
  if (schmal) {
    return (
      <div className="wf-schmal">
        <div className="wf-spaltenkopf">Standardverlauf</div>
        <div className="wf-knoten wf-start">
          <Icon name="start" size={14} /> Planlauf starten
        </div>
        {verbinder({ art: 'anfang' })}
        {hauptAnzeige.map((e) => (
          <div key={schluessel(e)} className="wf-zelle">
            {stelle(e)}
          </div>
        ))}
        {endknoten}
        {abweichungen.length > 0 ? (
          <>
            <div className="wf-spaltenkopf abw">Abweichungen</div>
            <div className="wf-stapel">{abweichungen.map((a) => abweichung(a.id))}</div>
          </>
        ) : null}
        {unerreichbar.length > 0 ? (
          <>
            <div className="wf-spaltenkopf weg">Nicht erreichbar</div>
            <div className="wf-stapel">{unerreichbar.map(nichtErreicht)}</div>
          </>
        ) : null}
      </div>
    );
  }

  /* -------------------------- breit: zwei Spalten mit Linien -------------------------- */
  const abwNachAnker = new Map<number, ID[]>();
  for (const a of abweichungen) abwNachAnker.set(a.anker, [...(abwNachAnker.get(a.anker) ?? []), a.id]);
  // Spalte des Standardverlaufs mindestens so breit wie der breiteste Block mit Zweigen nebeneinander
  const spalte1 = Math.max(
    250,
    ...hauptAnzeige.filter(istBlockAnzeige).map((e) => bloecke[e.block].zweige.length).filter(nebeneinander).map(blockBreite),
  );
  const zeilen = hauptAnzeige.length + 2;
  return (
    <div
      className="wf-raster"
      ref={rasterRef}
      style={spalte1 > 250 ? { gridTemplateColumns: `minmax(${spalte1}px, max-content) minmax(110px, 140px) minmax(230px, 300px)` } : undefined}
    >
      <div className="wf-spaltenkopf" style={{ gridColumn: 1, gridRow: 1 }}>
        Standardverlauf
      </div>
      <div className="wf-spaltenkopf abw" style={{ gridColumn: 3, gridRow: 1 }}>
        Abweichungen
      </div>
      {/* Messleisten für die Spaltenkanten */}
      <div ref={hauptRef} className="wf-messleiste" style={{ gridColumn: 1, gridRow: `2 / ${zeilen + 2}` }} />
      <div ref={abwRef} className="wf-messleiste" style={{ gridColumn: 3, gridRow: `2 / ${zeilen + 2}` }} />

      <div className="wf-zelle wf-start-zelle" style={{ gridColumn: 1, gridRow: 2 }}>
        <div className="wf-knoten wf-start">
          <Icon name="start" size={14} /> Planlauf starten
        </div>
        {verbinder({ art: 'anfang' })}
      </div>
      {hauptAnzeige.map((e, k) => (
        <div key={schluessel(e)} className="wf-zelle" style={{ gridColumn: 1, gridRow: k + 3 }}>
          {stelle(e)}
        </div>
      ))}
      <div className="wf-zelle" style={{ gridColumn: 1, gridRow: hauptAnzeige.length + 3 }}>
        {endknoten}
      </div>

      {abweichungen.length === 0 ? (
        <div className="wf-abw-leer" style={{ gridColumn: 3, gridRow: 3 }}>
          {gliederung.abweichungenGesamt > 0
            ? 'Abweichungen gibt es nur innerhalb paralleler Zweige – sie stehen gestrichelt unter ihrem Zweig.'
            : 'Keine Abweichungen – jede Antwort führt durch den Standardverlauf. Schritte, die nur über eine andere Antwort erreicht werden, erscheinen hier.'}
        </div>
      ) : null}
      {[...abwNachAnker.entries()].map(([anker, ids]) => (
        <div key={`abw-${anker}`} className="wf-stapel" style={{ gridColumn: 3, gridRow: anker + 3 }}>
          {ids.map(abweichung)}
        </div>
      ))}

      {unerreichbar.length > 0 ? (
        <div className="wf-weg" style={{ gridColumn: '1 / -1', gridRow: hauptAnzeige.length + 4 }}>
          <div className="wf-spaltenkopf weg">Nicht erreichbar – kein Übergang führt zu diesen Schritten</div>
          <div className="wf-weg-karten">{unerreichbar.map(nichtErreicht)}</div>
        </div>
      ) : null}

      {geo ? (
        <Linien
          geo={geo}
          kanten={seitenKanten}
          rang={rang}
          haupt={new Set(hauptPos.keys())}
          auswahl={auswahl === null ? null : einheit(auswahl)}
          hover={hover === null ? null : einheit(hover)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Karte                                                               */
/* ------------------------------------------------------------------ */

function KarteAnzeige({
  step,
  nummer,
  ort,
  aktiv,
  hervor,
  fehlt,
  kuerzel,
  zweige,
  refFn,
  onClick,
  onHover,
}: {
  step: ProcessTemplateStep;
  nummer: number;
  ort: KartenOrt;
  aktiv: boolean;
  hervor: boolean;
  fehlt: boolean;
  kuerzel: string;
  zweige: { text: string | null; ziel: string; rueck: boolean; unzulaessig: boolean }[];
  refFn: (el: HTMLElement | null) => void;
  onClick: (perTastatur: boolean) => void;
  onHover: (id: ID | null) => void;
}) {
  const entscheidung = step.typ === 'entscheidung';
  // Karten im Zweig: wie im Standardverlauf bzw. wie Abweichungen, im Zweig gestrichelt
  const ortKlasse = ort === 'zweig' ? 'haupt wf-parallel-karte' : ort === 'zweigabw' ? 'abweichung wf-parallel-gestrichelt' : ort;
  return (
    <button
      type="button"
      ref={refFn}
      className={`wf-karte ${step.typ} ${ortKlasse} ${aktiv ? 'aktiv' : ''} ${hervor ? 'hervor' : ''} ${fehlt ? 'fehlt' : ''}`}
      onClick={(e) => onClick(e.detail === 0)}
      onMouseEnter={() => onHover(step.id)}
      onMouseLeave={() => onHover(null)}
      aria-pressed={aktiv}
    >
      <span className="wf-karte-kopf">
        <span className={`wf-typ ${step.typ}`}>
          <Icon name={entscheidung ? 'raute' : 'aufgabe'} size={13} />
          {STEP_TYPE_LABEL[step.typ]}
        </span>
        <span className="wf-nr">{nr(nummer)}</span>
      </span>
      <span className={`wf-karte-titel ${step.name ? '' : 'leer'}`}>{step.name || 'Bezeichnung fehlt'}</span>
      <span className="wf-karte-fuss">
        <span className="wf-rolle">
          {step.roleName ? (
            <>
              <span className="wf-kuerzel">{kuerzel}</span>
              <span className="truncate">{step.roleName}</span>
            </>
          ) : (
            <span className="tertiary">keine Funktion</span>
          )}
        </span>
        <span className="wf-frist">
          <Icon name="frist" size={12} />
          {tage(step.fristTage)}
        </span>
      </span>
      {step.nachweis !== 'keine' || step.mailFrage ? (
        <span className="wf-merkmale">
          {step.nachweis !== 'keine' ? <span className="wf-merkmal">{NACHWEIS_LABEL[step.nachweis]}</span> : null}
          {step.mailFrage ? (
            <span className="wf-merkmal">
              <Icon name="mail" size={11} /> E-Mail
            </span>
          ) : null}
        </span>
      ) : null}
      {zweige.length > 0 ? (
        <span className="wf-zweige">
          {zweige.map((z, n) => (
            <span key={n} className={`wf-zweig ${z.rueck ? 'rueck' : ''} ${z.unzulaessig ? 'wf-parallel-unzulaessig' : ''}`}>
              {z.text ? <b>{z.text}</b> : null} → {z.ziel}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Linien abseits des Standardverlaufs                                 */
/* ------------------------------------------------------------------ */

/** Pfad durch Eckpunkte mit abgerundeten Ecken. */
function eckenPfad(p: [number, number][], radius = 9): string {
  if (p.length < 2) return '';
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const [x2, y2] = p[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0);
    const l2 = Math.hypot(x2 - x1, y2 - y1);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.5) {
      d += ` L ${x1} ${y1}`;
      continue;
    }
    const a: [number, number] = [x1 - ((x1 - x0) / l1) * r, y1 - ((y1 - y0) / l1) * r];
    const b: [number, number] = [x1 + ((x2 - x1) / l2) * r, y1 + ((y2 - y1) / l2) * r];
    d += ` L ${a[0]} ${a[1]} Q ${x1} ${y1} ${b[0]} ${b[1]}`;
  }
  const [xe, ye] = p[p.length - 1];
  return `${d} L ${xe} ${ye}`;
}

function Linien({
  geo,
  kanten,
  rang,
  haupt,
  auswahl,
  hover,
}: {
  geo: Geometrie;
  kanten: Kante[];
  /** Stelle im Ablauf: Index im Standardverlauf, bei Abweichungen ihr Anker + ½. */
  rang: Map<ID, number>;
  haupt: Set<ID>;
  auswahl: ID | null;
  hover: ID | null;
}) {
  const Y = 30; // Höhe des Anschlusspunkts unter der Kartenoberkante
  type Art = 'zurAbw' | 'zurHaupt' | 'hauptHaupt' | 'abwAbw';

  // Mehrere Linien, die dieselbe Kartenseite verlassen, leicht versetzt
  const ausgang = new Map<string, number>();
  const versetzt = (schluessel: string) => {
    const n = ausgang.get(schluessel) ?? 0;
    ausgang.set(schluessel, n + 1);
    return n * 22;
  };

  const gezeichnet = kanten
    .filter((k) => k.nach !== 'ende' && geo.karten[k.von] && geo.karten[k.nach as ID] && rang.has(k.von) && rang.has(k.nach as ID))
    .map((k) => {
      const nach = k.nach as ID;
      const vonHaupt = haupt.has(k.von);
      const nachHaupt = haupt.has(nach);
      const art: Art = vonHaupt ? (nachHaupt ? 'hauptHaupt' : 'zurAbw') : nachHaupt ? 'zurHaupt' : 'abwAbw';
      const q = geo.karten[k.von];
      const z = geo.karten[nach];
      const linksRaus = art === 'zurHaupt';
      // Direkt darunter gestapelte Abweichung: senkrecht von Karte zu Karte
      const gestapelt = art === 'abwAbw' && z.t >= q.b && z.t - q.b < 40 && Math.abs(z.l - q.l) < 2;
      const sx = linksRaus ? q.l : q.r;
      const sy = Math.min(q.t + Y + versetzt(`${k.von}:${linksRaus ? 'l' : 'r'}`), q.b - 8);
      // Rücksprung: führt zu einem Schritt des Standardverlaufs, der nicht später kommt
      const rueck = nachHaupt && rang.get(nach)! <= rang.get(k.von)!;
      // Linien zum selben Ziel teilen sich Bahn und Anschluss (Bündel)
      const bereich: 'zwischen' | 'rechts' = art === 'abwAbw' ? 'rechts' : 'zwischen';
      const gruppe = `${nach}:${art === 'zurAbw' ? 'l' : 'r'}:${bereich}`;
      // Eingänge an der rechten Kartenseite etwas tiefer als die Ausgänge dort
      const ty = z.t + Y + (art === 'zurAbw' ? 0 : 16);
      return { k, nach, art, q, z, sx, sy, ty, rueck, bereich, gruppe, gestapelt };
    });

  // Bahnen: je Bündel eine, überlappende Bündel nebeneinander
  const spannen = new Map<string, { von: number; bis: number; bereich: 'zwischen' | 'rechts' }>();
  for (const g of gezeichnet) {
    if (g.gestapelt) continue;
    const alt = spannen.get(g.gruppe);
    const von = Math.min(g.sy, g.ty, alt?.von ?? Infinity);
    const bis = Math.max(g.sy, g.ty, alt?.bis ?? -Infinity);
    spannen.set(g.gruppe, { von, bis, bereich: g.bereich });
  }
  const belegt: Record<'zwischen' | 'rechts', [number, number][][]> = { zwischen: [], rechts: [] };
  const bahn = new Map<string, number>();
  for (const [gruppe, { von, bis, bereich }] of spannen) {
    const liste = belegt[bereich];
    let n = 0;
    while (liste[n] && liste[n].some(([a, b]) => !(bis < a - 6 || von > b + 6))) n++;
    (liste[n] ??= []).push([von, bis]);
    bahn.set(gruppe, n);
  }
  const spalt = Math.max(40, geo.abwLinks - geo.hauptRechts);
  const bahnX = (gruppe: string, bereich: 'zwischen' | 'rechts') =>
    bereich === 'rechts'
      ? geo.abwRechts + 18 + bahn.get(gruppe)! * 10
      : Math.min(geo.hauptRechts + 22 + bahn.get(gruppe)! * 10, geo.hauptRechts + spalt - 18);

  const linien = gezeichnet.map((g) => {
    if (g.gestapelt) {
      const cx = (g.q.l + g.q.r) / 2;
      return {
        k: g.k,
        d: `M ${cx} ${g.q.b} L ${cx} ${g.z.t}`,
        spitze: `M ${cx} ${g.z.t} l -4.5 -7 l 9 0 z`,
        label: { x: cx + 8, y: g.q.b + 16, links: false, unten: false },
        rueck: g.rueck,
        aktiv: auswahl !== null && (g.k.von === auswahl || g.nach === auswahl),
        hervor: hover !== null && (g.k.von === hover || g.nach === hover),
      };
    }
    const x = bahnX(g.gruppe, g.bereich);
    const tx = g.art === 'zurAbw' ? g.z.l : g.z.r;
    const punkte: [number, number][] =
      g.art === 'zurAbw' && Math.abs(g.sy - g.ty) < 1
        ? [[g.sx, g.sy], [tx, g.ty]]
        : [[g.sx, g.sy], [x, g.sy], [x, g.ty], [tx, g.ty]];
    const nachRechts = g.art === 'zurAbw';
    const spitze = nachRechts ? `M ${tx} ${g.ty} l -7 -4.5 l 0 9 z` : `M ${tx} ${g.ty} l 7 -4.5 l 0 9 z`;
    const links = g.art === 'zurHaupt';
    // Rechts der Abweichungen: führt die Linie nach oben, steht das Etikett
    // unter ihr – sonst läge es über der eigenen senkrechten Bahn.
    const unten = g.art === 'abwAbw' && g.ty < g.sy;
    return {
      k: g.k,
      d: eckenPfad(punkte),
      spitze,
      label: { x: links ? g.sx - 8 : g.sx + 8, y: g.sy, links, unten },
      rueck: g.rueck,
      aktiv: auswahl !== null && (g.k.von === auswahl || g.nach === auswahl),
      hervor: hover !== null && (g.k.von === hover || g.nach === hover),
    };
  });

  return (
    <>
      <svg className="wf-linien" width={geo.breite} height={geo.hoehe} aria-hidden="true">
        {linien.map((l, n) => (
          <g key={n} className={`wf-kante ${l.rueck ? 'rueck' : 'abw'} ${l.aktiv ? 'aktiv' : ''} ${l.hervor ? 'hervor' : ''}`}>
            <path className="wf-kante-linie" d={l.d} />
            <path className="wf-kante-spitze" d={l.spitze} />
          </g>
        ))}
      </svg>
      {linien.map((l, n) =>
        l.k.text ? (
          <span
            key={`t${n}`}
            className={`wf-antwort ${l.rueck ? 'rueck' : 'abw'} ${l.aktiv ? 'aktiv' : ''}`}
            style={{
              left: l.label.x,
              top: l.label.y,
              transform: `translate(${l.label.links ? '-100%' : '0'}, ${l.label.unten ? '25%' : '-125%'})`,
            }}
          >
            {l.k.text}
          </span>
        ) : null,
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Schrittdetails                                                      */
/* ------------------------------------------------------------------ */

function SchrittDetails({
  step,
  steps,
  gliederung,
  bildFolge,
  rollenListe,
  onAuswahl,
  onSchrittAendern,
  onSchritteAendern,
  onBearbeitung,
  onEntfernen,
  onSchliessen,
  blockNameFokus,
  onBlockNameFokussiert,
  schmal,
}: {
  step: ProcessTemplateStep;
  steps: ProcessTemplateStep[];
  gliederung: Gliederung;
  bildFolge: ID[];
  rollenListe: string[];
  onAuswahl: (id: ID | 'uebersicht' | null) => void;
  onSchrittAendern: (id: ID, f: (s: ProcessTemplateStep) => ProcessTemplateStep, feld?: string | null) => void;
  onSchritteAendern: (f: (s: ProcessTemplateStep[]) => ProcessTemplateStep[], feld?: string | null) => void;
  /** Bearbeitung mit möglichem Hinweis übernehmen (siehe bearbeitungUebernehmen). */
  onBearbeitung: (e: Bearbeitung, neueAuswahl?: ID | null, meldung?: string) => void;
  onEntfernen: (id: ID) => void;
  onSchliessen: () => void;
  /** Das Feld „Name des Blocks“ fokussieren (nach einem Klick auf den Kopf der Containerkarte). */
  blockNameFokus: boolean;
  onBlockNameFokussiert: () => void;
  schmal: boolean;
}) {
  const { data } = useStore();
  const blockNameRef = useRef<HTMLInputElement>(null);
  const i = steps.indexOf(step);
  const pos = bildFolge.indexOf(step.id);
  const struktur = useMemo(() => strukturVon(steps), [steps]);
  /** Lage im parallelen Block; null = außerhalb von Blöcken. */
  const lage = struktur.lage[i] ?? null;
  const zweigG = lage ? gliederung.bloecke[lage.block.id]?.zweige[lage.zweig] : undefined;
  /** Namen ungekürzt, wie getippt (der erste nicht leere im Block bzw. Zweig). */
  const rohName = (feld: 'name' | 'zweigName', passt: (p: NonNullable<ProcessTemplateStep['parallel']>) => boolean) =>
    steps.map((s) => s.parallel).find((p) => p && passt(p) && p[feld]?.trim())?.[feld] ?? '';
  const blockNameRoh = lage ? rohName('name', (p) => p.block === lage.block.id) : '';
  const zweigNameRoh =
    lage && step.parallel ? rohName('zweigName', (p) => p.block === lage.block.id && p.zweig === step.parallel!.zweig) : '';
  useEffect(() => {
    if (!blockNameFokus) return;
    onBlockNameFokussiert();
    blockNameRef.current?.focus();
    blockNameRef.current?.select();
  }, [blockNameFokus, onBlockNameFokussiert]);
  const ort = lage
    ? `Paralleler Block${lage.block.name ? ` „${lage.block.name}“` : ''} · ${
        lage.block.zweigNamen[lage.zweig] ? `${lage.block.zweigNamen[lage.zweig]} · ` : ''
      }Zweig ${lage.zweig + 1} von ${lage.block.zweige.length}${
        zweigG?.standard.includes(step.id) ? '' : zweigG?.unerreichbar.includes(step.id) ? ' · im Zweig nicht erreichbar' : ' · Abweichung im Zweig'
      }`
    : gliederung.hauptAnzeige.includes(step.id)
      ? 'Standardverlauf'
      : gliederung.unerreichbar.includes(step.id)
        ? 'nicht erreichbar'
        : 'Abweichung';
  const entscheidung = step.typ === 'entscheidung';
  const bewegbar = verschiebbar(gliederung, step.id);
  const aendern = (patch: Partial<ProcessTemplateStep>, feld: string | null = null) =>
    onSchrittAendern(step.id, (s) => ({ ...s, ...patch }), feld);
  /** Wohin „nächster Schritt“ (null) führt – im Zweig der nächste Schritt des Zweigs. */
  const folge = i >= 0 ? nachfolger(steps, i, null, struktur) : null;
  const titel = (k: number) => `${nr(k)} · ${steps[k].name || 'ohne Bezeichnung'}`;
  const ZWEIG_BEENDET = 'Zweig beendet – weiter nach dem Block';

  /**
   * Auswahl „weiter mit“. Außerhalb von Blöcken: nächster Schritt der Liste,
   * jeder andere Schritt (ein Block über seinen ersten Schritt), Ende. Im
   * Zweig: Schritte des eigenen Zweigs, „Zweig beendet“ und Ausstiege aus dem
   * Block; andere Zweige desselben Blocks sind nicht wählbar.
   */
  const zielAuswahl = (wert: ID | 'ende' | null, setzen: (z: ID | 'ende' | null) => void, beschriftung: string) => {
    const wertIndex = wert !== null && wert !== 'ende' ? struktur.index.get(wert) : undefined;
    const wertLage = wertIndex === undefined ? null : (struktur.lage[wertIndex] ?? null);
    /** Ziele außerhalb des eigenen Blocks: Einzelschritte und je Block sein erster Schritt. */
    const aussen = steps
      .map((z, n) => ({ z, n, l: struktur.lage[n] ?? null }))
      .filter(({ z, n, l }) => z.id !== step.id && (!l || (l.block !== lage?.block && l.block.start === n)));
    const aussenText = (n: number, l: unknown) => `${titel(n)}${l ? ' (Beginn eines parallelen Blocks)' : ''}`;
    let sonder: ReactNode = null;
    if (wert !== null && wert !== 'ende') {
      if (wert === step.id) sonder = <option value={wert}>{`${nr(i)} · dieser Schritt (Wiederholung)`}</option>;
      else if (wertIndex === undefined) sonder = <option value={wert}>Unbekannter Schritt – bitte wählen</option>;
      else if (lage && wertLage?.block === lage.block && wertLage.zweig !== lage.zweig)
        sonder = <option value={wert}>{`${titel(wertIndex)} – anderer Zweig, nicht zulässig`}</option>;
      else if (wertLage && wertLage.block !== lage?.block && wertLage.block.start !== wertIndex)
        sonder = <option value={wert}>{`${titel(wertIndex)} – mitten im parallelen Block`}</option>;
    }
    return (
      <select
        className="select"
        aria-label={beschriftung}
        value={wert ?? ''}
        onChange={(e) => setzen(e.target.value === '' ? null : (e.target.value as ID | 'ende'))}
      >
        {lage ? (
          <>
            <option value="">{folge?.art === 'schritt' ? `Nächster Schritt im Zweig: ${titel(folge.index)}` : ZWEIG_BEENDET}</option>
            {folge?.art === 'schritt' || wert === 'ende' ? <option value="ende">{ZWEIG_BEENDET}</option> : null}
            <optgroup label={`Im eigenen Zweig (${zweigTitel(lage.block.zweigNamen[lage.zweig] ?? '', lage.zweig)})`}>
              {lage.block.zweige[lage.zweig]
                .filter((n) => n !== i)
                .map((n) => (
                  <option key={steps[n].id} value={steps[n].id}>
                    {titel(n)}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Ausstieg aus dem Block">
              {aussen.map(({ z, n, l }) => (
                <option key={z.id} value={z.id}>
                  Ausstieg: {aussenText(n, l)}
                </option>
              ))}
            </optgroup>
          </>
        ) : (
          <>
            <option value="">
              {folge?.art === 'schritt'
                ? `Nächster Schritt: ${aussenText(folge.index, struktur.lage[folge.index])}`
                : 'Nächster Schritt (Planlauf endet)'}
            </option>
            {aussen.map(({ z, n, l }) => (
              <option key={z.id} value={z.id}>
                {aussenText(n, l)}
              </option>
            ))}
            <option value="ende">Planlauf beenden</option>
          </>
        )}
        {sonder}
      </select>
    );
  };

  /** Neue Schritte für die Bearbeitungen im Abschnitt „Parallel“ – IDs vor der Änderung erzeugen (StrictMode). */
  const parallelDazuAusfuehren = () => {
    const neu = neuerSchritt('aufgabe', newId);
    onBearbeitung(parallelDazu(steps, step.id, neu, newId('blk')), neu.id, 'Paralleler Block angelegt – der neue Schritt ist Zweig 2.');
  };
  const zweigDazu = () => {
    if (!lage) return;
    const neu = neuerSchritt('aufgabe', newId);
    onBearbeitung(zweigHinzufuegen(steps, lage.block.id, neu), neu.id, 'Zweig hinzugefügt.');
  };

  return (
    <div className="wf-details">
      <div className="wf-panel-kopf">
        <span>Schrittdetails</span>
        <span className="wf-panel-nav">
          <button
            type="button"
            className="btn-icon"
            disabled={pos <= 0}
            onClick={() => onAuswahl(bildFolge[pos - 1])}
            aria-label="Vorheriger Schritt"
            title="Vorheriger Schritt"
          >
            <Icon name="zurueck" size={14} />
          </button>
          {/* Zählt die Karten in der Reihenfolge der Zeichenfläche – nicht die Schrittnummer */}
          <span className="tertiary" title="Position in der Reihenfolge der Zeichenfläche">
            Karte {pos + 1} von {bildFolge.length}
          </span>
          <button
            type="button"
            className="btn-icon"
            disabled={pos < 0 || pos >= bildFolge.length - 1}
            onClick={() => onAuswahl(bildFolge[pos + 1])}
            aria-label="Nächster Schritt"
            title="Nächster Schritt"
          >
            <Icon name="chevron" size={14} />
          </button>
          <button type="button" className="btn-icon" onClick={onSchliessen} aria-label="Details schließen" title="Schließen">
            ✕
          </button>
        </span>
      </div>

      <div className="wf-panel-titel">
        <span className={`wf-typ-zeichen ${step.typ}`}>
          <Icon name={entscheidung ? 'raute' : 'aufgabe'} size={18} />
        </span>
        <div>
          <strong>{entscheidung ? 'Entscheidung bearbeiten' : 'Aufgabe bearbeiten'}</strong>
          <div className="small tertiary">
            Schritt {nr(i)} im Workflow · {ort}
          </div>
        </div>
      </div>

      <div className="wf-felder">
        <label className="wf-feld">
          <span>Bezeichnung</span>
          <input
            className={`input ${step.name.trim() ? '' : 'wf-pflicht'}`}
            value={step.name}
            autoFocus={!step.name && !schmal}
            placeholder={entscheidung ? 'z. B. Prüfung ohne Mängel?' : 'z. B. Planerstellung'}
            onChange={(e) => aendern({ name: e.target.value }, `${step.id}:name`)}
          />
        </label>

        <div className="wf-feld">
          <span>Art</span>
          <div className="segmented wf-art" role="radiogroup" aria-label="Art">
            {(['aufgabe', 'entscheidung'] as StepType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={step.typ === t}
                className={step.typ === t ? 'active' : ''}
                onClick={() => {
                  // IDs neuer Antworten vor der Änderung erzeugen (StrictMode)
                  const neu = artSetzen(step, t, newId);
                  onSchrittAendern(step.id, () => neu);
                }}
              >
                <Icon name={t === 'entscheidung' ? 'raute' : 'aufgabe'} size={13} /> {STEP_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <label className="wf-feld">
          <span>Verantwortliche Funktion</span>
          <input
            className="input"
            value={step.roleName}
            list="wf-rollen"
            placeholder="z. B. Fachplaner"
            onChange={(e) => onSchrittAendern(step.id, (s) => funktionSetzen(s, e.target.value), `${step.id}:rolle`)}
          />
          <datalist id="wf-rollen">
            {rollenListe.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>

        <div className="wf-feld-reihe">
          <label className="wf-feld">
            <span>Frist</span>
            <span className="wf-mit-einheit">
              <input
                className="input"
                inputMode="numeric"
                value={step.fristTage}
                onChange={(e) =>
                  aendern({ fristTage: Number(e.target.value.replace(/\D/g, '')) || 0 }, `${step.id}:frist`)
                }
              />
              <span>Tage</span>
            </span>
          </label>
          <label className="wf-feld">
            <span>Nachweis bei Abschluss</span>
            <select
              className="select"
              value={step.nachweis}
              onChange={(e) => aendern({ nachweis: e.target.value as Nachweis })}
            >
              {Object.entries(NACHWEIS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="wf-hilfe">
          Die Frist zählt ab dem tatsächlichen Eingang – dem Abschluss des vorherigen Schritts. Ein Nachweis wird beim Erledigen abgefragt.
        </p>
      </div>

      <section className="wf-abschnitt">
        <h4>
          <Icon name="kette" size={14} /> Wie geht es weiter?
        </h4>
        {entscheidung ? (
          <>
            <p className="wf-hilfe">
              Jede Antwort führt zu einem nächsten Schritt. Die erste Antwort bildet den Standardverlauf.
              {lage ? ' Im Zweig führt eine Antwort zu Schritten desselben Zweigs, beendet den Zweig oder steigt aus dem Block aus.' : ''}{' '}
              „Führt zu Nacharbeit“ kennzeichnet Antworten, nach denen der weitere Weg als Nacharbeit zählt – etwa für die Ursache
              eines Verzugs.
            </p>
            <div className="wf-antworten">
              {step.antworten.map((a, n) => (
                <div key={a.id} className={`wf-antwort-karte ${n === 0 ? 'standard' : ''}`}>
                  <div className="wf-antwort-zeile">
                    <span className="wf-punkt" />
                    <input
                      className="input"
                      value={a.text}
                      placeholder={STANDARD_ANTWORTEN[n] ?? `Antwort ${n + 1}`}
                      aria-label={`Antwort ${n + 1}`}
                      onChange={(e) =>
                        onSchrittAendern(
                          step.id,
                          (s) => ({ ...s, antworten: s.antworten.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)) }),
                          `${a.id}:text`,
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label="Antwort entfernen"
                      title="Antwort entfernen"
                      disabled={step.antworten.length <= 1}
                      onClick={() =>
                        onSchrittAendern(step.id, (s) => ({ ...s, antworten: s.antworten.filter((x) => x.id !== a.id) }))
                      }
                    >
                      ✕
                    </button>
                  </div>
                  <div className="wf-weiter">
                    <span>→ Weiter mit</span>
                    {zielAuswahl(a.ziel, (z) => onSchritteAendern((alle) => zielSetzen(alle, step.id, a.id, z)), `Weiter mit nach „${a.text}“`)}
                  </div>
                  <label className="checkbox wf-parallel-nacharbeit" title="Wird diese Antwort gewählt, zählt der Weg danach als Nacharbeit – Ursache für Verzug.">
                    <input
                      type="checkbox"
                      checked={a.nacharbeit}
                      onChange={(e) =>
                        onSchrittAendern(step.id, (s) => ({
                          ...s,
                          antworten: s.antworten.map((x) => (x.id === a.id ? { ...x, nacharbeit: e.target.checked } : x)),
                        }))
                      }
                    />
                    führt zu Nacharbeit
                  </label>
                  {n === 0 ? (
                    <span className="wf-standard-marke">Standardverlauf</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost wf-als-standard"
                      onClick={() => onSchritteAendern((alle) => alsStandard(alle, step.id, a.id))}
                    >
                      Als Standardverlauf
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                // Jede weitere Antwort führt zunächst in Nacharbeit
                const antwort = { id: newId('ant'), text: '', ziel: null, nacharbeit: step.antworten.length > 0 };
                onSchrittAendern(step.id, (s) => ({ ...s, antworten: [...s.antworten, antwort] }));
              }}
            >
              <Icon name="plus" size={13} /> Antwort
            </button>
          </>
        ) : (
          <label className="wf-feld">
            <span>Weiter mit</span>
            {zielAuswahl(step.naechster, (z) => onSchritteAendern((alle) => zielSetzen(alle, step.id, null, z)), 'Weiter mit')}
          </label>
        )}
      </section>

      <section className="wf-abschnitt">
        <h4>
          <span className="wf-parallel-zeichen">‖</span> Parallel
        </h4>
        {lage ? (
          <>
            <p className="wf-hilfe">
              <b>
                Zweig {lage.zweig + 1} von {lage.block.zweige.length}
              </b>{' '}
              eines parallelen Blocks. Die Zweige laufen gleichzeitig; weiter geht es, wenn alle Zweige erledigt sind.
            </p>
            <div className="wf-feld-reihe wf-parallel-namen">
              <label className="wf-feld">
                <span>Name des Blocks</span>
                <input
                  ref={blockNameRef}
                  className="input"
                  value={blockNameRoh}
                  placeholder="z. B. Versand"
                  onChange={(e) =>
                    onSchritteAendern((alle) => blockBenennen(alle, lage.block.id, e.target.value), `${lage.block.id}:name`)
                  }
                />
              </label>
              <label className="wf-feld">
                <span>Name des Zweigs</span>
                <input
                  className="input"
                  value={zweigNameRoh}
                  placeholder={`Zweig ${lage.zweig + 1}`}
                  onChange={(e) =>
                    onSchritteAendern(
                      (alle) => (step.parallel ? zweigBenennen(alle, lage.block.id, step.parallel.zweig, e.target.value) : alle),
                      `${lage.block.id}:${step.parallel?.zweig}:zweigName`,
                    )
                  }
                />
              </label>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={zweigDazu}>
                <Icon name="plus" size={13} /> Zweig hinzufügen
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onBearbeitung(ausBlockLoesen(steps, step.id), step.id, 'Schritt aus dem Block gelöst – er folgt jetzt nach dem Block.')}
              >
                Aus dem Block lösen
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  onBearbeitung(blockAufloesen(steps, lage.block.id), step.id, 'Block aufgelöst – die Zweige laufen jetzt nacheinander.')
                }
              >
                Block auflösen
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="wf-hilfe">
              Legt neben diesem Schritt einen zweiten Zweig an, der gleichzeitig läuft. Weiter geht es, wenn beide erledigt sind.
            </p>
            <div>
              <button type="button" className="btn btn-sm btn-outline" onClick={parallelDazuAusfuehren}>
                <span className="wf-parallel-zeichen">‖</span> Parallel dazu ausführen
              </button>
            </div>
          </>
        )}
      </section>

      <section className="wf-abschnitt">
        <h4>
          <Icon name="mail" size={14} /> E-Mail nach Abschluss
        </h4>
        <label className="checkbox">
          <input type="checkbox" checked={step.mailFrage} onChange={(e) => aendern({ mailFrage: e.target.checked })} />
          Nach einer E-Mail fragen
        </label>
        <p className="wf-hilfe">
          Fragt nach dem Erledigen, ob die für den nächsten Schritt zuständige Person informiert werden soll.
        </p>
        {step.mailFrage ? (
          <select
            className="select"
            value={step.mailVorlageId ?? ''}
            onChange={(e) => aendern({ mailVorlageId: e.target.value || null })}
            aria-label="E-Mail-Vorlage"
          >
            <option value="">Vorlage automatisch wählen</option>
            {data.emailVorlagen.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="wf-feld">
          <span>Anliegen in der Versandmail</span>
          <select
            className="select"
            value={step.versandAnliegen ?? ''}
            onChange={(e) => aendern({ versandAnliegen: (e.target.value || null) as VersandAnliegen | null })}
          >
            {ANLIEGEN_OPTIONEN.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <p className="wf-hilfe">
          Versandschritt: Nach dem Erledigen schlägt KaPlan der danach zuständigen Person die Vorlage „Versand“ mit
          diesem Anliegen und ihren SharePoint-Links vor.
        </p>
      </section>

      <section className="wf-abschnitt wf-aktionen">
        <div className="wf-position">
          <span className="small tertiary">{lage ? 'Im Zweig' : 'Im Standardverlauf'}</span>
          <button
            type="button"
            className="btn-icon"
            disabled={!bewegbar.frueher}
            onClick={() => onBearbeitung(imVerlaufVerschieben(steps, step.id, -1))}
            aria-label="Früher im Ablauf"
            title="Früher im Ablauf"
          >
            <Icon name="hoch" size={14} />
          </button>
          <button
            type="button"
            className="btn-icon"
            disabled={!bewegbar.spaeter}
            onClick={() => onBearbeitung(imVerlaufVerschieben(steps, step.id, 1))}
            aria-label="Später im Ablauf"
            title="Später im Ablauf"
          >
            <Icon name="runter" size={14} />
          </button>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => {
              const ergebnis = duplizieren(steps, step.id, newId);
              onSchritteAendern(() => ergebnis);
              const kopie = ergebnis.find((x) => !steps.some((y) => y.id === x.id));
              if (kopie) onAuswahl(kopie.id);
            }}
          >
            <Icon name="kopieren" size={13} /> Duplizieren
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => onEntfernen(step.id)}>
            <Icon name="loeschen" size={13} /> Entfernen
          </button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Übersicht ohne gewählten Schritt                                    */
/* ------------------------------------------------------------------ */

function Uebersicht({
  mitStammdaten,
  beschreibung,
  onBeschreibung,
  steps,
  gliederung,
  hinweise,
  dauer,
  bloecke,
  arbeitstage,
  onAuswahl,
  onSchliessen,
}: {
  mitStammdaten: boolean;
  beschreibung: string;
  onBeschreibung: (v: string) => void;
  steps: ProcessTemplateStep[];
  gliederung: Gliederung;
  hinweise: ReturnType<typeof pruefen>;
  dauer: number;
  /** Zahl der parallelen Blöcke. */
  bloecke: number;
  arbeitstage: boolean;
  onAuswahl: (id: ID | 'uebersicht' | null) => void;
  onSchliessen?: () => void;
}) {
  const entscheidungen = steps.filter((s) => s.typ === 'entscheidung').length;
  return (
    <div className="wf-details">
      <div className="wf-panel-kopf">
        <span>Übersicht</span>
        {onSchliessen ? (
          <button type="button" className="btn-icon" onClick={onSchliessen} aria-label="Übersicht schließen">
            ✕
          </button>
        ) : null}
      </div>

      {mitStammdaten ? (
        <div className="wf-felder">
          <label className="wf-feld">
            <span>Beschreibung</span>
            <textarea
              className="textarea"
              rows={2}
              value={beschreibung}
              placeholder="Erscheint bei der Auswahl des Workflows"
              onChange={(e) => onBeschreibung(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      <div className="wf-kacheln">
        <div>
          <b>{steps.length}</b>
          <span>Schritte</span>
        </div>
        <div>
          <b>{entscheidungen}</b>
          <span>Entscheidungen</span>
        </div>
        <div>
          <b>{dauer}</b>
          <span>
            Tage im Standardverlauf{arbeitstage ? ' (Arbeitstage)' : ''}
            {bloecke > 0 ? ' – je Block der längste Zweig' : ''}
          </span>
        </div>
        <div>
          <b>{gliederung.abweichungenGesamt}</b>
          <span>Abweichungen</span>
        </div>
        <div>
          <b>{bloecke}</b>
          <span>{bloecke === 1 ? 'Paralleler Block' : 'Parallele Blöcke'}</span>
        </div>
      </div>

      {hinweise.length > 0 ? (
        <section className="wf-abschnitt">
          <h4>
            <Icon name="info" size={14} /> Hinweise
          </h4>
          <div className="wf-hinweise">
            {hinweise.map((h, n) => (
              <button
                key={n}
                type="button"
                className={`wf-hinweis ${h.sperrt ? 'sperrt' : ''}`}
                disabled={!h.stepId}
                onClick={() => h.stepId && onAuswahl(h.stepId)}
              >
                {h.text}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="wf-abschnitt">
        <h4>So lesen Sie das Bild</h4>
        <ul className="wf-legende">
          <li>
            <span className="wf-legende-linie standard" />
            <span>
              <b>Standardverlauf</b> – der Weg mit der jeweils ersten Antwort; nach ihm rechnen die voraussichtlichen Termine.
              Die Frist zählt ab dem tatsächlichen Eingang – dem Abschluss des vorherigen Schritts.
            </span>
          </li>
          <li>
            <span className="wf-legende-linie abw" />
            <span>
              <b>Abweichung</b> – Weg über eine andere Antwort, etwa „Nein“.
            </span>
          </li>
          <li>
            <span className="wf-legende-linie rueck" />
            <span>
              <b>Rücksprung</b> – führt zu einem früheren Schritt zurück; der Planlauf durchläuft ihn erneut.
            </span>
          </li>
          <li>
            <span className="wf-legende-linie wf-parallel-legende" />
            <span>
              <b>Parallel</b> – die Zweige eines Blocks laufen gleichzeitig; weiter geht es, wenn alle Zweige erledigt sind. Im
              Standardverlauf zählt der längste Zweig. Abweichungen im Zweig stehen gestrichelt darunter, Ausstiege aus dem Block
              als Text auf der Karte.
            </span>
          </li>
        </ul>
      </section>

      <section className="wf-abschnitt">
        <h4>Bedienung</h4>
        <ul className="wf-tipps">
          <li>Karte anklicken, um den Schritt zu bearbeiten.</li>
          <li>„+“ zwischen zwei Karten fügt dort eine Aufgabe ein – auch im Zweig eines parallelen Blocks.</li>
          <li>Parallele Zweige: „Schritt hinzufügen“ → „Parallele Zweige“ oder in den Schrittdetails „Parallel dazu ausführen“.</li>
          <li>Ein Klick auf den Kopf eines Blocks führt zu „Name des Blocks“; Zweige erhalten in den Schrittdetails einen Namen.</li>
          <li>Strg+Z bzw. Strg+Y: Rückgängig und Wiederholen.</li>
        </ul>
      </section>
    </div>
  );
}
