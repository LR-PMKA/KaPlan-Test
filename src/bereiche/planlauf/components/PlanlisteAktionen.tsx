/**
 * Sammelaktionen der Planliste für die gewählten Einträge: Planpaket
 * zuweisen, Gewerk/Planungsphase setzen, Löschen. „Neues Planpaket aus
 * Auswahl …“ steckt im PaketDialog.
 *
 * Die Dialoge erhalten die Kennungen der Auswahl und lesen die Einträge aus
 * dem aktuellen Stand. Pläne eines Planverzeichnisses gehören zum Paket ihres
 * Verzeichnisses (paketBetroffene in domain/bestand.ts): Sie ziehen mit, wenn
 * das Verzeichnis gewählt ist, und bleiben sonst unverändert.
 */
import { useState } from 'react';
import {
  DOCUMENT_KIND_LABEL,
  PLANUNGSPHASEN,
  hatEigenenPlanlauf,
  type AppData,
  type ID,
  type PlanDocument,
  type PlanRun,
  type Project,
} from '../domain/types';
import { gewerkeFuerProjekt } from '../domain/engine';
import { useStore } from '../store/store';
import { exportiereDaten } from '../store/storage';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Select } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import './planliste.css';

/** Sonderwert der Paketwahl: keinem Paket zuordnen. */
const KEIN_PAKET = '__kein-paket__';

