/**
 * Startseite des Bereichs: Kennzahlen, anstehende Terminfristen (samt
 * ausstehender Erstanmeldungen), Anmeldebedarf aus den Projekten und die
 * Projekte mit ihren Anmeldungen je Workflow. Angezeigt werden die markierten
 * Projekte.
 */
import { useState } from 'react';
import { formatDate, relativeLabel } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { Badge, Card, CardHeader, EmptyState, Stat } from '../../../shared/ui';
import { AmpelPunkt, NachfolgerAuswahl, StatusBadge, TerminZelle } from '../components/common';
import { StatusWechselDialog } from '../components/StatusWechselDialog';
import {
  AMPEL_RANG,
  ERSTANMELDUNG_GRUND,
  ausstehendeErstanmeldungen,
  faelligerBedarf,
  offeneTermine,
  type ErstanmeldungEintrag,
  type TerminEintrag,
} from '../domain/fristen';
import { ERSTE_PHASE_LABEL, RIL_LABEL, type Anmeldung, type Projekt, type StatusZiel } from '../domain/types';
import { anmeldungTitel, statusVon } from '../domain/workflow';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';

/** Markierte Projekte; ohne Markierung alle. */
export function sichtbareProjekte(projekte: Projekt[]): Projekt[] {
  const markiert = projekte.filter((p) => p.markiert);
  return markiert.length > 0 ? markiert : projekte;
}

/** Zeile der anstehenden Terminfristen: eine Anmeldung oder eine ausstehende Erstanmeldung. */
type FristZeile = { t: TerminEintrag; e?: undefined } | { e: ErstanmeldungEintrag; t?: undefined };
const ampelVon = (z: FristZeile) => (z.t ? z.t.ampel : z.e.ampel);
const datumVon = (z: FristZeile) => (z.t ? z.t.frist.datum : z.e.frist) ?? '';

/** So viele Terminfristen zeigt die Übersicht; alle stehen unter „Termine“. */
const ANZAHL_TERMINE = 8;

