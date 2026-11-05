/**
 * Karte „Terminnachweis“ eines Planlaufs (domain/nachweis.ts): Verzug gegenüber
 * dem Basisplan, je Ausführung aufgeschlüsselt und den Seiten zugerechnet.
 * Dazu die Zuordnung von Hand (Tage je Seite mit Grund), die Ursache der
 * Nacharbeit je Entscheidung, „Basis neu festlegen …“ und der Nachweis als
 * Excel-Datei (Blätter Ausführungen, Verzug je Seite, Erinnerungen, Protokoll).
 *
 * Dialoge merken sich nur Schlüssel bzw. IDs und lesen nach jedem Store-Update
 * frisch aus dem übergebenen Nachweis bzw. Lauf.
 */
import { useState } from 'react';
import {
  AUSFUEHRUNGS_ART_LABEL,
  POSTEN_ART_LABEL,
  tageText,
  type AusfuehrungsZustand,
  type NachweisAusfuehrung,
  type NachweisPosten,
  type Terminnachweis,
} from '../domain/nachweis';
import {
  EMAIL_ANLASS_LABEL,
  SEITE_LABEL,
  type PlanDocument,
  type PlanRun,
  type Seite,
} from '../domain/types';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { formatDate, today } from '../../../shared/dates';
import { dateiLaden, xlsxErzeugen, type Blatt, type Zelle } from '../../../shared/xlsx';
import { Badge, Callout, Card, CardHeader, Field, Modal, Select, TextArea, TextInput } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import { Kennzahl, SeiteBadge, WEG_LABEL, zeitpunktText } from './common';
import './planlauf.css';

const SEITEN = Object.keys(SEITE_LABEL) as Seite[];

const ZUSTAND_LABEL: Record<AusfuehrungsZustand, string> = {
  erledigt: 'erledigt',
  uebersprungen: 'übersprungen',
  laufend: 'läuft – Ende voraussichtlich',
  prognose: 'Prognose',
};

/** Kurzform der Einheit: AT bzw. KT. */
const einheit = (arbeitstage: boolean) => (arbeitstage ? 'AT' : 'KT');

/** Gezählte Tage einer Ausführung, die sich von Hand Seiten zuordnen lassen. */
function kapazitaet(nw: Terminnachweis, schluessel: string): number {
  return nw.posten
    .filter((p) => p.schluessel === schluessel && p.art !== 'zeitgewinn')
    .reduce((s, p) => s + p.gezaehlt, 0);
}

function ausfuehrungsName(a: Pick<NachweisAusfuehrung, 'name' | 'durchlauf'>): string {
  return a.durchlauf > 1 ? `${a.name} (${a.durchlauf}. Durchlauf)` : a.name;
}

