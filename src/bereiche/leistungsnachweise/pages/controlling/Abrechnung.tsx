/**
 * Abrechnung eines Leistungsnachweises im Controlling: je Zeile (Tag, Woche
 * oder Monat) die erfassten Stunden, der Aufschlag in ± Stunden und die
 * abgerechneten Stunden – ab zwei Abschnitten je Abschnitt
 * (`mitAbschnittsspalten`). Wer „Abgerechnet“ eingibt, setzt den Aufschlag als
 * Differenz (`aufschlagFuerAbgerechnet`). Erfasste Stunden bleiben, wie sie
 * sind; Druck und Excel zeigen die abgerechneten.
 *
 * Dazu Vorschau, Drucken/PDF, Excel, Abschließen bzw. Wieder öffnen (mit
 * Rückfrage – sie nennt gekürzte Zeiträume, spätere Leistungen und
 * Abweichungen vom festgeschriebenen Stand), Zeitraum ändern und Löschen, die
 * Kontrolle „Stunden je Mitarbeiter“ und die Bemerkung. Abgeschlossene
 * Nachweise zeigen ihren Stand und lassen sich nur lesen. Alle Änderungen
 * laufen über den Store, der die Rolle Controlling prüft.
 */
import { useState } from 'react';
import { today, wochentag } from '../../../../shared/dates';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Badge, Callout, Card, CardHeader, ConfirmDialog, EmptyState, Modal, Segmented, Stat } from '../../../../shared/ui';
import { Druckblatt } from '../../components/Druckblatt';
import { NachweisDialog } from '../../components/NachweisDialog';
import { Textfeld } from '../../components/Textfeld';
import { NachweisStatusBadge, anzahl, zeitpunkt } from '../../components/common';
import { GESAMT, nachweisDrucken, nachweisFassung, nachweisHtml, type NachweisFassung } from '../../domain/druck';
import { nachweisExportieren } from '../../domain/export';
import {
  abschlussZeitraum,
  anzahlAufschlaege,
  aufschlagEingabe,
  aufschlagFuerAbgerechnet,
  leistungenIm,
  mitAbschnittsspalten,
  nachweisSummen,
  neueLeistungenSeitText,
  standVeraltet,
  standVergleich,
} from '../../domain/nachweis';
import { eigeneLeistungen, istControlling, leistungenDerZeile } from '../../domain/rechte';
import {
  OHNE_ABSCHNITT,
  RASTER_LABEL,
  mitarbeiterName,
  projektTitel,
  type Abschnitt,
  type ID,
  type Leistung,
  type Leistungsnachweis,
  type NachweisZeile,
  type Projekt,
} from '../../domain/types';
import { kurzDatum, langDatum, runden, stundenText } from '../../domain/zeitraum';
import type { Route } from '../../lib/router';
import { useStore } from '../../store/store';
import { KeinZugriff, StundenFeld, aufschlagFeld, aufschlagText } from './hilfen';
import './controlling.css';

type Ansicht = 'abrechnung' | 'vorschau';

/** Leistungstexte ab dieser Länge erscheinen gekürzt mit „mehr“. */
const KURZ_AB = 180;

export function Abrechnung({ projektId, nachweisId, navigate }: { projektId: ID; nachweisId: ID; navigate: (r: Route) => void }) {
  const { data } = useStore();
  const projekt = data.projekte.find((p) => p.id === projektId);
  const nachweis = data.nachweise.find((n) => n.id === nachweisId && n.projektId === projektId);
  if (!istControlling(data)) return <KeinZugriff navigate={navigate} />;
  if (!projekt || !nachweis) {
    return (
      <Card>
        <EmptyState
          icon="stunden"
          titel="Nicht gefunden"
          text="Der Leistungsnachweis existiert nicht (mehr) – etwa weil er oder sein Projekt gelöscht wurde."
          action={
            <button type="button" className="btn btn-primary" onClick={() => navigate({ view: 'controlling', tab: 'nachweise' })}>
              Zu den Leistungsnachweisen
            </button>
          }
        />
      </Card>
    );
  }
  return <AbrechnungAnsicht key={nachweis.id} projekt={projekt} nachweis={nachweis} navigate={navigate} />;
}

/** Eine Abrechnungsposition einer Zeile: ein Abschnitt, „ohne“ bzw. die ganze Zeile. */
interface Position {
  /** Abschnitts-ID; null = „ohne“ bzw. ganze Zeile. */
  abschnittId: ID | null;
  kurz: string;
  name: string;
  erfasst: number;
  /** Eingegebener Aufschlag (offen) bzw. wirksamer (abgeschlossen). */
  eingabe: number;
  wirksam: number;
  abgerechnet: number;
}

