/**
 * Ein Leistungsnachweis zum gemeinsamen Bearbeiten: je Tag, Woche oder Monat
 * mit Leistungen eine Zeile mit Datum, Bearbeitern, Leistungstext und den
 * erfassten Stunden (ab zwei Abschnitten je Abschnitt, `mitAbschnittsspalten`).
 * Je Zeile aufklappbar die eigenen Leistungen; die der anderen erscheinen nur
 * als Zahl („+ 3 Leistungen von Kolleginnen und Kollegen“) – Stunden einzelner
 * anderer Personen zeigt diese Ansicht nie (domain/rechte.ts). Darunter Summe
 * und Bemerkung.
 *
 * Der Leistungstext entsteht automatisch aus den Texten der Leistungen. Wer
 * ihn bearbeitet, behält seinen Text: Kommen danach Leistungen hinzu, nennt
 * die Zeile sie und bietet „Ergänzen“ an – überschrieben wird nie still. Text
 * und Bemerkung bearbeitet jede angemeldete Person, solange der Nachweis offen
 * ist.
 *
 * Abschließen, Aufschläge, Zeitraum ändern, Löschen, Druck und Export gehören
 * dem Controlling (pages/controlling/Abrechnung.tsx); mit der Rolle führt
 * „Im Controlling öffnen“ dorthin. Abgeschlossene Nachweise zeigen den
 * festgeschriebenen Stand mit den erfassten Stunden, nur zum Lesen.
 */
