/**
 * Excel-Import der Leistungen aus der Zeiterfassung – projektübergreifend.
 * Die Datei (.xlsx oder .csv) wird gelesen (`importLesen`) und daraus eine
 * Vorschau samt Plan gerechnet (`importPlanen`): je Projekt, wie viele
 * Leistungen neu hinzukommen, schon vorhanden sind oder frühere Importe
 * ersetzen, welche Abschnitte aus Spalte J entstehen und welche
 * Leistungsnachweise dabei entstehen oder wachsen. Jede Änderung der Optionen
 * plant neu – mit neuen Kennungen, außerhalb von `mutate()`. „Übernehmen“
 * wendet genau den angezeigten Plan an.
 *
 * Übernommen werden nur die eigenen Zeilen der angemeldeten Person; Zeilen
 * anderer Mitarbeiter werden mit „anderer Mitarbeiter“ übersprungen. Nur mit
 * der Rolle Controlling lässt sich ein Sammel-Export aller Mitarbeiter der
 * Datei übernehmen (Haken „Sammel-Export …“) – erst dann entstehen neue
 * Mitarbeiter. Ohne Anmeldung ist der Dialog gesperrt. Leistungen anderer
 * bleiben immer unberührt: Ersetzt werden nur frühere Importe der Personen
 * aus der Datei in deren Zeitraum der Datei.
 */
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Badge, Callout, Field, Modal, Select } from '../../../shared/ui';
import { tabelleLesen, type GeleseneTabelle } from '../../../shared/xlsxLesen';
import { importVorlageLaden } from '../domain/export';
import {
  IMPORT_SPALTEN,
  IMPORT_STANDARDSPALTEN,
  importLesen,
  importPlanen,
  keineEigenenLeistungen,
  unbekannteProjektnummern,
  type ImportFeld,
  type ImportGelesen,
  type ImportOptionen,
  type ImportPlan,
  type ImportVorschau,
  type VorschauMitarbeiter,
  type VorschauProjekt,
} from '../domain/import';
import { angemeldet, darf } from '../domain/rechte';
import { mitarbeiterName, type Abschnitt, type LeistungsnachweisDaten } from '../domain/types';
import { stundenVon } from '../domain/nachweis';
import { kurzDatum, stundenText } from '../domain/zeitraum';
import type { Route } from '../lib/router';
import { newId, useStore } from '../store/store';
import { useAnmeldung } from './AnmeldeDialog';
import { anzahl, mitarbeiterAuswahlText, nachNamen } from './common';
import './leistungen.css';

/* ------------------------------------------------------------------ */
/* Reine Hilfen (auch für Prüfungen ohne Browser)                      */
/* ------------------------------------------------------------------ */

/** Erklärung der Spalten in der Reihenfolge der Zeiterfassung. */
const SPALTEN_ERKLAERUNG: { feld: ImportFeld; wofuer: string }[] = [
  { feld: 'datum', wofuer: 'Tag der Leistung' },
  { feld: 'mitarbeiter', wofuer: 'etwa „MM: Mustermann, Max“ – übernommen werden nur die eigenen Zeilen' },
  { feld: 'text', wofuer: 'Leistungstext' },
  { feld: 'stunden', wofuer: 'Stunden' },
  { feld: 'projekt', wofuer: 'Projektnummer, etwa „K9101: …“ – ordnet die Zeile ihrem Projekt zu' },
  { feld: 'projektelement', wofuer: 'optional, der Abschnitt – fehlende Abschnitte legt der Import an' },
];

/** Spaltenbuchstabe wie in Excel: 0 → „A“. */
const spaltenBuchstabe = (index: number) => String.fromCharCode(65 + index);

/**
 * Liest das erste Blatt der Mappe. Enthält es keine Leistungen, gilt das erste
 * weitere Blatt mit Leistungen; passt keines, bleibt das erste maßgeblich
 * (samt seiner Meldung, wenn gar keine Spalten passen).
 */
