/**
 * Einstellungen des Bereichs: Fristen laut Richtlinie, Ampel, Nachhak-Termin
 * und Vorschau des Anmeldebedarfs. Änderungen gelten sofort.
 */
import { Fragment, useState } from 'react';
import { Badge, Callout, Card, CardHeader, Field, Select } from '../../../shared/ui';
import { rilFristText } from '../domain/fristen';
import {
  PHASE_LABEL,
  RIL_KUERZEL,
  RIL_LABEL,
  RIL_PHASE_HINWEIS,
  RIL_SCHLUESSEL,
  rilFristenNachPhase,
  type RilFrist,
} from '../domain/types';
import { useStore } from '../store/store';

/** Zahlenfeld, das erst gültige Werte übernimmt – so lässt es sich auch leeren und neu tippen. */
function ZahlFeld({
  wert,
  onChange,
  min,
  max,
  breite = 72,
  label,
}: {
  wert: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  breite?: number;
  label: string;
}) {
  const [text, setText] = useState(String(wert));
  const [vorher, setVorher] = useState(wert);
  // Ändert sich der Wert von außen, folgt das Feld
  if (wert !== vorher) {
    setVorher(wert);
    setText(String(wert));
  }
  return (
    <input
      className="input"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      aria-label={label}
      style={{ width: breite }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setText(String(wert))}
    />
  );
}

export function Einstellungen() {
  const { data, setEinstellungen, setRilFrist } = useStore();
  const e = data.einstellungen;
  const platzhalter = RIL_SCHLUESSEL.filter((s) => e.rilFristen[s].platzhalter).length;

  return (
    <div className="stack">
      <Card>
        <CardHeader
          titel="Fristen laut Richtlinie"
          sub="Grundlage der Terminfristen „Frist laut Richtlinie“ in den Workflows – gegliedert nach Phase"
        />
        {platzhalter > 0 ? (
          <div className="card-pad" style={{ paddingBottom: 0 }}>
            <Callout ton="warn" icon="!">
              {platzhalter === 1 ? 'Eine Frist ist' : `${platzhalter} Fristen sind`} noch Platzhalter aus dem Entwurf und
              nicht mit der Richtlinie abgeglichen. Mit einer Änderung – oder mit „Geprüft“ – gilt der Wert als bestätigt.
            </Callout>
          </div>
        ) : null}
        <div className="table-scroll">
          <table className="table table-stack">
            <thead>
              <tr>
                <th>Frist</th>
                <th>Berechnung</th>
                <th>Wert</th>
                <th>Ergebnis</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {rilFristenNachPhase().map(({ phase, schluessel }) => (
                <Fragment key={phase}>
                  <tr className="gruppe-zeile">
                    <td colSpan={5}>
                      <strong>{PHASE_LABEL[phase]}</strong>
                      <span className="small muted"> · {RIL_PHASE_HINWEIS[phase]}</span>
                    </td>
                  </tr>
                  {schluessel.map((s) => {
                    const f = e.rilFristen[s];
                    const setze = (patch: Partial<RilFrist>) => setRilFrist(s, patch);
                    return (
                      <tr key={s}>
                        <td title={RIL_LABEL[s]}>
                          <strong>{RIL_KUERZEL[s]}</strong>
                        </td>
                        <td>
                          <Select
                            value={f.bezug}
                            onChange={(v) => setze({ bezug: v as RilFrist['bezug'] })}
                            options={[
                              { value: 'stichtag', label: 'Stichtag im Fahrplanjahr' },
                              { value: 'baubeginn', label: 'Wochen vor Sperrbeginn' },
                            ]}
                          />
                        </td>
                        <td>
                          {f.bezug === 'stichtag' ? (
                            <span className="row wrap" style={{ gap: 6 }}>
                              <ZahlFeld label="Tag" wert={f.tag} min={1} max={31} breite={60} onChange={(n) => setze({ tag: n })} />
                              <span className="tertiary">.</span>
                              <ZahlFeld label="Monat" wert={f.monat} min={1} max={12} breite={60} onChange={(n) => setze({ monat: n })} />
                              <span className="small muted">. im Jahr N −</span>
                              <ZahlFeld
                                label="Jahre vor dem Fahrplanjahr"
                                wert={f.jahreVorher}
                                min={0}
                                max={10}
                                breite={60}
                                onChange={(n) => setze({ jahreVorher: n })}
                              />
                            </span>
                          ) : (
                            <span className="row" style={{ gap: 6 }}>
                              <ZahlFeld
                                label="Wochen vor Sperrbeginn"
                                wert={f.wochenVorher}
                                min={0}
                                max={260}
                                onChange={(n) => setze({ wochenVorher: n })}
                              />
                              <span className="small muted">Wochen</span>
                            </span>
                          )}
                        </td>
                        <td className="small muted">{rilFristText(f)}</td>
                        <td className="actions">
                          {f.platzhalter ? (
                            <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                              <Badge ton="orange">Platzhalter</Badge>
                              <button type="button" className="btn btn-sm btn-outline" onClick={() => setze({ platzhalter: false })}>
                                Geprüft
                              </button>
                            </span>
                          ) : (
                            <Badge ton="green">geprüft</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader titel="Ampel und Nachhaken" sub="Gilt für alle Projekte" />
        <div className="card-pad">
          <div className="form-grid">
            <Field label="Fällig ab (Tage vor der Terminfrist)" hint="Ab hier steht eine Anmeldung auf „Fällig“.">
              <ZahlFeld label="Tage" wert={e.vorlaufTage} min={0} max={365} onChange={(n) => setEinstellungen({ vorlaufTage: n })} />
            </Field>
            <Field
              label="Nachhak-Abstand – Vorgabe (Tage)"
              hint="Vorbelegung für neue Nachhak-Termine im Workflow-Editor und für den nächsten Termin unter „Nachgehakt …“. Der Abstand je Status steht im Workflow."
            >
              <ZahlFeld label="Tage" wert={e.nachhakTage} min={1} max={365} onChange={(n) => setEinstellungen({ nachhakTage: n })} />
            </Field>
            <Field
              label="Anmeldebedarf – Vorschau (Tage)"
              hint="So weit im Voraus erscheinen Fristen für SKM, MKM und KM ohne Eintrag in Übersicht und Terminen."
            >
              <ZahlFeld
                label="Tage"
                wert={e.bedarfVorschauTage}
                min={1}
                max={1095}
                onChange={(n) => setEinstellungen({ bedarfVorschauTage: n })}
              />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  );
}
