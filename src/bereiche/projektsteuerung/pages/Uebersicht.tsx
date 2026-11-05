/**
 * Startseite des Bereichs: Kennzahlen, die offenen Aufgaben der Protokolle
 * nach Dringlichkeit und die Projekte mit ihren Besprechungen.
 * Angezeigt werden die markierten Projekte; ohne Markierung alle.
 */
import { useState } from 'react';
import { formatDate, relativeLabel, today } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Card, CardHeader, EmptyState, Segmented, Stat } from '../../../shared/ui';
import { AmpelBadge, AmpelPunkt } from '../components/common';
import { reihenVon } from '../domain/protokoll';
import { offenePunkte, type Punkt } from '../domain/punkte';
import type { Projekt } from '../domain/types';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';

/** Markierte Projekte; ohne Markierung alle. */
export function sichtbareProjekte(projekte: Projekt[]): Projekt[] {
  const markiert = projekte.filter((p) => p.markiert);
  return markiert.length > 0 ? markiert : projekte;
}

/** So viele Punkte zeigt die Übersicht zunächst. */
const ANZAHL_PUNKTE = 10;

type Filter = 'alle' | 'ueberfaellig' | 'faellig';

/** Ziel eines Punkts: das Protokoll der Aufgabe. */
export function punktZiel(p: Punkt): Route {
  return { view: 'protokoll', projektId: p.projekt.id, protokollId: p.protokollId };
}