/** Anfang einer nicht lesbaren Excel-Datei (src/shared/xlsxLesen.ts). */
const KEIN_ZIP = /keine gültige Excel-Datei/;

/**
 * Verständliche Meldung, wenn sich eine Datei nicht lesen lässt: Eine als
 * .xlsx umbenannte Sicherung (JSON) wird als solche benannt, sonst ergänzt um
 * das, was erwartet wird.
 */
export async function lesefehler(datei: Blob, e: unknown): Promise<string> {
  const meldung = e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.';
  if (!KEIN_ZIP.test(meldung)) return meldung;
  let anfang = '';
  try {
    anfang = (await datei.slice(0, 64).text()).trimStart();
  } catch {
    // ohne Anfang bleibt es bei der allgemeinen Meldung
  }
  if (anfang.startsWith('{')) {
    return 'Die Datei ist eine Sicherung (JSON) und kein Export der Zeiterfassung – Sicherungen lassen sich über „Einspielen“ in der Seitenleiste laden.';
  }
  return `${meldung} Erwartet wird der Export der Zeiterfassung als Excel-Datei (.xlsx) oder als CSV.`;
}

export function blattLesen(tabellen: GeleseneTabelle[]): ImportGelesen {
  if (tabellen.length === 0) throw new Error('Die Datei enthält kein Tabellenblatt.');
  let erstes: ImportGelesen | null = null;
  let ersterFehler: unknown = null;
  for (const t of tabellen) {
    try {
      const gelesen = importLesen(t.zeilen, t.name, t.zeilenNummern);
      if (gelesen.posten.length > 0) return gelesen;
      erstes ??= gelesen;
    } catch (e) {
      if (!erstes && ersterFehler === null) ersterFehler = e;
    }
  }
  if (erstes && ersterFehler === null) return erstes;
  throw ersterFehler instanceof Error ? ersterFehler : new Error('Die Datei konnte nicht gelesen werden.');
}

/**
 * Optionen für eine neu gelesene Datei: nur eigene Zeilen der angemeldeten
 * Person (`angemeldetId`; Sammel-Export aus – eine frühere Wahl bleibt, aber
 * nur mit der Rolle Controlling), unbekannte Projekte anlegen (Vorgabe an),
 * frühere Importe ersetzen (Vorgabe an, eine frühere Wahl bleibt) und – im
 * Sammel-Export – Zeilen ohne Mitarbeiter der angemeldeten Person zuordnen.
 */
export function importVorgaben(
  daten: LeistungsnachweisDaten,
  gelesen: ImportGelesen,
  bisher?: Partial<Pick<ImportOptionen, 'ersetzen' | 'alleMitarbeiter' | 'ersatzMitarbeiterId'>>,
): ImportOptionen {
  const angemeldetId = angemeldet(daten)?.id ?? null;
  const sammel = darf(daten, 'sammelImport') && bisher?.alleMitarbeiter === true;
  const ersatz = bisher?.ersatzMitarbeiterId;
  return {
    angemeldetId,
    alleMitarbeiter: sammel,
    ersatzMitarbeiterId:
      sammel && ersatz !== undefined && (ersatz === null || daten.mitarbeiter.some((m) => m.id === ersatz)) ? ersatz : angemeldetId,
    neueProjekte: Object.fromEntries(unbekannteProjektnummern(daten, gelesen).map((n) => [n, true])),
    ersetzen: bisher?.ersetzen ?? true,
  };
}

/**
 * Die Optionen so, wie sie gerade gelten dürfen: immer mit der angemeldeten
 * Person (auch nach einem Wechsel der Anmeldung im offenen Dialog), den
 * Sammel-Export nur mit der Rolle Controlling.
 */
export function wirksameOptionen(daten: LeistungsnachweisDaten, optionen: ImportOptionen): ImportOptionen {
  const sammel = optionen.alleMitarbeiter && darf(daten, 'sammelImport');
  return { ...optionen, angemeldetId: angemeldet(daten)?.id ?? null, alleMitarbeiter: sammel };
}

