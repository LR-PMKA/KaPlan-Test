/**
 * Reiter „Auswertung“ des Controllings: Zeitraum (Monat, Quartal, Jahr oder
 * frei; Vorgabe laufender Monat), Filter Projekt und Mitarbeiter, Kennzahlen
 * und die Tabellen „Stunden je Mitarbeiter“ (Spalten Projekte), „Stunden je
 * Mitarbeiter und Monat“ (bei mehr als einem Monat) und „Stunden je Projekt“
 * (erfasst, Aufschlag, abgerechnet, ohne Nachweis). Gerechnet wird in
 * domain/auswertung.ts; „Excel“ und „Excel Leistungen“ laden die Auswertung
 * bzw. die Leistungen des Zeitraums herunter (domain/export.ts).
 */
import { today } from '../../../../shared/dates';
import { Icon } from '../../../../shared/icons';
import { Callout, Card, CardHeader, EmptyState, Field, Segmented, Select, Stat, TextInput } from '../../../../shared/ui';
import { anzahl, mitarbeiterAuswahlText, nachNamen } from '../../components/common';
import {
  auswertung,
  zeitraumBezeichnung,
  zeitraumVon,
  type AuswertungFilter,
  type MitarbeiterTabelle,
  type ZeitraumArt,
} from '../../domain/auswertung';
import { auswertungExportieren, auswertungLeistungenExportieren } from '../../domain/export';
import { mitarbeiterName, projektKurzname, projektTitel, type ID, type LeistungsnachweisDaten, type Projekt } from '../../domain/types';
import { MONATSNAMEN, istDatum, langDatum, monatVersetzt, stundenText } from '../../domain/zeitraum';
import type { Route } from '../../lib/router';
import { useStore } from '../../store/store';
import { auswertungAuswahl, nachweisAuswahl, type AuswertungAuswahl } from './auswahl';
import { aufschlagText, useAuswahl } from './hilfen';

const ARTEN: { value: ZeitraumArt; label: string }[] = [
  { value: 'monat', label: 'Monat' },
  { value: 'quartal', label: 'Quartal' },
  { value: 'jahr', label: 'Jahr' },
  { value: 'frei', label: 'Von – bis' },
];

/** Schritt der Pfeile je Art in Monaten. */
const SCHRITT: Record<Exclude<ZeitraumArt, 'frei'>, number> = { monat: 1, quartal: 3, jahr: 12 };

/** „Okt 26“ – Spaltenkopf eines Monats (JJJJ-MM). */
const monatKurz = (monat: string) => `${MONATSNAMEN[Number(monat.slice(5, 7)) - 1].slice(0, 3)} ${monat.slice(2, 4)}`;

/** Filter aus der Auswahl; null, solange ein freier Zeitraum unvollständig oder verkehrt ist. */
function filterAus(a: AuswertungAuswahl): AuswertungFilter | null {
  const zeitraum = a.art === 'frei' ? { von: a.von, bis: a.bis } : zeitraumVon(a.art, a.datum);
  if (!istDatum(zeitraum.von) || !istDatum(zeitraum.bis) || zeitraum.von > zeitraum.bis) return null;
  return { ...zeitraum, projektId: a.projektId || null, mitarbeiterId: a.mitarbeiterId || null };
}

