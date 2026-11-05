/**
 * Detailansicht einer Anmeldung – aufgebaut wie ein Planlauf: der Weg durch
 * die Workflows, darunter die Status des aktuellen Workflows in ihrer
 * Reihenfolge. Der aktuelle Status trägt Terminfrist und die möglichen
 * Nachfolger; es folgen Merkmale und Statusverlauf.
 */
import { Fragment, useState } from 'react';
import { formatDate } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Badge, Card, CardHeader, ConfirmDialog } from '../../../shared/ui';
import { AnmeldungDialog } from '../components/AnmeldungDialog';
import { AmpelBadge, NachhakenBadge, STATUS_TON, StatusBadge, nachfolgerText } from '../components/common';
import { StatusWechselDialog } from '../components/StatusWechselDialog';
import { NachhakenDialog, TerminDialog } from '../components/TerminDialoge';
import { letzterWechsel, verwandte } from '../domain/ablauf';
import { ampelFuer, bauzeitraumText, fristRegelText, ganzesFahrplanjahr, terminfrist } from '../domain/fristen';
import {
  ANNEX_VII_LABEL,
  LOESCHEN,
  type Anmeldung,
  type Projekt,
  type StatusZiel,
  type VerlaufEintrag,
} from '../domain/types';
import {
  anmeldungBezeichnung,
  anmeldungTitel,
  istAenderung,
  istLeiche,
  istUebernahme,
  nachfolgerVon,
  statusInfo,
  statusVon,
  vorhabenFuehrend,
  zustaendigText,
} from '../domain/workflow';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';

