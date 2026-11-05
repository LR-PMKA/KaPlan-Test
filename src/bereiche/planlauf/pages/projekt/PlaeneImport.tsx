/**
 * Einlesen von Plänen, Planpaketen und Planverzeichnissen aus einer Excel-Datei
 * (.xlsx) oder Textliste (.csv).
 *
 * Übergeordnete Einträge werden über die Spalten „Planpaket“ und
 * „Planverzeichnis“ zugeordnet. Jeder Eintrag mit eigenem Planlauf startet
 * ihn beim Import – nach dem in der Datei genannten Workflow, sonst nach dem
 * im Dialog gewählten. Pläne eines gebündelten Verzeichnisses laufen in dessen
 * Lauf mit; ein beim Import neu angelegtes Verzeichnis startet seinen Lauf ebenso.
 */
import { useRef, useState } from 'react';
import {
  DOCUMENT_KIND_LABEL,
  hatEigenenPlanlauf,
  verzeichnisGebuendelt,
  type DocumentKind,
  type PlanDocument,
  type ProcessTemplate,
  type Project,
} from '../../domain/types';
import { datumLesen, spaltenZuordnen, tabelleLesen } from '../../../../shared/xlsxLesen';
import {
  PLAN_KOPFZEILE as KOPFZEILE,
  PLAN_SPALTEN as SPALTEN,
  planVorlageLaden,
} from '../../domain/importVorlagen';
import { laufUeberfuehrt, planlaufAusWorkflow } from '../../domain/engine';
import { formatDate, today } from '../../../../shared/dates';
import { newId, useStore } from '../../store/store';
import { useToast } from '../../../../shared/toast';
import { Callout, Field, Modal, Select } from '../../../../shared/ui';
import { Icon } from '../../../../shared/icons';

/** Erkennt die Art aus der Spaltenangabe. */
function artLesen(wert: string): DocumentKind {
  const t = wert.trim().toLowerCase();
  if (t.startsWith('planpaket') || t === 'paket' || t === 'pp') return 'paket';
  if (t.startsWith('planverzeichnis') || t === 'verzeichnis' || t === 'pv') return 'verzeichnis';
  return 'plan';
}

interface Zeile {
  doc: Omit<PlanDocument, 'id' | 'parentId' | 'paketId'>;
  parentNummer: string;
  /** Name des Planpakets; leer = keinem Paket zugeordnet. */
  paketName: string;
  /** Name des Workflows aus der Liste; leer = der im Dialog gewählte Workflow. */
  workflow: string;
  /** In der Liste genannter, hinterlegter Workflow; null = der im Dialog gewählte. */
  workflowId: string | null;
  hinweis: string;
}