export function AuswertungAnsicht({ navigate }: { navigate: (r: Route) => void }) {
  const { data } = useStore();
  const [auswahl, setAuswahl] = useAuswahl(auswertungAuswahl);
  const setze = (patch: Partial<AuswertungAuswahl>) => setAuswahl({ ...auswahl, ...patch });

  const projekte = [...data.projekte].sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }) || a.name.localeCompare(b.name, 'de'));
  const projektVon = new Map(data.projekte.map((p) => [p.id, p]));
  const personen = [...data.mitarbeiter].sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || nachNamen(a, b));

  const filter = filterAus(auswahl);
  const a = filter ? auswertung(data, filter) : null;

  // Wechsel der Art: der freie Zeitraum beginnt mit dem gewählten, Monat & Co. mit dessen Beginn
  const artWechseln = (art: ZeitraumArt) => {
    if (art === 'frei' && auswahl.art !== 'frei') {
      const z = zeitraumVon(auswahl.art, auswahl.datum);
      setze({ art, von: z.von, bis: z.bis });
    } else if (art !== 'frei' && auswahl.art === 'frei' && istDatum(auswahl.von)) setze({ art, datum: auswahl.von });
    else setze({ art });
  };
  const blaettern = (richtung: 1 | -1) => {
    if (auswahl.art === 'frei') return;
    setze({ datum: monatVersetzt(auswahl.datum, richtung * SCHRITT[auswahl.art]) });
  };
  const aktuell = auswahl.art !== 'frei' && zeitraumVon(auswahl.art, auswahl.datum).von === zeitraumVon(auswahl.art, today()).von;

  const zuNachweisen = (p: Projekt) => {
    nachweisAuswahl.wert = { ...nachweisAuswahl.wert, projektId: p.id, zeitraum: '' };
    navigate({ view: 'controlling', tab: 'nachweise' });
  };

  const fehlerText =
    auswahl.art === 'frei' && !filter
      ? !istDatum(auswahl.von) || !istDatum(auswahl.bis)
        ? 'Bitte Beginn und Ende angeben.'
        : 'Das Ende liegt vor dem Beginn.'
      : null;

  return (
    <div className="stack">
      {/* Zeitraum und Filter */}
      <Card>
        <div className="card-pad ln-co-filter">
          <div className="ln-co-filter-zeitraum">
            <Segmented<ZeitraumArt> value={auswahl.art} onChange={artWechseln} options={ARTEN} />
            {auswahl.art === 'frei' ? (
              <div className="row ln-co-von-bis">
                <TextInput type="date" value={auswahl.von} onChange={(v) => setze({ von: v })} aria-label="Von" />
                <span className="tertiary">–</span>
                <TextInput type="date" value={auswahl.bis} onChange={(v) => setze({ bis: v })} min={auswahl.von || undefined} aria-label="Bis" />
              </div>
            ) : (
              <div className="row ln-co-blaettern">
                <button type="button" className="btn-icon" aria-label="Früherer Zeitraum" title="Früherer Zeitraum" onClick={() => blaettern(-1)}>
                  <Icon name="zurueck" size={15} />
                </button>
                {auswahl.art === 'monat' ? (
                  <input
                    className="input ln-co-monat"
                    type="month"
                    value={auswahl.datum.slice(0, 7)}
                    aria-label="Monat"
                    onChange={(e) => {
                      if (/^\d{4}-\d{2}$/.test(e.target.value)) setze({ datum: `${e.target.value}-01` });
                    }}
                  />
                ) : (
                  <strong className="ln-co-zeitraum">{zeitraumBezeichnung(zeitraumVon(auswahl.art, auswahl.datum).von, zeitraumVon(auswahl.art, auswahl.datum).bis)}</strong>
                )}
                <button type="button" className="btn-icon" aria-label="Späterer Zeitraum" title="Späterer Zeitraum" onClick={() => blaettern(1)}>
                  <Icon name="chevron" size={15} />
                </button>
                {aktuell ? null : (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setze({ datum: today() })}>
                    Heute
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="ln-co-filter-auswahl">
            <Field label="Projekt">
              <Select
                value={auswahl.projektId}
                onChange={(v) => setze({ projektId: v })}
                options={[{ value: '', label: 'Alle Projekte' }, ...projekte.map((p) => ({ value: p.id, label: projektTitel(p) }))]}
              />
            </Field>
            <Field label="Mitarbeiter">
              <Select
                value={auswahl.mitarbeiterId}
                onChange={(v) => setze({ mitarbeiterId: v })}
                options={[{ value: '', label: 'Alle Mitarbeiter' }, ...personen.map((m) => ({ value: m.id, label: mitarbeiterAuswahlText(m) }))]}
              />
            </Field>
            <div className="row wrap ln-co-filter-knoepfe">
              <button
                type="button"
                className="btn btn-outline"
                disabled={!filter}
                title="Auswertung als Excel-Mappe – ein Blatt je Tabelle"
                onClick={() => filter && auswertungExportieren(data, filter)}
              >
                <Icon name="export" size={14} /> Excel
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={!a || a.leistungen.length === 0}
                title="Alle Leistungen des Zeitraums als Excel-Liste"
                onClick={() => filter && auswertungLeistungenExportieren(data, filter)}
              >
                <Icon name="export" size={14} /> Excel Leistungen
              </button>
            </div>
          </div>
        </div>
      </Card>

      {fehlerText ? (
        <Callout ton="warn" icon="!">
          {fehlerText}
        </Callout>
      ) : null}

      {a && filter ? (
        <>
          {/* Kennzahlen */}
          <Card>
            <CardHeader
              titel={zeitraumBezeichnung(filter.von, filter.bis)}
              sub={[
                `${langDatum(filter.von)} – ${langDatum(filter.bis)}`,
                filter.projektId ? projektTitel(projektVon.get(filter.projektId) ?? { nummer: '', name: '?' }) : 'alle Projekte',
                filter.mitarbeiterId ? personName(data, filter.mitarbeiterId) : 'alle Mitarbeiter',
                anzahl(a.leistungen.length, 'Leistung', 'Leistungen'),
              ].join(' · ')}
            />
            <div className="kennzahlen">
              <Stat wert={stundenText(a.kennzahlen.erfasst)} label="Stunden erfasst" />
              <Stat
                wert={a.kennzahlen.mitAufschlag ? aufschlagText(a.kennzahlen.aufschlag) : '–'}
                label="Aufschlag"
                ton={a.kennzahlen.aufschlag ? 'blue' : ''}
              />
              <Stat wert={stundenText(a.kennzahlen.abgerechnet)} label="Abgerechnet" />
              <Stat wert={a.kennzahlen.mitarbeiter} label="Mitarbeiter mit Stunden" />
            </div>
            {!a.kennzahlen.mitAufschlag || a.kennzahlen.ohneNachweis ? (
              <div className="card-pad ln-co-hinweise small muted">
                {!a.kennzahlen.mitAufschlag ? (
                  <p>Aufschläge gehören zu Zeilen eines Leistungsnachweises und lassen sich keiner Person zurechnen – mit Mitarbeiterfilter ohne Aufschlag.</p>
                ) : null}
                {a.kennzahlen.ohneNachweis ? (
                  <p>
                    <span className="ln-co-warnung">{stundenText(a.kennzahlen.ohneNachweis)} Std.</span> liegen in keinem
                    Leistungsnachweis – sie lassen sich weder abrechnen noch abschließen.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          {a.leistungen.length === 0 && a.jeProjekt.length === 0 ? (
            <Card>
              <EmptyState
                icon="stunden"
                titel="Keine Leistungen im Zeitraum"
                text="Für den gewählten Zeitraum und die Filter gibt es keine erfassten Leistungen. Wählen Sie einen anderen Zeitraum oder alle Projekte und Mitarbeiter."
              />
            </Card>
          ) : (
            <>
              <MitarbeiterKarte
                titel="Stunden je Mitarbeiter"
                sub="Erfasste Stunden – Spalten je Projekt"
                tabelle={a.jeMitarbeiter}
                kopf={(id) => {
                  const p = projektVon.get(id);
                  return { oben: p?.nummer || '–', unten: p ? projektKurzname(p) : '?', titel: p ? projektTitel(p) : '' };
                }}
              />
              {a.monate.length > 1 ? (
                <MitarbeiterKarte
                  titel="Stunden je Mitarbeiter und Monat"
                  sub="Erfasste Stunden – Spalten je Monat"
                  tabelle={a.jeMitarbeiterUndMonat}
                  kopf={(monat) => ({ oben: monatKurz(monat), unten: '', titel: `${MONATSNAMEN[Number(monat.slice(5, 7)) - 1]} ${monat.slice(0, 4)}` })}
                />
              ) : null}
              <ProjektKarte a={a} projektVon={projektVon} onProjekt={zuNachweisen} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function personName(data: Pick<LeistungsnachweisDaten, 'mitarbeiter'>, id: ID): string {
  const m = data.mitarbeiter.find((x) => x.id === id);
  return m ? mitarbeiterName(m) || m.kuerzel : '?';
}

/** Tabelle Mitarbeiter × Spalten (Projekte bzw. Monate) mit Summen. */
function MitarbeiterKarte({
  titel,
  sub,
  tabelle: t,
  kopf,
}: {
  titel: string;
  sub: string;
  tabelle: MitarbeiterTabelle;
  kopf: (schluessel: string) => { oben: string; unten: string; titel: string };
}) {
  return (
    <Card>
      <CardHeader titel={titel} sub={sub} />
      {t.zeilen.length === 0 ? (
        <p className="card-pad small tertiary">Keine Stunden im Zeitraum.</p>
      ) : (
        <div className="ln-co-scroll">
          <table className="table ln-co-tabelle ln-co-matrix">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                {t.spalten.map((s) => {
                  const k = kopf(s);
                  return (
                    <th key={s} className="ln-stunden" title={k.titel}>
                      {k.oben}
                      {k.unten ? <span className="ln-co-kopf-unten">{k.unten}</span> : null}
                    </th>
                  );
                })}
                <th className="ln-stunden">Summe</th>
              </tr>
            </thead>
            <tbody>
              {t.zeilen.map((z) => (
                <tr key={z.mitarbeiterId}>
                  <td>
                    <strong>{z.name}</strong>
                    {z.kuerzel ? <span className="tertiary ln-co-kuerzel">{z.kuerzel}</span> : null}
                  </td>
                  {t.spalten.map((s) => (
                    <td key={s} className={`ln-stunden ln-co-wert ${z.werte[s] ? '' : 'ln-co-leer'}`}>
                      {z.werte[s] ? stundenText(z.werte[s]) : '–'}
                    </td>
                  ))}
                  <td className="ln-stunden">{stundenText(z.summe)}</td>
                </tr>
              ))}
              <tr className="ln-co-summe">
                <td>Summe</td>
                {t.spalten.map((s) => (
                  <td key={s} className={`ln-stunden ${t.summen[s] ? '' : 'ln-co-leer'}`}>
                    {t.summen[s] ? stundenText(t.summen[s]) : '–'}
                  </td>
                ))}
                <td className="ln-stunden">{stundenText(t.summe)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Tabelle „Stunden je Projekt“: erfasst, Aufschlag, abgerechnet, ohne Nachweis – Klick zeigt die Nachweise des Projekts. */
function ProjektKarte({
  a,
  projektVon,
  onProjekt,
}: {
  a: ReturnType<typeof auswertung>;
  projektVon: Map<string, Projekt>;
  onProjekt: (p: Projekt) => void;
}) {
  const k = a.kennzahlen;
  return (
    <Card>
      <CardHeader
        titel="Stunden je Projekt"
        sub="Aufschläge zählen für den Zeitraum, in dem ihre Zeile beginnt – bei abgeschlossenen Nachweisen aus dem festgeschriebenen Stand"
      />
      <div className="table-scroll">
        <table className="table table-stack ln-co-tabelle ln-co-projekte">
          <thead>
            <tr>
              <th>Projekt</th>
              <th className="ln-stunden">Erfasst</th>
              <th className="ln-stunden">Aufschlag</th>
              <th className="ln-stunden">Abgerechnet</th>
              <th className="ln-stunden">Ohne Nachweis</th>
            </tr>
          </thead>
          <tbody>
            {a.jeProjekt.map((z) => {
              const p = projektVon.get(z.projektId);
              return (
                <tr
                  key={z.projektId}
                  className="clickable"
                  title="Leistungsnachweise des Projekts zeigen"
                  onClick={() => p && onProjekt(p)}
                >
                  <td>
                    <span className="mono tertiary ln-co-nummer">{z.nummer}</span> <strong>{z.name}</strong>
                  </td>
                  <td className="ln-stunden" data-label="Erfasst">
                    {stundenText(z.erfasst)}
                  </td>
                  <td className={`ln-stunden ln-co-wert ${z.aufschlag ? '' : 'ln-co-leer'}`} data-label="Aufschlag">
                    {k.mitAufschlag ? aufschlagText(z.aufschlag) : '–'}
                  </td>
                  <td className="ln-stunden ln-co-abgerechnet" data-label="Abgerechnet">
                    {stundenText(z.abgerechnet)}
                  </td>
                  <td className={`ln-stunden ln-co-wert ${z.ohneNachweis ? 'ln-co-warnung' : 'ln-co-leer'}`} data-label="Ohne Nachweis">
                    {z.ohneNachweis ? stundenText(z.ohneNachweis) : '–'}
                  </td>
                </tr>
              );
            })}
            <tr className="ln-co-summe">
              <td>Summe</td>
              <td className="ln-stunden" data-label="Erfasst">
                {stundenText(k.erfasst)}
              </td>
              <td className="ln-stunden" data-label="Aufschlag">
                {k.mitAufschlag ? aufschlagText(k.aufschlag) : '–'}
              </td>
              <td className="ln-stunden ln-co-abgerechnet" data-label="Abgerechnet">
                {stundenText(k.abgerechnet)}
              </td>
              <td className="ln-stunden" data-label="Ohne Nachweis">
                {k.ohneNachweis ? stundenText(k.ohneNachweis) : '–'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