const eintraege = (n: number) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`;
const plaeneText = (n: number) => `${n} ${n === 1 ? 'Plan' : 'Pläne'}`;
const laeufeText = (n: number) => `${n} ${n === 1 ? 'Planlauf' : 'Planläufe'}`;

/** Gewählte Einträge in der Reihenfolge der Auswahl (gelöschte fallen weg). */
function eintraegeVon(data: AppData, ids: ID[]): PlanDocument[] {
  const nachId = new Map(data.documents.map((d) => [d.id, d]));
  return ids.map((id) => nachId.get(id)).filter((d): d is PlanDocument => Boolean(d));
}

/**
 * Gewählte Pläne, deren Planverzeichnis nicht gewählt ist: Sie folgen dem
 * Paket ihres Verzeichnisses, eine Paketzuordnung lässt sie unverändert.
 */
export function plaeneOhneVerzeichnis(data: AppData, ids: ID[]): PlanDocument[] {
  const gewaehlt = new Set(ids);
  const vorhanden = new Set(data.documents.map((d) => d.id));
  return eintraegeVon(data, ids).filter(
    (d) => d.kind === 'plan' && d.parentId !== null && vorhanden.has(d.parentId) && !gewaehlt.has(d.parentId),
  );
}

/** Hinweis auf Pläne, die ihrem nicht gewählten Verzeichnis folgen. */
function folgenText(n: number): string {
  return `${plaeneText(n)} ${n === 1 ? 'gehört' : 'gehören'} zu einem nicht gewählten Planverzeichnis und ${
    n === 1 ? 'folgt' : 'folgen'
  } dessen Planpaket – ${n === 1 ? 'er bleibt' : 'sie bleiben'} unverändert.`;
}

/* ------------------------------------------------------------------ */
/* Planpaket zuweisen                                                  */
/* ------------------------------------------------------------------ */

export function PaketZuweisenDialog({
  project,
  ids,
  onClose,
  onFertig,
}: {
  project: Project;
  ids: ID[];
  onClose: () => void;
  onFertig: () => void;
}) {
  const { data, dokumentePaketZuweisen } = useStore();
  const toast = useToast();
  const [ziel, setZiel] = useState('');
  const pakete = data.documents.filter((d) => d.projectId === project.id && d.kind === 'paket');
  const folgen = plaeneOhneVerzeichnis(data, ids).length;
  const zuzuordnen = eintraegeVon(data, ids).length - folgen;
  const mitVerzeichnis = eintraegeVon(data, ids).filter(
    (d) => d.kind === 'plan' && d.parentId !== null && ids.includes(d.parentId),
  ).length;

  const zuweisen = () => {
    if (!ziel) {
      toast('Bitte ein Planpaket wählen.');
      return;
    }
    const paketId = ziel === KEIN_PAKET ? null : ziel;
    const n = dokumentePaketZuweisen(ids, paketId);
    const paket = pakete.find((p) => p.id === paketId);
    toast(
      `${paket ? `${eintraege(n)} „${paket.titel}“ zugeordnet.` : `${eintraege(n)} keinem Planpaket mehr zugeordnet.`}${
        folgen > 0 ? ` ${folgenText(folgen)}` : ''
      }`,
    );
    onFertig();
    onClose();
  };

  return (
    <Modal
      titel="Planpaket zuweisen"
      sub={`${eintraege(ids.length)} ausgewählt`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={zuweisen} disabled={!ziel || zuzuordnen === 0}>
            Zuweisen
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <Field
          label="Planpaket"
          hint={pakete.length === 0 ? 'Noch kein Planpaket angelegt – siehe „Neues Planpaket aus Auswahl …“.' : undefined}
        >
          <Select
            value={ziel}
            onChange={setZiel}
            placeholder="– Planpaket wählen –"
            options={[
              ...pakete.map((p) => ({ value: p.id, label: p.nummer ? `${p.titel} (${p.nummer})` : p.titel })),
              { value: KEIN_PAKET, label: '– keinem Paket –' },
            ]}
          />
        </Field>
        <div className="small muted">
          {zuzuordnen > 0 ? `${eintraege(zuzuordnen)} werden zugeordnet.` : 'Nichts zuzuordnen.'}
          {mitVerzeichnis > 0 ? ` Pläne gewählter Planverzeichnisse ziehen mit ihrem Verzeichnis um.` : ''}
        </div>
        {folgen > 0 ? (
          <Callout ton="warn" icon="!">
            {folgenText(folgen)}
          </Callout>
        ) : null}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Gewerk / Planungsphase                                              */
/* ------------------------------------------------------------------ */

export function EintraegeAendernDialog({
  project,
  ids,
  onClose,
  onFertig,
}: {
  project: Project;
  ids: ID[];
  onClose: () => void;
  onFertig: () => void;
}) {
  const { data, dokumenteAendern } = useStore();
  const toast = useToast();
  const docs = eintraegeVon(data, ids);
  /** Wert, den alle gewählten Einträge teilen – sonst leer. */
  const gemeinsam = (k: 'gewerk' | 'planungsphase') =>
    docs.length > 0 && docs.every((d) => d[k] === docs[0][k]) ? docs[0][k] : '';
  const [gewerk, setGewerk] = useState(gemeinsam('gewerk'));
  const [phase, setPhase] = useState(gemeinsam('planungsphase'));

  const speichern = () => {
    const patch: { gewerk?: string; planungsphase?: string } = {};
    if (gewerk.trim()) patch.gewerk = gewerk.trim();
    if (phase.trim()) patch.planungsphase = phase.trim();
    const geaendert = docs.filter(
      (d) =>
        (patch.gewerk !== undefined && d.gewerk !== patch.gewerk) ||
        (patch.planungsphase !== undefined && d.planungsphase !== patch.planungsphase),
    ).length;
    if (geaendert === 0) {
      toast('Nichts geändert.');
      onClose();
      return;
    }
    dokumenteAendern(ids, patch);
    toast(`${eintraege(geaendert)} geändert.`);
    onFertig();
    onClose();
  };

  return (
    <Modal
      titel="Gewerk / Planungsphase"
      sub={`${eintraege(docs.length)} ausgewählt`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Übernehmen
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Gewerk" hint="Leer lassen = unverändert">
          <input
            className="input"
            list="pli-gewerke"
            value={gewerk}
            onChange={(e) => setGewerk(e.target.value)}
            placeholder={gemeinsam('gewerk') ? '' : 'unterschiedlich – bleibt'}
          />
          <datalist id="pli-gewerke">
            {gewerkeFuerProjekt(data, project.id).map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field label="Planungsphase" hint="Leer lassen = unverändert">
          <input
            className="input"
            list="pli-phasen"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            placeholder={gemeinsam('planungsphase') ? '' : 'unterschiedlich – bleibt'}
          />
          <datalist id="pli-phasen">
            {PLANUNGSPHASEN.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Löschen                                                             */
/* ------------------------------------------------------------------ */

/** Lauf mit Nachweisdaten: Ist-Daten, frühere Durchläufe, Erinnerungen oder Protokoll über den Start hinaus. */
function hatNachweisdaten(r: PlanRun): boolean {
  return (
    r.protokoll.length > 1 ||
    r.steps.some((s) => s.istDatum || s.historie.length > 0 || s.erinnerungen.length > 0)
  );
}

export function EintraegeLoeschenDialog({
  ids,
  onClose,
  onFertig,
}: {
  ids: ID[];
  onClose: () => void;
  onFertig: () => void;
}) {
  const { data, dokumenteLoeschen } = useStore();
  const toast = useToast();
  const docs = eintraegeVon(data, ids);
  const weg = new Set(docs.map((d) => d.id));
  const verzeichnisse = docs.filter((d) => d.kind === 'verzeichnis');
  const plaene = docs.filter((d) => d.kind === 'plan');
  // Pläne gewählter Verzeichnisse stehen beim Verzeichnis, die übrigen für sich
  const einzelnGewaehlt = plaene.filter((p) => !(p.parentId && weg.has(p.parentId)));
  const laeufe = data.runs.filter((r) => weg.has(r.documentId));
  const mitDaten = laeufe.filter(hatNachweisdaten).length;
  /** Pläne gelöschter Verzeichnisse, die selbst bleiben – sie werden Einzelpläne. */
  const einzelplaene = data.documents.filter(
    (d) => d.kind === 'plan' && d.parentId !== null && weg.has(d.parentId) && !weg.has(d.id),
  );
  /** Davon laufen im Lauf des Verzeichnisses mit – sie erhalten dessen Stand in einem eigenen Planlauf. */
  const mitUebernahme = einzelplaene.filter(
    (p) =>
      !hatEigenenPlanlauf(p, data.documents) &&
      !data.runs.some((r) => r.documentId === p.id && r.status !== 'abgebrochen') &&
      data.runs.some((r) => r.documentId === p.parentId && r.status !== 'abgebrochen'),
  ).length;

  /** Planverzeichnis samt Angabe, ob seine Pläne mitgehen. */
  const verzeichnisText = (v: PlanDocument) => {
    const alle = data.documents.filter((d) => d.kind === 'plan' && d.parentId === v.id);
    const mit = alle.filter((d) => weg.has(d.id)).length;
    const zusatz =
      alle.length === 0
        ? 'ohne Pläne'
        : mit === alle.length
          ? `mit ${alle.length === 1 ? 'seinem Plan' : `allen ${alle.length} Plänen`}`
          : mit === 0
            ? `ohne seine ${plaeneText(alle.length)}`
            : `mit ${mit} von ${plaeneText(alle.length)}`;
    return `Planverzeichnis „${v.nummer ? `${v.nummer} · ` : ''}${v.titel}“ – ${zusatz}`;
  };

  const loeschen = () => {
    dokumenteLoeschen(ids);
    toast(`${eintraege(docs.length)} gelöscht.`);
    onFertig();
    onClose();
  };

  const sichern = () => {
    exportiereDaten(data);
    toast('Sicherung heruntergeladen.');
  };

  const GRENZE = 6;

  return (
    <Modal
      titel={`${eintraege(docs.length)} löschen?`}
      sub="Einträge und ihre Planläufe werden aus dem Bestand entfernt"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={sichern}>
            <Icon name="export" size={14} /> Sicherung vorher herunterladen
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary pli-rot" onClick={loeschen} disabled={docs.length === 0}>
            <Icon name="loeschen" size={14} /> {eintraege(docs.length)} löschen
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <ul className="pli-liste">
          {verzeichnisse.slice(0, GRENZE).map((v) => (
            <li key={v.id}>{verzeichnisText(v)}</li>
          ))}
          {verzeichnisse.length > GRENZE ? <li>{verzeichnisse.length - GRENZE} weitere Planverzeichnisse</li> : null}
          {einzelnGewaehlt.slice(0, GRENZE).map((p) => (
            <li key={p.id}>
              {DOCUMENT_KIND_LABEL[p.kind]} „{p.nummer ? `${p.nummer} · ` : ''}
              {p.titel}“
            </li>
          ))}
          {einzelnGewaehlt.length > GRENZE ? <li>{plaeneText(einzelnGewaehlt.length - GRENZE)} mehr</li> : null}
        </ul>
        <div className="small">
          {laeufe.length === 0 ? (
            'Keine Planläufe betroffen.'
          ) : (
            <>
              <strong>{laeufeText(laeufe.length)}</strong> {laeufe.length === 1 ? 'wird' : 'werden'} mit gelöscht
              {mitDaten > 0 ? (
                <>
                  , davon <strong>{mitDaten}</strong> mit erfassten Ist-Daten bzw. Protokoll – dieser Nachweis geht
                  verloren
                </>
              ) : null}
              .
            </>
          )}
        </div>
        {einzelplaene.length > 0 ? (
          <div className="small">
            <strong>{plaeneText(einzelplaene.length)}</strong> {einzelplaene.length === 1 ? 'wird Einzelplan' : 'werden Einzelpläne'}{' '}
            (ohne Planverzeichnis)
            {mitUebernahme > 0
              ? `; ${mitUebernahme === 1 ? 'einer läuft' : `${mitUebernahme} laufen`} im Planlauf des Verzeichnisses mit und ${
                  mitUebernahme === 1 ? 'erhält' : 'erhalten'
                } dessen Stand in einem eigenen Planlauf`
              : ''}
            .
          </div>
        ) : null}
        <Callout ton={mitDaten > 0 ? 'warn' : ''} icon={mitDaten > 0 ? '!' : 'i'}>
          Im Bestand bleibt nur ein Löschvermerk. Wer die Planläufe noch braucht, lädt vorher eine Sicherung herunter.
        </Callout>
      </div>
    </Modal>
  );
}