/**
 * Meldung, wenn die Datei Leistungen enthält, aber keine der angemeldeten
 * Person (Normalfall) – sonst null. Die Oberfläche nennt dazu die Mitarbeiter
 * der Datei.
 */
export function keineEigenenMeldung(daten: LeistungsnachweisDaten, optionen: ImportOptionen, vorschau: ImportVorschau): string | null {
  const ich = angemeldet(daten);
  if (!ich || optionen.alleMitarbeiter || vorschau.zugeordnet > 0 || vorschau.fremde === 0) return null;
  return keineEigenenLeistungen(mitarbeiterName(ich) || ich.kuerzel);
}

/** „Abschnitte: 01 Nordheim · 02 Südheim – werden angelegt“ (Spalte J der Datei). */
export function neueAbschnitteText(abschnitte: Pick<Abschnitt, 'kennung' | 'name' | 'kurz'>[]): string {
  if (abschnitte.length === 0) return '';
  const namen = abschnitte.map((a) => [a.kennung, a.name || a.kurz].filter(Boolean).join(' ')).join(' · ');
  return abschnitte.length === 1 ? `Abschnitt: ${namen} – wird angelegt` : `Abschnitte: ${namen} – werden angelegt`;
}

/** Kennzahlen der Vorschau über alle Projekte. */
export function importSummen(v: ImportVorschau): {
  neu: number;
  stunden: number;
  doppelt: number;
  ersetzt: number;
  uebersprungen: number;
  inAbgeschlossenem: number;
} {
  const summe = (feld: 'neu' | 'doppelt' | 'ersetzt' | 'inAbgeschlossenem') => v.projekte.reduce((s, p) => s + p[feld], 0);
  return {
    neu: summe('neu'),
    stunden: stundenVon(v.plan.neueLeistungen),
    doppelt: summe('doppelt'),
    ersetzt: summe('ersetzt'),
    uebersprungen: v.uebersprungen.length,
    inAbgeschlossenem: summe('inAbgeschlossenem'),
  };
}

/** Lässt sich der Plan übernehmen – bringt er neue Leistungen oder entfallen frühere Importe? */
export function importMoeglich(plan: ImportPlan): boolean {
  return plan.neueLeistungen.length > 0 || plan.entfernen.length > 0;
}

/** Meldung nach dem Übernehmen, etwa „46 Leistungen übernommen – 5 Projekte, 5 Leistungsnachweise angelegt.“ */
export function importMeldung(plan: ImportPlan): string {
  const angelegt: string[] = [];
  if (plan.neueProjekte.length) angelegt.push(anzahl(plan.neueProjekte.length, 'Projekt', 'Projekte'));
  if (plan.neueNachweise.length) angelegt.push(anzahl(plan.neueNachweise.length, 'Leistungsnachweis', 'Leistungsnachweise'));
  if (plan.neueMitarbeiter.length) angelegt.push(anzahl(plan.neueMitarbeiter.length, 'Mitarbeiter', 'Mitarbeiter'));
  const teile: string[] = [];
  if (angelegt.length) teile.push(`${angelegt.join(', ')} angelegt`);
  if (plan.erweiterteNachweise.length) {
    teile.push(`${anzahl(plan.erweiterteNachweise.length, 'Leistungsnachweis', 'Leistungsnachweise')} erweitert`);
  }
  if (plan.entfernen.length) teile.push(`${anzahl(plan.entfernen.length, 'früherer Import', 'frühere Importe')} ersetzt`);
  const kopf =
    plan.neueLeistungen.length > 0
      ? `${anzahl(plan.neueLeistungen.length, 'Leistung', 'Leistungen')} übernommen`
      : 'Keine neuen Leistungen';
  return `${kopf}${teile.length ? ` – ${teile.join(', ')}` : ''}.`;
}

