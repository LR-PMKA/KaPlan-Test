/**
 * Terminrechner – rechnet aus den Fristen eines Workflows rückwärts vom
 * Termin auf der Baustelle die späteste Übergabe des Planers bzw. vorwärts
 * vom Eingang der Planung das Ende des Planlaufs, jeweils mit allen
 * Zwischenergebnissen. Die Rechnung selbst steht in domain/terminrechner.ts
 * und läuft über die Simulation des Planlaufs; diese Seite schreibt nichts in
 * den Bestand.
 */
import { useMemo, useState } from 'react';
import { istArbeitstag, today } from '../../../shared/dates';
import { druckeHtml } from '../../../shared/print';
import { Icon } from '../../../shared/icons';
import { Badge, Callout, Card, CardHeader, EmptyState, Field, Segmented, Select, TextInput } from '../../../shared/ui';
import {
  ANKER_LABEL,
  DRUCK_STIL,
  einheit,
  endeLabel,
  entscheidungenVon,
  erreichteSchritte,
  fristText,
  hauptLabel,
  mitWochentag,
  tageText,
  terminBerechnen,
  terminDruckHtml,
  zweigKennung,
  type Richtung,
  type TerminZeile,
  type TerminrechnerEingabe,
  type TerminrechnerErgebnis,
} from '../domain/terminrechner';
import type { ID, ProcessTemplate, ProcessTemplateStep } from '../domain/types';
import { useStore } from '../store/store';
import '../components/terminrechner.css';

/** Feste leere Listen, damit die Berechnungen nicht bei jedem Zeichnen neu laufen. */
const KEINE_FEIERTAGE: string[] = [];
const KEINE_SCHRITTE: ProcessTemplateStep[] = [];

