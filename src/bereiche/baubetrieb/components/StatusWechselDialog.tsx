/**
 * Statuswechsel einer Anmeldung auf einen der möglichen Nachfolger.
 *
 * Führt der Wechsel in einen anderen Workflow (eine neue Phase), wird die
 * Anmeldung dorthin übernommen: Maßnahmenart, Anmelde-ID und Sperrzeitraum
 * werden neu erfasst, und der Eintrag lässt sich auf mehrere Anmeldungen
 * aufteilen – in SKM und MKM stehen ja nur Sammeleinträge. Der Status
 * „Anmeldeleiche“ ist ein gewöhnlicher Status; erst der Schritt „Eintrag
 * löschen“ (`LOESCHEN`) entfernt den Eintrag.
 */
import { useState } from 'react';
import { formatDate, today } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Select, TextArea, TextInput } from '../../../shared/ui';
import { bauzeitraumAbgleichen, type Aufteilung } from '../domain/ablauf';
import { ganzesFahrplanjahr, terminfrist } from '../domain/fristen';
import {
  ANNEX_VII_LABEL,
  LOESCHEN,
  type Anmeldung,
  type AnmeldungsArt,
  type AnnexVIIGrund,
  type ID,
  type StatusZiel,
} from '../domain/types';
import { anmeldungBezeichnung, istAenderung, istUebernahme, statusVon } from '../domain/workflow';
import { useStore } from '../store/store';
import { ANNEX_OPTIONEN, fahrplanjahrOptionen } from './AnmeldungDialog';
import { StatusBadge } from './common';

interface Zeile {
  anmeldeId: string;
  bfStrecke: string;
  fahrplanjahr: number | null;
  bauVon: string;
  bauBis: string;
}

