/**
 * Einen Leistungsnachweis bearbeiten: je Tag, Woche oder Monat mit Leistungen
 * eine Zeile mit Datum, Bearbeitern, Leistungstext und Stunden (bei Projekten
 * mit Abschnitten je Abschnitt), aufklappbar die Leistungen der Zeile. Darunter
 * Summe, Stunden je Mitarbeiter (Kontrolle, nicht im Druck) und Bemerkung.
 *
 * Der Leistungstext entsteht automatisch aus den Texten der Leistungen. Wer
 * ihn bearbeitet, behält seinen Text: Kommen danach Leistungen hinzu, nennt
 * die Zeile sie und bietet „Ergänzen“ an – überschrieben wird nie still.
 *
 * Abschließen schreibt den Stand fest (`nachweisAbschliessen`): Der Nachweis
 * zeigt dann, was abgegeben wurde, auch wenn sich Leistungen im Zeitraum
 * später ändern; „Wieder öffnen“ rechnet neu. Dazu Druckansicht, Drucken/PDF
 * und Excel – beide in der Form der Excel-Vorlagen (domain/druck.ts,
 * domain/export.ts).
 */
import { useState } from 'react';
import { formatDate, toISO, today, wochentag } from '../../../../shared/dates';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Badge, Callout, Card, CardHeader, ConfirmDialog, EmptyState, Modal, Segmented, Stat } from '../../../../shared/ui';
import { Druckblatt } from '../../components/Druckblatt';
import { ImportDialog } from '../../components/ImportDialog';
import { LeistungDialog } from '../../components/LeistungDialog';
import { NachweisDialog } from '../../components/NachweisDialog';
import { Textfeld } from '../../components/Textfeld';
import { NachweisStatusBadge, QuelleBadge, RasterBadge, anzahl } from '../../components/common';
import {
  GESAMT,
  nachweisDrucken,
  nachweisFassung,
  nachweisHtml,
  spaltenStunden,
  type NachweisFassung,
  type StundenSpalte,
} from '../../domain/druck';
import { nachweisExportieren } from '../../domain/export';
import { leistungenIm, neueLeistungenSeitText, standVeraltet, textErgaenzen } from '../../domain/nachweis';
import {
  OHNE_ABSCHNITT,
  mitarbeiterName,
  type ID,
  type Leistung,
  type Leistungsnachweis,
  type NachweisZeile,
  type Projekt,
  type Raster,
} from '../../domain/types';
import { imZeitraum, kurzDatum, langDatum, runden, stundenText } from '../../domain/zeitraum';
import type { Route } from '../../lib/router';
import { useStore } from '../../store/store';
import '../../components/nachweis.css';

type Ansicht = 'bearbeiten' | 'druck';

/** Bezeichnung der Zeilen je Raster. */
const ZEILEN_LABEL: Record<Raster, [string, string]> = {
  tag: ['Tag', 'Tage'],
  woche: ['Woche', 'Wochen'],
  monat: ['Monat', 'Monate'],
};

