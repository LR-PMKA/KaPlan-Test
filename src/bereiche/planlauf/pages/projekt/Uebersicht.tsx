/**
 * Reiter „Planläufe“ eines Projekts: Kennzahlen und die Liste der Planläufe.
 *
 * Die Liste hat eine Mehrfachauswahl (Menge von Zeilenschlüsseln wie im
 * Export: Lauf-ID bzw. ID eines mitlaufenden Plans). Sie wird bei jedem
 * Filterwechsel auf die angezeigten Einträge beschnitten. Solange etwas gewählt
 * ist, bietet eine Aktionsleiste Sammelaktionen an; vor „Schritte erledigen …“,
 * „Erinnern …“ und „Versandmail …“ wird die Auswahl in Planläufe aufgelöst (ohne Dubletten,
 * gewählte mitlaufende Pläne wirken auf den Lauf ihres Verzeichnisses).
 */
import { useState } from 'react';
import { eigenstaendigeLaeufe, offeneFristen } from '../../domain/engine';
import {
  anstehendeSchritte,
  auswahlAufloesen,
  massgeblicheLaeufe,
  mitlaufendHinweis,
  mittlererFortschritt,
  statusWerte,
  waehlbareSchluessel,
} from '../../domain/uebersicht';
import { ExportDialog } from './ExportDialog';
import { Icon } from '../../../../shared/icons';
import { type Contact, type DocumentKind, type ID, type Project } from '../../domain/types';
import type { ProjektTab } from '../../lib/router';
import { useStore } from '../../store/store';
import { Card, CardHeader, EmptyState, Progress, Search, Segmented, Stat } from '../../../../shared/ui';
import { PlanlaufListe } from '../../components/PlanlaufListe';
import { SammelErledigen } from '../../components/SammelErledigen';
import { SammelErinnern } from '../../components/SammelErinnern';
import '../../components/auswahl.css';

/** Auswahl der Statusspalte – laufende Läufe nach ihrer Ampel. */
const STATUS_FILTER = [
  { value: 'angekuendigt', label: 'Angekündigt' },
  { value: 'geplant', label: 'Im Plan' },
  { value: 'faellig', label: 'Fällig' },
  { value: 'ueberfaellig', label: 'Überfällig' },
  { value: 'abgeschlossen', label: 'Abgeschlossen' },
  { value: 'abgebrochen', label: 'Abgebrochen' },
];