export function Uebersicht({ navigate }: { navigate: (r: Route) => void }) {
  const { data } = useStore();
  const [wechsel, setWechsel] = useState<{ anmeldung: Anmeldung; nach: StatusZiel } | null>(null);
  const projekte = sichtbareProjekte(data.projekte);
  const ids = projekte.map((p) => p.id);
  const anmeldungen = data.anmeldungen.filter((a) => ids.includes(a.projektId));
  const termine = offeneTermine(data, ids);
  const erst = ausstehendeErstanmeldungen(data, ids);
  // Terminfristen der Anmeldungen und ausstehende Erstanmeldungen, nach Dringlichkeit
  const fristen: FristZeile[] = [
    ...termine.map((t): FristZeile => ({ t })),
    ...erst.map((e): FristZeile => ({ e })),
  ].sort((a, b) => AMPEL_RANG[ampelVon(a)] - AMPEL_RANG[ampelVon(b)] || datumVon(a).localeCompare(datumVon(b)));
  const ueberfaellig = [...termine, ...erst].filter((t) => t.ampel === 'ueberfaellig');
  const faellig = [...termine, ...erst].filter((t) => t.ampel === 'faellig');
  const nachhaken = termine.filter((t) => t.frist.nachhaken && t.ampel !== 'geplant');
  const bedarf = faelligerBedarf(data, ids);
  const vorn = fristen.slice(0, ANZAHL_TERMINE);
  const alleMarkiert = data.projekte.filter((p) => p.markiert).length;

  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat wert={anmeldungen.length} label="Anmeldungen" onClick={() => navigate({ view: 'projekte' })} />
        <Stat
          wert={ueberfaellig.length}
          label="Terminfristen überfällig"
          ton={ueberfaellig.length ? 'red' : 'green'}
          onClick={() => navigate({ view: 'termine' })}
        />
        <Stat
          wert={faellig.length}
          label="Demnächst fällig"
          ton={faellig.length ? 'orange' : ''}
          onClick={() => navigate({ view: 'termine' })}
        />
        <Stat
          wert={nachhaken.length + bedarf.length}
          label="Nachhaken & Anmeldebedarf"
          ton="blue"
          onClick={() => navigate({ view: 'termine' })}
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
          titel="Anstehende Terminfristen"
          sub="Je Anmeldung die Frist im aktuellen Status, dazu ausstehende Erstanmeldungen – Überfälliges zuerst"
          actions={
            fristen.length > ANZAHL_TERMINE ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate({ view: 'termine' })}>
                Alle {fristen.length} <Icon name="chevron" size={13} />
              </button>
            ) : null
          }
        />
        {vorn.length === 0 ? (
          <EmptyState icon="check" titel="Nichts offen" text="Keine Anmeldung hat derzeit eine Terminfrist." />
        ) : (
          <div className="table-scroll">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th className="col-optional" style={{ width: 22 }} />
                  <th>Anmeldung</th>
                  <th className="col-optional">Projekt</th>
                  <th>Status</th>
                  <th>Terminfrist</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {vorn.map(({ t, e }) =>
                  e ? (
                    <tr
                      key={`erst-${e.projekt.id}`}
                      className="clickable"
                      onClick={() => navigate({ view: 'projekt', projektId: e.projekt.id })}
                    >
                      <td className="col-optional">
                        <AmpelPunkt ampel={e.ampel} />
                      </td>
                      <td>
                        <strong>Erstanmeldung ausstehend</strong>
                        <div className="small tertiary">
                          {ERSTE_PHASE_LABEL[e.projekt.erstePhase]} · {e.projekt.name}
                        </div>
                      </td>
                      <td className="small muted col-optional">{e.projekt.name}</td>
                      <td>
                        <Badge ton="orange">Ausstehend</Badge>
                      </td>
                      <td>
                        {e.frist ? (
                          <span className="small" title={ERSTANMELDUNG_GRUND[e.grund]}>
                            <b>{formatDate(e.frist)}</b>
                            <div className="tertiary small">{relativeLabel(e.frist)}</div>
                          </span>
                        ) : (
                          <span className="small tertiary">kein erster Anmeldetermin</span>
                        )}
                      </td>
                      <td className="actions" />
                    </tr>
                  ) : (
                  <tr
                    key={t.anmeldung.id}
                    className="clickable"
                    onClick={() =>
                      navigate({ view: 'anmeldung', projektId: t.projekt.id, anmeldungId: t.anmeldung.id })
                    }
                  >
                    <td className="col-optional">
                      <AmpelPunkt ampel={t.ampel} />
                    </td>
                    <td>
                      <strong>{anmeldungTitel(t.anmeldung)}</strong>
                      <div className="small tertiary">
                        {[t.anmeldung.art, t.anmeldung.gewerk].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="small muted col-optional">{t.projekt.name}</td>
                    <td>
                      <StatusBadge statusId={t.anmeldung.statusId} />
                      {t.frist.nachhaken ? <div className="small tertiary">zum Nachhaken</div> : null}
                    </td>
                    <td>
                      <TerminZelle frist={t.frist} />
                    </td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <NachfolgerAuswahl
                        statusId={t.anmeldung.statusId}
                        onWaehle={(nach) => setWechsel({ anmeldung: t.anmeldung, nach })}
                      />
                    </td>
                  </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {bedarf.length > 0 ? (
        <Card>
          <CardHeader
            titel="Anmeldebedarf aus den Projekten"
            sub={`Fristen laut Richtlinie in den nächsten ${data.einstellungen.bedarfVorschauTage} Tagen, für die noch kein Eintrag besteht`}
          />
          {bedarf.map(({ projekt, zelle }) => (
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
          ))}
        </Card>
      ) : null}

      <Card>
        <CardHeader titel="Projekte" sub="Anmeldungen je Workflow und Fristenlage" />
        {projekte.length === 0 ? (
          <EmptyState icon="projekt" titel="Kein Projekt" text="Legen Sie unter „Projekte“ eines an." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Projekt</th>
                  {data.workflows.map((w) => (
                    <th key={w.id} className="zahl" title={w.name}>
                      {w.kurz || w.name}
                    </th>
                  ))}
                  <th className="zahl">Überfällig</th>
                  <th>Nächste Frist</th>
                </tr>
              </thead>
              <tbody>
                {projekte.map((p) => {
                  const eigene = data.anmeldungen.filter((a) => a.projektId === p.id);
                  const eigeneTermine = termine.filter((t) => t.projekt.id === p.id);
                  const offen = erst.find((e) => e.projekt.id === p.id);
                  const spaet =
                    eigeneTermine.filter((t) => t.ampel === 'ueberfaellig').length + (offen?.ampel === 'ueberfaellig' ? 1 : 0);
                  const naechste = eigeneTermine.find((t) => t.ampel !== 'ueberfaellig');
                  // Ohne Anmeldung ist die Erstanmeldung die nächste Frist
                  const naechsteErst = !naechste && offen?.frist && offen.ampel !== 'ueberfaellig' ? offen : null;
                  return (
                    <tr key={p.id} className="clickable" onClick={() => navigate({ view: 'projekt', projektId: p.id })}>
                      <td>
                        <span className="num tertiary">{p.dbGNummer}</span>
                        <div>
                          <strong>{p.name}</strong>
                        </div>
                      </td>
                      {data.workflows.map((w) => {
                        const n = eigene.filter((a) => statusVon(data.workflows, a.statusId).workflow.id === w.id).length;
                        return (
                          <td key={w.id} className={`zahl ${n ? '' : 'leer'}`}>
                            {n}
                          </td>
                        );
                      })}
                      <td
                        className={`zahl ${spaet ? '' : 'leer'}`}
                        style={{ color: spaet ? 'var(--red)' : undefined }}
                      >
                        {spaet}
                      </td>
                      <td className="small">
                        {naechste ? (
                          <>
                            {formatDate(naechste.frist.datum)}
                            <div className="tertiary small">
                              {naechste.anmeldung.anmeldeId || naechste.anmeldung.vorhaben
                                ? anmeldungTitel(naechste.anmeldung)
                                : naechste.status.status.name}
                            </div>
                          </>
                        ) : naechsteErst ? (
                          <>
                            {formatDate(naechsteErst.frist)}
                            <div className="tertiary small">Erstanmeldung</div>
                          </>
                        ) : (
                          <span className="tertiary">–</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {wechsel ? (
        <StatusWechselDialog anmeldung={wechsel.anmeldung} nach={wechsel.nach} onClose={() => setWechsel(null)} />
      ) : null}
    </div>
  );
}