/** „am 23.10.2026 um 14:05 Uhr“ in Ortszeit. */
function zeitpunkt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `am ${formatDate(toISO(d))} um ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

export function NachweisEditor({
  projekt,
  nachweis: n,
  navigate,
}: {
  projekt: Projekt;
  nachweis: Leistungsnachweis;
  navigate: (r: Route) => void;
}) {
  const { data, updateNachweis, zeilenTextSetzen, nachweisAbschliessen, nachweisOeffnen, deleteNachweis, deleteLeistung } =
    useStore();
  const toast = useToast();
  const [ansicht, setAnsicht] = useState<Ansicht>('bearbeiten');
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [leistungDialog, setLeistungDialog] = useState<{ leistung?: Leistung } | null>(null);
  const [leistungLoeschen, setLeistungLoeschen] = useState<Leistung | null>(null);
  const [zeitraumDialog, setZeitraumDialog] = useState(false);
  const [abschliessen, setAbschliessen] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [importOffen, setImportOffen] = useState(false);

  const abgeschlossen = n.status === 'abgeschlossen';
  const fassung = nachweisFassung(data, n, projekt);
  const { zeilen, spalten } = fassung;
  const veraltet = standVeraltet(data, n);
  const imZeitraumLive = leistungenIm(data, projekt.id, n.von, n.bis);
  const leistungVon = new Map(data.leistungen.map((l) => [l.id, l]));
  const mitarbeiterVon = new Map(data.mitarbeiter.map((m) => [m.id, m]));
  const abschnittVon = new Map(projekt.abschnitte.map((a) => [a.id, a]));
  const anzahlLeistungen = zeilen.reduce((s, z) => s + z.leistungIds.length, 0);
  const heute = today();
  const vorgabeDatum = imZeitraum(heute, n.von, n.bis) ? heute : heute > n.bis ? n.bis : n.von;
  const neueJeZeile = new Map(zeilen.map((z) => [z.schluessel, abgeschlossen ? [] : neueLeistungenSeitText(data, n, z)]));
  const zeilenMitNeuen = [...neueJeZeile.values()].filter((l) => l.length > 0).length;

  const personName = (id: ID) => {
    const m = mitarbeiterVon.get(id);
    return m ? mitarbeiterName(m) || m.kuerzel : '?';
  };

  /* Leistungstexte – alle Änderungen über den Store */
  const textAendern = (z: NachweisZeile, text: string) => {
    // Beim Weiterschreiben bleiben die Leistungen der ersten Bearbeitung maßgeblich,
    // damit der Hinweis auf neue Leistungen nicht verschwindet.
    const bekannt = n.texte[z.schluessel];
    zeilenTextSetzen(n.id, bekannt ? { ...z, leistungIds: bekannt.leistungIds } : z, text);
  };
  const ergaenzen = (z: NachweisZeile, neue: Leistung[]) => zeilenTextSetzen(n.id, z, textErgaenzen(z.text, neue));
  const beibehalten = (z: NachweisZeile) => zeilenTextSetzen(n.id, z, z.text);
  const automatisch = (z: NachweisZeile) => {
    zeilenTextSetzen(n.id, z, null);
    toast('Automatischer Leistungstext wiederhergestellt.');
  };

  const umschalten = (schluessel: string) =>
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(schluessel)) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });

  const zurueck = () => navigate({ view: 'projekt', projektId: projekt.id, tab: 'nachweise' });

  const wiederOeffnen = () => {
    nachweisOeffnen(n.id);
    toast('Leistungsnachweis wieder geöffnet – er zeigt die aktuellen Leistungen.');
  };

  const erfassenKnopf = (klasse = 'btn btn-outline') => (
    <button type="button" className={klasse} onClick={() => setLeistungDialog({})}>
      <Icon name="plus" size={14} /> Leistung erfassen
    </button>
  );

  return (
    <div className="stack">
      {/* Werkzeugleiste */}
      <div className="ln-leiste">
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={zurueck}>
            <Icon name="zurueck" size={14} /> Leistungsnachweise
          </button>
          <Segmented<Ansicht>
            value={ansicht}
            onChange={setAnsicht}
            options={[
              { value: 'bearbeiten', label: 'Bearbeiten' },
              { value: 'druck', label: 'Druckansicht' },
            ]}
          />
        </div>
        <div className="row">
          {erfassenKnopf()}
          <button
            type="button"
            className="btn btn-outline"
            disabled={abgeschlossen}
            title={abgeschlossen ? 'Erst „Wieder öffnen“ – der Stand ist festgeschrieben.' : 'Zeitraum, Raster und Überschrift ändern'}
            onClick={() => setZeitraumDialog(true)}
          >
            <Icon name="kalender" size={14} /> Zeitraum ändern
          </button>
          <button type="button" className="btn btn-outline" onClick={() => nachweisDrucken(data, n, projekt)}>
            <Icon name="plan" size={14} /> Drucken / PDF
          </button>
          <button type="button" className="btn btn-outline" onClick={() => nachweisExportieren(data, n, projekt)}>
            <Icon name="export" size={14} /> Excel
          </button>
          {abgeschlossen ? (
            <button type="button" className="btn btn-primary" onClick={wiederOeffnen}>
              <Icon name="schleife" size={14} /> Wieder öffnen
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setAbschliessen(true)}>
              <Icon name="check" size={14} /> Abschließen
            </button>
          )}
          <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
            <Icon name="loeschen" size={14} /> Löschen
          </button>
        </div>
      </div>

      {ansicht === 'druck' ? (
        <Druckblatt inhalt={nachweisHtml(data, n, projekt)} />
      ) : (
        <>
          {/* Kopf: Überschrift, Zeitraum, Raster, Status */}
          <Card>
            <CardHeader
              titel={fassung.titel}
              sub={`${langDatum(n.von)} – ${langDatum(n.bis)} · ${fassung.projektName}${
                fassung.leistungsbereich ? ` · ${fassung.leistungsbereich}` : ''
              } · zuletzt geändert ${zeitpunkt(n.geaendert)}`}
              actions={
                <span className="row wrap" style={{ gap: 6 }}>
                  <RasterBadge raster={n.raster} />
                  <NachweisStatusBadge status={n.status} />
                  {veraltet ? <Badge ton="orange">geändert</Badge> : null}
                </span>
              }
            />
            <div className="kennzahlen">
              <Stat wert={stundenText(fassung.summe)} label="Stunden" />
              <Stat wert={anzahlLeistungen} label={anzahlLeistungen === 1 ? 'Leistung' : 'Leistungen'} />
              <Stat wert={zeilen.length} label={ZEILEN_LABEL[n.raster][zeilen.length === 1 ? 0 : 1]} />
              <Stat wert={fassung.bearbeiter.length} label="Bearbeiter" />
            </div>
          </Card>

          {abgeschlossen ? (
            <Callout icon="✓">
              Abgeschlossen {zeitpunkt(n.abgeschlossen)} – der Stand ist festgeschrieben. Spätere Leistungen im Zeitraum
              ändern ihn nicht mehr.
            </Callout>
          ) : null}
          {veraltet ? (
            <Callout ton="warn" icon="!">
              Seit dem Abschluss haben sich Leistungen im Zeitraum geändert – „Wieder öffnen“ übernimmt sie.
            </Callout>
          ) : null}

          {zeilen.length === 0 ? (
            <Card>
              <EmptyState
                icon="stunden"
                titel="Noch keine Leistungen im Zeitraum"
                text={
                  abgeschlossen
                    ? 'Der Leistungsnachweis wurde ohne Leistungen abgeschlossen.'
                    : `Erfassen Sie Leistungen von Hand oder übernehmen Sie sie per Excel-Import aus der Zeiterfassung – sie erscheinen hier je ${ZEILEN_LABEL[n.raster][0]}, gemeinsam für alle Mitarbeiter.`
                }
                action={
                  abgeschlossen ? undefined : (
                    <div className="row wrap" style={{ justifyContent: 'center' }}>
                      {erfassenKnopf('btn btn-primary')}
                      <button type="button" className="btn btn-outline" onClick={() => setImportOffen(true)}>
                        <Icon name="importieren" size={14} /> Excel-Import
                      </button>
                    </div>
                  )
                }
              />
            </Card>
          ) : (
            <div className="stack ln-zeilen">
              {zeilen.map((z) => (
                <ZeileKarte
                  key={z.schluessel}
                  zeile={z}
                  spalten={spalten}
                  lesen={abgeschlossen}
                  leistungen={z.leistungIds.map((id) => leistungVon.get(id)).filter((l): l is Leistung => !!l)}
                  neue={neueJeZeile.get(z.schluessel) ?? []}
                  offen={offen.has(z.schluessel)}
                  mitAbschnitt={projekt.abschnitte.length > 0}
                  personName={personName}
                  abschnittName={(id) => {
                    const a = id ? abschnittVon.get(id) : undefined;
                    return a ? a.kurz || a.name : '';
                  }}
                  onUmschalten={() => umschalten(z.schluessel)}
                  onText={(text) => textAendern(z, text)}
                  onErgaenzen={(neue) => ergaenzen(z, neue)}
                  onBeibehalten={() => beibehalten(z)}
                  onAutomatisch={() => automatisch(z)}
                  onBearbeiten={(leistung) => setLeistungDialog({ leistung })}
                  onLoeschen={setLeistungLoeschen}
                />
              ))}

              {/* Summe */}
              <div className="card ln-summe">
                <span className="ln-summe-label">Summe</span>
                {spalten.length ? (
                  <span className="ln-summe-abschnitte">
                    {spalten
                      .filter((s) => s.schluessel !== GESAMT)
                      .map((s) => (
                        <span key={s.schluessel} title={s.name}>
                          {s.kurz} <b>{stundenText(fassung.summen[s.schluessel] ?? 0)}</b>
                        </span>
                      ))}
                  </span>
                ) : null}
                <strong className="ln-summe-wert">{stundenText(fassung.summe)} Std.</strong>
              </div>
            </div>
          )}

          {fassung.mitarbeiter.length > 0 ? (
            <StundenJeMitarbeiter
              fassung={fassung}
              leistungen={abgeschlossen ? null : imZeitraumLive}
              abschnittIds={new Set(projekt.abschnitte.map((a) => a.id))}
            />
          ) : null}

          <Card>
            <CardHeader titel="Bemerkung" sub="Steht im Druck unter der Tabelle" />
            <div className="card-pad">
              <Textfeld
                value={n.bemerkung}
                onChange={(v) => updateNachweis(n.id, { bemerkung: v })}
                readOnly={abgeschlossen}
                placeholder={abgeschlossen ? 'Keine Bemerkung' : 'z. B. Abrechnung nach Aufwand gemäß Vertrag'}
                aria-label="Bemerkung"
              />
            </div>
          </Card>
        </>
      )}

      {leistungDialog ? (
        <LeistungDialog
          projektId={projekt.id}
          leistung={leistungDialog.leistung}
          vorgabeDatum={vorgabeDatum}
          onClose={() => setLeistungDialog(null)}
        />
      ) : null}

      {zeitraumDialog ? <NachweisDialog projekt={projekt} nachweis={n} onClose={() => setZeitraumDialog(false)} /> : null}

      {importOffen ? <ImportDialog onClose={() => setImportOffen(false)} navigate={navigate} /> : null}

      {abschliessen ? (
        <ConfirmDialog
          titel="Leistungsnachweis abschließen?"
          text={`Der Stand wird festgeschrieben; spätere Leistungen im Zeitraum ändern ihn nicht mehr. „Wieder öffnen“ hebt den Abschluss auf.${
            zeilenMitNeuen
              ? ` Achtung: In ${anzahl(zeilenMitNeuen, 'Zeile', 'Zeilen')} fehlen neue Leistungen noch im bearbeiteten Text.`
              : ''
          }`}
          bestaetigenLabel="Abschließen"
          ton="blau"
          onConfirm={() => {
            nachweisAbschliessen(n.id);
            toast('Leistungsnachweis abgeschlossen.');
          }}
          onClose={() => setAbschliessen(false)}
        />
      ) : null}

      {loeschen ? (
        <NachweisLoeschen
          titel={fassung.titel}
          leistungen={imZeitraumLive.length}
          onClose={() => setLoeschen(false)}
          onLoeschen={(mitLeistungen) => {
            deleteNachweis(n.id, mitLeistungen);
            toast(
              mitLeistungen && imZeitraumLive.length
                ? `Leistungsnachweis und ${anzahl(imZeitraumLive.length, 'Leistung', 'Leistungen')} gelöscht.`
                : 'Leistungsnachweis gelöscht.',
            );
            zurueck();
          }}
        />
      ) : null}

      {leistungLoeschen ? (
        <ConfirmDialog
          titel="Leistung löschen?"
          text={`${wochentag(leistungLoeschen.datum)} ${kurzDatum(leistungLoeschen.datum)} · ${personName(
            leistungLoeschen.mitarbeiterId,
          )} · ${stundenText(leistungLoeschen.stunden)} Std. – „${leistungLoeschen.text}“ wird endgültig gelöscht.`}
          onConfirm={() => {
            deleteLeistung(leistungLoeschen.id);
            toast('Leistung gelöscht.');
          }}
          onClose={() => setLeistungLoeschen(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Eine Zeile des Nachweises                                           */
/* ------------------------------------------------------------------ */

function ZeileKarte({
  zeile: z,
  spalten,
  lesen,
  leistungen,
  neue,
  offen,
  mitAbschnitt,
  personName,
  abschnittName,
  onUmschalten,
  onText,
  onErgaenzen,
  onBeibehalten,
  onAutomatisch,
  onBearbeiten,
  onLoeschen,
}: {
  zeile: NachweisZeile;
  spalten: StundenSpalte[];
  /** Abgeschlossen: nur lesen. */
  lesen: boolean;
  leistungen: Leistung[];
  /** Leistungen, die nach der Textbearbeitung hinzukamen. */
  neue: Leistung[];
  offen: boolean;
  mitAbschnitt: boolean;
  personName: (id: ID) => string;
  abschnittName: (id: ID | null) => string;
  onUmschalten: () => void;
  onText: (text: string) => void;
  onErgaenzen: (neue: Leistung[]) => void;
  onBeibehalten: () => void;
  onAutomatisch: () => void;
  onBearbeiten: (l: Leistung) => void;
  onLoeschen: (l: Leistung) => void;
}) {
  const abschnitte = spalten.filter((s) => s.schluessel !== GESAMT && spaltenStunden(z, s.schluessel) !== 0);
  const tabellenId = `ln-zeile-${z.schluessel}`;

  return (
    <div className={`card ln-zeile ${z.textBearbeitet ? 'ln-zeile-bearbeitet' : ''}`}>
      <div className="ln-zeile-raster">
        <div className="ln-zeile-datum">{z.datumText}</div>
        <div className="ln-zeile-bearbeiter">
          {z.bearbeiter.map((b) => (
            <span key={b}>{b}</span>
          ))}
        </div>
        <div className="ln-zeile-text">
          {lesen ? (
            <div className="ln-zeile-lesetext">{z.text || <span className="tertiary">ohne Leistungstext</span>}</div>
          ) : (
            <>
              <Textfeld value={z.text} onChange={onText} aria-label={`Leistungstext ${z.datumText.replace('\n', ' ')}`} />
              <div className="ln-zeile-hinweis">
                {z.textBearbeitet ? (
                  <>
                    Von Hand bearbeitet ·{' '}
                    <button type="button" className="ln-zeile-link" onClick={onAutomatisch}>
                      Automatischen Text wiederherstellen
                    </button>
                  </>
                ) : (
                  'Automatisch aus den Leistungstexten – Änderungen bleiben stehen'
                )}
              </div>
            </>
          )}
          {neue.length > 0 ? (
            <div className="ln-zeile-neu">
              <Callout ton="warn" icon="!">
                <div className="stack" style={{ gap: 6 }}>
                  <strong>{anzahl(neue.length, 'neue Leistung', 'neue Leistungen')} seit der Bearbeitung</strong>
                  <ul className="ln-zeile-neu-liste">
                    {neue.map((l) => (
                      <li key={l.id}>
                        {kurzDatum(l.datum)} · {personName(l.mitarbeiterId)}: {l.text}
                      </li>
                    ))}
                  </ul>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => onErgaenzen(neue)}>
                      Ergänzen
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      title="Den Text unverändert lassen und den Hinweis ausblenden"
                      onClick={onBeibehalten}
                    >
                      Text so lassen
                    </button>
                  </div>
                </div>
              </Callout>
            </div>
          ) : null}
        </div>
        <div className="ln-zeile-stunden">
          <span className="ln-zeile-summe">{stundenText(z.stunden)}</span> <span className="small tertiary">Std.</span>
          {abschnitte.length > 0 ? (
            <div className="ln-zeile-abschnitte">
              {abschnitte.map((s) => (
                <span key={s.schluessel} title={s.name}>
                  <span>{s.kurz}</span>
                  <b>{stundenText(spaltenStunden(z, s.schluessel))}</b>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="ln-zeile-fuss">
        <button type="button" className="ln-zeile-aufklappen" aria-expanded={offen} aria-controls={offen ? tabellenId : undefined} onClick={onUmschalten}>
          <Icon name={offen ? 'runter' : 'chevron'} size={12} /> Leistungen ({leistungen.length})
        </button>
      </div>

      {offen ? (
        <div className="table-scroll ln-zeile-leistungen" id={tabellenId}>
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Mitarbeiter</th>
                <th>Leistungstext</th>
                {mitAbschnitt ? <th className="col-optional">Abschnitt</th> : null}
                <th className="ln-stunden">Stunden</th>
                <th className="col-optional">Quelle</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {leistungen.map((l) => (
                <tr key={l.id}>
                  <td className="num">
                    {wochentag(l.datum)} {kurzDatum(l.datum)}
                  </td>
                  <td>{personName(l.mitarbeiterId)}</td>
                  <td className="ln-zeile-leistungstext">{l.text}</td>
                  {mitAbschnitt ? <td className="col-optional small muted">{abschnittName(l.abschnittId) || 'ohne'}</td> : null}
                  <td className="ln-stunden">{stundenText(l.stunden)}</td>
                  <td className="col-optional">
                    <QuelleBadge quelle={l.quelle} />
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn-icon"
                      title="Leistung bearbeiten"
                      aria-label="Leistung bearbeiten"
                      onClick={() => onBearbeiten(l)}
                    >
                      <Icon name="bearbeiten" size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Leistung löschen"
                      aria-label="Leistung löschen"
                      onClick={() => onLoeschen(l)}
                    >
                      <Icon name="loeschen" size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {leistungen.length === 0 ? (
                <tr>
                  <td colSpan={mitAbschnitt ? 7 : 6} className="small tertiary">
                    Die Leistungen dieser Zeile wurden seit dem Abschluss gelöscht.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stunden je Mitarbeiter                                              */
/* ------------------------------------------------------------------ */

/**
 * Kontrolle wie die Wiko-Spalten der Excel-Vorlage: Stunden je Person, bei
 * Abschnitten je Abschnitt. Abgeschlossene Nachweise zeigen die Summen des
 * festgeschriebenen Stands (ohne Aufteilung nach Abschnitten).
 */
function StundenJeMitarbeiter({
  fassung,
  leistungen,
  abschnittIds,
}: {
  fassung: NachweisFassung;
  /** Leistungen im Zeitraum; null bei abgeschlossenen Nachweisen. */
  leistungen: Leistung[] | null;
  abschnittIds: Set<ID>;
}) {
  const spalten = leistungen ? fassung.spalten.filter((s) => s.schluessel !== GESAMT) : [];
  const jeAbschnitt = new Map<ID, Record<string, number>>();
  for (const l of leistungen ?? []) {
    const werte = jeAbschnitt.get(l.mitarbeiterId) ?? {};
    const schluessel = l.abschnittId && abschnittIds.has(l.abschnittId) ? l.abschnittId : OHNE_ABSCHNITT;
    werte[schluessel] = runden((werte[schluessel] ?? 0) + l.stunden);
    jeAbschnitt.set(l.mitarbeiterId, werte);
  }

  return (
    <Card>
      <CardHeader
        titel="Stunden je Mitarbeiter"
        sub="Kontrolle – erscheint nicht im Druck; in der Excel-Datei rechts neben dem Druckbereich"
      />
      <div className="table-scroll">
        <table className="table ln-mitarbeiterstunden">
          <thead>
            <tr>
              <th>Kürzel</th>
              <th>Name</th>
              {spalten.map((s) => (
                <th key={s.schluessel} className="ln-stunden" title={s.name}>
                  {s.kurz}
                </th>
              ))}
              <th className="ln-stunden">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {fassung.mitarbeiter.map((m) => (
              <tr key={m.id}>
                <td className="num">{m.kuerzel}</td>
                <td>{m.name}</td>
                {spalten.map((s) => {
                  const wert = jeAbschnitt.get(m.id)?.[s.schluessel] ?? 0;
                  return (
                    <td key={s.schluessel} className={`ln-stunden ${wert ? '' : 'ln-null'}`}>
                      {wert ? stundenText(wert) : '–'}
                    </td>
                  );
                })}
                <td className="ln-stunden">{stundenText(m.stunden)}</td>
              </tr>
            ))}
            <tr className="ln-mitarbeiterstunden-summe">
              <td />
              <td>Summe</td>
              {spalten.map((s) => (
                <td key={s.schluessel} className="ln-stunden">
                  {stundenText(fassung.summen[s.schluessel] ?? 0)}
                </td>
              ))}
              <td className="ln-stunden">{stundenText(fassung.summe)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Löschen                                                             */
/* ------------------------------------------------------------------ */

function NachweisLoeschen({
  titel,
  leistungen,
  onClose,
  onLoeschen,
}: {
  titel: string;
  /** Zahl der Leistungen im Zeitraum. */
  leistungen: number;
  onClose: () => void;
  onLoeschen: (mitLeistungen: boolean) => void;
}) {
  const [mit, setMit] = useState(false);
  return (
    <Modal
      titel="Leistungsnachweis löschen?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: 'var(--red)' }}
            onClick={() => {
              onLoeschen(mit && leistungen > 0);
              onClose();
            }}
          >
            Löschen
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <p className="muted">„{titel}“ wird gelöscht.</p>
        {leistungen > 0 ? (
          <>
            <label className="checkbox">
              <input type="checkbox" checked={mit} onChange={(e) => setMit(e.target.checked)} />
              Auch die {anzahl(leistungen, 'Leistung', 'Leistungen')} im Zeitraum löschen
            </label>
            <p className="small tertiary">
              {mit
                ? 'Die Leistungen aller Mitarbeiter im Zeitraum werden endgültig gelöscht.'
                : 'Die Leistungen bleiben erhalten und liegen danach in keinem Leistungsnachweis.'}
            </p>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
