/**
 * Termine & Nachhaken: alle Anmeldungen mit Terminfrist über alle Projekte,
 * gefiltert nach Dringlichkeit – je Projekt zuerst eine ausstehende
 * Erstanmeldung –, dazu der Anmeldebedarf aus den Projekten.
 */
import { Fragment, useMemo, useState } from 'react';
import { formatDate, relativeLabel } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { Badge, Card, CardHeader, EmptyState, Search, Segmented } from '../../../shared/ui';
import { AmpelPunkt, NachfolgerAuswahl, NachhakenBadge, StatusBadge, TerminZelle } from '../components/common';
import { StatusWechselDialog } from '../components/StatusWechselDialog';
import { NachhakenDialog } from '../components/TerminDialoge';
import { ERSTANMELDUNG_GRUND, ausstehendeErstanmeldungen, faelligerBedarf, offeneTermine } from '../domain/fristen';
import { ERSTE_PHASE_LABEL, RIL_LABEL, type Anmeldung, type StatusZiel } from '../domain/types';
import { anmeldungTitel } from '../domain/workflow';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';

type Filter = 'alle' | 'ueberfaellig' | 'faellig' | 'geplant' | 'nachhaken';

export function Termine({ navigate }: { navigate: (r: Route) => void }) {
  const { data } = useStore();
  const [filter, setFilter] = useState<Filter>('alle');
  const [suche, setSuche] = useState('');
  const [wechsel, setWechsel] = useState<{ anmeldung: Anmeldung; nach: StatusZiel } | null>(null);
  const [nachhaken, setNachhaken] = useState<Anmeldung | null>(null);

  const alle = useMemo(() => offeneTermine(data), [data]);
  const erst = useMemo(() => ausstehendeErstanmeldungen(data), [data]);
  const bedarf = useMemo(() => faelligerBedarf(data), [data]);
  const zaehler = (f: Filter) =>
    alle.filter((t) => passt(f, t.ampel, t.frist.nachhaken)).length + erst.filter((e) => passt(f, e.ampel, false)).length;
  const sucheTrifft = (felder: string[]) =>
    !suche.trim() || felder.join(' ').toLowerCase().includes(suche.toLowerCase());
  const erstanmeldungen = erst.filter(
    (e) =>
      passt(filter, e.ampel, false) &&
      sucheTrifft(['Erstanmeldung ausstehend', e.projekt.name, e.projekt.dbGNummer, ERSTE_PHASE_LABEL[e.projekt.erstePhase]]),
  );

  const eintraege = alle.filter((t) => {
    if (!passt(filter, t.ampel, t.frist.nachhaken)) return false;
    if (!suche.trim()) return true;
    return [
      t.anmeldung.vorhaben,
      t.anmeldung.anmeldeId,
      t.anmeldung.bfStrecke,
      t.anmeldung.gewerk,
      t.anmeldung.art,
      t.status.workflow.name,
      t.status.status.name,
      t.projekt.name,
      t.projekt.dbGNummer,
    ]
      .join(' ')
      .toLowerCase()
      .includes(suche.toLowerCase());
  });

  const projekte = [
    ...new Map([...erstanmeldungen, ...eintraege].map((t) => [t.projekt.id, t.projekt])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return (
    <div className="stack">
      <div className="row-between wrap">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'alle', label: `Alle (${alle.length + erst.length})` },
            { value: 'ueberfaellig', label: `Überfällig (${zaehler('ueberfaellig')})` },
            { value: 'faellig', label: `Fällig (${zaehler('faellig')})` },
            { value: 'geplant', label: `Im Plan (${zaehler('geplant')})` },
            { value: 'nachhaken', label: `Zum Nachhaken (${zaehler('nachhaken')})` },
          ]}
        />
        <Search value={suche} onChange={setSuche} placeholder="ID, Status, Projekt …" />
      </div>

      <Card>
        <CardHeader
          titel="Terminfristen der Anmeldungen"
          sub="Frist im aktuellen Status laut Workflow – berechnet nach Richtlinie, Stichtag oder Nachhak-Termin"
        />
        {eintraege.length + erstanmeldungen.length === 0 ? (
          <EmptyState icon="check" titel="Nichts offen" text="Für diese Auswahl gibt es keine Terminfrist." />
        ) : (
          <div className="table-scroll">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th className="col-optional" style={{ width: 22 }} />
                  <th>Anmeldung</th>
                  <th>Status</th>
                  <th>Terminfrist</th>
                  <th className="actions">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {projekte.map((projekt) => {
                  const zeilen = eintraege.filter((t) => t.projekt.id === projekt.id);
                  const e = erstanmeldungen.find((x) => x.projekt.id === projekt.id);
                  const anzahl = zeilen.length + (e ? 1 : 0);
                  return (
                    <Fragment key={projekt.id}>
                      <tr className="gruppe-zeile">
                        <td colSpan={5}>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => navigate({ view: 'projekt', projektId: projekt.id })}
                          >
                            <span className="num tertiary">{projekt.dbGNummer}</span> <strong>{projekt.name}</strong>
                          </button>
                          <span className="small tertiary">
                            {' '}
                            · {anzahl} {anzahl === 1 ? 'Termin' : 'Termine'}
                          </span>
                        </td>
                      </tr>
                      {e ? (
                        <tr>
                          <td className="col-optional">
                            <AmpelPunkt ampel={e.ampel} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => navigate({ view: 'projekt', projektId: projekt.id })}
                            >
                              <strong>Erstanmeldung ausstehend</strong>
                            </button>
                            <div className="small tertiary">
                              {ERSTE_PHASE_LABEL[projekt.erstePhase]} · noch keine Anmeldung im Projekt
                            </div>
                          </td>
                          <td>
                            <Badge ton="orange">Ausstehend</Badge>
                          </td>
                          <td>
                            {e.frist ? (
                              <span className="small">
                                <b>{formatDate(e.frist)}</b>
                                <div className="tertiary small">{relativeLabel(e.frist)}</div>
                                <div className="tertiary small">{ERSTANMELDUNG_GRUND[e.grund]}</div>
                              </span>
                            ) : (
                              <span className="small tertiary">kein erster Anmeldetermin</span>
                            )}
                          </td>
                          <td className="actions">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => navigate({ view: 'projekt', projektId: projekt.id })}
                            >
                              Zum Projekt
                            </button>
                          </td>
                        </tr>
                      ) : null}
                      {zeilen.map((t) => (
                        <tr key={t.anmeldung.id}>
                          <td className="col-optional">
                            <AmpelPunkt ampel={t.ampel} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() =>
                                navigate({ view: 'anmeldung', projektId: projekt.id, anmeldungId: t.anmeldung.id })
                              }
                            >
                              <strong>{anmeldungTitel(t.anmeldung)}</strong>
                            </button>
                            <div className="small tertiary">
                              {[t.anmeldung.art, t.anmeldung.bfStrecke, t.anmeldung.gewerk].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td>
                            <StatusBadge statusId={t.anmeldung.statusId} />
                            {t.frist.nachhaken ? (
                              <div style={{ marginTop: 4 }}>
                                <NachhakenBadge />
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <TerminZelle frist={t.frist} />
                          </td>
                          <td className="actions">
                            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                              {t.frist.nachhaken ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline"
                                  onClick={() => setNachhaken(t.anmeldung)}
                                  title="Festhalten, dass nachgehakt wurde"
                                >
                                  <Icon name="glocke" size={13} /> Nachgehakt
                                </button>
                              ) : null}
                              <NachfolgerAuswahl
                                statusId={t.anmeldung.statusId}
                                onWaehle={(nach) => setWechsel({ anmeldung: t.anmeldung, nach })}
                              />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          titel="Anmeldebedarf aus den Projekten"
          sub={`Fristen laut Richtlinie für SKM, MKM und KM in den nächsten ${data.einstellungen.bedarfVorschauTage} Tagen ohne Eintrag`}
        />
        {bedarf.length === 0 ? (
          <EmptyState icon="check" titel="Kein Anmeldebedarf" text="In der Vorschau steht keine Anmeldung ohne Eintrag an." />
        ) : (
          bedarf.map(({ projekt, zelle }) => (
            <div
              key={`${projekt.id}-${zelle.fahrplanjahr}-${zelle.phase}`}
              className="list-row clickable"
              onClick={() => navigate({ view: 'projekt', projektId: projekt.id })}
            >
              <Icon name="kalender" size={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  {RIL_LABEL[zelle.phase]} für Fahrplanjahr {zelle.fahrplanjahr}
                </strong>
                <div className="small tertiary">{projekt.name}</div>
              </div>
              <span className="small">
                bis <b>{formatDate(zelle.frist)}</b>
                <div className="tertiary small">{relativeLabel(zelle.frist)}</div>
              </span>
            </div>
          ))
        )}
      </Card>

      {wechsel ? (
        <StatusWechselDialog anmeldung={wechsel.anmeldung} nach={wechsel.nach} onClose={() => setWechsel(null)} />
      ) : null}
      {nachhaken ? <NachhakenDialog anmeldung={nachhaken} onClose={() => setNachhaken(null)} /> : null}
    </div>
  );
}

function passt(filter: Filter, ampel: string, nachhaken: boolean): boolean {
  if (filter === 'alle') return true;
  if (filter === 'nachhaken') return nachhaken;
  return ampel === filter;
}
