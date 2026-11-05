/**
 * Projektbeteiligte aus Excel (.xlsx) oder CSV einlesen. Je Zeile eine Person
 * mit Funktion und wahlweise Gewerk; die Vorschau zeigt, was angelegt,
 * aktualisiert oder neu als Funktion bzw. Gewerk entsteht. Auch die
 * Excel-Ausgabe der Beteiligtenliste eines anderen Projekts lässt sich so
 * übernehmen.
 */
import { useRef, useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Callout, Modal } from '../../../shared/ui';
import { tabelleLesen } from '../../../shared/xlsxLesen';
import { BETEILIGTE_KOPF, beteiligteLesen, funktionsSchluessel, neueFunktion, type ImportZeile } from '../domain/beteiligteImport';
import { beteiligteVorlageLaden } from '../domain/export';
import { UEBERGREIFEND, funktionsName, personName, type ID, type Projekt } from '../domain/types';
import { useStore } from '../store/store';

const FARBEN = ['#24456e', '#5856d6', '#ff9500', '#34c759', '#ff3b30', '#af52de', '#00a0a0', '#c77700'];

export function BeteiligteImport({ projekt, onClose }: { projekt: Projekt; onClose: () => void }) {
  const { data, addFunktion, addBeteiligter, updateBeteiligter } = useStore();
  const toast = useToast();
  const eingabe = useRef<HTMLInputElement>(null);
  const [ueber, setUeber] = useState(false);
  const [fehler, setFehler] = useState('');
  const [datei, setDatei] = useState('');
  const [vorschau, setVorschau] = useState<ImportZeile[]>([]);

  const lies = async (f: File) => {
    setDatei(f.name);
    setFehler('');
    setVorschau([]);
    try {
      const tabellen = await tabelleLesen(f);
      const zeilen = beteiligteLesen(tabellen[0]?.zeilen ?? [], data, projekt.id);
      if (zeilen.length === 0) setFehler('Die Datei enthält keine Zeile mit einem Nachnamen.');
      setVorschau(zeilen);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
    }
  };

  const uebernehmen = () => {
    // Fehlende Funktionen je Bezeichnung und Gewerk einmal anlegen
    const neu = new Map<string, ID>();
    let farbe = data.funktionen.length;
    for (const z of vorschau) {
      if (z.funktion.id || !z.funktion.name) continue;
      const schluessel = funktionsSchluessel(z.funktion);
      if (neu.has(schluessel)) continue;
      neu.set(schluessel, addFunktion(neueFunktion(z.funktion.name, z.funktion.gewerk, FARBEN[farbe++ % FARBEN.length])));
    }
    let angelegt = 0;
    let aktualisiert = 0;
    const bearbeitet = new Set<ID>();
    for (const z of vorschau) {
      const funktionId = z.funktion.id ?? (z.funktion.name ? (neu.get(funktionsSchluessel(z.funktion)) ?? null) : null);
      if (z.vorhandenId) {
        // Vorhandene Person: nur ausgefüllte Angaben übernehmen
        const werte = Object.fromEntries(Object.entries(z.person).filter(([, v]) => v !== ''));
        updateBeteiligter(z.vorhandenId, { ...werte, ...(funktionId ? { funktionId } : {}) });
        if (!bearbeitet.has(z.vorhandenId)) aktualisiert++;
        bearbeitet.add(z.vorhandenId);
      } else {
        addBeteiligter({ ...z.person, projektId: projekt.id, funktionId });
        angelegt++;
      }
    }
    const teile = [`${angelegt} ${angelegt === 1 ? 'Person' : 'Personen'} aufgenommen`];
    if (aktualisiert > 0) teile.push(`${aktualisiert} aktualisiert`);
    if (neu.size > 0) teile.push(`${neu.size} ${neu.size === 1 ? 'Funktion' : 'Funktionen'} angelegt`);
    toast(`${teile.join(', ')}.`);
    onClose();
  };

  const mitHinweis = vorschau.filter((z) => z.hinweise.some((h) => h !== 'wird aktualisiert')).length;

  return (
    <Modal
      titel="Projektbeteiligte aus Excel einlesen"
      sub="Je Zeile eine Person mit ihrer Funktion; .xlsx oder .csv"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={beteiligteVorlageLaden}>
            <Icon name="export" size={14} /> Vorlage
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={uebernehmen} disabled={vorschau.length === 0}>
            {vorschau.length > 0 ? `${vorschau.length} Zeilen übernehmen` : 'Übernehmen'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div
          className={`drop-zone ${ueber ? 'over' : ''}`}
          onClick={() => eingabe.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setUeber(true);
          }}
          onDragLeave={() => setUeber(false)}
          onDrop={(e) => {
            e.preventDefault();
            setUeber(false);
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
            ref={eingabe}
            type="file"
            accept=".xlsx,.csv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void lies(f);
            }}
          />
        </div>

        {fehler ? (
          <Callout ton="error" icon="!">
            {fehler}
          </Callout>
        ) : null}

        {vorschau.length === 0 && !fehler ? (
          <Callout icon="i">
            Erwartete Spalten: <strong>{BETEILIGTE_KOPF.join(' · ')}</strong>. Zwingend ist nur <strong>Nachname</strong>{' '}
            (oder <strong>Name</strong> mit Vor- und Nachnamen). Funktionen und Gewerke, die es noch nicht gibt, werden
            angelegt; Personen gleichen Namens im Projekt werden aktualisiert. Über <em>Vorlage</em> erhalten Sie eine
            Datei mit genau diesen Spalten – die Excel-Ausgabe der Beteiligtenliste passt ebenso.
          </Callout>
        ) : null}

        {vorschau.length > 0 ? (
          <>
            {mitHinweis > 0 ? (
              <Callout ton="warn" icon="!">
                {mitHinweis} {mitHinweis === 1 ? 'Zeile' : 'Zeilen'} mit Hinweisen – sie werden trotzdem übernommen.
              </Callout>
            ) : null}
            <div className="card" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Funktion</th>
                    <th>Person</th>
                    <th>Kontakt</th>
                    <th>Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {vorschau.map((z, i) => (
                    <tr key={i}>
                      <td>
                        <strong>{z.funktion.name ? funktionsName(z.funktion) : '–'}</strong>
                        {z.funktion.name ? (
                          <div className="tertiary small">{z.funktion.gewerk ?? UEBERGREIFEND}</div>
                        ) : null}
                      </td>
                      <td>
                        {personName(z.person)}
                        {z.person.firma ? <div className="tertiary small">{z.person.firma}</div> : null}
                      </td>
                      <td className="small muted">{z.person.email || z.person.telefon || '–'}</td>
                      <td className="small" style={{ color: z.hinweise.length ? 'var(--accent)' : undefined }}>
                        {z.hinweise.join(' · ') || 'neu'}
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