export function Uebersicht({ navigate }: { navigate: (r: Route) => void }) {
  const { data, punktErledigen } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('alle');
  const [alle, setAlle] = useState(false);

  const projekte = sichtbareProjekte(data.projekte);
  const ids = projekte.map((p) => p.id);
  const offen = offenePunkte(data, ids);
  const ueberfaellig = offen.filter((p) => p.ampel === 'ueberfaellig');
  const faellig = offen.filter((p) => p.ampel === 'faellig');
  const gefiltert = filter === 'ueberfaellig' ? ueberfaellig : filter === 'faellig' ? faellig : offen;
  const sichtbar = alle ? gefiltert : gefiltert.slice(0, ANZAHL_PUNKTE);
  const alleMarkiert = data.projekte.filter((p) => p.markiert).length;
  const heute = today();

  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat
          wert={projekte.filter((p) => p.status === 'aktiv').length}
          label="Aktive Projekte"
          onClick={() => navigate({ view: 'projekte' })}
        />
        <Stat wert={offen.length} label="Offene Punkte" ton="blue" onClick={() => setFilter('alle')} />
        <Stat
          wert={ueberfaellig.length}
          label="Überfällig"
          ton={ueberfaellig.length ? 'red' : 'green'}
          onClick={() => setFilter('ueberfaellig')}
        />
        <Stat
          wert={faellig.length}
          label="Demnächst fällig"
          ton={faellig.length ? 'orange' : ''}
          onClick={() => setFilter('faellig')}
        />
      </div>

      {alleMarkiert === 0 ? (
        <p className="small tertiary">
          Kein Projekt markiert – es werden alle angezeigt. Unter <strong>Projekte</strong> lassen sich einzelne
          markieren; dann erscheinen nur diese hier und in der Seitenleiste.
        </p>
      ) : null}

      <Card>
        <CardHeader
          titel="Offene Punkte"
          sub="Aufgaben aus den Protokollen – Überfälliges zuerst"
          actions={
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'alle', label: `Alle (${offen.length})` },
                { value: 'ueberfaellig', label: `Überfällig (${ueberfaellig.length})` },
                { value: 'faellig', label: `Fällig (${faellig.length})` },
              ]}
            />
          }
        />
        {gefiltert.length === 0 ? (
          <EmptyState icon="check" titel="Nichts offen" text="Für diese Auswahl gibt es keine offenen Punkte." />
        ) : (
          <div className="table-scroll">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th className="col-optional" style={{ width: 22 }} />
                  <th>Punkt</th>
                  <th>Verantwortlich</th>
                  <th className="col-optional">Projekt</th>
                  <th>Termin</th>
                  <th>Status</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((p) => (
                  <tr key={p.schluessel} className="clickable" onClick={() => navigate(punktZiel(p))}>
                    <td className="col-optional">
                      <AmpelPunkt ampel={p.ampel} />
                    </td>
                    <td style={{ maxWidth: 460 }}>
                      <div className="ps-zweizeilig">{p.text || <span className="tertiary">ohne Text</span>}</div>
                      <div className="small tertiary">{p.fundstelle}</div>
                    </td>
                    <td className="small">{p.wer || <span className="tertiary">–</span>}</td>
                    <td className="small muted col-optional">
                      {p.projekt.nummer} {p.projekt.name}
                    </td>
                    <td className="small">
                      {p.termin ? formatDate(p.termin) : <span className="tertiary">ohne Termin</span>}
                      {p.termin ? <div className="tertiary small">{relativeLabel(p.termin)}</div> : null}
                    </td>
                    <td>
                      <AmpelBadge ampel={p.ampel} />
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline btn-haken"
                        title="Als erledigt markieren"
                        onClick={(e) => {
                          e.stopPropagation();
                          punktErledigen(p, true);
                          toast(`${p.fundstelle} als erledigt markiert.`);
                        }}
                      >
                        <Icon name="check" size={13} /> Erledigt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {gefiltert.length > ANZAHL_PUNKTE ? (
          <div className="card-pad" style={{ paddingTop: 10, paddingBottom: 10 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlle((a) => !a)}>
              {alle ? 'Weniger anzeigen' : `Alle ${gefiltert.length} anzeigen`}
            </button>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader titel="Projekte" sub="Beteiligte, Besprechungen und offene Punkte je Projekt" />
        {projekte.length === 0 ? (
          <EmptyState icon="projekt" titel="Kein Projekt" text="Legen Sie unter „Projekte“ ein Projekt an." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th className="zahl col-optional">Beteiligte</th>
                  <th className="zahl col-optional">Protokolle</th>
                  <th className="col-optional">Letzte Besprechung</th>
                  <th>Nächster Termin</th>
                  <th className="zahl">Offene Punkte</th>
                  <th className="zahl">Überfällig</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {projekte.map((projekt) => {
                  const protokolle = data.protokolle.filter((x) => x.projektId === projekt.id);
                  const vergangen = protokolle.filter((x) => x.datum <= heute).sort((a, b) => b.datum.localeCompare(a.datum));
                  // Nächster Termin: das nächste angesetzte Protokoll oder der „Nächste Termin“ der Reihen
                  const kuenftig = [
                    ...protokolle.filter((x) => x.datum > heute).map((x) => x.datum),
                    ...reihenVon(protokolle)
                      .map((r) => r.letztes.naechster)
                      .filter((d) => d && d >= heute),
                  ].sort();
                  const letzte = vergangen[0];
                  const punkte = offen.filter((x) => x.projekt.id === projekt.id);
                  const spaet = punkte.filter((x) => x.ampel === 'ueberfaellig').length;
                  const beteiligte = data.beteiligte.filter((b) => b.projektId === projekt.id).length;
                  return (
                    <tr
                      key={projekt.id}
                      className="clickable"
                      onClick={() => navigate({ view: 'projekt', projektId: projekt.id, tab: 'beteiligte' })}
                    >
                      <td>
                        <span className="num tertiary">{projekt.nummer}</span>
                        <div>
                          <strong>{projekt.name}</strong>
                        </div>
                      </td>
                      <td className={`zahl col-optional ${beteiligte ? '' : 'leer'}`}>{beteiligte}</td>
                      <td className={`zahl col-optional ${protokolle.length ? '' : 'leer'}`}>{protokolle.length}</td>
                      <td className="small col-optional">
                        {letzte ? (
                          <>
                            {formatDate(letzte.datum)}
                            <div className="tertiary small">
                              {letzte.art} Nr. {letzte.nr}
                            </div>
                          </>
                        ) : (
                          <span className="tertiary">–</span>
                        )}
                      </td>
                      <td className="small">{kuenftig[0] ? formatDate(kuenftig[0]) : <span className="tertiary">–</span>}</td>
                      <td className={`zahl ${punkte.length ? '' : 'leer'}`}>{punkte.length}</td>
                      <td className={`zahl ${spaet ? '' : 'leer'}`} style={{ color: spaet ? 'var(--red)' : undefined }}>
                        {spaet}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({ view: 'projekt', projektId: projekt.id, tab: 'protokolle' });
                          }}
                        >
                          Protokolle <Icon name="chevron" size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
