/**
 * Export der Planläufe eines Projekts als Excel-Arbeitsmappe oder PDF (über
 * den Druckdialog).
 *
 * Kurzfassung: als PDF genau die Angaben der Übersicht im Reiter „Planläufe“,
 * in Excel ein formatiertes Blatt nach Planpaket, Plancode, Stand und Frist.
 * Langfassung: zusätzlich alle durchlaufenen und ausstehenden Schritte.
 * Die Auswahl der Einträge ist wie die Übersicht nach Planpaketen gegliedert;
 * gewählt wird je Planlauf bzw. mitlaufendem Plan. Ein Verzeichnis wählt die
 * Pläne unter sich mit, ein mitlaufender Plan sein Verzeichnis.
 */
import { useState } from 'react';
import {
  EXPORT_STIL,
  berichtBilden,
  exportDateiname,
  exportHtml,
  kurzBlatt,
  langBlatt,
  zeilenSchluessel,
  type BerichtGruppe,
  type BerichtZeile,
  type ExportUmfang,
} from '../../domain/export';
import { INDEX_LABEL, type ID, type PlanDocument, type Project } from '../../domain/types';
import { druckeHtml } from '../../../../shared/print';
import { dateiLaden, xlsxErzeugen } from '../../../../shared/xlsx';
import { useStore } from '../../store/store';
import { useToast } from '../../../../shared/toast';
import { Callout, Field, Modal, Segmented } from '../../../../shared/ui';
import { DocKindIcon } from '../../components/common';
import { Icon } from '../../../../shared/icons';

/** Auswählbare Schlüssel einer Zeilenfolge (Klammern selbst sind nicht auswählbar). */
const schluesselVon = (zeilen: BerichtZeile[]): ID[] =>
  [...new Set(zeilen.map(zeilenSchluessel).filter((id): id is ID => Boolean(id)))];

/** Die Zeilen unter einer Zeile der obersten Ebene – bis zur nächsten. */
function unterzeilen(zeilen: BerichtZeile[], index: number): BerichtZeile[] {
  const kinder: BerichtZeile[] = [];
  for (const z of zeilen.slice(index + 1)) {
    if (z.ebene === 0) break;
    kinder.push(z);
  }
  return kinder;
}