import { useState } from 'react';
import { today, wochentag } from '../../../../shared/dates';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Badge, Callout, Card, CardHeader, ConfirmDialog, EmptyState, Stat } from '../../../../shared/ui';
import { useMitAnmeldung } from '../../components/AnmeldeDialog';
import { ImportDialog } from '../../components/ImportDialog';
import { LeistungDialog } from '../../components/LeistungDialog';
import { Textfeld } from '../../components/Textfeld';
import { NachweisStatusBadge, QuelleBadge, RasterBadge, anzahl, zeitpunkt } from '../../components/common';
import {
  bearbeiterVon,
  mitAbschnittsspalten,
  nachweisTitel,
  neueLeistungenSeitText,
  standVeraltet,
  summeStunden,
  textErgaenzen,
  zeilenFuerAnzeige,
} from '../../domain/nachweis';
import { angemeldet, istControlling, leistungenDerZeile } from '../../domain/rechte';
import {
  OHNE_ABSCHNITT,
  mitarbeiterName,
  projektKurzname,
  type Abschnitt,
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

/** Bezeichnung der Zeilen je Raster. */
const ZEILEN_LABEL: Record<Raster, [string, string]> = {
  tag: ['Tag', 'Tage'],
  woche: ['Woche', 'Wochen'],
  monat: ['Monat', 'Monate'],
};

/** Eine Stundenspalte des Nachweises: ein Abschnitt oder „ohne“. */
interface Spalte {
  schluessel: string;
  kurz: string;
  name: string;
}

/**
 * Stundenspalten ab zwei Abschnitten (wie die Vorlage Woche.xlsx): je
 * Abschnitt eine, dazu „ohne“, wenn Leistungen ohne Abschnitt in den Zeilen
 * stehen. Mit einem oder keinem Abschnitt keine – dann zählt nur die Summe.
 * Gerechnet mit den erfassten Stunden (`stundenJeAbschnitt`).
 */
function stundenSpalten(abschnitte: Abschnitt[], zeilen: NachweisZeile[]): Spalte[] {
  if (!mitAbschnittsspalten(abschnitte)) return [];
  const spalten: Spalte[] = abschnitte.map((a) => ({ schluessel: a.id, kurz: a.kurz || a.kennung || a.name, name: a.name }));
  if (zeilen.some((z) => (z.stundenJeAbschnitt[OHNE_ABSCHNITT] ?? 0) !== 0)) {
    spalten.push({ schluessel: OHNE_ABSCHNITT, kurz: 'ohne', name: 'Leistungen ohne Abschnitt' });
  }
  return spalten;
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
  const { data, updateNachweis, zeilenTextSetzen, deleteLeistung } = useStore();
  const toast = useToast();
  const mitAnmeldung = useMitAnmeldung();
  const [offen, setOffen] = useState<Set<string>>(new Set());
  const [leistungDialog, setLeistungDialog] = useState<{ leistung?: Leistung } | null>(null);
  const [leistungLoeschen, setLeistungLoeschen] = useState<Leistung | null>(null);
  const [importOffen, setImportOffen] = useState(false);

  const ich = angemeldet(data);
  const controlling = istControlling(data);
  const abgeschlossen = n.status === 'abgeschlossen';
  // Gemeinsam bearbeiten: jede angemeldete Person, solange der Nachweis offen ist
  const bearbeitbar = !abgeschlossen && !!ich;
  const stand = abgeschlossen ? n.stand : null;
  const zeilen = zeilenFuerAnzeige(data, n);
  const spalten = stundenSpalten(stand ? stand.abschnitte : projekt.abschnitte, zeilen);
  const summe = summeStunden(zeilen);
  const summen = Object.fromEntries(
    spalten.map((s) => [s.schluessel, runden(zeilen.reduce((t, z) => t + (z.stundenJeAbschnitt[s.schluessel] ?? 0), 0))]),
  );
  const bearbeiter = bearbeiterVon(zeilen);
  const meineStunden = ich ? runden(zeilen.reduce((t, z) => t + (z.stundenJeMitarbeiter[ich.id] ?? 0), 0)) : 0;
  const titel = stand?.titel ?? nachweisTitel(n);
  const kopfProjekt = stand ? stand.projekt : projekt;
  const leistungsbereich = kopfProjekt.leistungsbereich;
  const veraltet = standVeraltet(data, n);
  const mitarbeiterVon = new Map(data.mitarbeiter.map((m) => [m.id, m]));
  const abschnittVon = new Map(projekt.abschnitte.map((a) => [a.id, a]));
  const anzahlLeistungen = zeilen.reduce((s, z) => s + z.leistungIds.length, 0);
  const heute = today();
  const vorgabeDatum = imZeitraum(heute, n.von, n.bis) ? heute : heute > n.bis ? n.bis : n.von;
  const neueJeZeile = new Map(zeilen.map((z) => [z.schluessel, bearbeitbar ? neueLeistungenSeitText(data, n, z) : []]));

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
  const erfassen = () => mitAnmeldung(() => setLeistungDialog({}));
  const importieren = () => mitAnmeldung(() => setImportOffen(true));

  const erfassenKnopf = (klasse: string) => (
    <button type="button" className={klasse} onClick={erfassen}>
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
        </div>
        <div className="row">
          {!abgeschlossen ? erfassenKnopf('btn btn-primary') : null}
          {controlling ? (
            <button
              type="button"
              className="btn btn-outline"
              title="Abrechnung: Aufschläge, Abschließen, Drucken / PDF und Excel"
              onClick={() => navigate({ view: 'abrechnung', projektId: projekt.id, nachweisId: n.id })}
            >
              <Icon name="aufgabe" size={14} /> Im Controlling öffnen
            </button>
          ) : null}
        </div>
      </div>

      {/* Kopf: Überschrift, Zeitraum, Raster, Status */}
      <Card>
        <CardHeader
          titel={titel}
          sub={`${langDatum(n.von)} – ${langDatum(n.bis)} · ${projektKurzname(kopfProjekt)}${
            leistungsbereich ? ` · ${leistungsbereich}` : ''
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
          <Stat wert={stundenText(summe)} label="Stunden erfasst" />
          {ich ? <Stat wert={stundenText(meineStunden)} label="Meine Stunden" ton={meineStunden ? 'blue' : ''} /> : null}
          <Stat wert={anzahlLeistungen} label={anzahlLeistungen === 1 ? 'Leistung' : 'Leistungen'} />
          <Stat wert={zeilen.length} label={ZEILEN_LABEL[n.raster][zeilen.length === 1 ? 0 : 1]} />
          <Stat wert={bearbeiter.length} label="Bearbeiter" />
        </div>
      </Card>

      {abgeschlossen ? (
        <Callout icon="✓">Abgeschlossen {zeitpunkt(n.abgeschlossen)} – Änderungen nur über das Controlling.</Callout>
      ) : (
        <p className="small tertiary ln-gemeinsam">
          Gemeinsamer Nachweis: Jede Person erfasst ihre eigenen Leistungen; Leistungstext und Bemerkung bearbeiten alle
          gemeinsam. Abschließen und Abrechnen übernimmt das Controlling.
        </p>
      )}
      {veraltet ? (
        <Callout ton="warn" icon="!">
          Seit dem Abschluss haben sich Leistungen im Zeitraum geändert – sie erscheinen erst, wenn das Controlling den
          Leistungsnachweis wieder öffnet.
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
                : `Eigene Leistungen lassen sich von Hand erfassen oder per Excel-Import aus der Zeiterfassung übernehmen – sie erscheinen hier je ${ZEILEN_LABEL[n.raster][0]}, gemeinsam mit denen der Kolleginnen und Kollegen.`
            }
            action={
              abgeschlossen ? undefined : (
                <div className="row wrap" style={{ justifyContent: 'center' }}>
                  {erfassenKnopf('btn btn-primary')}
                  <button type="button" className="btn btn-outline" onClick={importieren}>
                    <Icon name="importieren" size={14} /> Excel-Import
                  </button>
                </div>
              )
            }
          />
        </Card>
      ) : (
        <div className="stack ln-zeilen">
          {zeilen.map((z) => {
            const { eigene, andereAnzahl } = leistungenDerZeile(data, z);
            return (
              <ZeileKarte
                key={z.schluessel}
                zeile={z}
                spalten={spalten}
                bearbeitbar={bearbeitbar}
                angemeldet={!!ich}
                eigene={eigene}
                andereAnzahl={andereAnzahl}
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
            );
          })}

          {/* Summe der erfassten Stunden */}
          <div className="card ln-summe">
            <span className="ln-summe-label">Summe</span>
            {spalten.length ? (
              <span className="ln-summe-abschnitte">
                {spalten.map((s) => (
                  <span key={s.schluessel} title={s.name}>
                    {s.kurz} <b>{stundenText(summen[s.schluessel] ?? 0)}</b>
                  </span>
                ))}
              </span>
            ) : null}
            <strong className="ln-summe-wert">{stundenText(summe)} Std.</strong>
          </div>
        </div>
      )}

      <Card>
        <CardHeader titel="Bemerkung" sub="Steht im Druck unter der Tabelle – gemeinsam für alle" />
        <div className="card-pad">
          <Textfeld
            value={n.bemerkung}
            onChange={(v) => updateNachweis(n.id, { bemerkung: v })}
            readOnly={!bearbeitbar}
            placeholder={
              abgeschlossen ? 'Keine Bemerkung' : ich ? 'z. B. Abrechnung nach Aufwand gemäß Vertrag' : 'Zum Bearbeiten bitte anmelden'
            }
            aria-label="Bemerkung"
          />
        </div>
      </Card>

      {leistungDialog ? (
        <LeistungDialog
          projektId={projekt.id}
          leistung={leistungDialog.leistung}
          vorgabeDatum={vorgabeDatum}
          onClose={() => setLeistungDialog(null)}
        />
      ) : null}

      {importOffen ? <ImportDialog onClose={() => setImportOffen(false)} navigate={navigate} /> : null}

      {leistungLoeschen ? (
        <ConfirmDialog
          titel="Leistung löschen?"
          text={`${wochentag(leistungLoeschen.datum)} ${kurzDatum(leistungLoeschen.datum)} · ${stundenText(
            leistungLoeschen.stunden,
          )} Std. – „${leistungLoeschen.text}“ wird endgültig gelöscht.`}
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
  bearbeitbar,
  angemeldet,
  eigene,
  andereAnzahl,
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
  spalten: Spalte[];
  /** Offen und angemeldet: Text und eigene Leistungen lassen sich bearbeiten. */
  bearbeitbar: boolean;
  angemeldet: boolean;
  /** Eigene Leistungen der Zeile. */
  eigene: Leistung[];
  /** Zahl der Leistungen anderer in der Zeile – einzeln erscheinen sie hier nicht. */
  andereAnzahl: number;
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
  const abschnitte = spalten.filter((s) => (z.stundenJeAbschnitt[s.schluessel] ?? 0) !== 0);
  const tabellenId = `ln-zeile-${z.schluessel}`;
  // Ohne Anmeldung gibt es keine „Kolleginnen und Kollegen“ – dann nur die Zahl
  const andereText =
    andereAnzahl === 0
      ? ''
      : angemeldet
        ? `+ ${anzahl(andereAnzahl, 'Leistung', 'Leistungen')} von Kolleginnen und Kollegen`
        : anzahl(andereAnzahl, 'Leistung', 'Leistungen');

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
          {bearbeitbar ? (
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
          ) : (
            <div className="ln-zeile-lesetext">{z.text || <span className="tertiary">ohne Leistungstext</span>}</div>
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
                  <b>{stundenText(z.stundenJeAbschnitt[s.schluessel] ?? 0)}</b>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="ln-zeile-fuss">
        {eigene.length > 0 ? (
          <button
            type="button"
            className="ln-zeile-aufklappen"
            aria-expanded={offen}
            aria-controls={offen ? tabellenId : undefined}
            onClick={onUmschalten}
          >
            <Icon name={offen ? 'runter' : 'chevron'} size={12} /> Meine Leistungen ({eigene.length})
          </button>
        ) : angemeldet ? (
          <span className="ln-zeile-keine">Keine eigenen Leistungen</span>
        ) : null}
        {andereText ? <span className="ln-zeile-andere">{andereText}</span> : null}
      </div>

      {offen && eigene.length > 0 ? (
        <div className="table-scroll ln-zeile-leistungen" id={tabellenId}>
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Leistungstext</th>
                {mitAbschnitt ? <th className="col-optional">Abschnitt</th> : null}
                <th className="ln-stunden">Stunden</th>
                <th className="col-optional">Quelle</th>
                {bearbeitbar ? <th className="actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {eigene.map((l) => (
                <tr key={l.id}>
                  <td className="num">
                    {wochentag(l.datum)} {kurzDatum(l.datum)}
                  </td>
                  <td className="ln-zeile-leistungstext">{l.text}</td>
                  {mitAbschnitt ? <td className="col-optional small muted">{abschnittName(l.abschnittId) || 'ohne'}</td> : null}
                  <td className="ln-stunden">{stundenText(l.stunden)}</td>
                  <td className="col-optional">
                    <QuelleBadge quelle={l.quelle} />
                  </td>
                  {bearbeitbar ? (
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
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