export function AnmeldungDetail({
  projekt,
  anmeldung,
  navigate,
}: {
  projekt: Projekt;
  anmeldung: Anmeldung;
  navigate: (r: Route) => void;
}) {
  const { data, deleteAnmeldung, duplicateAnmeldung, statusZuruecknehmen } = useStore();
  const toast = useToast();
  const [wechsel, setWechsel] = useState<StatusZiel | null>(null);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [zuruecknehmen, setZuruecknehmen] = useState(false);
  const [nachhaken, setNachhaken] = useState(false);
  const [termin, setTermin] = useState(false);

  const { workflow, status } = statusVon(data.workflows, anmeldung.statusId);
  const frist = terminfrist(anmeldung, data);
  const ampel = ampelFuer(frist.datum, data.einstellungen.vorlaufTage);
  const letzter = letzterWechsel(anmeldung, data.workflows);
  const { herkunft, aufgeteilt } = verwandte(data, anmeldung);
  const zumProjekt = () => navigate({ view: 'projekt', projektId: projekt.id });
  const oeffne = (a: Anmeldung) => navigate({ view: 'anmeldung', projektId: a.projektId, anmeldungId: a.id });
  const titel = anmeldungTitel(anmeldung);
  const vorhaben = vorhabenFuehrend(anmeldung);
  const zustaendig = zustaendigText(status, anmeldung, projekt);
  const duplizieren = () => {
    const id = duplicateAnmeldung(anmeldung.id);
    toast('Anmeldung dupliziert – die Kopie ist geöffnet.');
    navigate({ view: 'anmeldung', projektId: projekt.id, anmeldungId: id });
  };

  // Workflows, die die Anmeldung schon durchlaufen hat
  const besuchteWorkflows = new Set(
    anmeldung.verlauf
      .flatMap((v) => [v.von, v.nach])
      .map((id) => statusInfo(data.workflows, id)?.workflow.id)
      .filter(Boolean),
  );
  /** Wann die Anmeldung einen Status zuletzt erreicht hat. */
  const erreicht = (statusId: string) =>
    [...anmeldung.verlauf].reverse().find((v) => v.typ !== 'notiz' && v.nach === statusId)?.datum ?? null;

  const nachfolger = nachfolgerVon(data.workflows, anmeldung.statusId);
  const imWorkflow = nachfolger.filter((n) => n !== LOESCHEN && !istUebernahme(data.workflows, anmeldung.statusId, n));
  const uebernahmen = nachfolger.filter((n) => istUebernahme(data.workflows, anmeldung.statusId, n));
  const loeschbar = nachfolger.includes(LOESCHEN);
  // Der Wechsel in eine Anmeldeleiche ist rot hervorgehoben.
  const rot = (n: StatusZiel) => (istLeiche(data.workflows, n) ? { color: 'var(--red)' } : undefined);

  return (
    <div className="stack">
      <div className="row-between wrap">
        <button type="button" className="btn btn-ghost" onClick={zumProjekt}>
          <Icon name="zurueck" size={14} /> {projekt.name}
        </button>
        <div className="row wrap">
          <button type="button" className="btn btn-outline" onClick={() => setBearbeiten(true)}>
            <Icon name="bearbeiten" size={14} /> Bearbeiten
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={duplizieren}
            title="Kopie mit aktuellem Stand und Statusverlauf anlegen"
          >
            <Icon name="kopieren" size={14} /> Duplizieren
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
            <Icon name="loeschen" size={14} /> Löschen
          </button>
        </div>
      </div>

      <Card>
        <CardHeader
          titel={titel === 'ohne ID' ? 'Anmeldung ohne ID' : titel}
          sub={[
            vorhaben && anmeldung.vorhaben.trim() ? anmeldung.anmeldeId : '',
            anmeldung.art,
            bauzeitraumText(anmeldung, data.workflows),
            anmeldung.gewerk,
          ]
            .filter(Boolean)
            .join(' · ')}
          actions={<StatusBadge statusId={anmeldung.statusId} />}
        />
        <div className="card-pad">
          <div className="chain">
            {data.workflows.map((w, i) => {
              const aktuell = w.id === workflow.id;
              const durchlaufen = !aktuell && besuchteWorkflows.has(w.id);
              return (
                <Fragment key={w.id}>
                  {i > 0 ? <div className="chain-arrow">›</div> : null}
                  <div className={`chain-node ${aktuell ? 'current' : durchlaufen ? 'done' : ''}`}>
                    <div className="cn-name">{w.name}</div>
                    <div className="cn-meta">{aktuell ? status.name : durchlaufen ? 'durchlaufen' : '–'}</div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          titel={`Workflow ${workflow.name}`}
          sub="Status in der Reihenfolge des Workflows – der aktuelle mit Terminfrist und den möglichen Nachfolgern"
        />
        {workflow.status.map((s, i) => {
          const aktuell = s.id === anmeldung.statusId;
          const am = erreicht(s.id);
          const spaet = aktuell && ampel === 'ueberfaellig';
          return (
            <div className={`step-row ${aktuell ? 'aktiv' : 'kompakt'}`} key={s.id}>
              <div className="step-marker">
                <div className={`step-num ${spaet ? 'late' : aktuell ? 'current' : am ? 'done' : ''}`}>
                  {!aktuell && am ? <Icon name="check" size={12} strokeWidth={2.4} /> : i + 1}
                </div>
                {i < workflow.status.length - 1 ? <div className="step-line" /> : null}
              </div>
              <div className="step-body">
                <div className="step-title">
                  <strong>{s.name}</strong>
                  {aktuell ? (
                    <>
                      <Badge ton={STATUS_TON[s.art]}>aktuell</Badge>
                      {frist.datum ? <AmpelBadge ampel={ampel} /> : null}
                      {frist.nachhaken && frist.datum ? <NachhakenBadge /> : null}
                    </>
                  ) : am ? (
                    <span className="small tertiary">zuletzt erreicht am {formatDate(am)}</span>
                  ) : null}
                </div>

                {aktuell ? (
                  <>
                    <div className="step-meta">
                      <span>
                        Seit: <b>{formatDate(anmeldung.statusSeit)}</b>
                      </span>
                      <span>
                        Terminfrist: <b>{frist.datum ? formatDate(frist.datum) : 'keine'}</b>
                        {frist.datum ? ` · ${frist.manuell ? 'von Hand festgelegt' : frist.regel}` : ''}
                      </span>
                      <span>
                        Zuständig: <b>{zustaendig ?? '–'}</b>
                      </span>
                    </div>
                    <p className="small tertiary">{frist.erlaeuterung}</p>
                    {frist.platzhalter ? (
                      <p className="small" style={{ color: 'var(--orange)' }}>
                        Berechnet aus einem Platzhalterwert – Richtlinienfrist unter „Einstellungen“ prüfen.
                      </p>
                    ) : null}
                    {s.bemerkung ? <p className="small muted">{s.bemerkung}</p> : null}

                    {imWorkflow.length > 0 ? (
                      <div className="row wrap" style={{ gap: 6 }}>
                        <span className="small muted">Weiter mit:</span>
                        {imWorkflow.map((n) => (
                          <button key={n} type="button" className="antwort-chip" style={rot(n)} onClick={() => setWechsel(n)}>
                            {nachfolgerText(data.workflows, anmeldung.statusId, n)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {uebernahmen.length > 0 ? (
                      <div className="row wrap" style={{ gap: 6 }}>
                        <span className="small muted">Übernahme in neue Phase:</span>
                        {uebernahmen.map((n) => (
                          <button key={n} type="button" className="antwort-chip" onClick={() => setWechsel(n)}>
                            {nachfolgerText(data.workflows, anmeldung.statusId, n)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {loeschbar ? (
                      <div className="row wrap" style={{ gap: 6 }}>
                        <span className="small muted">Abschluss:</span>
                        <button
                          type="button"
                          className="antwort-chip"
                          style={{ color: 'var(--red)' }}
                          onClick={() => setWechsel(LOESCHEN)}
                        >
                          {nachfolgerText(data.workflows, anmeldung.statusId, LOESCHEN)}
                        </button>
                      </div>
                    ) : null}

                    <div className="step-actions">
                      {frist.nachhaken ? (
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => setNachhaken(true)}>
                          <Icon name="glocke" size={13} /> Nachgehakt …
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setTermin(true)}>
                        <Icon name="kalender" size={13} /> Termin festlegen …
                      </button>
                      {letzter ? (
                        <button type="button" className="btn btn-sm" onClick={() => setZuruecknehmen(true)}>
                          Letzten Wechsel zurücknehmen
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="small tertiary">
                    Terminfrist: {s.frist.typ === 'keine' ? 'keine' : fristRegelText(s.frist)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {workflow.status.every((s) => s.id !== anmeldung.statusId) ? (
          <div className="card-pad small tertiary">Der Status dieser Anmeldung ist in keinem Workflow mehr vorhanden.</div>
        ) : null}
      </Card>

      <Card>
        <CardHeader titel="Merkmale" />
        <div className="card-pad">
          <dl className="kv kv-breit" style={{ margin: 0 }}>
            {vorhaben || anmeldung.vorhaben.trim() ? (
              <>
                <dt>Vorhabenname</dt>
                <dd>{anmeldung.vorhaben || '–'}</dd>
              </>
            ) : null}
            <dt>
              {vorhaben && anmeldung.vorhaben.trim()
                ? 'tVE-Nr'
                : ganzesFahrplanjahr(workflow)
                  ? 'Begriff / tVE-Nr'
                  : 'Anmelde-ID'}
            </dt>
            <dd>{anmeldung.anmeldeId || '–'}</dd>
            <dt>Maßnahmenart</dt>
            <dd>{anmeldung.art}</dd>
            <dt>Sperrzeitraum</dt>
            <dd>
              {bauzeitraumText(anmeldung, data.workflows)}
              {ganzesFahrplanjahr(workflow) && anmeldung.bauVon ? (
                <span className="tertiary small">
                  {' '}
                  · {formatDate(anmeldung.bauVon)} – {formatDate(anmeldung.bauBis)}
                </span>
              ) : anmeldung.fahrplanjahr ? (
                <span className="tertiary small"> · Fahrplanjahr {anmeldung.fahrplanjahr}</span>
              ) : null}
            </dd>
            <dt>Bf/Strecke</dt>
            <dd>{anmeldung.bfStrecke || '–'}</dd>
            <dt>Gewerk/Tätigkeit</dt>
            <dd>{anmeldung.gewerk || '–'}</dd>
            <dt>Zuständiger BBK</dt>
            <dd>{anmeldung.bbk || '–'}</dd>
            {istAenderung(data.workflows, anmeldung.statusId) ? (
              <>
                <dt>ÄAbst-Nr</dt>
                <dd>{anmeldung.aenderungsNr || '–'}</dd>
                <dt>AnnexVII-Kennzeichen</dt>
                <dd>{anmeldung.annexVII ? ANNEX_VII_LABEL[anmeldung.annexVII] : '–'}</dd>
              </>
            ) : null}
            <dt>Bemerkungen</dt>
            <dd>{anmeldung.bemerkung || '–'}</dd>
            {herkunft ? (
              <>
                <dt>Herkunft</dt>
                <dd>
                  <button type="button" className="link-btn" onClick={() => oeffne(herkunft)}>
                    {anmeldungTitel(herkunft)}
                  </button>{' '}
                  <span className="tertiary small">– bei der Übernahme aufgeteilt</span>
                </dd>
              </>
            ) : null}
            {aufgeteilt.length > 0 ? (
              <>
                <dt>Aufgeteilt in</dt>
                <dd className="row wrap" style={{ gap: 8 }}>
                  {aufgeteilt.map((a) => (
                    <button key={a.id} type="button" className="link-btn" onClick={() => oeffne(a)}>
                      {anmeldungTitel(a)}
                    </button>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
          {!istAenderung(data.workflows, anmeldung.statusId) ? (
            <p className="small tertiary" style={{ marginTop: 10 }}>
              ÄAbst-Nr und AnnexVII-Kennzeichen sind nur während einer laufenden Änderungsabstimmung aktiv.
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader titel="Statusverlauf" sub="Jeder Wechsel mit Datum, Bearbeitung und Bemerkung" />
        {anmeldung.verlauf.length === 0 ? (
          <div className="card-pad small tertiary">Noch kein Eintrag.</div>
        ) : (
          anmeldung.verlauf.map((v, i) => (
            <VerlaufZeile key={v.id} eintrag={v} letzter={i === anmeldung.verlauf.length - 1} />
          ))
        )}
      </Card>

      {wechsel ? (
        <StatusWechselDialog
          anmeldung={anmeldung}
          nach={wechsel}
          onClose={() => setWechsel(null)}
          onGeloescht={zumProjekt}
        />
      ) : null}
      {bearbeiten ? <AnmeldungDialog projekt={projekt} anmeldung={anmeldung} onClose={() => setBearbeiten(false)} /> : null}
      {nachhaken ? <NachhakenDialog anmeldung={anmeldung} onClose={() => setNachhaken(false)} /> : null}
      {termin ? <TerminDialog anmeldung={anmeldung} onClose={() => setTermin(false)} /> : null}
      {zuruecknehmen && letzter ? (
        <ConfirmDialog
          titel="Letzten Statuswechsel zurücknehmen?"
          text={`Die Anmeldung kehrt von „${letzter.nachText}“ zurück nach „${letzter.vonText}“ – mit dem Stand von vorher (Maßnahmenart, ID, Sperrzeitraum). ${
            aufgeteilt.length > 0 ? 'Bei der Übernahme aufgeteilte Anmeldungen bleiben bestehen.' : ''
          }`}
          bestaetigenLabel="Zurücknehmen"
          ton="blau"
          onConfirm={() => {
            statusZuruecknehmen(anmeldung.id);
            toast('Statuswechsel zurückgenommen.');
          }}
          onClose={() => setZuruecknehmen(false)}
        />
      ) : null}
      {loeschen ? (
        <ConfirmDialog
          titel="Anmeldung löschen?"
          text={`„${anmeldungBezeichnung(anmeldung)}“ wird samt Statusverlauf gelöscht. Für Anmeldeleichen ist der Status „Anmeldeleiche“ vorgesehen.`}
          onConfirm={() => {
            deleteAnmeldung(anmeldung.id);
            toast('Anmeldung gelöscht.');
            zumProjekt();
          }}
          onClose={() => setLoeschen(false)}
        />
      ) : null}
    </div>
  );
}

/** Eintrag im Statusverlauf. Der Text des Status stammt aus dem Zeitpunkt des Wechsels. */
function VerlaufZeile({ eintrag: v, letzter }: { eintrag: VerlaufEintrag; letzter: boolean }) {
  const { data } = useStore();
  const aktiv = letzter && v.typ !== 'notiz';
  const uebernommen = v.typ === 'wechsel' && !!v.von && !!v.nach && istUebernahme(data.workflows, v.von, v.nach);
  const art = statusInfo(data.workflows, v.nach)?.status.art;
  return (
    <div className={`step-row ${aktiv ? 'aktiv' : ''}`}>
      <div className="step-marker">
        <div className={`step-num ${v.typ === 'notiz' ? '' : aktiv ? 'current' : 'done'}`}>
          {v.typ === 'notiz' ? '…' : v.typ === 'anlage' ? '+' : <Icon name="check" size={12} strokeWidth={2.4} />}
        </div>
        {!letzter ? <div className="step-line" /> : null}
      </div>
      <div className="step-body">
        <div className="step-title">
          {v.typ === 'notiz' ? <strong>Notiz</strong> : <Badge ton={art ? STATUS_TON[art] : ''}>{v.nachText || 'Status'}</Badge>}
          {uebernommen ? <Badge ton="purple">Übernahme</Badge> : null}
          {v.typ === 'anlage' && v.von ? <Badge ton="purple">Aus Aufteilung</Badge> : null}
        </div>
        <div className="step-meta">
          <span>
            Datum: <b>{formatDate(v.datum)}</b>
          </span>
          <span>
            Bearbeitung: <b>{v.bearbeiter}</b>
          </span>
          {v.typ === 'wechsel' && v.vonText ? (
            <span>
              zuvor: <b>{v.vonText}</b>
            </span>
          ) : null}
          {uebernommen && v.vorher ? (
            <span>
              vorher: <b>{v.vorher.art}</b>
              {v.vorher.anmeldeId ? ` · ${v.vorher.anmeldeId}` : ''}
            </span>
          ) : null}
          {v.aenderungsNr || v.annexVII ? (
            <span>
              Änderung: <b>{v.aenderungsNr || 'ohne ÄAbst-Nr'}</b>
              {v.annexVII ? ` · ${ANNEX_VII_LABEL[v.annexVII]}` : ''}
            </span>
          ) : null}
        </div>
        {v.text ? <p className="small muted">{v.text}</p> : null}
      </div>
    </div>
  );
}