/** Ziel nach dem Übernehmen: Betrifft der Import genau ein Projekt, dessen Leistungsnachweise, sonst die Übersicht. */
export function importZiel(daten: LeistungsnachweisDaten, plan: ImportPlan): Route {
  const entfernt = new Set(plan.entfernen);
  const projekte = new Set([
    ...plan.neueLeistungen.map((l) => l.projektId),
    ...daten.leistungen.filter((l) => entfernt.has(l.id)).map((l) => l.projektId),
  ]);
  if (projekte.size === 1) return { view: 'projekt', projektId: [...projekte][0], tab: 'nachweise' };
  return { view: 'uebersicht' };
}

/** „01.10.26 – 30.10.26“ bzw. ein einzelner Tag. */
const spanne = (von: string, bis: string) => (!von ? '–' : von === bis ? kurzDatum(von) : `${kurzDatum(von)} – ${kurzDatum(bis)}`);

/** Nachweistitel ohne das vorangestellte „Leistungsnachweis“ – in der Vorschau steht er unter dieser Überschrift. */
const nachweisKurz = (titel: string) => titel.replace(/^Leistungsnachweis\s+/, '') || titel;

const NACHWEIS_ART: Record<VorschauProjekt['nachweise'][number]['art'], { label: string; ton: '' | 'blue' | 'orange' }> = {
  neu: { label: 'neu', ton: 'blue' },
  erweitert: { label: 'erweitert', ton: 'orange' },
  vorhanden: { label: 'vorhanden', ton: '' },
};