export function ExportDialog({
  project,
  vorauswahl,
  vorauswahlHinweis,
  onClose,
}: {
  project: Project;
  /**
   * Vorgewählte Zeilen – Schlüssel wie `zeilenSchluessel` (Lauf-ID bzw. ID eines
   * mitlaufenden Plans), etwa die Auswahl oder die gefilterte Liste im Reiter
   * „Planläufe“. Ohne Angabe ist alles gewählt.
   */
  vorauswahl?: Set<ID>;
  /** Erklärt, woher die Vorauswahl stammt. */
  vorauswahlHinweis?: string;
  onClose: () => void;
}) {
  const { data } = useStore();
  const toast = useToast();

  // Die Auswahl zeigt alles, was die Übersicht zeigt – in derselben Gliederung.
  const bericht = berichtBilden(data, project);
  const alleZeilen = bericht.gruppen.flatMap((g) => g.zeilen);
  const alleIds = schluesselVon(alleZeilen);

  const [umfang, setUmfang] = useState<ExportUmfang>('kurz');
  const [auswahl, setAuswahl] = useState<Set<ID>>(() =>
    vorauswahl ? new Set(alleIds.filter((id) => vorauswahl.has(id))) : new Set(alleIds),
  );

  const gewaehlt = alleIds.filter((id) => auswahl.has(id)).length;
  // Gesperrt wird nach dem Ergebnis, nicht nach der Zahl der Haken
  const leer = berichtBilden(data, project, auswahl).gruppen.every((g) => g.zeilen.length === 0);

  const umschalten = (ids: ID[], mit: ID[] = []) =>
    setAuswahl((alt) => {
      const neu = new Set(alt);
      const alleDrin = ids.every((id) => neu.has(id));
      ids.forEach((id) => (alleDrin ? neu.delete(id) : neu.add(id)));
      // Wer einen mitlaufenden Plan wählt, wählt den Lauf seines Verzeichnisses mit
      if (!alleDrin) mit.forEach((id) => neu.add(id));
      return neu;
    });

  const alleUmschalten = () => setAuswahl(gewaehlt === alleIds.length ? new Set() : new Set(alleIds));

  const alsExcel = () => {
    if (leer) {
      toast('Bitte mindestens einen Eintrag auswählen.');
      return;
    }
    const blatt =
      umfang === 'kurz'
        ? kurzBlatt(data, project, auswahl)
        : langBlatt(data, project, auswahl);
    const blob = xlsxErzeugen([blatt]);
    dateiLaden(blob, `${exportDateiname(project, umfang)}.xlsx`);
    toast('Excel-Datei wurde erzeugt.');
    onClose();
  };

  const alsPdf = () => {
    if (leer) {
      toast('Bitte mindestens einen Eintrag auswählen.');
      return;
    }
    druckeHtml(exportDateiname(project, umfang), exportHtml(data, project, auswahl, umfang), EXPORT_STIL);
    toast('Druckdialog geöffnet – dort „Als PDF sichern“ wählen.');
  };

  /**
   * Haken für eine Gruppe von Einträgen – gesetzt, wenn alle gewählt sind. Als
   * Funktion aufgerufen, nicht als Komponente: so bleibt das Element beim
   * Umschalten bestehen und behält den Fokus.
   */
  const haken = (ids: ID[], mit: ID[] = []) => (
    <input
      type="checkbox"
      checked={ids.length > 0 && ids.every((id) => auswahl.has(id))}
      ref={(el) => {
        if (el) el.indeterminate = ids.some((id) => auswahl.has(id)) && !ids.every((id) => auswahl.has(id));
      }}
      onChange={() => umschalten(ids, mit)}
      style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
    />
  );

  /** Nummer, Index und Titel – ein abgebrochener Lauf mit seinem eigenen Index. */
  const eintragText = (doc: PlanDocument | undefined, name: string, index = doc?.index) => (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="num">
        {doc?.nummer}
        {doc && index ? ` · ${INDEX_LABEL[doc.kind]} ${index}` : ''}
      </span>{' '}
      <strong>{doc?.titel ?? name}</strong>
    </span>
  );

  const gruppenTitel = (g: BerichtGruppe) =>
    g.art === 'paket' ? g.paket?.titel : g.art === 'ohne-paket' ? 'Ohne Planpaket' : 'Abgebrochen';

  return (
    <Modal
      titel="Planläufe exportieren"
      sub={`${project.nummer} · ${project.name}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-outline" onClick={alsPdf} disabled={leer}>
            <Icon name="export" size={14} /> PDF
          </button>
          <button type="button" className="btn btn-primary" onClick={alsExcel} disabled={leer}>
            <Icon name="export" size={14} /> Excel
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <Field label="Umfang">
          <Segmented<ExportUmfang>
            value={umfang}
            onChange={setUmfang}
            options={[
              { value: 'kurz', label: 'Kurzfassung' },
              { value: 'lang', label: 'Langfassung' },
            ]}
          />
          <span className="hint">
            {umfang === 'kurz'
              ? 'Als PDF genau die Angaben des Reiters „Planläufe“ wie im Programm: Aktueller Stand, Nächster Schritt, Zuständig, Fortschritt und Status. In Excel die Spalten Planpaket, Plancode, Index/Ausgabe, Titel, Gewerk, Aktueller Stand, Datum, Nächster Schritt und Frist; abgeschlossene Planläufe grün und abgebrochene grau gesondert am Ende.'
              : 'Je Planlauf alle bereits durchlaufenen und alle ausstehenden Schritte mit Durchlauf, Verantwortlichen, Seite, Eingang, Soll, Ist und Verzug – frühere Durchläufe als eigene Zeilen, gegliedert nach Planpaketen.'}
          </span>
        </Field>

        <div>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
              Einträge ({gewaehlt} von {alleIds.length})
            </label>
            <button type="button" className="btn btn-sm btn-ghost" onClick={alleUmschalten}>
              {gewaehlt === alleIds.length ? 'Keinen' : 'Alle'} auswählen
            </button>
          </div>

          {vorauswahl ? (
            <p className="small tertiary" style={{ marginBottom: 6 }}>
              {vorauswahlHinweis ?? 'Vorgewählt sind die Einträge, die der Filter im Reiter „Planläufe“ zeigt.'}
            </p>
          ) : null}

          {alleIds.length === 0 ? (
            <Callout ton="warn" icon="!">
              In diesem Projekt gibt es noch keinen Planlauf.
            </Callout>
          ) : (
            <div className="card" style={{ maxHeight: 300, overflowY: 'auto' }}>
              {bericht.gruppen.map((gruppe, gi) => {
                const ids = schluesselVon(gruppe.zeilen);
                const kopf = gruppe.art !== 'ohne-paket' || bericht.mitPaketen;
                return (
                  <div key={gi}>
                    {kopf ? (
                      <label className="list-row clickable" style={{ cursor: 'pointer', background: 'var(--fill-gruppe)' }}>
                        {haken(ids)}
                        {gruppe.art === 'paket' ? <DocKindIcon kind="paket" /> : null}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong>{gruppenTitel(gruppe)}</strong>
                          <span className="small tertiary">
                            {' '}
                            · {ids.length} {ids.length === 1 ? 'Eintrag' : 'Einträge'}
                          </span>
                        </span>
                      </label>
                    ) : null}
                    {gruppe.zeilen.map((zeile, zi) => {
                      const einzug = (kopf ? 26 : 0) + zeile.ebene * 22;
                      if (zeile.art === 'klammer') {
                        // Die Klammer wählt die Pläne aus, die unter ihr folgen
                        return (
                          <label key={zi} className="list-row clickable" style={{ cursor: 'pointer', paddingLeft: 20 + einzug }}>
                            {haken(schluesselVon(unterzeilen(gruppe.zeilen, zi)))}
                            <DocKindIcon kind="verzeichnis" />
                            {eintragText(zeile.verzeichnis, '')}
                            <span className="small tertiary">Pläne einzeln</span>
                          </label>
                        );
                      }
                      const id = zeilenSchluessel(zeile)!;
                      const doc = zeile.art === 'mitlaufend' ? zeile.plan : zeile.eintrag.doc;
                      // Ein Verzeichnis wählt seine Pläne mit, ein mitlaufender Plan sein Verzeichnis
                      const ids = zeile.ebene === 0 ? [id, ...schluesselVon(unterzeilen(gruppe.zeilen, zi))] : [id];
                      const mit = zeile.art === 'mitlaufend' ? [zeile.verzeichnisLauf.id] : [];
                      const run = zeile.art === 'lauf' ? zeile.eintrag.run : undefined;
                      const index = run?.status === 'abgebrochen' ? run.index : doc?.index;
                      return (
                        <label key={zi} className="list-row clickable" style={{ cursor: 'pointer', paddingLeft: 20 + einzug }}>
                          {haken(ids, mit)}
                          {doc ? <DocKindIcon kind={doc.kind} /> : null}
                          {eintragText(doc, run?.name ?? '', index)}
                          {zeile.art === 'mitlaufend' ? (
                            <span className="small tertiary">läuft im Verzeichnis mit</span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="small tertiary">
          Excel wird als .xlsx-Datei heruntergeladen. Für PDF öffnet sich der Druckdialog des Browsers – dort
          „Als PDF sichern“ (bzw. „Microsoft Print to PDF“) wählen.
        </p>
      </div>
    </Modal>
  );
}