export function StatusWechselDialog({
  anmeldung,
  nach,
  onClose,
  onGeloescht,
  onAufgeteilt,
}: {
  anmeldung: Anmeldung;
  nach: StatusZiel;
  onClose: () => void;
  /** Nach dem Löschen – die Ansicht der Anmeldung gibt es dann nicht mehr. */
  onGeloescht?: () => void;
  onAufgeteilt?: (ids: ID[]) => void;
}) {
  const { data, statusWechseln } = useStore();
  const toast = useToast();
  const von = statusVon(data.workflows, anmeldung.statusId);
  const loeschen = nach === LOESCHEN;
  const ziel = loeschen ? von : statusVon(data.workflows, nach);
  // Wechsel in den Status „Anmeldeleiche“ – gelöscht wird erst im nächsten Schritt.
  const wirdLeiche = !loeschen && ziel.status.art === 'leiche' && von.status.art !== 'leiche';
  const vonLeiche = von.status.art === 'leiche';
  const uebernahme = istUebernahme(data.workflows, anmeldung.statusId, nach);
  const ganzesJahr = ganzesFahrplanjahr(ziel.workflow);
  const wirdAenderung = istAenderung(data.workflows, nach) && !istAenderung(data.workflows, anmeldung.statusId);
  const endetAenderung = istAenderung(data.workflows, anmeldung.statusId) && !istAenderung(data.workflows, nach);
  // Bleibt die Anmeldung im Workflow, bleibt auch ihre Art wählbar.
  const arten = ziel.workflow.arten.length > 0 ? ziel.workflow.arten : [anmeldung.art];

  const [datum, setDatum] = useState(today());
  const [bemerkung, setBemerkung] = useState('');
  const [aenderungsNr, setAenderungsNr] = useState(anmeldung.aenderungsNr);
  const [annexVII, setAnnexVII] = useState<AnnexVIIGrund | ''>(anmeldung.annexVII ?? '');
  const [art, setArt] = useState<AnmeldungsArt>(arten.includes(anmeldung.art) ? anmeldung.art : arten[0]);
  const ersteZeile: Zeile = {
    anmeldeId: anmeldung.anmeldeId,
    bfStrecke: anmeldung.bfStrecke,
    fahrplanjahr: anmeldung.fahrplanjahr,
    bauVon: anmeldung.bauVon ?? '',
    bauBis: anmeldung.bauBis ?? '',
  };
  const [zeilen, setZeilen] = useState<Zeile[]>([ersteZeile]);
  const zeileSetzen = (i: number, patch: Partial<Zeile>) =>
    setZeilen((z) => z.map((zeile, j) => (j === i ? { ...zeile, ...patch } : zeile)));

  const bauzeit = (z: Zeile) =>
    ganzesJahr
      ? { fahrplanjahr: z.fahrplanjahr, bauVon: null, bauBis: null }
      : { fahrplanjahr: null, bauVon: z.bauVon || null, bauBis: z.bauBis || z.bauVon || null };

  // Vorschau der Terminfrist im neuen Status
  const vorschau = loeschen
    ? null
    : terminfrist(
        bauzeitraumAbgleichen(
          {
            ...anmeldung,
            statusId: nach,
            statusSeit: datum || today(),
            terminManuell: null,
            ...(uebernahme ? { art, ...bauzeit(zeilen[0]) } : {}),
          },
          data.workflows,
        ),
        data,
      );

  const ausfuehren = () => {
    if (!loeschen && !datum) {
      toast('Bitte das Datum des Statuswechsels angeben.');
      return;
    }
    if (uebernahme && ganzesJahr && zeilen.some((z) => !z.fahrplanjahr)) {
      toast('Bitte je Eintrag das Fahrplanjahr wählen.');
      return;
    }
    if (uebernahme && !ganzesJahr && zeilen.some((z) => z.bauVon && z.bauBis && z.bauBis < z.bauVon)) {
      toast('Das Ende eines Sperrzeitraums liegt vor dem Beginn.');
      return;
    }
    const [erste, ...weitere] = zeilen;
    const neueIds = statusWechseln(anmeldung.id, {
      nach,
      datum: datum || today(),
      bemerkung,
      aenderungsNr: wirdAenderung ? aenderungsNr : undefined,
      annexVII: wirdAenderung ? annexVII || null : undefined,
      uebernahme: uebernahme ? { art, anmeldeId: erste.anmeldeId, ...bauzeit(erste) } : undefined,
      weitere: uebernahme
        ? weitere.map((z): Aufteilung => ({ anmeldeId: z.anmeldeId, bfStrecke: z.bfStrecke, ...bauzeit(z) }))
        : undefined,
    });
    if (loeschen) {
      toast(vonLeiche ? 'Anmeldeleiche gelöscht.' : 'Anmeldung gelöscht.');
      onClose();
      onGeloescht?.();
      return;
    }
    const zielName = `${ziel.workflow.kurz || ziel.workflow.name} · ${ziel.status.name}`;
    toast(
      neueIds.length > 0
        ? `Übernommen in ${zielName} – ${neueIds.length + 1} Anmeldungen.`
        : uebernahme
          ? `Übernommen in ${zielName}.`
          : `Status ${ziel.status.name} gesetzt.`,
    );
    onClose();
    if (neueIds.length > 0) onAufgeteilt?.(neueIds);
  };

  const titel = loeschen
    ? vonLeiche
      ? 'Anmeldeleiche löschen?'
      : 'Anmeldung löschen?'
    : uebernahme
      ? `Übernahme in ${ziel.workflow.name}`
      : 'Status ändern';

  return (
    <Modal
      titel={titel}
      sub={
        <span className="row wrap" style={{ gap: 6 }}>
          <StatusBadge statusId={anmeldung.statusId} />
          <Icon name="chevron" size={12} />
          {loeschen ? <span className="small">Löschen</span> : <StatusBadge statusId={nach} />}
        </span>
      }
      onClose={onClose}
      wide={uebernahme}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={loeschen ? { background: 'var(--red)' } : undefined}
            onClick={ausfuehren}
          >
            {loeschen ? 'Löschen' : uebernahme ? 'Übernehmen' : 'Status setzen'}
          </button>
        </>
      }
    >
      {loeschen ? (
        <p className="muted">
          {vonLeiche ? 'Anmeldeleichen werden komplett gelöscht. ' : ''}Der Eintrag „{anmeldungBezeichnung(anmeldung)}“
          verschwindet samt Statusverlauf aus dem Projekt. Das lässt sich nicht rückgängig machen.
        </p>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          {uebernahme ? (
            <Callout>
              Die Anmeldung wechselt vom Workflow {von.workflow.name} in den Workflow {ziel.workflow.name}. Art,
              Anmelde-ID und Sperrzeitraum gelten ab jetzt für die neue Phase; der bisherige Stand bleibt im Verlauf
              erhalten.
              {ganzesJahr ? '' : ' Der Sperrzeitraum ist ab hier tagesscharf.'}
            </Callout>
          ) : null}
          {wirdLeiche ? (
            <Callout ton="warn">
              Die Anmeldung bleibt als Anmeldeleiche rot gekennzeichnet im Projekt stehen und deckt keinen
              Anmeldebedarf mehr ab.
              {ziel.status.nachfolger.includes(LOESCHEN) ? ' Gelöscht wird sie erst im nächsten Schritt („Eintrag löschen“).' : ''}
            </Callout>
          ) : null}
          {nach === anmeldung.statusId ? (
            <Callout>
              Der Status wird erneut gesetzt: Der Wechsel erscheint mit Datum im Verlauf, die Terminfrist wird vom
              neuen Datum aus berechnet.
            </Callout>
          ) : null}

          <div className="form-grid">
            <Field label="Datum des Statuswechsels">
              <TextInput type="date" value={datum} onChange={setDatum} />
            </Field>
            {uebernahme ? (
              <Field label="Maßnahmenart">
                {arten.length === 1 ? (
                  <TextInput value={arten[0]} onChange={() => undefined} disabled />
                ) : (
                  <Select
                    value={art}
                    onChange={(v) => setArt(v as AnmeldungsArt)}
                    options={arten.map((a) => ({ value: a, label: a }))}
                  />
                )}
              </Field>
            ) : null}
            {wirdAenderung ? (
              <>
                <Field label="ÄAbst-Nr" hint="der jetzt laufenden Änderung">
                  <TextInput value={aenderungsNr} onChange={setAenderungsNr} />
                </Field>
                <Field label="AnnexVII-Kennzeichen">
                  <Select
                    value={annexVII}
                    onChange={(v) => setAnnexVII(v as AnnexVIIGrund | '')}
                    options={ANNEX_OPTIONEN}
                    placeholder="– ohne –"
                  />
                </Field>
              </>
            ) : null}
            <Field label="Bemerkung zum Wechsel" full>
              <TextArea value={bemerkung} onChange={setBemerkung} rows={2} placeholder="optional" />
            </Field>
          </div>

          {endetAenderung && (anmeldung.aenderungsNr || anmeldung.annexVII) ? (
            <p className="small muted">
              Die Änderungsabstimmung endet: ÄAbst-Nr {anmeldung.aenderungsNr || '–'}
              {anmeldung.annexVII ? ` und AnnexVII „${ANNEX_VII_LABEL[anmeldung.annexVII]}“` : ''} werden im Verlauf
              festgehalten und in der Anmeldung geleert.
            </p>
          ) : null}

          {uebernahme ? (
            <div>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <strong className="small">
                  {zeilen.length === 1 ? 'Übernommene Anmeldung' : `Aufgeteilt in ${zeilen.length} Anmeldungen`}
                </strong>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => setZeilen((z) => [...z, { ...ersteZeile, anmeldeId: '' }])}
                  title="Der Eintrag wird in mehrere Anmeldungen der neuen Phase aufgeteilt"
                >
                  <Icon name="plus" size={12} /> Weitere Anmeldung
                </button>
              </div>
              <div className="table-scroll">
                <table className="table table-stack">
                  <thead>
                    <tr>
                      <th>{ganzesJahr ? 'Begriff / tVE-Nr' : 'Anmelde-ID'}</th>
                      <th>Bf/Strecke</th>
                      {ganzesJahr ? <th>Fahrplanjahr</th> : <th>Sperrzeit von</th>}
                      {ganzesJahr ? null : <th>Sperrzeit bis</th>}
                      <th className="actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {zeilen.map((z, i) => (
                      <tr key={i}>
                        <td>
                          <TextInput
                            value={z.anmeldeId}
                            onChange={(v) => zeileSetzen(i, { anmeldeId: v })}
                            placeholder={i === 0 ? 'neue ID' : 'ID der weiteren Anmeldung'}
                            aria-label="Anmelde-ID"
                          />
                        </td>
                        <td>
                          <TextInput
                            value={z.bfStrecke}
                            onChange={(v) => zeileSetzen(i, { bfStrecke: v })}
                            aria-label="Bf/Strecke"
                          />
                        </td>
                        {ganzesJahr ? (
                          <td>
                            <Select
                              value={String(z.fahrplanjahr ?? '')}
                              onChange={(v) => zeileSetzen(i, { fahrplanjahr: v ? Number(v) : null })}
                              options={fahrplanjahrOptionen(z.fahrplanjahr)}
                              placeholder="wählen"
                            />
                          </td>
                        ) : (
                          <>
                            <td>
                              <TextInput
                                type="date"
                                value={z.bauVon}
                                onChange={(v) => zeileSetzen(i, { bauVon: v })}
                                aria-label="Sperrzeit von"
                              />
                            </td>
                            <td>
                              <TextInput
                                type="date"
                                value={z.bauBis}
                                onChange={(v) => zeileSetzen(i, { bauBis: v })}
                                aria-label="Sperrzeit bis"
                              />
                            </td>
                          </>
                        )}
                        <td className="actions">
                          {i === 0 ? (
                            <span className="small tertiary">dieser Eintrag</span>
                          ) : (
                            <button
                              type="button"
                              className="btn-icon"
                              title="Zeile entfernen"
                              aria-label="Zeile entfernen"
                              onClick={() => setZeilen((alt) => alt.filter((_, j) => j !== i))}
                            >
                              <Icon name="loeschen" size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {zeilen.length > 1 ? (
                <p className="small tertiary" style={{ marginTop: 6 }}>
                  Die weiteren Anmeldungen übernehmen Gewerk/Tätigkeit und Bemerkungen und verweisen auf diesen Eintrag
                  als Herkunft.
                </p>
              ) : null}
            </div>
          ) : null}

          {vorschau ? (
            <p className="small muted">
              Terminfrist im neuen Status:{' '}
              {vorschau.datum ? (
                <>
                  <b>{formatDate(vorschau.datum)}</b> · {vorschau.regel}
                  {vorschau.nachhaken ? ' · zum Nachhaken' : ''}
                </>
              ) : vorschau.regel === '.-.' ? (
                'keine'
              ) : (
                `${vorschau.regel} – nicht berechenbar (${vorschau.erlaeuterung})`
              )}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