export function PlaeneImport({ project, onClose }: { project: Project; onClose: () => void }) {
  const { data, addDocument, updateDocument, addRun } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [fehler, setFehler] = useState('');
  const [datei, setDatei] = useState('');
  const [vorschau, setVorschau] = useState<Zeile[]>([]);

  const vorhandene = data.documents.filter((d) => d.projectId === project.id);
  const vorlagen = data.templates.filter((t) => t.projectId === null || t.projectId === project.id);
  const rollen = data.roles.filter((r) => r.projectId === project.id);
  const kontakte = data.contacts.filter((c) => c.projectId === project.id);

  const vorlage = planVorlageLaden;

  /** Workflow für Einträge, deren Zeile keinen (hinterlegten) Workflow nennt. */
  const [standardId, setStandardId] = useState(vorlagen[0]?.id ?? '');
  const standard = vorlagen.find((t) => t.id === standardId);
  /** Der Workflow, nach dem der Planlauf einer Zeile startet. */
  const workflowVon = (z: Pick<Zeile, 'workflowId'>): ProcessTemplate | undefined =>
    vorlagen.find((t) => t.id === z.workflowId) ?? standard;

  /**
   * Läuft der Eintrag einer Zeile selbst? Pakete nie; Pläne eines Verzeichnisses
   * nur, wenn ein vorhandenes Verzeichnis seine Pläne einzeln führt – ein neu
   * angelegtes Verzeichnis läuft gebündelt, seine Pläne laufen darin mit.
   */
  const laufArt = (z: Pick<Zeile, 'doc' | 'parentNummer'>): 'kein' | 'mit' | 'eigen' => {
    if (z.doc.kind === 'paket') return 'kein';
    if (z.doc.kind === 'verzeichnis' || !z.parentNummer) return 'eigen';
    const eltern = vorhandenesVerzeichnis(z.parentNummer);
    return eltern && !verzeichnisGebuendelt(eltern) ? 'eigen' : 'mit';
  };

  /** Trägt ein Eintrag den Namen – als Codierung bzw. Kurzzeichen oder als Titel? */
  const heisst = (e: { nummer: string; titel: string }, name: string) => e.nummer === name || e.titel === name;
  /** Vorhandenes Planverzeichnis des Projekts, das eine Zeile nennt. */
  const vorhandenesVerzeichnis = (name: string) =>
    vorhandene.find((d) => d.kind === 'verzeichnis' && heisst(d, name));
  /**
   * Hatte der Eintrag schon einen Planlauf? Ein abgebrochener startet nicht von
   * selbst neu; überführte Läufe (aufgeteilt, gebündelt, neu gestartet) zählen nicht.
   */
  const hatLauf = (docId: string) => data.runs.some((r) => r.documentId === docId && !laufUeberfuehrt(r));

  const lies = async (f: File) => {
    setFehler('');
    setVorschau([]);
    setDatei(f.name);
    try {
      const tabellen = await tabelleLesen(f);
      const tabelle = tabellen.find((t) => t.zeilen.length > 1) ?? tabellen[0];
      if (!tabelle || tabelle.zeilen.length < 2) {
        setFehler('Die Datei enthält keine Datenzeilen.');
        return;
      }
      const [kopf, ...zeilen] = tabelle.zeilen;
      const spalten = spaltenZuordnen(kopf, SPALTEN);
      if (spalten.nummer === undefined && spalten.titel === undefined) {
        setFehler(
          `Weder „Plancodierung“ noch „Titel“ gefunden. Gelesene Überschriften: ${kopf.join(', ') || '(keine)'}`,
        );
        return;
      }

      const wert = (zeile: string[], feld: string) =>
        spalten[feld] !== undefined ? (zeile[spalten[feld]] ?? '').trim() : '';

      // Pakete und Verzeichnisse dürfen in derselben Datei stehen, die sie nennt
      const inDatei = zeilen.map((zeile) => ({
        kind: artLesen(wert(zeile, 'art')),
        nummer: wert(zeile, 'nummer'),
        titel: wert(zeile, 'titel'),
      }));
      const bekannt = (kind: DocumentKind, name: string) =>
        vorhandene.some((d) => d.kind === kind && heisst(d, name)) ||
        inDatei.some((e) => e.kind === kind && heisst(e, name));

      const ergebnis: Zeile[] = zeilen.map((zeile) => {
        const art = artLesen(wert(zeile, 'art'));
        const nummer = wert(zeile, 'nummer');
        const parentNummer = wert(zeile, 'parent');
        const paketName = wert(zeile, 'paket');
        const workflow = wert(zeile, 'workflow');
        const hinweise: string[] = [];

        if (vorhandene.some((d) => d.nummer && d.nummer === nummer)) {
          hinweise.push('Eintrag mit dieser Bezeichnung ist bereits vorhanden');
        }
        if (nummer && inDatei.filter((e) => e.nummer === nummer).length > 1) {
          hinweise.push('Bezeichnung kommt in der Datei mehrfach vor');
        }
        if (parentNummer && art !== 'plan') hinweise.push('nur Pläne können einem Planverzeichnis zugeordnet werden');
        if (paketName && !bekannt('paket', paketName)) hinweise.push(`Planpaket „${paketName}“ wird angelegt`);
        if (art === 'plan' && parentNummer) {
          const eltern = vorhandenesVerzeichnis(parentNummer);
          if (!bekannt('verzeichnis', parentNummer)) {
            hinweise.push(`Planverzeichnis „${parentNummer}“ wird angelegt`);
          } else if (eltern && verzeichnisGebuendelt(eltern) && !hatLauf(eltern.id)) {
            hinweise.push(`Planverzeichnis „${parentNummer}“ startet seinen Planlauf`);
          }
        }

        const vorlage = workflow
          ? vorlagen.find((t) => t.name.trim().toLowerCase() === workflow.toLowerCase())
          : undefined;
        if (workflow && !vorlage) {
          hinweise.push(`Workflow „${workflow}“ ist nicht hinterlegt – es gilt der im Dialog gewählte`);
        }

        return {
          doc: {
            projectId: project.id,
            kind: art,
            nummer,
            titel: wert(zeile, 'titel') || nummer,
            index: wert(zeile, 'index'),
            gewerk: wert(zeile, 'gewerk'),
            planungsphase: wert(zeile, 'planungsphase'),
            eingangSoll: datumLesen(wert(zeile, 'eingangSoll')),
            datum: art === 'verzeichnis' ? datumLesen(wert(zeile, 'datum')) : null,
            bemerkung: wert(zeile, 'bemerkung'),
          },
          parentNummer: art === 'plan' ? parentNummer : '',
          paketName: art === 'paket' ? '' : paketName,
          workflow,
          workflowId: vorlage?.id ?? null,
          hinweis: hinweise.join('; '),
        };
      });

      setVorschau(ergebnis.filter((e) => e.doc.nummer || e.doc.titel));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
    }
  };

  const uebernehmen = () => {
    // Erst die übergeordneten Einträge, damit die Zuordnung greifen kann
    const reihenfolge = [...vorschau].sort((a, b) => (a.parentNummer ? 1 : 0) - (b.parentNummer ? 1 : 0));
    /** Neu angelegter Eintrag je Zeile – die Codierung kann fehlen oder doppelt sein. */
    const ids = new Map<Zeile, string>();
    /** In diesem Import angelegte Einträge – auffindbar über Codierung und Titel. */
    const neue: { id: string; kind: DocumentKind; nummer: string; titel: string }[] = [];

    for (const z of reihenfolge) {
      const id = addDocument({ ...z.doc, parentId: null, paketId: null });
      ids.set(z, id);
      neue.push({ id, kind: z.doc.kind, nummer: z.doc.nummer, titel: z.doc.titel });
    }

    // Ein fehlendes Verzeichnis übernimmt das früheste Eingang Soll der Pläne,
    // die es nennen – sein Planlauf trägt deren Eingang.
    const eingangVon = new Map<string, string>();
    for (const z of vorschau) {
      if (!z.parentNummer || !z.doc.eingangSoll) continue;
      const bisher = eingangVon.get(z.parentNummer);
      if (!bisher || z.doc.eingangSoll < bisher) eingangVon.set(z.parentNummer, z.doc.eingangSoll);
    }

    let ergaenzt = 0;
    const gestartet = new Set<string>();
    /** Startet den Planlauf eines Eintrags nach dem Workflow seiner Zeile – je Eintrag einmal. */
    const laufStarten = (
      documentId: string,
      eintrag: { kind: DocumentKind; nummer: string; titel: string; index: string; gewerk: string },
      workflow: ProcessTemplate | undefined,
    ) => {
      if (!workflow || gestartet.has(documentId)) return;
      gestartet.add(documentId);
      addRun(
        planlaufAusWorkflow(
          workflow,
          { ...eintrag, projectId: project.id, documentId },
          kontakte,
          rollen,
          today(),
          () => newId('rs'),
        ),
      );
    };
    /** Legt ein in der Liste genanntes, aber noch unbekanntes Paket bzw.
     *  Verzeichnis an, damit die Zuordnung nicht verloren geht. Ein neues
     *  Verzeichnis läuft gebündelt und startet seinen Planlauf sofort – nach
     *  dem Workflow der Zeile, die es nennt. */
    const findenOderAnlegen = (
      name: string,
      kind: 'paket' | 'verzeichnis',
      gewerk: string,
      workflow: ProcessTemplate | undefined,
    ): string => {
      const vorhandenerEintrag =
        neue.find((n) => n.kind === kind && heisst(n, name))?.id ??
        vorhandene.find((d) => d.kind === kind && heisst(d, name))?.id;
      if (vorhandenerEintrag) return vorhandenerEintrag;
      const neu = {
        projectId: project.id,
        kind,
        parentId: null,
        paketId: null,
        nummer: kind === 'verzeichnis' ? name : '',
        titel: name,
        index: '',
        gewerk,
        planungsphase: '',
        eingangSoll: kind === 'verzeichnis' ? (eingangVon.get(name) ?? null) : null,
        datum: null,
        bemerkung: 'beim Import angelegt',
      };
      const id = addDocument(neu);
      neue.push({ id, kind, nummer: neu.nummer, titel: name });
      ergaenzt += 1;
      if (kind === 'verzeichnis') laufStarten(id, neu, workflow);
      return id;
    };

    for (const z of reihenfolge) {
      const eigeneId = ids.get(z)!;

      // Zuordnungen nachziehen; fehlende Pakete und Verzeichnisse entstehen dabei
      const parentId = z.parentNummer
        ? findenOderAnlegen(z.parentNummer, 'verzeichnis', z.doc.gewerk, workflowVon(z))
        : null;
      const paketId = z.paketName ? findenOderAnlegen(z.paketName, 'paket', z.doc.gewerk, undefined) : null;
      if (parentId || paketId) updateDocument(eigeneId, { parentId, paketId });

      // Ein vorhandenes gebündeltes Verzeichnis ohne Planlauf startet ihn jetzt –
      // sonst liefe der Plan nirgends mit.
      const eltern = vorhandene.find((d) => d.id === parentId);
      if (eltern && verzeichnisGebuendelt(eltern) && !hatLauf(eltern.id)) {
        laufStarten(eltern.id, eltern, workflowVon(z));
      }

      // Jeder Eintrag mit eigenem Planlauf startet ihn sofort. Ein im Import neu
      // angelegtes Verzeichnis ist gebündelt; ein vorhandenes kann seine Pläne
      // einzeln führen – dann erhält auch dieser Plan einen Lauf.
      if (!hatEigenenPlanlauf({ kind: z.doc.kind, parentId }, data.documents)) continue;
      laufStarten(eigeneId, z.doc, workflowVon(z));
    }

    const teile = [`${vorschau.length} Einträge übernommen`];
    if (ergaenzt > 0) teile.push(`${ergaenzt} Paket(e)/Verzeichnis(se) ergänzt`);
    if (gestartet.size > 0) teile.push(`${gestartet.size} Planläufe gestartet`);
    toast(`${teile.join(', ')}.`);
    onClose();
  };

  const mitHinweis = vorschau.filter((v) => v.hinweis).length;

  return (
    <Modal
      titel="Pläne aus Excel einlesen"
      sub="Erste Zeile als Spaltenüberschriften; .xlsx oder .csv"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={vorlage}>
            <Icon name="export" size={14} /> Vorlage
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={uebernehmen}
            disabled={vorschau.length === 0 || !standard}
          >
            {vorschau.length > 0 ? `${vorschau.length} Einträge übernehmen` : 'Übernehmen'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div
          className={`drop-zone ${over ? 'over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void lies(f);
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <Icon name="importieren" size={26} strokeWidth={1.4} />
          </div>
          {datei ? (
            <>
              <strong>{datei}</strong>
              <div className="small">Andere Datei wählen</div>
            </>
          ) : (
            <>
              <strong>Excel- oder CSV-Datei hierher ziehen</strong>
              <div className="small">oder klicken, um eine Datei auszuwählen</div>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lies(f);
            }}
          />
        </div>

        {fehler ? (
          <Callout ton="error" icon="!">
            {fehler}
          </Callout>
        ) : null}

        <Field
          label="Workflow für Einträge ohne Angabe"
          hint="Jeder Plan und jedes Planverzeichnis mit eigenem Planlauf startet ihn beim Import – nach dem Workflow aus der Spalte „Workflow“, sonst nach diesem."
        >
          <Select
            value={standardId}
            onChange={setStandardId}
            options={vorlagen.map((t) => ({ value: t.id, label: `${t.name} (${t.steps.length} Schritte)` }))}
          />
        </Field>

        {vorschau.length === 0 && !fehler ? (
          <Callout icon="i">
            Erwartete Spalten: <strong>{KOPFZEILE.join(' · ')}</strong>. In <em>Art</em> steht Plan, Planpaket
            oder Planverzeichnis. Der Planlauf startet beim Import immer – nach dem in <em>Workflow</em>
            genannten Workflow, sonst nach dem oben gewählten. <em>Planpaket</em> ordnet den Eintrag einem Paket zu (reines
            Ordnungsmerkmal), <em>Planverzeichnis</em> ordnet einen Plan einem Verzeichnis unter – solche Pläne
            laufen im Planlauf des Verzeichnisses mit und erhalten keinen eigenen. Noch nicht angelegte Pakete
            und Verzeichnisse entstehen beim Import automatisch. Über <em>Vorlage</em> erhalten Sie eine Datei
            mit genau diesen Spalten.
          </Callout>
        ) : null}

        {vorschau.length > 0 ? (
          <>
            {mitHinweis > 0 ? (
              <Callout ton="warn" icon="!">
                {mitHinweis} Zeile(n) mit Hinweisen – bitte vor dem Übernehmen prüfen.
              </Callout>
            ) : null}
            <div className="card" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Art</th>
                    <th>Bezeichnung / Titel</th>
                    <th>Gewerk</th>
                    <th>Eingang Soll</th>
                    <th>Workflow</th>
                    <th>Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {vorschau.map((z, i) => (
                    <tr key={i}>
                      <td className="small muted">{DOCUMENT_KIND_LABEL[z.doc.kind]}</td>
                      <td>
                        <span className="num">{z.doc.nummer}</span>
                        <div>
                          <strong>{z.doc.titel}</strong>
                          {z.doc.index ? <span className="tertiary small"> · {z.doc.index}</span> : null}
                        </div>
                      </td>
                      <td className="small muted">{z.doc.gewerk || '–'}</td>
                      <td className="small">{z.doc.eingangSoll ? formatDate(z.doc.eingangSoll) : '–'}</td>
                      <td className="small muted">
                        {laufArt(z) === 'kein'
                          ? '–'
                          : laufArt(z) === 'mit'
                            ? 'läuft im Verzeichnis mit'
                            : (workflowVon(z)?.name ?? '–')}
                        {laufArt(z) === 'eigen' && !vorlagen.some((t) => t.id === z.workflowId) ? (
                          <span className="tertiary small"> (gewählter Workflow)</span>
                        ) : null}
                        {z.parentNummer ? (
                          <div className="tertiary small">untergeordnet: {z.parentNummer}</div>
                        ) : null}
                      </td>
                      <td className="small" style={{ color: z.hinweis ? 'var(--orange)' : undefined }}>
                        {z.hinweis || '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