/** Kennzeichen eines Mitarbeiters der Datei in der Vorschau. */
function MitarbeiterArt({ m, wirdAngelegt }: { m: VorschauMitarbeiter; wirdAngelegt: boolean }) {
  switch (m.art) {
    case 'eigene':
      return <Badge ton="green">eigene Leistungen</Badge>;
    case 'anderer':
      return <Badge>anderer Mitarbeiter – übersprungen</Badge>;
    case 'vorhanden':
      return <Badge ton="green">vorhanden</Badge>;
    case 'neu':
      return wirdAngelegt ? <Badge ton="blue">wird angelegt</Badge> : <Badge>ohne neue Leistungen</Badge>;
  }
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export function ImportDialog({ onClose, navigate }: { onClose: () => void; navigate: (r: Route) => void }) {
  const { data, importUebernehmen } = useStore();
  const toast = useToast();
  const anmeldung = useAnmeldung();
  const ich = angemeldet(data);
  const sammelErlaubt = darf(data, 'sammelImport');
  const eingabe = useRef<HTMLInputElement>(null);
  // Zählt die Lesevorgänge, damit eine langsamer gelesene frühere Datei die neuere nicht überschreibt
  const lesung = useRef(0);
  const [ueber, setUeber] = useState(false);
  const [datei, setDatei] = useState('');
  const [fehler, setFehler] = useState('');
  const [gelesen, setGelesen] = useState<ImportGelesen | null>(null);
  const [optionen, setOptionen] = useState<ImportOptionen>({
    angemeldetId: null,
    alleMitarbeiter: false,
    ersatzMitarbeiterId: null,
    neueProjekte: {},
    ersetzen: true,
  });

  // Neu planen bei jeder Änderung der Datei, der Optionen oder des Bestands – mit neuen Kennungen
  const wirksam = useMemo(() => wirksameOptionen(data, optionen), [data, optionen]);
  const vorschau = useMemo(
    () => (ich && gelesen && gelesen.posten.length > 0 ? importPlanen(data, gelesen, wirksam, new Date().toISOString(), newId) : null),
    [data, gelesen, wirksam, ich],
  );
  const summen = vorschau ? importSummen(vorschau) : null;
  const sammel = wirksam.alleMitarbeiter;
  const keineEigenen = vorschau ? keineEigenenMeldung(data, wirksam, vorschau) : null;

  const lies = async (f: File) => {
    const nummer = ++lesung.current;
    setDatei(f.name);
    setFehler('');
    setGelesen(null);
    try {
      const ergebnis = blattLesen(await tabelleLesen(f));
      if (nummer !== lesung.current) return;
      setGelesen(ergebnis);
      setOptionen((bisher) => importVorgaben(data, ergebnis, bisher));
      if (ergebnis.posten.length === 0) {
        setFehler('Die Datei enthält keine Zeile mit Datum, Stunden und Projektnummer.');
      }
    } catch (e) {
      const meldung = await lesefehler(f, e);
      if (nummer !== lesung.current) return;
      setFehler(meldung);
    }
  };

  const uebernehmen = () => {
    if (!vorschau || !importMoeglich(vorschau.plan)) return;
    const { plan } = vorschau;
    const ziel = importZiel(data, plan);
    importUebernehmen(plan);
    toast(importMeldung(plan));
    onClose();
    navigate(ziel);
  };

  const anlegenSetzen = (nummer: string, an: boolean) =>
    setOptionen((o) => ({ ...o, neueProjekte: { ...o.neueProjekte, [nummer]: an } }));

  const aktive = data.mitarbeiter.filter((m) => m.aktiv).sort(nachNamen);
  const neueKuerzel = new Set(vorschau?.plan.neueMitarbeiter.map((m) => m.kuerzel) ?? []);
  const ichName = ich ? mitarbeiterName(ich) || ich.kuerzel : '';
  const uebersprungen = vorschau?.uebersprungen ?? gelesen?.uebersprungen ?? [];
  const gruende = [...uebersprungen.reduce((m, u) => m.set(u.grund, (m.get(u.grund) ?? 0) + 1), new Map<string, number>())];
  const moeglich = !!vorschau && importMoeglich(vorschau.plan);

  return (
    <Modal
      titel="Leistungen aus Excel übernehmen"
      sub={
        ich
          ? `Export der Zeiterfassung (.xlsx oder .csv) – auch mit mehreren Projekten · für ${ichName}`
          : 'Export der Zeiterfassung (.xlsx oder .csv) – auch mit mehreren Projekten'
      }
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={importVorlageLaden} title="Datei mit den Spalten der Zeiterfassung und einer Beispielzeile">
            <Icon name="export" size={14} /> Vorlage
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={uebernehmen} disabled={!moeglich}>
            {summen && summen.neu > 0 ? `${anzahl(summen.neu, 'Leistung', 'Leistungen')} übernehmen` : 'Übernehmen'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {!ich ? (
          <Callout ton="warn" icon="!">
            <div className="row-between wrap">
              <span>Übernommen werden nur eigene Leistungen – bitte zuerst anmelden.</span>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => anmeldung()}>
                Anmelden
              </button>
            </div>
          </Callout>
        ) : null}

        {ich ? (
          <div className="ln-imp-wer">
            {sammel ? (
              <span>Übernommen werden die Leistungen aller Mitarbeiter der Datei; unbekannte Mitarbeiter werden angelegt.</span>
            ) : (
              <span>
                Übernommen werden nur Ihre eigenen Leistungen ({ichName}). Zeilen anderer Mitarbeiter werden übersprungen.
              </span>
            )}
            {sammelErlaubt ? (
              <label className="checkbox ln-imp-sammel">
                <input
                  type="checkbox"
                  checked={optionen.alleMitarbeiter}
                  onChange={(e) => {
                    const an = e.target.checked;
                    setOptionen((o) => ({ ...o, alleMitarbeiter: an, ersatzMitarbeiterId: o.ersatzMitarbeiterId ?? ich.id }));
                  }}
                />
                Sammel-Export: Leistungen aller Mitarbeiter der Datei übernehmen
              </label>
            ) : null}
          </div>
        ) : null}

        <div
          className={`drop-zone ${ueber ? 'over' : ''} ${datei ? 'ln-imp-klein' : ''}`}
          style={ich ? undefined : { display: 'none' }}
          onClick={() => eingabe.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setUeber(true);
          }}
          onDragLeave={() => setUeber(false)}
          onDrop={(e) => {
            e.preventDefault();
            setUeber(false);
            const f = e.dataTransfer.files[0];
            if (f) void lies(f);
          }}
        >
          {datei ? (
            <>
              <Icon name="importieren" size={18} strokeWidth={1.5} />
              <strong>{datei}</strong>
              {gelesen?.blatt ? <span className="small">Blatt „{gelesen.blatt}“</span> : null}
              <span className="small">· Andere Datei wählen</span>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <Icon name="importieren" size={26} strokeWidth={1.4} />
              </div>
              <strong>Excel- oder CSV-Datei hierher ziehen</strong>
              <div className="small">oder klicken, um eine Datei auszuwählen</div>
            </>
          )}
          <input
            ref={eingabe}
            type="file"
            accept=".xlsx,.csv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void lies(f);
            }}
          />
        </div>

        {fehler ? (
          <Callout ton="error" icon="!">
            {fehler}
          </Callout>
        ) : null}

        {ich && !vorschau ? (
          <Callout icon="i">
            Erwartet wird der Export der Zeiterfassung mit einer Kopfzeile. Gelesen werden diese Spalten – ohne erkannte
            Überschriften gelten die Buchstaben in Klammern:
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
              {SPALTEN_ERKLAERUNG.map(({ feld, wofuer }) => (
                <li key={feld}>
                  <strong>{IMPORT_SPALTEN[feld][0]}</strong> ({spaltenBuchstabe(IMPORT_STANDARDSPALTEN[feld])}) – {wofuer}
                </li>
              ))}
            </ul>
            Ein Import kann mehrere Projekte enthalten; jede Leistung landet in ihrem Projekt und dort im
            Leistungsnachweis ihres Zeitraums. Fehlende Abschnitte aus der Spalte Projektelement werden angelegt. Zeilen
            ohne Projekt (Urlaub, Fortbildung …) und Summenzeilen werden übersprungen. Leistungen anderer Mitarbeiter
            bleiben unverändert. Über <em>Vorlage</em> gibt es eine Datei mit den Spalten der Zeiterfassung.
          </Callout>
        ) : null}

        {vorschau && summen ? (
          <>
            <div className="ln-imp-zahlen">
              <div className={`ln-imp-zahl neu ${summen.neu ? '' : 'leer'}`}>
                <strong>{summen.neu}</strong>
                <span>neu · {stundenText(summen.stunden)} Std.</span>
              </div>
              <div className={`ln-imp-zahl ${summen.doppelt ? '' : 'leer'}`} title="Gleiche Person, gleiches Projekt, Datum, Stunden und Text – schon vorhanden">
                <strong>{summen.doppelt}</strong>
                <span>doppelt – schon vorhanden</span>
              </div>
              <div className={`ln-imp-zahl ersetzt ${summen.ersetzt ? '' : 'leer'}`}>
                <strong>{summen.ersetzt}</strong>
                <span>frühere Importe ersetzt</span>
              </div>
              <div className={`ln-imp-zahl ${summen.uebersprungen ? '' : 'leer'}`}>
                <strong>{summen.uebersprungen}</strong>
                <span>Zeilen übersprungen</span>
              </div>
            </div>

            {keineEigenen ? (
              <Callout ton="warn" icon="!">
                <div className="stack" style={{ gap: 6 }}>
                  <strong>{keineEigenen}</strong>
                  <span className="small">
                    Mitarbeiter der Datei:{' '}
                    {vorschau.mitarbeiter.map((m) => m.text).join(' · ') || '–'}
                  </span>
                  <span className="small">
                    {sammelErlaubt
                      ? 'Mit der Rolle Controlling lässt sich die Datei als Sammel-Export übernehmen – Haken oben setzen.'
                      : 'Stimmt die Anmeldung? Unter „Angemeldet als“ in der Seitenleiste lässt sie sich wechseln; einen Sammel-Export aller Mitarbeiter übernimmt das Controlling.'}
                  </span>
                </div>
              </Callout>
            ) : !moeglich ? (
              <Callout icon="i">
                Nichts zu übernehmen – {summen.doppelt > 0 ? 'alle Leistungen der Datei sind bereits vorhanden' : 'keine Zeile lässt sich übernehmen'}.
              </Callout>
            ) : null}

            {summen.inAbgeschlossenem > 0 ? (
              <Callout ton="warn" icon="!">
                {anzahl(summen.inAbgeschlossenem, 'Leistung betrifft', 'Leistungen betreffen')} abgeschlossene
                Leistungsnachweise – deren festgeschriebener Stand ändert sich erst nach „Wieder öffnen“ im Controlling.
              </Callout>
            ) : null}

            <div>
              <div className="ln-imp-titel">Mitarbeiter der Datei</div>
              {vorschau.mitarbeiter.length > 0 ? (
                <ul className="ln-imp-personen">
                  {vorschau.mitarbeiter.map((m) => (
                    <li key={m.text} title={m.text} className={m.art === 'anderer' ? 'ln-imp-fremd' : ''}>
                      <span className="ln-imp-person">
                        <span className="mono">{m.kuerzel}</span>
                        <strong>{m.name || m.text}</strong>
                        <MitarbeiterArt m={m} wirdAngelegt={neueKuerzel.has(m.kuerzel)} />
                        <span className="small tertiary">{anzahl(m.anzahl, 'Zeile', 'Zeilen')}</span>
                      </span>
                      {m.hinweis ? <span className="ln-imp-hinweis">{m.hinweis}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small tertiary">Die Datei nennt keinen Mitarbeiter.</p>
              )}
              {!sammel && vorschau.ohneMitarbeiter > 0 ? (
                <p className="small tertiary" style={{ marginTop: 6 }}>
                  {anzahl(vorschau.ohneMitarbeiter, 'Zeile nennt', 'Zeilen nennen')} keinen Mitarbeiter und{' '}
                  {vorschau.ohneMitarbeiter === 1 ? 'zählt' : 'zählen'} als eigene Leistungen ({ichName}).
                </p>
              ) : null}
              {sammel && vorschau.ohneMitarbeiter > 0 ? (
                <div style={{ marginTop: 10, maxWidth: 420 }}>
                  <Field
                    label="Zeilen ohne Mitarbeiter zuordnen zu"
                    hint={`${anzahl(vorschau.ohneMitarbeiter, 'Zeile nennt', 'Zeilen nennen')} keinen Mitarbeiter.`}
                  >
                    <Select
                      value={optionen.ersatzMitarbeiterId ?? ''}
                      onChange={(v) => setOptionen((o) => ({ ...o, ersatzMitarbeiterId: v || null }))}
                      options={[
                        { value: '', label: '– nicht übernehmen –' },
                        ...aktive.map((m) => ({ value: m.id, label: mitarbeiterAuswahlText(m) })),
                      ]}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <div>
              <div className="ln-imp-titel">
                {anzahl(vorschau.projekte.length, 'Projekt', 'Projekte')} der Datei
              </div>
              <div className="card ln-imp-liste">
                <table className="table table-stack ln-imp-tabelle">
                  <thead>
                    <tr>
                      <th>Projekt</th>
                      <th>Zeitraum</th>
                      <th className="ln-imp-menge">In der Datei</th>
                      <th>Ergebnis</th>
                      <th>Leistungsnachweise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vorschau.projekte.map((p) => {
                      const unbekannt = p.projektId === null;
                      const aus = unbekannt && !p.anlegen;
                      return (
                        <tr key={p.nummer} className={aus ? 'ln-imp-aus' : ''}>
                          <td>
                            <span className="row" style={{ gap: 6 }}>
                              <strong className="mono">{p.nummer}</strong>
                              {unbekannt ? <Badge ton={p.anlegen ? 'blue' : ''}>{p.anlegen ? 'neues Projekt' : 'unbekannt'}</Badge> : null}
                            </span>
                            <div className="small muted">{p.name}</div>
                            {!aus && p.neueAbschnitte.length > 0 ? (
                              <div className="ln-imp-abschnitte" title="Aus der Spalte Projektelement (J)">
                                {neueAbschnitteText(p.neueAbschnitte)}
                              </div>
                            ) : null}
                            {unbekannt ? (
                              <label className="checkbox ln-imp-anlegen">
                                <input type="checkbox" checked={p.anlegen} onChange={(e) => anlegenSetzen(p.nummer, e.target.checked)} />
                                Projekt anlegen
                              </label>
                            ) : null}
                          </td>
                          <td className="small ln-imp-zeitraum">{spanne(p.von, p.bis)}</td>
                          <td className="ln-imp-menge">
                            <strong>{anzahl(p.anzahl, 'Leistung', 'Leistungen')}</strong>
                            <div className="small tertiary">{stundenText(p.stunden)} Std.</div>
                          </td>
                          <td>
                            {aus ? (
                              <span className="small">wird nicht übernommen</span>
                            ) : (
                              <span className="ln-imp-ergebnis">
                                <Badge ton={p.neu ? 'blue' : ''}>{p.neu} neu</Badge>
                                {p.doppelt ? <Badge>{p.doppelt} doppelt</Badge> : null}
                                {p.ersetzt ? <Badge ton="orange">{p.ersetzt} ersetzt</Badge> : null}
                              </span>
                            )}
                            {p.inAbgeschlossenem > 0 ? (
                              <span className="ln-imp-warnung">
                                {anzahl(p.inAbgeschlossenem, 'Leistung', 'Leistungen')} in abgeschlossenen Nachweisen
                              </span>
                            ) : null}
                          </td>
                          <td>
                            {p.nachweise.length > 0 ? (
                              <ul className="ln-imp-nachweise">
                                {p.nachweise.map((n) => (
                                  <li key={`${n.art}-${n.titel}`} title={n.titel}>
                                    <Badge ton={NACHWEIS_ART[n.art].ton}>{NACHWEIS_ART[n.art].label}</Badge>
                                    <span className="truncate">{nachweisKurz(n.titel)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="small tertiary">{aus ? '–' : 'unverändert'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ln-imp-option">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={optionen.ersetzen}
                  onChange={(e) => setOptionen((o) => ({ ...o, ersetzen: e.target.checked }))}
                />
                {sammel ? 'Frühere Importe dieser Personen im Zeitraum ersetzen' : 'Frühere eigene Importe im Zeitraum ersetzen'}
              </label>
              <span className="hint">
                {sammel
                  ? 'Importierte Leistungen der Personen aus der Datei, die zwischen ihrem ersten und letzten Datum der Datei liegen und dort nicht mehr vorkommen, entfallen – so lässt sich ein korrigierter Export erneut einspielen.'
                  : 'Eigene importierte Leistungen, die zwischen dem ersten und letzten eigenen Datum der Datei liegen und dort nicht mehr vorkommen, entfallen – so lässt sich ein korrigierter Export erneut einspielen.'}{' '}
                Händisch erfasste Leistungen und Leistungen anderer Mitarbeiter bleiben unverändert.
              </span>
            </div>
          </>
        ) : null}

        {uebersprungen.length > 0 ? (
          <details className="ln-imp-aufklapp">
            <summary>
              Übersprungene Zeilen ({uebersprungen.length})
              {gruende.length > 0 ? (
                <span className="small tertiary" style={{ fontWeight: 400 }}>
                  {gruende.map(([grund, n]) => `${n} ${grund}`).join(' · ')}
                </span>
              ) : null}
            </summary>
            <div className="ln-imp-aufklapp-inhalt">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 64 }}>Zeile</th>
                    <th>Grund</th>
                    <th>Text</th>
                  </tr>
                </thead>
                <tbody>
                  {uebersprungen.map((u, i) => (
                    <tr key={`${u.zeile}-${i}`}>
                      <td className="num">{u.zeile}</td>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>
                        {u.grund}
                      </td>
                      <td className="small muted">{u.text || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </div>
    </Modal>
  );
}