/**
 * Positionen einer Zeile: ohne Abschnittsspalten eine, sonst je Abschnitt und
 * „ohne“ – davon nur die mit Stunden oder Aufschlag, mit `alle` jede.
 */
function positionenVon(
  z: NachweisZeile,
  n: Leistungsnachweis,
  abschnitte: Abschnitt[],
  spalten: boolean,
  lesen: boolean,
  alle: boolean,
): Position[] {
  if (!spalten) {
    return [
      {
        abschnittId: null,
        kurz: '',
        name: '',
        erfasst: z.stunden,
        eingabe: lesen ? z.aufschlag : aufschlagEingabe(n, z.schluessel, null),
        wirksam: z.aufschlag,
        abgerechnet: z.abgerechnet,
      },
    ];
  }
  const liste = [
    ...abschnitte.map((a) => ({ abschnittId: a.id as ID | null, kurz: a.kurz || a.kennung || a.name, name: a.name })),
    { abschnittId: null, kurz: 'ohne', name: 'Ohne Abschnitt – ein Aufschlag hier gilt der ganzen Zeile' },
  ];
  const alleZeilen = liste
    .map((p): Position => {
      const k = p.abschnittId ?? OHNE_ABSCHNITT;
      const wirksam = z.aufschlagJeAbschnitt?.[k] ?? 0;
      return {
        ...p,
        erfasst: z.stundenJeAbschnitt[k] ?? 0,
        eingabe: lesen ? wirksam : aufschlagEingabe(n, z.schluessel, p.abschnittId),
        wirksam,
        abgerechnet: (z.abgerechnetJeAbschnitt ?? z.stundenJeAbschnitt)[k] ?? 0,
      };
    });
  const gezeigt = alleZeilen.filter((p) => alle || p.erfasst !== 0 || p.eingabe !== 0 || p.wirksam !== 0 || p.abgerechnet !== 0);
  // Mindestens eine Position – sonst fehlten der Zeile Datum, Bearbeiter und Text
  return gezeigt.length ? gezeigt : alleZeilen.slice(-1);
}

