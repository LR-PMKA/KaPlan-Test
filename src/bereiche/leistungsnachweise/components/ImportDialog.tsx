/**
 * Excel-Import der Leistungen aus der Zeiterfassung – projektübergreifend.
 * Die Datei (.xlsx oder .csv) wird gelesen (`importLesen`) und daraus eine
 * Vorschau samt Plan gerechnet (`importPlanen`): je Projekt, wie viele
 * Leistungen neu hinzukommen, schon vorhanden sind oder frühere Importe
 * ersetzen, und welche Leistungsnachweise dabei entstehen oder wachsen. Jede
 * Änderung der Optionen plant neu – mit neuen Kennungen, außerhalb von
 * `mutate()`. „Übernehmen“ wendet genau den angezeigten Plan an.
 *
 * Leistungen anderer Mitarbeiter bleiben immer unberührt: Ersetzt werden nur
 * frühere Importe der Personen aus der Datei in deren Zeitraum der Datei.
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
  unbekannteProjektnummern,
  type ImportFeld,
  type ImportGelesen,
  type ImportOptionen,
  type ImportPlan,
  type ImportVorschau,
  type VorschauProjekt,
} from '../domain/import';
import type { LeistungsnachweisDaten } from '../domain/types';
import { stundenVon } from '../domain/nachweis';
import { kurzDatum, stundenText } from '../domain/zeitraum';
import type { Route } from '../lib/router';
import { newId, useStore } from '../store/store';
import { anzahl, mitarbeiterAuswahlText, nachNamen } from './common';
import './leistungen.css';

/* ------------------------------------------------------------------ */
/* Reine Hilfen (auch für Prüfungen ohne Browser)                      */
/* ------------------------------------------------------------------ */

/** Erklärung der Spalten in der Reihenfolge der Zeiterfassung. */
const SPALTEN_ERKLAERUNG: { feld: ImportFeld; wofuer: string }[] = [
  { feld: 'datum', wofuer: 'Tag der Leistung' },
  { feld: 'mitarbeiter', wofuer: 'etwa „LR: Roese, Lukas“' },
  { feld: 'text', wofuer: 'Leistungstext' },
  { feld: 'stunden', wofuer: 'Stunden' },
  { feld: 'projekt', wofuer: 'Projektnummer, etwa „K2476: …“ – ordnet die Zeile ihrem Projekt zu' },
  { feld: 'projektelement', wofuer: 'optional, ordnet Abschnitten zu' },
];

/** Spaltenbuchstabe wie in Excel: 0 → „A“. */
const spaltenBuchstabe = (index: number) => String.fromCharCode(65 + index);

/**
 * Liest das erste Blatt der Mappe. Enthält es keine Leistungen, gilt das erste
 * weitere Blatt mit Leistungen; passt keines, bleibt das erste maßgeblich
 * (samt seiner Meldung, wenn gar keine Spalten passen).
 */
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
 * Optionen für eine neu gelesene Datei: unbekannte Projekte anlegen (Vorgabe
 * an), frühere Importe ersetzen (Vorgabe an, eine frühere Wahl bleibt) und
 * Zeilen ohne Mitarbeiter der Person zuordnen, als die die angemeldete Person
 * erfasst (`einstellungen.mitarbeiterId`).
 */
export function importVorgaben(
  daten: LeistungsnachweisDaten,
  gelesen: ImportGelesen,
  bisher?: Pick<ImportOptionen, 'ersetzen'>,
): ImportOptionen {
  const ich = daten.einstellungen.mitarbeiterId;
  const angemeldetId = ich && daten.mitarbeiter.some((m) => m.id === ich && m.aktiv) ? ich : null;
  return {
    angemeldetId,
    alleMitarbeiter: false,
    ersatzMitarbeiterId: angemeldetId,
    neueProjekte: Object.fromEntries(unbekannteProjektnummern(daten, gelesen).map((n) => [n, true])),
    ersetzen: bisher?.ersetzen ?? true,
  };
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

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export function ImportDialog({ onClose, navigate }: { onClose: () => void; navigate: (r: Route) => void }) {
  const { data, importUebernehmen } = useStore();
  const toast = useToast();
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
  const vorschau = useMemo(
    () => (gelesen && gelesen.posten.length > 0 ? importPlanen(data, gelesen, optionen, new Date().toISOString(), newId) : null),
    [data, gelesen, optionen],
  );
  const summen = vorschau ? importSummen(vorschau) : null;

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
      if (nummer !== lesung.current) return;
      setFehler(e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
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
  const uebersprungen = vorschau?.uebersprungen ?? gelesen?.uebersprungen ?? [];
  const gruende = [...uebersprungen.reduce((m, u) => m.set(u.grund, (m.get(u.grund) ?? 0) + 1), new Map<string, number>())];
  const moeglich = !!vorschau && importMoeglich(vorschau.plan);

  return (
    <Modal
      titel="Leistungen aus Excel übernehmen"
      sub="Export der Zeiterfassung (.xlsx oder .csv) – auch mit mehreren Projekten und Mitarbeitern"
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
        <div
          className={`drop-zone ${ueber ? 'over' : ''} ${datei ? 'ln-imp-klein' : ''}`}
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

        {!vorschau ? (
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
            Leistungsnachweis ihres Zeitraums. Zeilen ohne Projekt (Urlaub, Fortbildung …) und Summenzeilen werden
            übersprungen. Leistungen anderer Mitarbeiter bleiben unverändert. Über <em>Vorlage</em> erhalten Sie eine
            Datei mit den Spalten der Zeiterfassung.
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

            {!moeglich ? (
              <Callout icon="i">
                Nichts zu übernehmen – {summen.doppelt > 0 ? 'alle Leistungen der Datei sind bereits vorhanden' : 'keine Zeile lässt sich übernehmen'}.
              </Callout>
            ) : null}

            {summen.inAbgeschlossenem > 0 ? (
              <Callout ton="warn" icon="!">
                {anzahl(summen.inAbgeschlossenem, 'Leistung betrifft', 'Leistungen betreffen')} abgeschlossene
                Leistungsnachweise – deren festgeschriebener Stand ändert sich erst nach „Wieder öffnen“.
              </Callout>
            ) : null}

            <div>
              <div className="ln-imp-titel">Mitarbeiter der Datei</div>
              {vorschau.mitarbeiter.length > 0 ? (
                <ul className="ln-imp-personen">
                  {vorschau.mitarbeiter.map((m) => (
                    <li key={m.text} title={m.text}>
                      <span className="mono">{m.kuerzel}</span>
                      <strong>{m.name || m.text}</strong>
                      {m.mitarbeiterId ? (
                        <Badge ton="green">vorhanden</Badge>
                      ) : neueKuerzel.has(m.kuerzel) ? (
                        <Badge ton="blue">wird angelegt</Badge>
                      ) : (
                        <Badge>ohne neue Leistungen</Badge>
                      )}
                      <span className="small tertiary">{anzahl(m.anzahl, 'Zeile', 'Zeilen')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small tertiary">Die Datei nennt keinen Mitarbeiter.</p>
              )}
              {vorschau.ohneMitarbeiter > 0 ? (
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
                Frühere Importe dieser Personen im Zeitraum ersetzen
              </label>
              <span className="hint">
                Importierte Leistungen der Personen aus der Datei, die zwischen ihrem ersten und letzten Datum der Datei
                liegen und dort nicht mehr vorkommen, entfallen – so lässt sich ein korrigierter Export erneut
                einspielen. Händisch erfasste Leistungen und Leistungen anderer Mitarbeiter bleiben unverändert.
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