export function Terminrechner() {
  const { data } = useStore();
  const [projektId, setProjektId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [richtung, setRichtung] = useState<Richtung>('rueckwaerts');
  const [datum, setDatum] = useState('');
  const [arbeitstage, setArbeitstage] = useState(true);
  const [szenario, setSzenario] = useState<Record<ID, number>>({});
  const [zielStepId, setZielStepId] = useState('');

  const projekt = data.projects.find((p) => p.id === projektId);
  const feiertage = projekt?.settings.feiertage ?? KEINE_FEIERTAGE;
  const workflows = data.templates.filter((t) => t.projectId === null || (projekt && t.projectId === projekt.id));
  const template: ProcessTemplate | undefined = workflows.find((t) => t.id === templateId) ?? workflows[0];
  const steps = template?.steps ?? KEINE_SCHRITTE;
  const ziel = steps.find((s) => s.id === zielStepId) ?? null;
  const heute = today();

  const eingabe: TerminrechnerEingabe = useMemo(
    () => ({ steps, richtung, datum, arbeitstage, feiertage, szenario, zielStepId: ziel?.id ?? null, heute }),
    [steps, richtung, datum, arbeitstage, feiertage, szenario, ziel, heute],
  );
  const ergebnis = useMemo(() => terminBerechnen(eingabe), [eingabe]);
  const erreicht = useMemo(
    () => erreichteSchritte(steps, szenario, arbeitstage, feiertage),
    [steps, szenario, arbeitstage, feiertage],
  );
  const entscheidungen = entscheidungenVon(steps);
  const ankerArt = ergebnis.ankerArt;
  const abweichend = entscheidungen.filter((s) => (szenario[s.id] ?? 0) > 0);

  const projektWaehlen = (id: string) => {
    setProjektId(id);
    const p = data.projects.find((x) => x.id === id);
    setArbeitstage(p?.settings.fristenInArbeitstagen ?? true);
  };
  const workflowWaehlen = (id: string) => {
    setTemplateId(id);
    setSzenario({});
    setZielStepId('');
  };

  const zielName = ziel ? schrittBezeichnung(ziel, steps) : null;
  const datumLabel =
    richtung === 'rueckwaerts'
      ? ziel
        ? `Termin für „${zielName}“`
        : 'Termin auf der Baustelle'
      : ankerArt === 'uebergabe'
        ? 'Eingang der Planung (Übergabe)'
        : 'Start des Planlaufs';
  const hinweisRichtung =
    richtung === 'rueckwaerts'
      ? ankerArt === 'uebergabe'
        ? 'Termin auf der Baustelle → späteste Übergabe des Planers'
        : 'Termin auf der Baustelle → spätester Start des Planlaufs'
      : ankerArt === 'uebergabe'
        ? 'Eingang der Planung → Ende des Planlaufs'
        : 'Start des Planlaufs → Ende des Planlaufs';
  const keinArbeitstag = Boolean(datum) && arbeitstage && !istArbeitstag(datum, feiertage);

  const drucken = () => {
    if (!template) return;
    const html = terminDruckHtml(eingabe, ergebnis, {
      workflowName: template.name,
      projektName: projekt ? (projekt.nummer ? `${projekt.nummer} ${projekt.name}` : projekt.name) : null,
      zielName,
      szenario: abweichend
        .filter((s) => erreicht.has(s.id))
        .map((s) => `${schrittBezeichnung(s, steps)}: ${s.antworten[szenario[s.id]]?.text ?? ''}`),
    });
    druckeHtml(`Terminrechner – ${template.name}`, html, DRUCK_STIL);
  };

  return (
    <div className="stack">
      <p className="muted small" style={{ maxWidth: 760 }}>
        Der Terminrechner rechnet mit den Fristen eines Workflows – rückwärts vom Termin auf der Baustelle bis zur
        spätesten Übergabe durch den Planer oder vorwärts vom Eingang der Planung bis zum Ende des Planlaufs. Jede
        Frist zählt ab dem tatsächlichen Eingang – dem Abschluss des vorherigen Schritts; parallele Zweige laufen
        gleichzeitig.
      </p>

      <div className="tr-oben">
        <div className="stack">
          <Card>
            <CardHeader titel="Eingaben" />
            <div className="card-pad stack">
              <div className="form-grid">
                <Field label="Projekt" hint={projekt ? undefined : 'Ohne Projekt: Mo–Fr, ohne Feiertage'}>
                  <Select
                    value={projekt?.id ?? ''}
                    onChange={projektWaehlen}
                    placeholder="Ohne Projekt"
                    options={data.projects.map((p) => ({ value: p.id, label: p.nummer ? `${p.nummer} ${p.name}` : p.name }))}
                  />
                </Field>
                <Field label="Workflow">
                  <Select
                    value={template?.id ?? ''}
                    onChange={workflowWaehlen}
                    options={workflows.map((t) => ({
                      value: t.id,
                      label: t.projectId ? `${t.name} (Projektvariante)` : t.name,
                    }))}
                  />
                </Field>
              </div>

              <div className="field tr-richtung">
                <label>Richtung</label>
                <Segmented
                  value={richtung}
                  onChange={setRichtung}
                  options={[
                    { value: 'rueckwaerts', label: 'Rückwärts' },
                    { value: 'vorwaerts', label: 'Vorwärts' },
                  ]}
                />
                <span className="hint">{hinweisRichtung}</span>
              </div>

              <div className="form-grid">
                <Field
                  label={datumLabel}
                  hint={
                    keinArbeitstag
                      ? richtung === 'rueckwaerts'
                        ? 'Kein Arbeitstag – gerechnet bis zum Arbeitstag davor.'
                        : 'Das Datum ist kein Arbeitstag.'
                      : undefined
                  }
                >
                  <TextInput type="date" value={datum} onChange={setDatum} aria-label={datumLabel} />
                </Field>
                <Field label="Zielschritt" hint={ziel ? 'Maßgeblich ist sein letzter Abschluss.' : undefined}>
                  <Select
                    value={ziel?.id ?? ''}
                    onChange={setZielStepId}
                    placeholder="Ende des Planlaufs"
                    options={steps.map((s) => ({ value: s.id, label: schrittBezeichnung(s, steps) }))}
                  />
                </Field>
              </div>

              <div className="field">
                <label className="checkbox">
                  <input type="checkbox" checked={arbeitstage} onChange={(e) => setArbeitstage(e.target.checked)} />
                  Fristen in Arbeitstagen
                </label>
                <span className="hint">
                  {arbeitstage
                    ? feiertage.length > 0
                      ? `Mo–Fr; ${feiertage.length} Feiertag${feiertage.length === 1 ? '' : 'e'} des Projekts werden übersprungen.`
                      : 'Mo–Fr, ohne Feiertage.'
                    : 'Fristen in Kalendertagen.'}
                </span>
              </div>
            </div>
          </Card>

          {entscheidungen.length > 0 ? (
            <Card>
              <CardHeader
                titel="Szenario"
                sub="Antwort je Entscheidung im ersten Durchlauf; Vorgabe ist der Standardverlauf."
                actions={
                  abweichend.length > 0 ? (
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setSzenario({})}>
                      Standardverlauf
                    </button>
                  ) : null
                }
              />
              <div className="tr-szenario">
                {entscheidungen.map((s) => {
                  const nichtErreicht = !erreicht.has(s.id);
                  return (
                    <div key={s.id} className={`tr-szenario-zeile ${nichtErreicht ? 'tr-nicht-erreicht' : ''}`}>
                      <div className="tr-szenario-name">
                        <strong>{s.name}</strong>
                        <span className="small muted">
                          {s.roleName}
                          {nichtErreicht ? ' · im gewählten Verlauf nicht erreicht' : ''}
                        </span>
                      </div>
                      <Select
                        value={String(szenario[s.id] ?? 0)}
                        onChange={(v) => setSzenario((alt) => ({ ...alt, [s.id]: Number(v) }))}
                        options={s.antworten.map((a, i) => ({
                          value: String(i),
                          label: i === 0 ? `${a.text} (Standardverlauf)` : a.text,
                        }))}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>

        <Card className="tr-ergebnis">
          <CardHeader
            titel="Ergebnis"
            sub={template ? `${template.name} · ${richtung === 'rueckwaerts' ? 'rückwärts' : 'vorwärts'} gerechnet` : undefined}
            actions={
              ergebnis.zustand === 'ok' ? (
                <button type="button" className="btn btn-sm btn-outline" onClick={drucken}>
                  <Icon name="export" size={12} /> Drucken
                </button>
              ) : null
            }
          />
          <div className="card-pad">
            <ErgebnisInhalt
              ergebnis={ergebnis}
              template={template}
              arbeitstage={arbeitstage}
              datum={datum}
              zielName={zielName}
            />
          </div>
        </Card>
      </div>

      {ergebnis.zustand === 'ok' ? (
        <Card>
          <CardHeader
            titel="Zwischenergebnisse"
            sub={
              richtung === 'rueckwaerts'
                ? 'In Abschlussreihenfolge; „spätestens“ auf dem kritischen Weg, übrige Schritte mit Puffer.'
                : 'In Abschlussreihenfolge; Puffer bis zum Ende ohne Verschiebung.'
            }
          />
          <ZwischenTabelle zeilen={ergebnis.zeilen} richtung={richtung} arbeitstage={arbeitstage} />
        </Card>
      ) : null}
    </div>
  );
}

/** Name eines Schritts; bei gleichnamigen Schritten mit der Funktion ergänzt. */
function schrittBezeichnung(s: ProcessTemplateStep, steps: ProcessTemplateStep[]): string {
  const doppelt = steps.some((x) => x.id !== s.id && x.name === s.name);
  return doppelt ? `${s.name} – ${s.roleName}` : s.name;
}

function ErgebnisInhalt({
  ergebnis,
  template,
  arbeitstage,
  datum,
  zielName,
}: {
  ergebnis: TerminrechnerErgebnis;
  template: ProcessTemplate | undefined;
  arbeitstage: boolean;
  datum: string;
  zielName: string | null;
}) {
  if (!template) {
    return <EmptyState icon="kette" titel="Kein Workflow vorhanden" text="Legen Sie unter „Workflows“ einen Workflow an." />;
  }
  switch (ergebnis.zustand) {
    case 'leer':
      return (
        <EmptyState icon="kette" titel="Der Workflow enthält keine Schritte" text="Ergänzen Sie die Schritte im Workflow-Editor." />
      );
    case 'kein_datum':
      return (
        <EmptyState
          icon="kalender"
          titel="Noch kein Datum"
          text={
            ergebnis.richtung === 'rueckwaerts'
              ? 'Geben Sie den Termin auf der Baustelle ein.'
              : 'Geben Sie den Eingang der Planung ein.'
          }
        />
      );
    case 'ungueltig':
      return <Callout ton="warn" icon="!">Das Datum ist ungültig.</Callout>;
    case 'schleife':
      return (
        <Callout ton="error" icon="!">
          Der Ablauf endet in diesem Szenario in einer Schleife – Terminrechnung nicht möglich. Wählen Sie für die
          Entscheidungen andere Antworten oder prüfen Sie den Workflow.
        </Callout>
      );
    case 'grenze':
      return (
        <Callout ton="error" icon="!">
          Der Ablauf kommt auch nach 500 Abschlüssen nicht zum Ende – Terminrechnung abgebrochen.
        </Callout>
      );
    case 'ziel':
      return (
        <Callout ton="warn" icon="!">
          „{zielName}“ wird im gewählten Szenario nicht erreicht. Wählen Sie einen anderen Zielschritt oder ein anderes
          Szenario.
        </Callout>
      );
    default:
      break;
  }

  const r = ergebnis;
  const rueck = r.richtung === 'rueckwaerts';
  const haupt = rueck ? r.anker : r.ende;
  const zeilen: [string, string][] = [];
  if (rueck) {
    zeilen.push([zielName ? `Termin für „${zielName}“` : 'Termin auf der Baustelle', mitWochentag(datum)]);
    if (r.planerstellung) {
      zeilen.push([
        `Beginn der Planerstellung bei ${fristText(r.planerstellung.frist, arbeitstage)} Frist`,
        mitWochentag(r.planerstellung.beginn),
      ]);
    }
    // Weicht nur ab, wenn der Termin kein Arbeitstag ist
    if (r.ende !== datum) zeilen.push([endeLabel(zielName), mitWochentag(r.ende)]);
  } else {
    zeilen.push([ANKER_LABEL[r.ankerArt], mitWochentag(r.anker)]);
    if (r.planerstellung) {
      zeilen.push([
        `Beginn der Planerstellung bei ${fristText(r.planerstellung.frist, arbeitstage)} Frist`,
        mitWochentag(r.planerstellung.beginn),
      ]);
    }
  }
  if (r.dauer) {
    const at = tageText(r.dauer.arbeitstage, true);
    const kt = tageText(r.dauer.kalendertage, false);
    zeilen.push([
      r.ankerArt === 'uebergabe' ? 'Dauer ab der Übergabe' : 'Dauer ab dem Start',
      arbeitstage ? `${at} · ${kt}` : `${kt} · ${at}`,
    ]);
  }

  return (
    <div className="stack">
      <div className="tr-haupt">
        <div className="tr-haupt-label">{hauptLabel(r, zielName)}</div>
        <div className="tr-haupt-datum">{mitWochentag(haupt)}</div>
      </div>
      {r.vergangenheit ? (
        <Callout ton="warn" icon="!">
          Die {ANKER_LABEL[r.ankerArt]} läge vor heute – der Termin ist mit diesen Fristen nicht mehr zu halten.{' '}
          Frühestes Ende bei {r.ankerArt === 'uebergabe' ? 'Übergabe' : 'Start'} heute
          {r.vergangenheit.anker !== today() ? ` (${mitWochentag(r.vergangenheit.anker)})` : ''}:{' '}
          <strong>{mitWochentag(r.vergangenheit.fruehestesEnde)}</strong>
        </Callout>
      ) : null}
      {r.datumVorHeute ? (
        <Callout>Das eingegebene Datum liegt vor heute – gerechnet wird trotzdem ab diesem Tag.</Callout>
      ) : null}
      <dl className="tr-kennzahlen">
        {zeilen.map(([label, wert]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{wert}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ZwischenTabelle({
  zeilen,
  richtung,
  arbeitstage,
}: {
  zeilen: TerminZeile[];
  richtung: Richtung;
  arbeitstage: boolean;
}) {
  const ein = einheit(arbeitstage);
  return (
    <div className="table-scroll">
      <table className="table table-stack tr-tabelle">
        <thead>
          <tr>
            <th className="tr-nr">Nr.</th>
            <th>Schritt</th>
            <th>Funktion</th>
            <th>Frist</th>
            <th>Eingang</th>
            <th>Fristende</th>
            <th>Puffer</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr
              key={z.nr}
              className={[z.zweig ? 'tr-zweig' : '', z.kritisch ? 'tr-kritisch' : '', z.ohneBelang ? 'tr-ohne-belang' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <td className="tr-nr num">{z.nr}</td>
              <td className="tr-schritt">
                <div className="tr-schritt-inhalt">
                  <strong>{z.name}</strong>
                  <span className="tr-schritt-zusatz">
                    {z.zweig ? <span className="small muted">{zweigKennung(z)}</span> : null}
                    {z.durchlauf > 1 ? <Badge ton="purple">{z.durchlauf}. Durchlauf</Badge> : null}
                    {z.antwort ? <span className="small muted">Antwort: {z.antwort}</span> : null}
                  </span>
                </div>
              </td>
              <td className="tr-funktion" data-label="Funktion">
                {z.roleName || '–'}
              </td>
              <td className="num" data-label="Frist">
                {z.frist} {ein}
              </td>
              <td className="tr-datum" data-label="Eingang">
                {mitWochentag(z.eingang)}
                {z.eingangPlanerstellung ? <div className="small tertiary">Beginn der Planerstellung</div> : null}
              </td>
              <td className="tr-datum" data-label="Fristende">
                {richtung === 'rueckwaerts' && z.kritisch ? <div className="tr-spaetestens">spätestens</div> : null}
                {mitWochentag(z.fristende)}
              </td>
              <td className="tr-datum" data-label="Puffer">
                {z.ohneBelang ? (
                  <span className="tertiary">{z.ohneBelang === 'nach_ziel' ? 'nach dem Zielschritt' : 'ohne Einfluss'}</span>
                ) : z.kritisch ? (
                  <span className="tr-kritisch-text">kritischer Weg</span>
                ) : (
                  <>
                    {z.puffer} {ein}
                    <div className="small tertiary">bis {mitWochentag(z.spaetestens)}</div>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