function AbrechnungAnsicht({ projekt, nachweis: n, navigate }: { projekt: Projekt; nachweis: Leistungsnachweis; navigate: (r: Route) => void }) {
  const { data, updateNachweis, nachweisAbschliessen, nachweisOeffnen, deleteNachweis, aufschlagSetzen, aufschlaegeZuruecksetzen } = useStore();
  const toast = useToast();
  const [ansicht, setAnsicht] = useState<Ansicht>('abrechnung');
  const [offeneTexte, setOffeneTexte] = useState<Set<string>>(new Set());
  const [offeneLeistungen, setOffeneLeistungen] = useState<Set<string>>(new Set());
  const [alleAbschnitte, setAlleAbschnitte] = useState(false);
  const [zeitraumDialog, setZeitraumDialog] = useState(false);
  const [abschliessen, setAbschliessen] = useState(false);
  const [oeffnen, setOeffnen] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [zuruecksetzen, setZuruecksetzen] = useState(false);
  const [excelLaeuft, setExcelLaeuft] = useState(false);

  const abgeschlossen = n.status === 'abgeschlossen';
  const fassung = nachweisFassung(data, n, projekt, 'abgerechnet');
  const { zeilen } = fassung;
  const abschnitte = abgeschlossen && n.stand ? n.stand.abschnitte : projekt.abschnitte;
  const spalten = mitAbschnittsspalten(abschnitte);
  const summen = nachweisSummen(zeilen);
  const veraltet = standVeraltet(data, n);
  const imZeitraum = leistungenIm(data, projekt.id, n.von, n.bis);
  // Löschen darf auch das Controlling nur eigene Leistungen (domain/rechte.ts)
  const eigeneImZeitraum = eigeneLeistungen(data, imZeitraum).length;
  const aufschlaege = anzahlAufschlaege(n);
  const mitarbeiterVon = new Map(data.mitarbeiter.map((m) => [m.id, m]));
  const abschnittVon = new Map(projekt.abschnitte.map((a) => [a.id, a]));
  const personName = (id: ID) => {
    const m = mitarbeiterVon.get(id);
    return m ? mitarbeiterName(m) || m.kuerzel : '?';
  };

  // Aufschläge, die gerade nicht wirken: ihre Zeile fehlt (etwa nach einem Rasterwechsel) oder ihr Abschnitt
  const zeilenSchluessel = new Set(zeilen.map((z) => z.schluessel));
  const unwirksam = abgeschlossen
    ? 0
    : Object.entries(n.aufschlaege).filter(([k, v]) => {
        if (!v) return false;
        const trenner = k.lastIndexOf('|');
        const zeile = k.slice(0, trenner);
        const abschnitt = k.slice(trenner + 1);
        return !zeilenSchluessel.has(zeile) || (abschnitt !== OHNE_ABSCHNITT && (!spalten || !abschnittVon.has(abschnitt)));
      }).length;
  const zeilenMitNeuen = abgeschlossen ? 0 : zeilen.filter((z) => neueLeistungenSeitText(data, n, z).length > 0).length;

  const umschalten = (setze: typeof setOffeneTexte, schluessel: string) =>
    setze((alt) => {
      const neu = new Set(alt);
      if (neu.has(schluessel)) neu.delete(schluessel);
      else neu.add(schluessel);
      return neu;
    });

  const excel = async () => {
    setExcelLaeuft(true);
    try {
      await nachweisExportieren(data, n, projekt);
    } catch {
      toast('Die Excel-Datei ließ sich nicht erzeugen.');
    } finally {
      setExcelLaeuft(false);
    }
  };

  /* Rückfragen */
  const abschluss = abschlussZeitraum(data, n, today());
  const abschliessenText = [
    `Der Stand wird festgeschrieben – mit ${stundenText(summen.abgerechnet)} abgerechneten Stunden${
      summen.aufschlag ? ` (erfasst ${stundenText(summen.erfasst)}, Aufschlag ${aufschlagText(summen.aufschlag)})` : ''
    }. Spätere Leistungen im Zeitraum ändern ihn nicht mehr; „Wieder öffnen“ hebt den Abschluss auf.`,
    abschluss.gekuerzt
      ? `Nach der Regel „Fortlaufend bis zum Abschluss“ endet der Zeitraum am ${langDatum(abschluss.bis)}, dem letzten Tag mit Leistungen.`
      : '',
    abschluss.spaetere.length
      ? `${anzahl(abschluss.spaetere.length, 'spätere Leistung kommt', 'spätere Leistungen kommen')} in einen neuen Leistungsnachweis.`
      : '',
    zeilenMitNeuen ? `Achtung: In ${anzahl(zeilenMitNeuen, 'Zeile', 'Zeilen')} fehlen neue Leistungen noch im bearbeiteten Text.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const vergleich = standVergleich(data, n);
  const oeffnenText = vergleich.veraltet
    ? `Seit dem Abschluss haben sich Leistungen geändert: festgeschrieben sind ${stundenText(vergleich.stand.erfasst)} Std. erfasst und ${stundenText(
        vergleich.stand.abgerechnet,
      )} Std. abgerechnet, aktuell sind es ${stundenText(vergleich.aktuell.erfasst)} bzw. ${stundenText(
        vergleich.aktuell.abgerechnet,
      )} Std. „Wieder öffnen“ verwirft den festgeschriebenen Stand und zeigt die aktuellen Leistungen; die Aufschläge bleiben.`
    : `Der festgeschriebene Stand (${stundenText(vergleich.stand.abgerechnet)} Std. abgerechnet) wird verworfen; der Leistungsnachweis zeigt wieder die aktuellen Leistungen, die Aufschläge bleiben. Er stimmt derzeit mit dem Stand überein.`;

  const kopfSub = `${langDatum(n.von)} – ${langDatum(n.bis)} · ${projektTitel(projekt)} · ${RASTER_LABEL[n.raster]}`;
  const spaltenzahl = spalten ? 7 : 6;

  return (
    <div className="stack">
      {/* Werkzeugleiste */}
      <div className="ln-co-leiste">
        <div className="row wrap">
          <button
            type="button"
            className="btn btn-ghost"
            title="Den gemeinsamen Leistungsnachweis öffnen"
            onClick={() => navigate({ view: 'nachweis', projektId: projekt.id, nachweisId: n.id })}
          >
            <Icon name="zurueck" size={14} /> Zum Nachweis
          </button>
          <Segmented<Ansicht>
            value={ansicht}
            onChange={setAnsicht}
            options={[
              { value: 'abrechnung', label: 'Abrechnung' },
              { value: 'vorschau', label: 'Vorschau' },
            ]}
          />
        </div>
        <div className="row wrap">
          <button type="button" className="btn btn-outline" onClick={() => nachweisDrucken(data, n, projekt)}>
            <Icon name="plan" size={14} /> Drucken / PDF
          </button>
          <button type="button" className="btn btn-outline" disabled={excelLaeuft} onClick={() => void excel()}>
            <Icon name="export" size={14} /> {excelLaeuft ? 'Excel …' : 'Excel'}
          </button>
          {abgeschlossen ? (
            <button type="button" className="btn btn-primary" onClick={() => setOeffnen(true)}>
              <Icon name="schleife" size={14} /> Wieder öffnen
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setAbschliessen(true)}>
              <Icon name="check" size={14} /> Abschließen
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline"
            disabled={abgeschlossen}
            title={abgeschlossen ? 'Erst „Wieder öffnen“ – der Stand ist festgeschrieben.' : 'Zeitraum, Raster und Überschrift ändern'}
            onClick={() => setZeitraumDialog(true)}
          >
            <Icon name="kalender" size={14} /> Zeitraum ändern
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
            <Icon name="loeschen" size={14} /> Löschen
          </button>
        </div>
      </div>

      {/* Kopf: Überschrift, Zeitraum, Raster, Status, Kennzahlen */}
      <Card>
        <CardHeader
          titel={fassung.titel}
          sub={kopfSub}
          actions={
            <span className="row wrap" style={{ gap: 6 }}>
              <NachweisStatusBadge status={n.status} />
              {veraltet ? <Badge ton="orange">geändert</Badge> : null}
            </span>
          }
        />
        <div className="kennzahlen">
          <Stat wert={stundenText(summen.erfasst)} label="Erfasst" />
          <Stat wert={aufschlagText(summen.aufschlag)} label="Aufschlag" ton={summen.aufschlag ? 'blue' : ''} />
          <Stat wert={stundenText(summen.abgerechnet)} label="Abgerechnet" />
          <Stat wert={fassung.bearbeiter.length} label="Bearbeiter" />
        </div>
      </Card>

      {abgeschlossen ? (
        <Callout icon="✓">
          Abgeschlossen {zeitpunkt(n.abgeschlossen)} – der Stand ist festgeschrieben, mit seinen Aufschlägen. Spätere
          Leistungen im Zeitraum ändern ihn nicht; Aufschläge lassen sich erst nach „Wieder öffnen“ ändern.
        </Callout>
      ) : null}
      {veraltet ? (
        <Callout ton="warn" icon="!">
          Seit dem Abschluss haben sich Leistungen im Zeitraum geändert – „Wieder öffnen“ übernimmt sie.
        </Callout>
      ) : null}
      {unwirksam > 0 ? (
        <Callout icon="i">
          {unwirksam === 1
            ? '1 Aufschlag gehört zu einer Zeile, die es im aktuellen Raster nicht gibt, und wirkt deshalb nicht – er kehrt zurück, wenn die Zeile wieder entsteht.'
            : `${unwirksam} Aufschläge gehören zu Zeilen, die es im aktuellen Raster nicht gibt, und wirken deshalb nicht – sie kehren zurück, wenn die Zeilen wieder entstehen.`}{' '}
          „Aufschläge zurücksetzen“ entfernt sie.
        </Callout>
      ) : null}

      {ansicht === 'vorschau' ? (
        <Druckblatt inhalt={nachweisHtml(data, n, projekt)} />
      ) : (
        <>
          <Card>
            <CardHeader
              titel="Abrechnung"
              sub={
                abgeschlossen
                  ? 'Festgeschriebener Stand – nur lesen'
                  : `Aufschlag in ± Std. je Zeile${spalten ? ' und Abschnitt' : ''}, z. B. 1,5 oder -0,5 – gespeichert beim Verlassen des Felds oder mit Enter. „Abgerechnet“ setzt den Aufschlag als Differenz.`
              }
              actions={
                abgeschlossen ? undefined : (
                  <span className="row wrap" style={{ gap: 10 }}>
                    {spalten ? (
                      <label className="checkbox small" title="Je Zeile auch Abschnitte ohne Stunden und „ohne Abschnitt“ zeigen – für Aufschläge dort">
                        <input type="checkbox" checked={alleAbschnitte} onChange={(e) => setAlleAbschnitte(e.target.checked)} />
                        Alle Abschnitte
                      </label>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      disabled={aufschlaege === 0}
                      onClick={() => setZuruecksetzen(true)}
                    >
                      <Icon name="rueckgaengig" size={12} /> Aufschläge zurücksetzen
                    </button>
                  </span>
                )
              }
            />
            {zeilen.length === 0 ? (
              <EmptyState
                icon="stunden"
                titel="Keine Leistungen im Zeitraum"
                text={
                  abgeschlossen
                    ? 'Der Leistungsnachweis wurde ohne Leistungen abgeschlossen.'
                    : 'Sobald Mitarbeiter Leistungen im Zeitraum erfassen oder importieren, erscheinen sie hier je Zeile.'
                }
              />
            ) : (
              <div className="table-scroll ln-co-abrechnung-huelle">
                <table className={`table ln-co-abrechnung ${spalten ? 'ln-co-mit-abschnitten' : ''} ${abgeschlossen ? '' : 'ln-co-eingaben'}`}>
                  <thead>
                    <tr>
                      <th className="ln-co-spalte-datum">Datum</th>
                      <th className="ln-co-spalte-bearbeiter">Bearbeiter</th>
                      <th>Leistungstext</th>
                      {spalten ? <th className="ln-co-spalte-abschnitt">Abschnitt</th> : null}
                      <th className="ln-stunden ln-co-spalte-zahl">Erfasst</th>
                      <th className="ln-stunden ln-co-spalte-eingabe">Aufschlag</th>
                      <th className="ln-stunden ln-co-spalte-eingabe">Abgerechnet</th>
                    </tr>
                  </thead>
                  {zeilen.map((z) => {
                    const { eigene, andere } = leistungenDerZeile(data, z);
                    return (
                      <ZeileAbrechnung
                        key={z.schluessel}
                        zeile={z}
                        positionen={positionenVon(z, n, abschnitte, spalten, abgeschlossen, alleAbschnitte)}
                        spalten={spalten}
                        lesen={abgeschlossen}
                        leistungen={[...eigene, ...andere].sort((a, b) => a.datum.localeCompare(b.datum))}
                        textOffen={offeneTexte.has(z.schluessel)}
                        leistungenOffen={offeneLeistungen.has(z.schluessel)}
                        personName={personName}
                        abschnittKurz={(id) => {
                          const a = id ? abschnittVon.get(id) : undefined;
                          return a ? a.kurz || a.kennung || a.name : '';
                        }}
                        onText={() => umschalten(setOffeneTexte, z.schluessel)}
                        onLeistungen={() => umschalten(setOffeneLeistungen, z.schluessel)}
                        onAufschlag={(abschnittId, stunden) => aufschlagSetzen(n.id, z.schluessel, abschnittId, stunden)}
                        onAbgerechnet={(abschnittId, stunden) =>
                          aufschlagSetzen(n.id, z.schluessel, abschnittId, stunden === null ? null : aufschlagFuerAbgerechnet(z, abschnittId, stunden, spalten))
                        }
                      />
                    );
                  })}
                  <tbody className="ln-co-summenblock">
                    <tr className="ln-co-summe">
                      <td colSpan={spaltenzahl - 3}>Summe</td>
                      <td className="ln-stunden" data-label="Erfasst">
                        {stundenText(summen.erfasst)}
                      </td>
                      <td className="ln-stunden" data-label="Aufschlag">
                        {aufschlagText(summen.aufschlag)}
                      </td>
                      <td className="ln-stunden ln-co-abgerechnet" data-label="Abgerechnet">
                        {stundenText(summen.abgerechnet)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {fassung.mitarbeiter.length > 0 ? (
            <StundenJeMitarbeiter fassung={fassung} leistungen={abgeschlossen ? null : imZeitraum} abschnitte={spalten ? abschnitte : []} />
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

      {zeitraumDialog ? <NachweisDialog projekt={projekt} nachweis={n} onClose={() => setZeitraumDialog(false)} /> : null}

      {abschliessen ? (
        <ConfirmDialog
          titel="Leistungsnachweis abschließen?"
          text={abschliessenText}
          bestaetigenLabel="Abschließen"
          ton="blau"
          onConfirm={() => {
            nachweisAbschliessen(n.id);
            toast(
              `Leistungsnachweis abgeschlossen${abschluss.gekuerzt ? ` – Zeitraum bis ${langDatum(abschluss.bis)}` : ''}${
                abschluss.spaetere.length
                  ? `; ${anzahl(abschluss.spaetere.length, 'spätere Leistung liegt', 'spätere Leistungen liegen')} in einem neuen Leistungsnachweis`
                  : ''
              }.`,
            );
          }}
          onClose={() => setAbschliessen(false)}
        />
      ) : null}

      {oeffnen ? (
        <ConfirmDialog
          titel="Leistungsnachweis wieder öffnen?"
          text={oeffnenText}
          bestaetigenLabel="Wieder öffnen"
          ton="blau"
          onConfirm={() => {
            nachweisOeffnen(n.id);
            toast('Leistungsnachweis wieder geöffnet – er zeigt die aktuellen Leistungen.');
          }}
          onClose={() => setOeffnen(false)}
        />
      ) : null}

      {zuruecksetzen ? (
        <ConfirmDialog
          titel="Aufschläge zurücksetzen?"
          text={`${
            aufschlaege === 1 ? 'Der Aufschlag' : `Alle ${aufschlaege} Aufschläge`
          } dieses Leistungsnachweises ${aufschlaege === 1 ? 'wird' : 'werden'} entfernt – abgerechnet wird dann, was erfasst ist.`}
          bestaetigenLabel="Zurücksetzen"
          onConfirm={() => {
            aufschlaegeZuruecksetzen(n.id);
            toast('Aufschläge zurückgesetzt.');
          }}
          onClose={() => setZuruecksetzen(false)}
        />
      ) : null}

      {loeschen ? (
        <NachweisLoeschen
          titel={fassung.titel}
          eigene={eigeneImZeitraum}
          andere={imZeitraum.length - eigeneImZeitraum}
          onClose={() => setLoeschen(false)}
          onLoeschen={(mitLeistungen) => {
            deleteNachweis(n.id, mitLeistungen);
            toast(
              mitLeistungen && eigeneImZeitraum
                ? `Leistungsnachweis und ${anzahl(eigeneImZeitraum, 'eigene Leistung', 'eigene Leistungen')} gelöscht.`
                : 'Leistungsnachweis gelöscht.',
            );
            navigate({ view: 'controlling', tab: 'nachweise' });
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Eine Zeile der Abrechnung                                           */
/* ------------------------------------------------------------------ */

function ZeileAbrechnung({
  zeile: z,
  positionen,
  spalten,
  lesen,
  leistungen,
  textOffen,
  leistungenOffen,
  personName,
  abschnittKurz,
  onText,
  onLeistungen,
  onAufschlag,
  onAbgerechnet,
}: {
  zeile: NachweisZeile;
  positionen: Position[];
  spalten: boolean;
  /** Abgeschlossen: nur lesen. */
  lesen: boolean;
  leistungen: Leistung[];
  textOffen: boolean;
  leistungenOffen: boolean;
  personName: (id: ID) => string;
  abschnittKurz: (id: ID | null) => string;
  onText: () => void;
  onLeistungen: () => void;
  onAufschlag: (abschnittId: ID | null, stunden: number | null) => string | null;
  onAbgerechnet: (abschnittId: ID | null, stunden: number | null) => string | null;
}) {
  const datum = z.datumText.replace('\n', ' ');
  const lang = z.text.length > KURZ_AB || z.text.split('\n').length > 3;
  const zeilen = positionen.length + (spalten ? 1 : 0);
  const listeId = `ln-co-leistungen-${z.schluessel}`;

  const zellen = (p: Position) => {
    const ort = spalten ? `${datum}, ${p.kurz}` : datum;
    return (
      <>
        {spalten ? (
          <td className="ln-co-abschnitt" title={p.name}>
            {p.kurz}
          </td>
        ) : null}
        <td className="ln-stunden ln-co-erfasst" data-label="Erfasst">
          {stundenText(p.erfasst)}
        </td>
        <td className="ln-stunden ln-co-eingabe" data-label="Aufschlag">
          {lesen ? (
            <span className={p.wirksam ? 'ln-co-aufschlag' : 'tertiary'}>{aufschlagText(p.wirksam)}</span>
          ) : (
            <>
              <StundenFeld
                wert={p.eingabe}
                anzeige={aufschlagFeld}
                platzhalter="±0"
                label={`Aufschlag ${ort}`}
                onSetzen={(stunden) => onAufschlag(p.abschnittId, stunden)}
              />
              {runden(p.eingabe) !== runden(p.wirksam) ? (
                <span className="ln-co-wirkt" title="Der Aufschlag wirkt nur, soweit Stunden da sind – abgerechnet wird nie weniger als 0.">
                  wirkt {aufschlagText(p.wirksam)}
                </span>
              ) : null}
            </>
          )}
        </td>
        <td className="ln-stunden ln-co-eingabe" data-label="Abgerechnet">
          {lesen ? (
            <strong>{stundenText(p.abgerechnet)}</strong>
          ) : (
            <StundenFeld
              wert={p.abgerechnet}
              anzeige={stundenText}
              label={`Abgerechnet ${ort}`}
              klasse="ln-co-feld-abgerechnet"
              onSetzen={(stunden) => onAbgerechnet(p.abschnittId, stunden)}
            />
          )}
        </td>
      </>
    );
  };

  return (
    <tbody className={`ln-co-zeile ${z.aufschlag ? 'ln-co-zeile-aufschlag' : ''}`}>
      {positionen.map((p, i) => (
        <tr key={p.abschnittId ?? OHNE_ABSCHNITT} className={i === 0 ? 'ln-co-erste' : 'ln-co-weitere'}>
          {i === 0 ? (
            <>
              <td className="ln-co-datum" rowSpan={zeilen}>
                {z.datumText}
              </td>
              <td className="ln-co-bearbeiter" rowSpan={zeilen}>
                {z.bearbeiter.map((b) => (
                  <span key={b}>{b}</span>
                ))}
              </td>
              <td className="ln-co-text" rowSpan={zeilen}>
                <div className={`ln-co-lesetext ${lang && !textOffen ? 'ln-co-gekuerzt' : ''}`}>
                  {z.text || <span className="tertiary">ohne Leistungstext</span>}
                </div>
                <div className="ln-co-text-knoepfe">
                  {lang ? (
                    <button type="button" className="ln-co-link" aria-expanded={textOffen} onClick={onText}>
                      {textOffen ? 'weniger' : 'mehr'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ln-co-link"
                    aria-expanded={leistungenOffen}
                    aria-controls={leistungenOffen ? listeId : undefined}
                    onClick={onLeistungen}
                  >
                    <Icon name={leistungenOffen ? 'runter' : 'chevron'} size={11} /> Leistungen ({z.leistungIds.length})
                  </button>
                  {z.textBearbeitet ? <span className="small tertiary">Text von Hand bearbeitet</span> : null}
                </div>
                {leistungenOffen ? (
                  <ul className="ln-co-leistungen" id={listeId}>
                    {leistungen.map((l) => (
                      <li key={l.id}>
                        <span className="ln-co-leistung-kopf">
                          {wochentag(l.datum)} {kurzDatum(l.datum)} · {personName(l.mitarbeiterId)} · {stundenText(l.stunden)} Std.
                          {spalten ? ` · ${abschnittKurz(l.abschnittId) || 'ohne'}` : ''}
                        </span>
                        <span className="ln-co-leistung-text">{l.text}</span>
                      </li>
                    ))}
                    {leistungen.length < z.leistungIds.length ? (
                      <li className="tertiary">
                        {anzahl(z.leistungIds.length - leistungen.length, 'Leistung wurde', 'Leistungen wurden')} seit dem Abschluss gelöscht.
                      </li>
                    ) : null}
                    <li className="small tertiary">Nur lesen – Leistungen ändert, wer sie erfasst hat.</li>
                  </ul>
                ) : null}
              </td>
            </>
          ) : null}
          {zellen(p)}
        </tr>
      ))}
      {spalten ? (
        <tr className="ln-co-zeilensumme">
          <td className="ln-co-abschnitt">Zeile</td>
          <td className="ln-stunden" data-label="Erfasst">
            {stundenText(z.stunden)}
          </td>
          <td className="ln-stunden" data-label="Aufschlag">
            <span className={z.aufschlag ? 'ln-co-aufschlag' : 'tertiary'}>{aufschlagText(z.aufschlag)}</span>
          </td>
          <td className="ln-stunden ln-co-abgerechnet" data-label="Abgerechnet">
            {stundenText(z.abgerechnet)}
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}

/* ------------------------------------------------------------------ */
/* Stunden je Mitarbeiter                                              */
/* ------------------------------------------------------------------ */

/**
 * Kontrolle wie die Wiko-Spalten der Excel-Vorlage: erfasste Stunden je
 * Person, ab zwei Abschnitten je Abschnitt; darunter Aufschlag und
 * abgerechnete Stunden. Abgeschlossene Nachweise zeigen die Summen des
 * festgeschriebenen Stands (ohne Aufteilung nach Abschnitten).
 */
function StundenJeMitarbeiter({
  fassung,
  leistungen,
  abschnitte,
}: {
  fassung: NachweisFassung;
  /** Leistungen im Zeitraum; null bei abgeschlossenen Nachweisen. */
  leistungen: Leistung[] | null;
  /** Abschnitte der Spalten (leer ohne Abschnittsspalten). */
  abschnitte: Abschnitt[];
}) {
  const ids = new Set(abschnitte.map((a) => a.id));
  const spalten = leistungen
    ? fassung.spalten.filter((s) => s.schluessel !== GESAMT)
    : [];
  const jeAbschnitt = new Map<ID, Record<string, number>>();
  for (const l of leistungen ?? []) {
    const werte = jeAbschnitt.get(l.mitarbeiterId) ?? {};
    const k = l.abschnittId && ids.has(l.abschnittId) ? l.abschnittId : OHNE_ABSCHNITT;
    werte[k] = runden((werte[k] ?? 0) + l.stunden);
    jeAbschnitt.set(l.mitarbeiterId, werte);
  }
  const erfasstJe = (k: string) => runden(fassung.zeilen.reduce((s, z) => s + (z.stundenJeAbschnitt[k] ?? 0), 0));

  return (
    <Card>
      <CardHeader
        titel="Stunden je Mitarbeiter"
        sub="Kontrolle der erfassten Stunden – erscheint nicht im Druck; in der Excel-Datei rechts neben dem Druckbereich, mit dem Aufschlag"
      />
      <div className="table-scroll ln-co-scroll">
        <table className="table ln-co-tabelle ln-co-kontrolle">
          <thead>
            <tr>
              <th>Kürzel</th>
              <th>Name</th>
              {spalten.map((s) => (
                <th key={s.schluessel} className="ln-stunden" title={s.name}>
                  {s.kurz}
                </th>
              ))}
              <th className="ln-stunden">Erfasst</th>
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
                    <td key={s.schluessel} className={`ln-stunden ln-co-wert ${wert ? '' : 'ln-co-leer'}`}>
                      {wert ? stundenText(wert) : '–'}
                    </td>
                  );
                })}
                <td className="ln-stunden">{stundenText(m.stunden)}</td>
              </tr>
            ))}
            <tr className="ln-co-summe">
              <td />
              <td>Erfasst</td>
              {spalten.map((s) => (
                <td key={s.schluessel} className="ln-stunden">
                  {stundenText(erfasstJe(s.schluessel))}
                </td>
              ))}
              <td className="ln-stunden">{stundenText(fassung.erfasst)}</td>
            </tr>
            <tr className="ln-co-nebensumme">
              <td />
              <td>Aufschlag</td>
              {spalten.map((s) => {
                const a = runden((fassung.summen[s.schluessel] ?? 0) - erfasstJe(s.schluessel));
                return (
                  <td key={s.schluessel} className={`ln-stunden ln-co-wert ${a ? '' : 'ln-co-leer'}`}>
                    {aufschlagText(a)}
                  </td>
                );
              })}
              <td className="ln-stunden">{aufschlagText(fassung.aufschlag)}</td>
            </tr>
            <tr className="ln-co-summe">
              <td />
              <td>Abgerechnet</td>
              {spalten.map((s) => (
                <td key={s.schluessel} className="ln-stunden">
                  {stundenText(fassung.summen[s.schluessel] ?? 0)}
                </td>
              ))}
              <td className="ln-stunden">{stundenText(fassung.abgerechnet)}</td>
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
  eigene,
  andere,
  onClose,
  onLoeschen,
}: {
  titel: string;
  /** Zahl der eigenen Leistungen im Zeitraum – nur sie lassen sich mitlöschen. */
  eigene: number;
  /** Zahl der Leistungen anderer im Zeitraum – sie bleiben immer erhalten. */
  andere: number;
  onClose: () => void;
  onLoeschen: (mitLeistungen: boolean) => void;
}) {
  const [mit, setMit] = useState(false);
  const bleiben = (mit ? 0 : eigene) + andere;
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
              onLoeschen(mit && eigene > 0);
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
        {eigene > 0 ? (
          <label className="checkbox">
            <input type="checkbox" checked={mit} onChange={(e) => setMit(e.target.checked)} />
            Auch meine {anzahl(eigene, 'Leistung', 'Leistungen')} im Zeitraum endgültig löschen
          </label>
        ) : null}
        {bleiben > 0 ? (
          <p className="small tertiary">
            {andere > 0
              ? `${anzahl(andere, 'Leistung', 'Leistungen')} anderer Mitarbeiter ${andere === 1 ? 'bleibt' : 'bleiben'} erhalten – sie löscht auch das Controlling nicht. `
              : ''}
            {`${bleiben === 1 ? 'Die verbleibende Leistung liegt' : 'Die verbleibenden Leistungen liegen'} danach in keinem Leistungsnachweis.`}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