export function TerminnachweisKarte({
  project,
  run,
  doc,
  nw,
}: {
  project: { name: string; nummer?: string };
  run: PlanRun;
  doc: PlanDocument | undefined;
  nw: Terminnachweis;
}) {
  const { nacharbeitSeiteSetzen } = useStore();
  const toast = useToast();
  const [zuordnen, setZuordnen] = useState<string | null>(null);
  const [basis, setBasis] = useState(false);
  const [alle, setAlle] = useState(false);
  const e = einheit(nw.arbeitstage);

  // Posten je Ausführung, in der Reihenfolge der Ausführungen
  const gruppen = nw.ausfuehrungen
    .map((a) => ({ a, posten: nw.posten.filter((p) => p.schluessel === a.schluessel) }))
    .filter((g) => g.posten.length > 0);
  const wichtig = gruppen.filter((g) => g.posten.some((p) => p.art !== 'zeitgewinn' && p.gezaehlt > 0));
  const sichtbar = alle ? gruppen : wichtig;
  const nacharbeit = nw.ausfuehrungen.filter(
    (a) => a.antwortNacharbeit && (a.zustand === 'erledigt' || a.zustand === 'uebersprungen'),
  );
  const offenZuordnen = zuordnen ? nw.ausfuehrungen.find((a) => a.schluessel === zuordnen) : undefined;

  const excel = () => {
    const blob = xlsxErzeugen(nachweisBlaetter(project, run, doc, nw));
    const name = `Terminnachweis ${doc?.nummer || run.name} ${today()}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
    dateiLaden(blob, name);
    toast('Terminnachweis als Excel-Datei erstellt.');
  };

  return (
    <Card>
      <CardHeader
        titel="Terminnachweis"
        sub="Verzug gegenüber dem Basisplan – und welcher Seite er zuzurechnen ist"
        actions={
          <span className="row wrap" style={{ gap: 6 }}>
            {run.status !== 'abgebrochen' ? (
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setBasis(true)}>
                Basis neu festlegen …
              </button>
            ) : null}
            <button type="button" className="btn btn-sm btn-outline" onClick={excel}>
              <Icon name="export" size={13} /> Nachweis als Excel
            </button>
          </span>
        }
      />

      <div className="pl-nachweis-abschnitt">
        <div className="pl-summen">
          <Kennzahl label="Geplantes Ende (Basis)" wert={formatDate(nw.basisEnde)} />
          <Kennzahl
            label={nw.endeIstPrognose ? 'Ende voraussichtlich' : 'Ende'}
            wert={nw.ende ? formatDate(nw.ende) : '–'}
          />
          <Kennzahl
            label="Gesamtverzug"
            wert={nw.gesamtverzug === null ? '–' : `${nw.gesamtverzug} ${e}`}
            ton={nw.gesamtverzug !== null && nw.gesamtverzug > 0 ? 'rot' : nw.gesamtverzug !== null && nw.gesamtverzug < 0 ? 'gruen' : ''}
          />
          {SEITEN.map((s) => (
            <Kennzahl key={s} label={SEITE_LABEL[s]} wert={`${nw.summen[s]} ${e}`} />
          ))}
          {nw.seiteFehlt > 0 ? <Kennzahl label="Seite fehlt" wert={`${nw.seiteFehlt} ${e}`} ton="orange" /> : null}
          {nw.zeitgewinn > 0 ? <Kennzahl label="Zeitgewinn" wert={`−${nw.zeitgewinn} ${e}`} ton="gruen" /> : null}
          {nw.nichtErklaert ? <Kennzahl label="Nicht erklärt" wert={`${nw.nichtErklaert} ${e}`} ton="orange" /> : null}
        </div>
        {nw.warnungen.length > 0 ? (
          <Callout ton="warn" icon="!">
            {nw.warnungen.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </Callout>
        ) : null}
      </div>

      <div className="pl-nachweis-abschnitt">
        <div className="row-between wrap" style={{ gap: 8 }}>
          <h4>Verzug je Ausführung</h4>
          {gruppen.length > wichtig.length ? (
            <button type="button" className="pl-link" onClick={() => setAlle((a) => !a)}>
              {alle ? 'Nur gezählten Verzug zeigen' : `Auch aufgefangene Posten und Zeitgewinne (${gruppen.length - wichtig.length})`}
            </button>
          ) : null}
        </div>
        {sichtbar.length === 0 ? (
          <p className="small muted">Kein Verzug – der Planlauf liegt im Basisplan.</p>
        ) : (
          <div>
            {sichtbar.map(({ a, posten }) => {
              const verteilt = nw.verteilung.filter((v) => v.schluessel === a.schluessel);
              const zuordenbar = kapazitaet(nw, a.schluessel) > 0;
              return (
                <div className="pl-posten-zeile" key={a.schluessel}>
                  <div className="pl-posten-text">
                    <span className="row wrap" style={{ gap: 6 }}>
                      <strong>{ausfuehrungsName(a)}</strong>
                      {a.art !== 'regel' ? <Badge ton={a.art === 'nacharbeit' ? 'purple' : 'orange'}>{AUSFUEHRUNGS_ART_LABEL[a.art]}</Badge> : null}
                      {a.zustand === 'prognose' || a.zustand === 'laufend' ? <Badge>voraussichtlich</Badge> : null}
                    </span>
                    {posten.map((p, i) => (
                      <PostenZeile key={i} p={p} arbeitstage={nw.arbeitstage} />
                    ))}
                    {a.ausloeser ? (
                      <span>
                        ausgelöst durch „{a.ausloeser.name}“{a.ausloeser.antwort ? ` (Antwort „${a.ausloeser.antwort}“)` : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
                    <span className="pl-seiten">
                      {verteilt.map((v, i) =>
                        v.seite ? (
                          <Badge key={i} ton={v.hand ? 'blue' : ''}>
                            {SEITE_LABEL[v.seite]} {v.tage} {e}
                            {v.hand ? ' · von Hand' : ''}
                          </Badge>
                        ) : (
                          <Badge key={i} ton="gelb">
                            Seite fehlt {v.tage} {e}
                          </Badge>
                        ),
                      )}
                    </span>
                    {zuordenbar ? (
                      <button type="button" className="btn btn-sm" onClick={() => setZuordnen(a.schluessel)}>
                        Zuordnen …
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {nacharbeit.length > 0 ? (
        <div className="pl-nachweis-abschnitt">
          <h4>Ursache der Nacharbeit</h4>
          <p className="small muted" style={{ margin: 0 }}>
            Wer die Nacharbeit nach einer Entscheidung verursacht hat – ihr Verzug wird dieser Seite zugerechnet.
          </p>
          {nacharbeit.map((a) => (
            <div className="pl-posten-zeile" key={a.schluessel}>
              <div className="pl-posten-text">
                <strong>{ausfuehrungsName(a)}</strong>
                <span>
                  Antwort „{a.antwort ?? '–'}“{a.ist ? ` am ${formatDate(a.ist)}` : ''}
                </span>
              </div>
              <Select
                value={a.nacharbeitSeite ?? ''}
                onChange={(v) => nacharbeitSeiteSetzen(run.id, a.stepId, a.durchlauf, (v || null) as Seite | null)}
                placeholder="– nicht festgelegt –"
                options={SEITEN.map((s) => ({ value: s, label: SEITE_LABEL[s] }))}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="pl-nachweis-abschnitt">
        <h4>Basisplan</h4>
        {run.basis ? (
          <p className="small muted" style={{ margin: 0 }}>
            Festgelegt am {zeitpunktText(run.basis.festgelegtAm)} ({run.basis.grund || 'ohne Grund'}) · Beginn{' '}
            {formatDate(run.basis.anker)} · geplantes Ende {formatDate(run.basis.planEnde)} · Fristen in{' '}
            {run.basis.arbeitstage ? 'Arbeitstagen' : 'Kalendertagen'}
          </p>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Für diesen Planlauf ist noch kein Basisplan festgelegt.
          </p>
        )}
      </div>

      {offenZuordnen ? (
        <ZuordnenDialog
          run={run}
          a={offenZuordnen}
          kapazitaet={kapazitaet(nw, offenZuordnen.schluessel)}
          arbeitstage={nw.arbeitstage}
          vorbelegung={nw.verteilung.filter((v) => v.schluessel === offenZuordnen.schluessel && !v.hand)}
          onClose={() => setZuordnen(null)}
        />
      ) : null}
      {basis ? <BasisDialog run={run} onClose={() => setBasis(false)} /> : null}
    </Card>
  );
}

function PostenZeile({ p, arbeitstage }: { p: NachweisPosten; arbeitstage: boolean }) {
  const aufgefangen = p.art !== 'zeitgewinn' && p.gezaehlt < p.tage;
  // Nennt der Text die Art schon („Nacharbeit nach …“), entfällt die Vorsilbe
  const label = POSTEN_ART_LABEL[p.art];
  return (
    <span>
      {p.text.startsWith(label) ? p.text : `${label}: ${p.text}`} –{' '}
      {p.art === 'zeitgewinn' ? (
        <span className="pl-frueher">{tageText(p.tage, arbeitstage)} gewonnen</span>
      ) : aufgefangen && p.gezaehlt === 0 ? (
        <span className="pl-aufgefangen" title="durch Puffer aufgefangen bzw. nicht terminwirksam">
          {tageText(p.tage, arbeitstage)}
        </span>
      ) : (
        <b>{tageText(p.gezaehlt, arbeitstage)}</b>
      )}
      {aufgefangen && p.gezaehlt > 0 ? ` (von ${p.tage}, Rest durch Puffer aufgefangen)` : ''}
      {aufgefangen && p.gezaehlt === 0 ? ' (durch Puffer aufgefangen)' : ''}
      {p.seite && p.art !== 'zeitgewinn' ? ` · Vorgabe ${SEITE_LABEL[p.seite]}` : ''}
    </span>
  );
}

/* ------------------------------------------------------------------ */

/** Verzug einer Ausführung von Hand Seiten zuordnen – Tage je Seite mit Pflicht-Grund. */
function ZuordnenDialog({
  run,
  a,
  kapazitaet: max,
  arbeitstage,
  vorbelegung,
  onClose,
}: {
  run: PlanRun;
  a: NachweisAusfuehrung;
  kapazitaet: number;
  arbeitstage: boolean;
  vorbelegung: { seite: Seite | null; tage: number }[];
  onClose: () => void;
}) {
  const { verzugZuordnen } = useStore();
  const toast = useToast();
  const [werte, setWerte] = useState<Record<Seite, { tage: string; grund: string }>>(() => {
    const start = Object.fromEntries(SEITEN.map((s) => [s, { tage: '', grund: '' }])) as Record<
      Seite,
      { tage: string; grund: string }
    >;
    for (const z of a.verzugZuordnung) start[z.seite] = { tage: String(z.tage), grund: z.grund };
    return start;
  });
  const zahl = (s: Seite) => Number(werte[s].tage.replace(/\D/g, '')) || 0;
  const summe = SEITEN.reduce((n, s) => n + zahl(s), 0);
  const e = einheit(arbeitstage);

  const setze = (s: Seite, feld: 'tage' | 'grund', v: string) =>
    setWerte((alt) => ({ ...alt, [s]: { ...alt[s], [feld]: feld === 'tage' ? v.replace(/\D/g, '') : v } }));

  const speichern = () => {
    const fehlt = SEITEN.find((s) => zahl(s) > 0 && !werte[s].grund.trim());
    if (fehlt) {
      toast(`Bitte einen Grund für ${SEITE_LABEL[fehlt]} angeben.`);
      return;
    }
    verzugZuordnen(
      run.id,
      a.stepId,
      a.durchlauf,
      SEITEN.filter((s) => zahl(s) > 0).map((s) => ({ seite: s, tage: zahl(s), grund: werte[s].grund.trim() })),
    );
    toast('Zuordnung gespeichert.');
    onClose();
  };

  const aufheben = () => {
    verzugZuordnen(run.id, a.stepId, a.durchlauf, []);
    toast('Zuordnung von Hand aufgehoben – es gilt wieder die Vorbelegung.');
    onClose();
  };

  return (
    <Modal
      titel="Verzug zuordnen"
      sub={`${ausfuehrungsName(a)} · ${max} ${e} gezählter Verzug`}
      onClose={onClose}
      footer={
        <>
          {a.verzugZuordnung.length > 0 ? (
            <button type="button" className="btn" onClick={aufheben} style={{ marginRight: 'auto' }}>
              Zuordnung aufheben
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Speichern
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Vorbelegt:{' '}
          {vorbelegung.length === 0
            ? '–'
            : vorbelegung.map((v) => `${v.seite ? SEITE_LABEL[v.seite] : 'Seite fehlt'} ${v.tage} ${e}`).join(', ')}
          . Von Hand zugeordnete Tage ersetzen die Vorbelegung; der Rest bleibt bei ihr.
        </p>
        <div className="pl-zuordnen">
          <span className="pl-zuordnen-kopf">Seite</span>
          <span className="pl-zuordnen-kopf">Tage ({e})</span>
          <span className="pl-zuordnen-kopf pl-zuordnen-grund">Grund</span>
          {SEITEN.map((s) => (
            <ZuordnenZeile
              key={s}
              seite={s}
              tage={werte[s].tage}
              grund={werte[s].grund}
              onTage={(v) => setze(s, 'tage', v)}
              onGrund={(v) => setze(s, 'grund', v)}
            />
          ))}
        </div>
        {summe > max ? (
          <Callout ton="warn" icon="!">
            Zugeordnet sind {summe} {e}, gezählt werden aber nur {max} {e} – der Überschuss von {summe - max} {e}{' '}
            bleibt unberücksichtigt.
          </Callout>
        ) : summe > 0 && summe < max ? (
          <p className="small muted" style={{ margin: 0 }}>
            {max - summe} {e} bleiben bei der Vorbelegung.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function ZuordnenZeile({
  seite,
  tage,
  grund,
  onTage,
  onGrund,
}: {
  seite: Seite;
  tage: string;
  grund: string;
  onTage: (v: string) => void;
  onGrund: (v: string) => void;
}) {
  return (
    <>
      <span>
        <SeiteBadge seite={seite} />
      </span>
      <TextInput value={tage} onChange={onTage} inputMode="numeric" placeholder="0" aria-label={`Tage ${SEITE_LABEL[seite]}`} />
      <span className="pl-zuordnen-grund">
        <TextInput
          value={grund}
          onChange={onGrund}
          placeholder={tage ? 'Grund (Pflicht)' : 'Grund'}
          aria-label={`Grund ${SEITE_LABEL[seite]}`}
        />
      </span>
    </>
  );
}

/** Legt den Basisplan neu fest – nur mit Grund, protokolliert. */
function BasisDialog({ run, onClose }: { run: PlanRun; onClose: () => void }) {
  const { basisNeuFestlegen } = useStore();
  const toast = useToast();
  const [grund, setGrund] = useState('');
  return (
    <Modal
      titel="Basis neu festlegen"
      sub={run.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (!grund.trim()) {
                toast('Bitte einen Grund angeben.');
                return;
              }
              basisNeuFestlegen(run.id, grund);
              toast('Basisplan neu festgelegt.');
              onClose();
            }}
          >
            Neu festlegen
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <Callout ton="warn" icon="!">
          Der Basisplan ist der Maßstab des Terminnachweises: Beginn, Fristen aller Schritte und das daraus geplante
          Ende. Neu festgelegt gelten die heutigen Fristen und Termine als Plan – der bisherige Verzug gegenüber der
          alten Basis ist danach nicht mehr ausgewiesen. Der Vorgang wird mit Grund protokolliert.
        </Callout>
        {run.basis ? (
          <p className="small muted" style={{ margin: 0 }}>
            Bisher: festgelegt am {zeitpunktText(run.basis.festgelegtAm)} ({run.basis.grund || 'ohne Grund'}),
            geplantes Ende {formatDate(run.basis.planEnde)}.
          </p>
        ) : null}
        <Field label="Grund" full>
          <TextArea value={grund} onChange={setGrund} rows={3} placeholder="z.B. Terminplan mit dem Auftraggeber neu vereinbart" />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

const fett = (wert: string): Zelle => ({ wert, stil: { fett: true } });
const datum = (iso: string | null | undefined): Zelle => (iso ? { wert: iso, datum: true } : '');

/** Die Blätter des Terminnachweises: Ausführungen, Verzug je Seite, Erinnerungen, Protokoll. */
export function nachweisBlaetter(
  project: { name: string; nummer?: string },
  run: PlanRun,
  doc: PlanDocument | undefined,
  nw: Terminnachweis,
): Blatt[] {
  const e = einheit(nw.arbeitstage);
  const nameVon = (schluessel: string) => {
    const a = nw.ausfuehrungen.find((x) => x.schluessel === schluessel);
    return a ? [a.name, a.durchlauf] : ['', ''];
  };

  const ausfuehrungen: Blatt = {
    name: 'Ausführungen',
    fixierteZeilen: 1,
    querformat: true,
    zeilen: [
      [
        'Schritt',
        'Funktion',
        'Person',
        'Seite',
        'Durchlauf',
        'Art',
        'Zustand',
        'Eingang',
        'Eingang geschätzt',
        `Frist (${e})`,
        `Frist Basis (${e})`,
        'Soll',
        'Soll von Hand',
        'Ist bzw. voraussichtlich',
        `Dauer (${e})`,
        `Abweichung (${e})`,
        'Antwort',
        'Ursache der Nacharbeit',
        'Terminwirksam',
      ],
      ...nw.ausfuehrungen.map((a): Zelle[] => [
        a.name,
        a.roleName,
        a.kontaktName,
        a.seite ? SEITE_LABEL[a.seite] : 'Seite fehlt',
        a.durchlauf,
        AUSFUEHRUNGS_ART_LABEL[a.art],
        ZUSTAND_LABEL[a.zustand],
        datum(a.eingang),
        a.eingangGeschaetzt ? 'ja' : '',
        a.frist,
        a.basisFrist ?? 'nicht im Basisplan',
        datum(a.soll),
        a.sollManuell ? 'ja' : '',
        datum(a.ist),
        a.dauer ?? '',
        a.abweichung,
        a.antwort ?? '',
        a.nacharbeitSeite ? SEITE_LABEL[a.nacharbeitSeite] : '',
        a.terminwirksam ? 'ja' : 'nein',
      ]),
    ],
  };

  const verzug: Blatt = {
    name: 'Verzug je Seite',
    kopfzeileFett: false,
    zeilen: [
      [fett('Terminnachweis'), run.name],
      ['Projekt', [project.nummer, project.name].filter(Boolean).join(' · ')],
      ['Eintrag', doc ? [doc.nummer, doc.titel].filter(Boolean).join(' · ') : ''],
      ['Stand', datum(today())],
      ['Geplantes Ende (Basis)', datum(nw.basisEnde)],
      [nw.endeIstPrognose ? 'Ende voraussichtlich' : 'Ende', datum(nw.ende)],
      [`Gesamtverzug (${e})`, nw.gesamtverzug ?? ''],
      [],
      [fett('Seite'), fett(`Tage (${e})`)],
      ...SEITEN.map((s): Zelle[] => [SEITE_LABEL[s], nw.summen[s]]),
      ['Seite fehlt', nw.seiteFehlt],
      ['Zeitgewinn', nw.zeitgewinn ? -nw.zeitgewinn : 0],
      ['Nicht erklärt', nw.nichtErklaert ?? ''],
      [],
      [fett('Posten')],
      [fett('Schritt'), fett('Durchlauf'), fett('Art'), fett('Beschreibung'), fett(`Tage (${e})`), fett('davon gezählt'), fett('Seite (Vorgabe)'), fett('voraussichtlich')],
      ...nw.posten.map((p): Zelle[] => [
        ...nameVon(p.schluessel),
        POSTEN_ART_LABEL[p.art],
        p.text,
        p.art === 'zeitgewinn' ? -p.tage : p.tage,
        p.art === 'zeitgewinn' ? -p.gezaehlt : p.gezaehlt,
        p.seite ? SEITE_LABEL[p.seite] : p.art === 'zeitgewinn' ? '' : 'Seite fehlt',
        p.prognose ? 'ja' : '',
      ]),
      [],
      [fett('Zurechnung')],
      [fett('Schritt'), fett('Durchlauf'), fett('Seite'), fett(`Tage (${e})`), fett('von Hand'), fett('Grund')],
      ...nw.verteilung.map((v): Zelle[] => [
        ...nameVon(v.schluessel),
        v.seite ? SEITE_LABEL[v.seite] : 'Seite fehlt',
        v.tage,
        v.hand ? 'ja' : '',
        v.grund ?? '',
      ]),
      ...(nw.warnungen.length > 0 ? [[], [fett('Hinweise')], ...nw.warnungen.map((w): Zelle[] => [w])] : []),
    ],
  };

  const erinnerungen: Blatt = {
    name: 'Erinnerungen',
    fixierteZeilen: 1,
    zeilen: [
      ['Schritt', 'Durchlauf', 'Zeitpunkt', 'Person', 'An', 'Betreff', 'Anlass', 'Weg'],
      ...run.steps
        .flatMap((s) => (s.erinnerungen ?? []).map((er) => ({ s, er })))
        .sort((x, y) => x.er.zeitpunkt.localeCompare(y.er.zeitpunkt))
        .map(({ s, er }): Zelle[] => [
          s.name,
          er.durchlauf ?? '',
          zeitpunktText(er.zeitpunkt),
          er.kontaktName,
          er.an,
          er.betreff,
          er.anlass ? EMAIL_ANLASS_LABEL[er.anlass] : '',
          WEG_LABEL[er.weg] ?? er.weg,
        ]),
    ],
  };

  const protokoll: Blatt = {
    name: 'Protokoll',
    fixierteZeilen: 1,
    zeilen: [
      ['Zeitpunkt', 'Bearbeiter', 'Schritt', 'Eintrag'],
      ...(run.protokoll ?? []).map((p): Zelle[] => [
        zeitpunktText(p.zeitpunkt),
        p.bearbeiter,
        p.stepId ? (run.steps.find((s) => s.id === p.stepId)?.name ?? '') : '',
        p.text,
      ]),
    ],
  };

  return [ausfuehrungen, verzug, erinnerungen, protokoll];
}