export function Uebersicht({
  project,
  gotoTab,
  oeffneLauf,
}: {
  project: Project;
  gotoTab: (t: ProjektTab) => void;
  oeffneLauf: (runId: string) => void;
}) {
  const { data } = useStore();
  // Gliederung der Planlaufliste: Pakete allein oder mit ihren Einträgen.
  // Pläne eines Planverzeichnisses hängen am Dreieck der Verzeichniszeile.
  const [ebene, setEbene] = useState<'1' | '2'>('2');
  // Filter der Planlaufliste
  const [suche, setSuche] = useState('');
  const [gewerkFilter, setGewerkFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [exportOffen, setExportOffen] = useState(false);
  /** Gewählte Zeilen der Liste (Lauf-ID bzw. ID eines mitlaufenden Plans). */
  const [auswahl, setAuswahl] = useState<Set<ID>>(() => new Set());
  /** Offene Sammelaktion – die Läufe werden beim Öffnen festgehalten. */
  const [aktion, setAktion] = useState<
    | { art: 'erledigen' | 'erinnern' | 'versand'; runIds: ID[]; hinweise: string[] }
    | { art: 'export' }
    | null
  >(null);
  const dokumente = data.documents.filter((d) => d.projectId === project.id);
  // Ohne die Läufe von Plänen, die in einem Planverzeichnis mitlaufen
  const laeufe = eigenstaendigeLaeufe(data.documents, data.runs).filter(
    (r) => r.projectId === project.id,
  );
  const aktiv = laeufe.filter((r) => r.status === 'laufend');
  const abgeschlossen = laeufe.filter((r) => r.status === 'abgeschlossen');

  // Je Eintrag der maßgebliche Lauf – der laufende, sonst der abgeschlossene;
  // abgebrochene Läufe stehen gesammelt am Ende (dieselbe Auswahl wie im Export).
  const massgeblich = massgeblicheLaeufe(data, project.id);
  /**
   * Status eines Laufs als Filterwerte – je anstehendem Schritt seine Ampel,
   * solange der Eingang beim Planlaufmanagement aussteht „angekündigt“ (ein
   * überfälliger Eingang zählt als überfällig). Der Filter trifft einen Lauf,
   * sobald einer seiner Schritte passt.
   */
  const statusVon = (r: (typeof laeufe)[number]) =>
    statusWerte(r, anstehendeSchritte(r), project.settings.erinnerungVorlaufTage);

  // Suche, Status und Personenauswahl über alle anstehenden Schritte (parallele Zweige)
  const gefiltert = massgeblich.filter((r) => {
    const doc = data.documents.find((d) => d.id === r.documentId);
    const anstehend = anstehendeSchritte(r);
    // Pläne eines Verzeichnisses gehören zu dessen Paket
    const elternId = doc?.kind === 'plan' ? doc.parentId : null;
    const paketId = (elternId ? dokumente.find((d) => d.id === elternId)?.paketId : undefined) ?? doc?.paketId;
    const paket = paketId ? dokumente.find((d) => d.id === paketId) : undefined;
    const text = [doc?.nummer, doc?.titel, doc?.index, r.name, ...anstehend.map((s) => s.name), paket?.titel]
      .join(' ')
      .toLowerCase();
    return (
      (!suche || text.includes(suche.toLowerCase())) &&
      (!gewerkFilter || (doc?.gewerk ?? '') === gewerkFilter) &&
      (!statusFilter || (statusVon(r) as string[]).includes(statusFilter)) &&
      (!personFilter || anstehend.some((s) => s.contactId === personFilter))
    );
  });

  // Auswahllisten aus dem Bestand des Projekts
  const gewerke = [...new Set(dokumente.map((d) => d.gewerk).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'de'),
  );
  const personenIds = [
    ...new Set(
      massgeblich
        .flatMap((r) => anstehendeSchritte(r).map((s) => s.contactId))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const personen = personenIds
    .map((id) => data.contacts.find((c) => c.id === id))
    .filter((c): c is Contact => Boolean(c))
    .sort((a, b) => a.nachname.localeCompare(b.nachname, 'de'));

  const filterAktiv = Boolean(suche || gewerkFilter || statusFilter || personFilter);

  // Auswahl: nur angezeigte, nicht abgebrochene Einträge sind wählbar. Bei
  // jedem Filterwechsel wird sie auf das Angezeigte beschnitten.
  const waehlbar = waehlbareSchluessel(data.documents, gefiltert);
  const filterSchluessel = [suche, gewerkFilter, statusFilter, personFilter].join('\u0000');
  const [zuletztGefiltert, setZuletztGefiltert] = useState(filterSchluessel);
  if (zuletztGefiltert !== filterSchluessel) {
    setZuletztGefiltert(filterSchluessel);
    setAuswahl((alt) => new Set([...alt].filter((id) => waehlbar.has(id))));
  }
  const gewaehlt = new Set([...auswahl].filter((id) => waehlbar.has(id)));
  const auswahlAendern = (ids: string[], an: boolean) =>
    setAuswahl((alt) => {
      const neu = new Set(alt);
      ids.forEach((id) => (an ? neu.add(id) : neu.delete(id)));
      return neu;
    });
  const aufgeloest = auswahlAufloesen(data.documents, gefiltert, gewaehlt);
  const laufendGewaehlt = aufgeloest.laeufe.filter((r) => r.status === 'laufend');
  const sammelAktion = (art: 'erledigen' | 'erinnern' | 'versand') =>
    setAktion({
      art,
      runIds: laufendGewaehlt.map((r) => r.id),
      hinweise: aufgeloest.mitlaufend.filter((m) => m.lauf.status === 'laufend').map(mitlaufendHinweis),
    });
  const filterLoeschen = () => {
    setSuche('');
    setGewerkFilter('');
    setStatusFilter('');
    setPersonFilter('');
  };

  const fristen = offeneFristen(data, [project.id]);
  const faellig = fristen.filter((f) => f.ampel === 'faellig').length;
  const ueberfaellig = fristen.filter((f) => f.ampel === 'ueberfaellig').length;
  const anzahl = (art: DocumentKind) => dokumente.filter((d) => d.kind === art).length;

  // Gesamtfortschritt: Mittel der (nach Fristen gewichteten) Lauf-Werte ohne abgebrochene
  const gesamt = mittlererFortschritt(data, laeufe);

  return (
    <div className="stack">
      <Card>
        <div className="kennzahlen">
          <Stat wert={anzahl('paket')} label="Planpakete" onClick={() => gotoTab('plaene')} />
          <Stat wert={anzahl('verzeichnis')} label="Planverzeichnisse" onClick={() => gotoTab('plaene')} />
          <Stat wert={anzahl('plan')} label="Pläne" onClick={() => gotoTab('plaene')} />
          <Stat wert={faellig} label="Fällige Schritte" ton={faellig ? 'orange' : ''} />
          <Stat wert={ueberfaellig} label="Überfällige Schritte" ton={ueberfaellig ? 'red' : 'green'} />
        </div>
        <div className="card-pad row" style={{ gap: 14 }}>
          <span className="small muted" style={{ flex: 'none' }}>
            Gesamtfortschritt der Planläufe
          </span>
          <span style={{ flex: 1 }}>
            <Progress wert={gesamt} />
          </span>
          <b className="small" style={{ flex: 'none', minWidth: 38, textAlign: 'right' }}>{gesamt}%</b>
        </div>
      </Card>

      <Card>
        <CardHeader
          titel="Planläufe"
          sub={
            filterAktiv
              ? `${gefiltert.length} von ${massgeblich.length} Einträgen · Spaltenüberschrift klicken zum Sortieren`
              : `${aktiv.length} laufend · ${abgeschlossen.length} abgeschlossen · Spaltenüberschrift klicken zum Sortieren`
          }
          actions={
            <span className="row wrap" style={{ gap: 10 }}>
              <Search value={suche} onChange={setSuche} placeholder="Nummer, Titel, Schritt …" />
              <Segmented<'1' | '2'>
                value={ebene}
                onChange={setEbene}
                options={[
                  { value: '1', label: 'Planpakete' },
                  { value: '2', label: '+ Pläne & Verzeichnisse' },
                ]}
              />
              {filterAktiv ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={filterLoeschen}>
                  Filter zurücksetzen
                </button>
              ) : null}
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setExportOffen(true)}>
                <Icon name="export" size={13} /> Export
              </button>
            </span>
          }
        />
        {gewaehlt.size > 0 ? (
          <div className="pll-leiste" role="toolbar" aria-label="Aktionen für die Auswahl">
            <span className="pll-anzahl">{gewaehlt.size} ausgewählt</span>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={laufendGewaehlt.length === 0}
              title={laufendGewaehlt.length === 0 ? 'Keiner der gewählten Planläufe läuft noch' : undefined}
              onClick={() => sammelAktion('erledigen')}
            >
              <Icon name="check" size={13} /> Schritte erledigen …
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={laufendGewaehlt.length === 0}
              title={laufendGewaehlt.length === 0 ? 'Keiner der gewählten Planläufe läuft noch' : undefined}
              onClick={() => sammelAktion('erinnern')}
            >
              <Icon name="mail" size={13} /> Erinnern …
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              disabled={laufendGewaehlt.length === 0}
              title={
                laufendGewaehlt.length === 0
                  ? 'Keiner der gewählten Planläufe läuft noch'
                  : 'Versandmail je Empfänger für die Pläne am Versandschritt'
              }
              onClick={() => sammelAktion('versand')}
            >
              <Icon name="mail" size={13} /> Versandmail …
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setAktion({ art: 'export' })}>
              <Icon name="export" size={13} /> Exportieren …
            </button>
            <span className="pll-leiste-rest" />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAuswahl(new Set())}>
              Auswahl aufheben
            </button>
          </div>
        ) : null}
        {massgeblich.length === 0 ? (
          <EmptyState
            icon="kette"
            titel="Noch kein Planlauf"
            text="Starten Sie einen Lauf für einen Plan oder ein Planverzeichnis."
          />
        ) : gefiltert.length === 0 ? (
          <EmptyState
            icon="suche"
            titel="Kein Eintrag passt zum Filter"
            text="Setzen Sie die Filter zurück, um wieder alle Planläufe zu sehen."
            action={
              <button type="button" className="btn btn-primary" onClick={filterLoeschen}>
                Filter zurücksetzen
              </button>
            }
          />
        ) : (
          <PlanlaufListe
            project={project}
            runs={gefiltert}
            spaltenFilter={{
              werte: { gewerk: gewerkFilter, zustaendig: personFilter, status: statusFilter },
              setzen: (feld, wert) => {
                if (feld === 'gewerk') setGewerkFilter(wert);
                else if (feld === 'zustaendig') setPersonFilter(wert);
                else setStatusFilter(wert);
              },
              optionen: {
                gewerk: gewerke.map((g) => ({ value: g, label: g })),
                zustaendig: personen.map((c) => ({ value: c.id, label: `${c.vorname} ${c.nachname}` })),
                status: STATUS_FILTER,
              },
            }}
            alleRuns={laeufe}
            ebene={Number(ebene) as 1 | 2}
            auswahl={gewaehlt}
            onAuswahl={auswahlAendern}
            oeffneLauf={oeffneLauf}
          />
        )}
      </Card>

      {exportOffen ? (
        <ExportDialog
          project={project}
          // Bei gesetztem Filter sind die Einträge vorgewählt, die die Liste zeigt –
          // mit den Plänen gebündelter Verzeichnisse und den abgebrochenen Läufen
          vorauswahl={
            filterAktiv
              ? new Set([...waehlbar, ...gefiltert.filter((r) => r.status === 'abgebrochen').map((r) => r.id)])
              : undefined
          }
          onClose={() => setExportOffen(false)}
        />
      ) : null}
      {aktion?.art === 'export' ? (
        <ExportDialog
          project={project}
          vorauswahl={gewaehlt}
          vorauswahlHinweis="Vorgewählt ist Ihre Auswahl im Reiter „Planläufe“."
          onClose={() => setAktion(null)}
        />
      ) : null}
      {aktion?.art === 'erledigen' ? (
        <SammelErledigen runIds={aktion.runIds} hinweise={aktion.hinweise} onClose={() => setAktion(null)} />
      ) : null}
      {aktion?.art === 'erinnern' || aktion?.art === 'versand' ? (
        <SammelErinnern
          art={aktion.art}
          runIds={aktion.runIds}
          hinweise={aktion.hinweise}
          onClose={() => setAktion(null)}
        />
      ) : null}
    </div>
  );
}
