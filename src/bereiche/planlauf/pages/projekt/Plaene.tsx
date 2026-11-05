/**
 * Planliste: alle Planpakete, Pläne und Planverzeichnisse eines Projekts zum
 * Nachschlagen und Bearbeiten.
 *
 * Die Planpakete gliedern die Liste – je Paket seine Einträge, danach die
 * ohne Paket. Die Liste führt die Stammdaten – Art, Bezeichnung, Gewerk,
 * Zugehörigkeit und den Soll-Termin des Eingangs. Der Stand der Planläufe
 * steht im Reiter „Planläufe“. Planpakete werden hier angelegt und gepflegt.
 *
 * Mehrfachauswahl: Die Kästchen-Spalte wählt Einträge für die Sammelaktionen
 * (Planpaket zuweisen, neues Planpaket, Gewerk/Planungsphase, Löschen). Das
 * Kästchen eines Planverzeichnisses steht für das Verzeichnis samt seinen
 * Plänen („teilweise“, wenn die Auswahl davon abweicht); Planpaket, „Ohne
 * Planpaket“ und Kopfzeile wählen ihren Inhalt. Gewählt bleiben nur sichtbare
 * Einträge – Suche und Filter beschneiden die Auswahl.
 */
import { Fragment, useEffect, useState } from 'react';
import {
  gewerkeFuerProjekt,
  laufUeberfuehrt,
  lfdNummern,
  funktionenFuerGewerk,
  kontaktFuerRolleUndGewerk,
  planlaufName,
  laufSchritteAusVorlage,
  vorlagenSchritte,
} from '../../domain/engine';
import { formatDate, today } from '../../../../shared/dates';
import {
  DOCUMENT_KIND_LABEL,
  INDEX_LABEL,
  NUMMER_LABEL,
  PLANUNGSPHASEN,
  SCHRITT_EINGANG,
  hatEigenenPlanlauf,
  istEingangPLM,
  verzeichnisGebuendelt,
  type DocumentKind,
  type ID,
  type PlanDocument,
  type ProcessTemplateStep,
  type Project,
} from '../../domain/types';
import { newId, useStore } from '../../store/store';
import { useToast } from '../../../../shared/toast';
import { DocKindIcon } from '../../components/common';
import { LaufSchritte } from '../../components/AblaufVorschau';
import { PlaeneImport } from './PlaeneImport';
import { BuendelnDialog, planeMitEigenemLauf } from '../../components/BuendelnDialog';
import { PaketDialog } from '../../components/PaketDialog';
import { paketVon } from '../../domain/uebersicht';
import { aktuelleSchritte } from '../../domain/ablauf';
import { EintraegeAendernDialog, EintraegeLoeschenDialog, PaketZuweisenDialog } from '../../components/PlanlisteAktionen';
import '../../components/planliste.css';
import {
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Search,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from '../../../../shared/ui';
import { Icon } from '../../../../shared/icons';

type Filter = 'alle' | 'plan' | 'verzeichnis';

/** Sonderwert der Auswahlfelder: Eintrag direkt neu anlegen. */
const NEU = '__neu__';
type SortFeld = 'lfd' | 'kind' | 'nummer' | 'titel' | 'gewerk' | 'parent' | 'eingangSoll';

/** Kennung der Gruppe „ohne Planpaket“ beim Auf- und Zuklappen. */
const OHNE_PAKET = '__ohne-paket__';

type Kaestchenzustand = 'an' | 'aus' | 'teilweise';
type Sammelaktion = 'paket' | 'neues-paket' | 'aendern' | 'loeschen';

/** Kästchen der Auswahl mit Zwischenstand „teilweise“. */
function Kaestchen({
  zustand,
  onChange,
  label,
  disabled = false,
}: {
  zustand: Kaestchenzustand;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="pli-flaeche" title={label}>
      <input
        type="checkbox"
        className="pli-kaestchen"
        checked={zustand === 'an'}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = zustand === 'teilweise';
        }}
        onChange={onChange}
        aria-label={label}
      />
    </label>
  );
}

export function Plaene({ project, oeffneLauf }: { project: Project; oeffneLauf: (runId: ID) => void }) {
  const { data } = useStore();
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [sortFeld, setSortFeld] = useState<SortFeld>('lfd');
  const [absteigend, setAbsteigend] = useState(false);
  const [dialog, setDialog] = useState<{ doc?: PlanDocument } | null>(null);
  const [paketDialog, setPaketDialog] = useState<{ paket?: PlanDocument } | null>(null);
  const [importOffen, setImportOffen] = useState(false);
  /** Zugeklappte Planverzeichnisse und Planpakete – zunächst ist alles offen. */
  const [zugeklappt, setZugeklappt] = useState<string[]>([]);
  /** Gewählte Pläne und Planverzeichnisse (Kennungen). */
  const [auswahl, setAuswahl] = useState<ID[]>([]);
  const [sammel, setSammel] = useState<{ aktion: Sammelaktion; ids: ID[] } | null>(null);
  const projektDokumente = data.documents.filter((d) => d.projectId === project.id);
  // Planpakete gliedern die Liste; die Einträge sind Pläne und Planverzeichnisse.
  const alle = projektDokumente.filter((d) => d.kind !== 'paket');
  const pakete = projektDokumente.filter((d) => d.kind === 'paket');

  /** Planpaket eines Eintrags – Pläne eines Verzeichnisses tragen dessen Paket. */
  const paketIdVon = (d: PlanDocument): ID | null => {
    const id = paketVon(data.documents, d);
    return id && pakete.some((p) => p.id === id) ? id : null;
  };

  /** Gesucht wird in den Stammdaten des Eintrags und im Namen seines Planpakets. */
  const passt = (d: PlanDocument) => {
    const paket = pakete.find((p) => p.id === paketIdVon(d));
    return (
      (filter === 'alle' || d.kind === filter) &&
      [d.nummer, d.titel, d.gewerk, d.index, d.planungsphase, paket?.titel, paket?.nummer]
        .join(' ')
        .toLowerCase()
        .includes(suche.toLowerCase())
    );
  };

  const gefiltert = alle.filter(passt);

  // Laufende Nummern in der Reihenfolge der Gliederung: erst die Einträge der
  // Planpakete, dann die ohne Paket; Pläne eines Verzeichnisses als „1.1“ …
  const nummern = lfdNummern([
    ...pakete.flatMap((p) => alle.filter((d) => paketIdVon(d) === p.id)),
    ...alle.filter((d) => !paketIdVon(d)),
  ]);

  /** Name des übergeordneten Planverzeichnisses. */
  const verzeichnisName = (d: PlanDocument) =>
    d.kind === 'plan' && d.parentId ? (alle.find((x) => x.id === d.parentId)?.titel ?? '') : '';

  const schluessel = (d: PlanDocument): string => {
    switch (sortFeld) {
      case 'lfd': {
        // Nach laufender Nummer: „1“, „1.1“, „2“ … numerisch sortierbar machen
        const nr = nummern.get(d.id) ?? '999';
        return nr
          .split('.')
          .map((t) => t.padStart(4, '0'))
          .join('.');
      }
      case 'kind':
        return DOCUMENT_KIND_LABEL[d.kind];
      case 'parent':
        return verzeichnisName(d);
      case 'eingangSoll':
        return d.eingangSoll ?? '9999-99-99';
      default:
        return d[sortFeld];
    }
  };

  const zeilen = [...gefiltert].sort(
    (a, b) => schluessel(a).localeCompare(schluessel(b), 'de', { numeric: true }) * (absteigend ? -1 : 1),
  );

  /**
   * Pläne eines Planverzeichnisses stehen eingerückt unter ihm und lassen sich
   * am Dreieck zuklappen. Ist das Verzeichnis selbst ausgefiltert, steht der
   * Plan wie bisher für sich in der Liste.
   */
  const kinderVon = (id: string) => zeilen.filter((d) => d.kind === 'plan' && d.parentId === id);
  const obereEbene = zeilen.filter(
    (d) => !(d.kind === 'plan' && d.parentId && zeilen.some((x) => x.id === d.parentId)),
  );
  const klappen = (id: string) =>
    setZugeklappt((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  /*
   * Auswahl: nur sichtbare Einträge (Suche und Filter) – was dabei
   * herausfällt, wird abgewählt; ebenso gelöschte Einträge.
   */
  const sichtbar = new Set(zeilen.map((d) => d.id));
  const gewaehlt = auswahl.filter((id) => sichtbar.has(id));
  useEffect(() => {
    if (gewaehlt.length !== auswahl.length) setAuswahl(gewaehlt);
  });
  const gewaehltMenge = new Set(gewaehlt);
  const zustandVon = (ids: ID[]): Kaestchenzustand => {
    const n = ids.filter((id) => gewaehltMenge.has(id)).length;
    return n === 0 ? 'aus' : n === ids.length ? 'an' : 'teilweise';
  };
  /** Wählt alle `ids` – oder wählt sie ab, wenn schon alle gewählt sind. */
  const umschalten = (ids: ID[]) => {
    const alleAn = ids.length > 0 && ids.every((id) => gewaehltMenge.has(id));
    setAuswahl(alleAn ? gewaehlt.filter((id) => !ids.includes(id)) : [...new Set([...gewaehlt, ...ids])]);
  };
  /** Ein Planverzeichnis steht für sich und seine (sichtbaren) Pläne. */
  const idsVon = (d: PlanDocument): ID[] =>
    d.kind === 'verzeichnis' ? [d.id, ...kinderVon(d.id).map((k) => k.id)] : [d.id];
  /** Inhalt einer Gruppe: ihre Einträge samt den Plänen ihrer Verzeichnisse. */
  const gruppenIds = (oben: PlanDocument[]): ID[] => oben.flatMap(idsVon);
  /** Zelle mit dem Auswahlkästchen – ein Klick darauf öffnet keinen Dialog. */
  const wahlZelle = (ids: ID[], label: string) => (
    <td className="pli-wahl" onClick={(e) => e.stopPropagation()}>
      <Kaestchen zustand={zustandVon(ids)} onChange={() => umschalten(ids)} label={label} disabled={ids.length === 0} />
    </td>
  );

  /**
   * Gruppen der Liste: je Planpaket seine Einträge, danach die Einträge ohne
   * Paket. Leere Pakete erscheinen, solange weder Suche noch Filter gesetzt
   * sind oder ihr Name zur Suche passt.
   */
  const ohneEinschraenkung = !suche.trim() && filter === 'alle';
  const paketTrifft = (p: PlanDocument) =>
    Boolean(suche.trim()) && [p.nummer, p.titel, p.gewerk].join(' ').toLowerCase().includes(suche.toLowerCase());
  const paketGruppen = pakete
    .map((paket) => ({ paket, oben: obereEbene.filter((d) => paketIdVon(d) === paket.id) }))
    .filter((g) => g.oben.length > 0 || ohneEinschraenkung || paketTrifft(g.paket));
  const ohnePaket = obereEbene.filter((d) => !paketIdVon(d));
  /** Angezeigte Einträge einer Gruppe – samt der eingerückten Pläne ihrer Verzeichnisse. */
  const zeilenZahl = (oben: PlanDocument[]) => oben.reduce((n, d) => n + 1 + kinderVon(d.id).length, 0);
  const eintraegeText = (n: number) => `${n} ${n === 1 ? 'Eintrag' : 'Einträge'}`;

  const sortieren = (feld: SortFeld) => {
    if (feld === sortFeld) setAbsteigend((a) => !a);
    else {
      setSortFeld(feld);
      setAbsteigend(false);
    }
  };

  const Kopf = ({ feld, children, klasse = '' }: { feld: SortFeld; children: React.ReactNode; klasse?: string }) => (
    <th className={klasse}>
      <button type="button" className="sort-btn" onClick={() => sortieren(feld)}>
        {children}
        <span className={`sort-pfeil ${sortFeld === feld ? 'aktiv' : ''}`}>
          {sortFeld === feld ? (absteigend ? '▾' : '▴') : '▴'}
        </span>
      </button>
    </th>
  );

  const anzahl = (art: DocumentKind) => projektDokumente.filter((d) => d.kind === art).length;

  /**
   * Maßgeblicher Lauf eines Eintrags: der laufende, sonst der abgeschlossene.
   * Pläne eines gebündelten Verzeichnisses zeigen den Lauf des Verzeichnisses.
   */
  const laufVon = (d: PlanDocument) => {
    const id = hatEigenenPlanlauf(d, data.documents) ? d.id : (d.parentId ?? d.id);
    const laeufe = data.runs.filter((r) => r.documentId === id && r.status !== 'abgebrochen');
    return laeufe.find((r) => r.status === 'laufend') ?? laeufe[0];
  };

  /**
   * Der Eingang beim Planlaufmanagement steht noch aus: Der Plan ist
   * angekündigt, aber noch nicht eingegangen – die Zeile wird gelb hinterlegt.
   */
  const wartetAufEingang = (d: PlanDocument) => {
    const lauf = laufVon(d);
    // Bei parallelen Zweigen können mehrere Schritte zugleich anstehen
    return lauf?.status === 'laufend' && aktuelleSchritte(lauf).some((s) => istEingangPLM(s.name));
  };
  const anzahlEingang = alle.filter(wartetAufEingang).length;

  /** Der maßgebliche Planlauf ist abgeschlossen – die Zeile wird grün hinterlegt. */
  const abgeschlossen = (d: PlanDocument) => laufVon(d)?.status === 'abgeschlossen';

  /**
   * Abgebrochene Läufe eines Eintrags. Wurde ein Lauf durch einen neuen Index
   * ersetzt, steht das als Zusatz in der Liste – ebenso ein ersatzloser
   * Abbruch, solange kein weiterer Lauf gestartet wurde.
   */
  const abbruchZusatz = (d: PlanDocument) => {
    // Aufgeteilte bzw. wieder gebündelte Läufe sind kein Abbruch des Eintrags
    const laeufe = data.runs.filter((r) => r.documentId === d.id && !laufUeberfuehrt(r));
    const ersetzt = [...laeufe]
      .reverse()
      .find((r) => r.status === 'abgebrochen' && r.abbruchArt === 'neuer_index');
    if (ersetzt) {
      const label = INDEX_LABEL[d.kind];
      return {
        text: `${label} ${ersetzt.index || '–'} → ${ersetzt.abbruchNeuerIndex || d.index}`,
        titel: `Planlauf zu ${label} ${ersetzt.index || '–'} abgebrochen${
          ersetzt.abbruchDatum ? ` am ${formatDate(ersetzt.abbruchDatum)}` : ''
        } und durch ${label} ${ersetzt.abbruchNeuerIndex || d.index} ersetzt.`,
      };
    }
    // Nur noch abgebrochene Läufe: der Eintrag wird nicht weiterverfolgt
    if (laeufe.length > 0 && laeufe.every((r) => r.status === 'abgebrochen')) {
      const letzter = laeufe[laeufe.length - 1];
      return {
        text: 'abgebrochen',
        titel: `Planlauf ersatzlos abgebrochen${
          letzter.abbruchDatum ? ` am ${formatDate(letzter.abbruchDatum)}` : ''
        }.${letzter.abbruchGrund ? ` ${letzter.abbruchGrund}` : ''}`,
      };
    }
    return null;
  };

  /**
   * Eine Zeile der Planliste. Einträge eines Planpakets rücken eine Stufe ein,
   * Pläne eines Verzeichnisses eine weitere.
   */
  const zeile = (doc: PlanDocument, imPaket: boolean, eingerueckt = false) => {
    const kinder = doc.kind === 'verzeichnis' ? kinderVon(doc.id) : [];
    const offen = !zugeklappt.includes(doc.id);
    const einzug = (imPaket ? 10 : 0) + (eingerueckt ? 24 : 0);
    return (
      <tr
        key={doc.id}
        className={`clickable ${eingerueckt ? 'unterzeile' : ''} ${
          abgeschlossen(doc) ? 'zeile-fertig' : wartetAufEingang(doc) ? 'zeile-eingang' : ''
        } ${gewaehltMenge.has(doc.id) ? 'pli-gewaehlt' : ''}`}
        onClick={() => setDialog({ doc })}
        title={
          abgeschlossen(doc)
            ? 'Planlauf abgeschlossen'
            : wartetAufEingang(doc)
              ? `Angekündigt – „${SCHRITT_EINGANG}“ steht noch aus`
              : undefined
        }
      >
        {wahlZelle(
          idsVon(doc),
          doc.kind === 'verzeichnis' && kinder.length > 0
            ? `Planverzeichnis „${doc.titel}“ samt Plänen wählen`
            : `${DOCUMENT_KIND_LABEL[doc.kind]} „${doc.titel}“ wählen`,
        )}
        <td className="num tertiary" style={{ paddingLeft: imPaket ? 24 : undefined }}>
          {nummern.get(doc.id) ?? '–'}
        </td>
        {/* Der Pfeil steht zwischen Nummer und Symbol; Symbol und Titel eines
            untergeordneten Plans rücken gemeinsam ein – wie in den Planläufen. */}
        <td className="small" style={{ paddingLeft: 36 + einzug }}>
          <span className="row" style={{ gap: 9 }}>
            {kinder.length > 0 ? (
              <button
                type="button"
                className={`chev-btn chev-vorn ${offen ? 'offen' : ''}`}
                title={offen ? 'Pläne ausblenden' : 'Pläne anzeigen'}
                aria-label="Pläne des Verzeichnisses anzeigen"
                onClick={(e) => {
                  e.stopPropagation();
                  klappen(doc.id);
                }}
              >
                <Icon name="chevron" size={13} />
              </button>
            ) : null}
            <DocKindIcon kind={doc.kind} />
            {DOCUMENT_KIND_LABEL[doc.kind]}
          </span>
        </td>
        <td style={{ paddingLeft: eingerueckt ? 38 : undefined }}>
          <span className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
            <span style={{ minWidth: 0 }}>
              <span className="num">
                {doc.nummer}
                {doc.index ? ` · ${INDEX_LABEL[doc.kind]} ${doc.index}` : ''}
              </span>
              <div>
                <strong>{doc.titel}</strong>
                {kinder.length > 0 ? (
                  <span className="small tertiary">
                    {' '}
                    · {kinder.length} {kinder.length === 1 ? 'Plan' : 'Pläne'}
                  </span>
                ) : null}
                {wartetAufEingang(doc) ? (
                  <span className="badge gelb" style={{ marginLeft: 6 }} title={`„${SCHRITT_EINGANG}“ steht noch aus`}>
                    Angekündigt
                  </span>
                ) : null}
                {doc.kind === 'verzeichnis' && !verzeichnisGebuendelt(doc) ? (
                  <span className="badge zusatz" title="Jeder Plan dieses Verzeichnisses hat einen eigenen Planlauf">
                    Pläne einzeln
                  </span>
                ) : null}
                {doc.kind === 'plan' &&
                doc.parentId &&
                doc.eigenerLauf &&
                verzeichnisGebuendelt(alle.find((x) => x.id === doc.parentId) ?? {}) ? (
                  <span className="badge zusatz" title="Aus dem gebündelten Lauf des Verzeichnisses herausgelöst">
                    eigener Lauf
                  </span>
                ) : null}
                {(() => {
                  const zusatz = abbruchZusatz(doc);
                  return zusatz ? (
                    <span className="badge zusatz" title={zusatz.titel}>
                      {zusatz.text}
                    </span>
                  ) : null;
                })()}
              </div>
            </span>
          </span>
        </td>
        <td className="small muted">{doc.gewerk || '–'}</td>
        <td className="small muted col-optional">{verzeichnisName(doc) || '–'}</td>
        <td className="small">{doc.eingangSoll ? formatDate(doc.eingangSoll) : '–'}</td>
        <td className="actions">
          <button
            type="button"
            className="btn-icon"
            aria-label="Eintrag bearbeiten"
            title="Stammdaten bearbeiten"
            onClick={(e) => {
              e.stopPropagation();
              setDialog({ doc });
            }}
          >
            <Icon name="bearbeiten" size={15} />
          </button>
        </td>
      </tr>
    );
  };

  /** Einträge einer Gruppe samt der Pläne ihrer Verzeichnisse. */
  const gruppenZeilen = (oben: PlanDocument[], imPaket: boolean) =>
    oben.map((doc) => (
      <Fragment key={doc.id}>
        {zeile(doc, imPaket)}
        {doc.kind === 'verzeichnis' && !zugeklappt.includes(doc.id)
          ? kinderVon(doc.id).map((plan) => zeile(plan, imPaket, true))
          : null}
      </Fragment>
    ));

  /**
   * Kopfzeile eines Planpakets: auf- und zuklappen, bearbeiten. Die Spalte
   * „Planverzeichnis“ behält eine eigene Zelle, damit die Zeile auf schmalen
   * Bildschirmen, wo sie ausgeblendet ist, nicht verrutscht.
   */
  const paketZeile = (paket: PlanDocument, oben: PlanDocument[]) => {
    const offen = !zugeklappt.includes(paket.id);
    const leer = !alle.some((d) => paketIdVon(d) === paket.id);
    return (
      <tr key={paket.id} className="paket-zeile clickable" onClick={() => setPaketDialog({ paket })}>
        {wahlZelle(gruppenIds(oben), `Einträge des Planpakets „${paket.titel}“ wählen`)}
        <td colSpan={4}>
          <span className="row" style={{ gap: 9 }}>
            <button
              type="button"
              className={`gruppe-btn ${offen ? 'offen' : ''}`}
              style={{ width: 'auto' }}
              title={offen ? 'Einträge ausblenden' : 'Einträge anzeigen'}
              aria-label="Einträge des Planpakets anzeigen"
              onClick={(e) => {
                e.stopPropagation();
                klappen(paket.id);
              }}
            >
              <span className="chev">
                <Icon name="chevron" size={13} />
              </span>
            </button>
            <DocKindIcon kind="paket" />
            <span style={{ minWidth: 0 }}>
              {paket.nummer ? <span className="num">{paket.nummer}</span> : null}
              <div>
                <strong>{paket.titel}</strong>
                <span className="small tertiary">
                  {' '}
                  · Planpaket · {leer ? 'noch nichts zugeordnet' : eintraegeText(zeilenZahl(oben))}
                  {paket.gewerk ? ` · ${paket.gewerk}` : ''}
                </span>
              </div>
            </span>
          </span>
        </td>
        <td className="col-optional" />
        <td />
        <td className="actions">
          <button
            type="button"
            className="btn-icon"
            aria-label="Planpaket bearbeiten"
            title="Planpaket bearbeiten"
            onClick={(e) => {
              e.stopPropagation();
              setPaketDialog({ paket });
            }}
          >
            <Icon name="bearbeiten" size={15} />
          </button>
        </td>
      </tr>
    );
  };

  const keineZeilen = paketGruppen.length === 0 && ohnePaket.length === 0;

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div className="row wrap">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'alle', label: `Alle (${alle.length})` },
              { value: 'plan', label: 'Pläne' },
              { value: 'verzeichnis', label: 'Verzeichnisse' },
            ]}
          />
          <Search value={suche} onChange={setSuche} placeholder="Nummer, Titel, Gewerk, Paket …" />
        </div>
        <div className="row wrap">
          <button type="button" className="btn btn-outline" onClick={() => setImportOffen(true)}>
            <Icon name="importieren" size={14} /> Excel-Import
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setPaketDialog({})}>
            <Icon name="paket" size={14} /> Neues Planpaket
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
            <Icon name="plus" size={14} /> Neuer Eintrag
          </button>
        </div>
      </div>

      <Card>
        <CardHeader
          titel="Planliste"
          sub={`${anzahl('paket')} Planpakete · ${anzahl('plan')} Pläne · ${anzahl('verzeichnis')} Planverzeichnisse${
            anzahlEingang > 0 ? ` · ${anzahlEingang} vor dem Eingang beim PLM` : ''
          } · Spaltenüberschrift klicken zum Sortieren`}
        />
        {gewaehlt.length > 0 ? (
          <div className="pli-leiste" role="toolbar" aria-label="Aktionen für die Auswahl">
            <span className="pli-anzahl">{eintraegeText(gewaehlt.length)} ausgewählt</span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setSammel({ aktion: 'paket', ids: gewaehlt })}
            >
              <Icon name="paket" size={13} /> Planpaket zuweisen …
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setSammel({ aktion: 'neues-paket', ids: gewaehlt })}
            >
              <Icon name="plus" size={13} /> Neues Planpaket aus Auswahl …
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setSammel({ aktion: 'aendern', ids: gewaehlt })}
            >
              <Icon name="bearbeiten" size={13} /> Gewerk/Planungsphase …
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => setSammel({ aktion: 'loeschen', ids: gewaehlt })}
            >
              <Icon name="loeschen" size={13} /> Löschen …
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setAuswahl([])}>
              Auswahl aufheben
            </button>
          </div>
        ) : null}
        {alle.length === 0 && pakete.length === 0 ? (
          <EmptyState
            icon="plan"
            titel="Noch keine Einträge"
            text="Mit einem neuen Eintrag startet zugleich sein Planlauf."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
                <Icon name="plus" size={14} /> Neuer Eintrag
              </button>
            }
          />
        ) : keineZeilen ? (
          <EmptyState icon="suche" titel="Kein Eintrag passt zur Suche" text="Passen Sie Suche oder Filter an." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="pli-wahl">
                    <Kaestchen
                      zustand={zustandVon(zeilen.map((d) => d.id))}
                      onChange={() => umschalten(zeilen.map((d) => d.id))}
                      label="Alle sichtbaren Einträge wählen"
                      disabled={zeilen.length === 0}
                    />
                  </th>
                  <Kopf feld="lfd">Nr.</Kopf>
                  <Kopf feld="kind">Art</Kopf>
                  <Kopf feld="nummer">Bezeichnung / Titel</Kopf>
                  <Kopf feld="gewerk">Gewerk</Kopf>
                  <Kopf feld="parent" klasse="col-optional">Planverzeichnis</Kopf>
                  <Kopf feld="eingangSoll">Eingang Soll</Kopf>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {paketGruppen.map(({ paket, oben }) => (
                  <Fragment key={paket.id}>
                    {paketZeile(paket, oben)}
                    {!zugeklappt.includes(paket.id) ? gruppenZeilen(oben, true) : null}
                  </Fragment>
                ))}

                {ohnePaket.length > 0 && paketGruppen.length > 0 ? (
                  <tr className="paket-zeile ohne-paket">
                    {wahlZelle(gruppenIds(ohnePaket), 'Einträge ohne Planpaket wählen')}
                    <td colSpan={4}>
                      <button
                        type="button"
                        className={`gruppe-btn ${!zugeklappt.includes(OHNE_PAKET) ? 'offen' : ''}`}
                        onClick={() => klappen(OHNE_PAKET)}
                      >
                        <span className="chev">
                          <Icon name="chevron" size={13} />
                        </span>
                        <span className="small muted">
                          Ohne Planpaket · {eintraegeText(zeilenZahl(ohnePaket))}
                        </span>
                      </button>
                    </td>
                    <td className="col-optional" />
                    <td colSpan={2} />
                  </tr>
                ) : null}
                {paketGruppen.length === 0 || !zugeklappt.includes(OHNE_PAKET)
                  ? gruppenZeilen(ohnePaket, paketGruppen.length > 0)
                  : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {importOffen ? <PlaeneImport project={project} onClose={() => setImportOffen(false)} /> : null}

      {dialog ? (
        <PlanDialog
          project={project}
          doc={dialog.doc}
          onClose={() => setDialog(null)}
          onLaufGestartet={oeffneLauf}
        />
      ) : null}

      {paketDialog ? (
        <PaketDialog project={project} paket={paketDialog.paket} onClose={() => setPaketDialog(null)} />
      ) : null}

      {sammel?.aktion === 'paket' ? (
        <PaketZuweisenDialog
          project={project}
          ids={sammel.ids}
          onClose={() => setSammel(null)}
          onFertig={() => setAuswahl([])}
        />
      ) : null}
      {sammel?.aktion === 'neues-paket' ? (
        <PaketDialog
          project={project}
          auswahl={sammel.ids}
          onAngelegt={() => setAuswahl([])}
          onClose={() => setSammel(null)}
        />
      ) : null}
      {sammel?.aktion === 'aendern' ? (
        <EintraegeAendernDialog
          project={project}
          ids={sammel.ids}
          onClose={() => setSammel(null)}
          onFertig={() => setAuswahl([])}
        />
      ) : null}
      {sammel?.aktion === 'loeschen' ? (
        <EintraegeLoeschenDialog ids={sammel.ids} onClose={() => setSammel(null)} onFertig={() => setAuswahl([])} />
      ) : null}
    </div>
  );
}

/**
 * Anlage und Pflege eines Eintrags. Beim Anlegen – und bei Einträgen ohne
 * Planlauf – gehört die Workflow dazu, sodass Eintrag und Planlauf
 * gemeinsam entstehen.
 */
function PlanDialog({
  project,
  doc,
  onClose,
  onLaufGestartet,
}: {
  project: Project;
  doc?: PlanDocument;
  onClose: () => void;
  onLaufGestartet: (runId: ID) => void;
}) {
  const { data, addDocument, updateDocument, deleteDocument, addRun, planHerausloesen, verzeichnisAufteilen } =
    useStore();
  const toast = useToast();
  const [loeschen, setLoeschen] = useState(false);
  const [nachtrag, setNachtrag] = useState<'herausloesen' | 'aufteilen' | 'buendeln' | null>(null);

  const vorlagen = data.templates.filter((t) => t.projectId === null || t.projectId === project.id);
  const kontakte = data.contacts.filter((c) => c.projectId === project.id);
  const rollen = data.roles.filter((r) => r.projectId === project.id);
  // Ein überführter Lauf (aufgeteilt, gebündelt, neu gestartet) zählt nicht – sonst
  // ließe sich nach dem Löschen seines Nachfolgers kein Lauf mehr starten.
  const vorhandenerLauf = doc ? data.runs.find((r) => r.documentId === doc.id && !laufUeberfuehrt(r)) : undefined;

  const [form, setForm] = useState({
    kind: doc?.kind ?? ('plan' as DocumentKind),
    parentId: doc?.parentId ?? (null as ID | null),
    paketId: doc?.paketId ?? (null as ID | null),
    nummer: doc?.nummer ?? '',
    titel: doc?.titel ?? '',
    index: doc?.index ?? '',
    gewerk: doc?.gewerk ?? '',
    planungsphase: doc?.planungsphase ?? '',
    eingangSoll: doc?.eingangSoll ?? '',
    datum: doc?.datum ?? '',
    bemerkung: doc?.bemerkung ?? '',
    planlaufModus: doc?.planlaufModus ?? 'gebuendelt',
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Planverzeichnisse des Projekts – mögliche „Eltern“ eines Plans. */
  const moeglicheEltern = data.documents.filter(
    (d) => d.projectId === project.id && d.id !== doc?.id && d.kind === 'verzeichnis',
  );

  // Plan eines Verzeichnisses: gehört automatisch zu dessen Planpaket
  const untergeordnet = form.kind === 'plan' && form.parentId !== null;
  const eltern = moeglicheEltern.find((d) => d.id === form.parentId);
  /** Eigener, nicht abgebrochener Lauf – den behält ein Plan auch beim Verschieben. */
  const eigenerAktiverLauf = doc
    ? data.runs.find((r) => r.documentId === doc.id && r.status !== 'abgebrochen')
    : undefined;
  // Ein Plan läuft im Lauf seines Verzeichnisses mit, wenn dieses gebündelt ist
  // und der Plan nicht herausgelöst wurde.
  const laeuftMit =
    untergeordnet &&
    !eigenerAktiverLauf &&
    !doc?.eigenerLauf &&
    (eltern ? verzeichnisGebuendelt(eltern) : true);
  // Ein Verzeichnis mit einzeln laufenden Plänen ordnet nur – ohne eigenen Lauf.
  const verzeichnisEinzeln = form.kind === 'verzeichnis' && form.planlaufModus === 'einzeln';
  /**
   * Gebündeltes Verzeichnis des Plans, das noch nie einen Planlauf hatte – etwa
   * eben aus der Auswahl angelegt. Sein Lauf startet mit dem Speichern des Plans.
   * Ein abgebrochener Verzeichnislauf startet dagegen nicht von selbst neu.
   */
  const verzeichnisOhneLauf =
    form.kind === 'plan' &&
    eltern &&
    verzeichnisGebuendelt(eltern) &&
    !data.runs.some((r) => r.documentId === eltern.id && !laufUeberfuehrt(r))
      ? eltern
      : undefined;
  const braucheLauf = Boolean(verzeichnisOhneLauf) || (!vorhandenerLauf && !laeuftMit && !verzeichnisEinzeln);
  /** Eintrag, für den der Planlauf startet: der Eintrag selbst oder das Verzeichnis des Plans. */
  const laufZiel = verzeichnisOhneLauf ?? form;

  // Die Wahl gebündelt/einzeln ist frei, solange weder das Verzeichnis noch
  // seine Pläne einen Lauf haben. Danach geht es nur noch Richtung „einzeln“.
  const planIds = doc ? data.documents.filter((d) => d.parentId === doc.id).map((d) => d.id) : [];
  const modusGesperrt = Boolean(
    doc && data.runs.some((r) => r.documentId === doc.id || planIds.includes(r.documentId)),
  );
  /** Laufender gebündelter Lauf dieses Verzeichnisses – lässt sich aufteilen. */
  const buendelLauf =
    doc?.kind === 'verzeichnis' && verzeichnisGebuendelt(doc)
      ? data.runs.find((r) => r.documentId === doc.id && r.status === 'laufend')
      : undefined;
  /** Laufender Lauf des Verzeichnisses, aus dem sich dieser Plan herauslösen lässt. */
  const elternLauf =
    doc && laeuftMit && eltern
      ? data.runs.find((r) => r.documentId === eltern.id && r.status === 'laufend')
      : undefined;
  const ohneEigenenLauf = planIds.filter(
    (id) => !data.runs.some((r) => r.documentId === id && r.status !== 'abgebrochen'),
  ).length;
  const pakete = data.documents.filter((d) => d.projectId === project.id && d.kind === 'paket');

  // Pläne eines Verzeichnisses gehören automatisch zu dessen Planpaket
  const elternPaket = moeglicheEltern.find((d) => d.id === form.parentId)?.paketId ?? null;
  const wirksamesPaket = untergeordnet ? elternPaket : form.paketId;

  /** Anlage eines Planverzeichnisses bzw. Planpakets direkt aus der Auswahl. */
  const [schnell, setSchnell] = useState<'verzeichnis' | 'paket' | null>(null);
  /** Aus der Auswahl angelegtes Planverzeichnis – entfällt wieder, wenn der Plan es nicht nutzt. */
  const [neuesVerzeichnis, setNeuesVerzeichnis] = useState<ID | null>(null);

  /** Schließt den Dialog; ein angelegtes, aber nicht genutztes Verzeichnis wird verworfen. */
  const schliessen = (genutzt?: ID | null) => {
    if (neuesVerzeichnis && neuesVerzeichnis !== genutzt) deleteDocument(neuesVerzeichnis);
    onClose();
  };

  /**
   * Ein Planverzeichnis entsteht gebündelt und dem Plan übergeordnet. Seinen
   * Planlauf startet es mit dem Speichern des Plans – nach dem Workflow im
   * Dialog; der Plan läuft darin mit.
   */
  const schnellAnlegen = (art: 'verzeichnis' | 'paket', titel: string, nummer: string) => {
    const neu = {
      projectId: project.id,
      kind: art,
      parentId: null,
      paketId: art === 'verzeichnis' ? form.paketId : null,
      nummer,
      titel,
      index: '',
      gewerk: form.gewerk,
      planungsphase: art === 'verzeichnis' ? form.planungsphase : '',
      eingangSoll: null,
      datum: null,
      bemerkung: '',
    };
    const id = addDocument(neu);
    if (art === 'paket') {
      set('paketId', id);
      toast('Planpaket angelegt.');
      return;
    }
    // Ein zuvor angelegtes, ungenutztes Verzeichnis ersetzt das neue
    if (neuesVerzeichnis) deleteDocument(neuesVerzeichnis);
    setNeuesVerzeichnis(id);
    set('parentId', id);
    toast('Planverzeichnis angelegt – sein Planlauf startet mit dem Speichern.');
  };

  /** Bearbeitbare Kopie der Vorlagenschritte. */
  const kopie = (id: string): ProcessTemplateStep[] => vorlagenSchritte(vorlagen.find((v) => v.id === id), newId);

  const [templateId, setTemplateId] = useState(vorlagen[0]?.id ?? '');
  const [steps, setSteps] = useState<ProcessTemplateStep[]>(() => kopie(vorlagen[0]?.id ?? ''));
  /** Die Schritte wurden über „Individueller Workflow“ für diesen Planlauf angepasst. */
  const [angepasst, setAngepasst] = useState(false);
  const [start, setStart] = useState(today());

  const vorlageWechseln = (id: string) => {
    setTemplateId(id);
    setSteps(kopie(id));
    setAngepasst(false);
  };

  /**
   * Besetzung einer Rolle: Bei Rollen mit Gewerkbezug zählt die Zuordnung für
   * das Gewerk des Eintrags, sonst die gewerkübergreifende Zuordnung.
   */
  const kontaktFuerRolle = (roleName: string): ID | null =>
    kontaktFuerRolleUndGewerk(kontakte, rollen, roleName, laufZiel.gewerk);

  const speichern = () => {
    if (!form.titel.trim()) {
      toast('Bitte einen Titel angeben.');
      return;
    }
    const werte = {
      ...form,
      eingangSoll: form.eingangSoll || null,
      datum: form.kind === 'verzeichnis' ? form.datum || null : null,
      parentId: form.kind === 'plan' ? form.parentId : null,
      paketId: wirksamesPaket,
      planlaufModus: form.kind === 'verzeichnis' ? form.planlaufModus : undefined,
      // Ein Plan, der schon einen eigenen Lauf hat, behält ihn – auch wenn er
      // in ein gebündeltes Verzeichnis verschoben wird.
      eigenerLauf:
        form.kind === 'plan' && form.parentId !== null && (doc?.eigenerLauf || Boolean(eigenerAktiverLauf))
          ? true
          : undefined,
    };

    // Ohne eigenen Planlauf – etwa Pläne eines Verzeichnisses – bleibt es bei
    // den Stammdaten.
    if (!braucheLauf) {
      if (doc) {
        updateDocument(doc.id, werte);
        toast('Eintrag aktualisiert.');
      } else {
        addDocument({ ...werte, projectId: project.id });
        toast(
          laeuftMit
            ? 'Plan angelegt – er läuft im Planlauf des Verzeichnisses mit.'
            : verzeichnisEinzeln
              ? 'Planverzeichnis angelegt – seine Pläne erhalten ihre Planläufe einzeln.'
              : 'Eintrag angelegt.',
        );
      }
      schliessen(werte.parentId);
      return;
    }

    if (steps.length === 0 || steps.some((s) => !s.name.trim())) {
      toast('Bitte jeden Schritt der Workflow benennen.');
      return;
    }

    const documentId = doc ? doc.id : addDocument({ ...werte, projectId: project.id });
    if (doc) updateDocument(doc.id, werte);
    // Startet der Lauf des Verzeichnisses, trägt er den Eingang des Plans, solange das Verzeichnis keinen hat
    if (verzeichnisOhneLauf && !verzeichnisOhneLauf.eingangSoll && werte.eingangSoll) {
      updateDocument(verzeichnisOhneLauf.id, { eingangSoll: werte.eingangSoll });
    }

    const template = vorlagen.find((t) => t.id === templateId);
    const markiert = laufSchritteAusVorlage(template, steps, kontaktFuerRolle, () => newId('rs'));

    const runId = addRun({
      projectId: project.id,
      documentId: verzeichnisOhneLauf ? verzeichnisOhneLauf.id : documentId,
      templateId: template?.id ?? null,
      templateName: template?.name ?? 'Individuelle Kette',
      name: planlaufName(laufZiel),
      index: laufZiel.index,
      start,
      status: 'laufend',
      abbruchGrund: null,
      abbruchDatum: null,
      abbruchArt: null,
      abbruchNeuerIndex: null,
      steps: markiert,
      bemerkung: '',
      protokoll: [],
      basis: null,
    });

    const ohneKontakt = markiert.filter((s) => !s.contactId).length;
    const gestartet = verzeichnisOhneLauf
      ? `Planlauf des Verzeichnisses „${verzeichnisOhneLauf.nummer || verzeichnisOhneLauf.titel}“ gestartet – ${
          werte.eigenerLauf ? 'der Plan behält seinen eigenen Planlauf' : 'der Plan läuft darin mit'
        }`
      : 'Eintrag angelegt und Planlauf gestartet';
    toast(ohneKontakt > 0 ? `${gestartet} – ${ohneKontakt} Schritt(e) noch ohne Person.` : `${gestartet}.`);
    schliessen(werte.parentId);
    onLaufGestartet(runId);
  };

  return (
    <>
      <Modal
        titel={doc ? `${DOCUMENT_KIND_LABEL[doc.kind]} bearbeiten` : 'Neuer Eintrag'}
        sub={
          doc
            ? doc.nummer + (braucheLauf && !vorhandenerLauf ? ' · Planlauf noch nicht gestartet' : '')
            : 'Stammdaten und Workflow – der Planlauf startet mit dem Eintrag'
        }
        wide={braucheLauf}
        onClose={() => schliessen()}
        footer={
          <>
            {doc ? (
              <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
                <Icon name="loeschen" size={14} /> Löschen
              </button>
            ) : null}
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => schliessen()}>
              Abbrechen
            </button>
            <button type="button" className="btn btn-primary" onClick={speichern}>
              {braucheLauf ? (doc ? 'Planlauf starten' : 'Anlegen und Planlauf starten') : 'Speichern'}
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 16 }}>
          <div className="form-grid">
            <Field label="Art">
              <Select
                value={form.kind}
                onChange={(v) => {
                  set('kind', v as DocumentKind);
                  if (v !== 'plan') set('parentId', null);
                }}
                options={[
                  { value: 'plan', label: DOCUMENT_KIND_LABEL.plan },
                  { value: 'verzeichnis', label: DOCUMENT_KIND_LABEL.verzeichnis },
                ]}
              />
            </Field>
            {form.kind === 'plan' ? (
              <Field
                label="Planverzeichnis"
                hint="Ob die Pläne im Lauf des Verzeichnisses mitlaufen oder einzeln, legt das Verzeichnis fest; ohne Verzeichnis erhält der Plan einen eigenen Lauf."
              >
                <Select
                  value={form.parentId ?? ''}
                  onChange={(v) => (v === NEU ? setSchnell('verzeichnis') : set('parentId', v || null))}
                  placeholder="– Einzelplan –"
                  options={[
                    ...moeglicheEltern.map((d) => ({ value: d.id, label: `${d.nummer} · ${d.titel}` })),
                    { value: NEU, label: '+ Neues Planverzeichnis anlegen …' },
                  ]}
                />
              </Field>
            ) : null}
            <Field
              label="Planpaket"
              hint={
                untergeordnet
                  ? 'Ergibt sich aus dem Planverzeichnis'
                  : 'Ordnungsmerkmal ohne Einfluss auf den Planlauf'
              }
            >
              {untergeordnet ? (
                <input
                  className="input"
                  readOnly
                  value={pakete.find((p) => p.id === elternPaket)?.titel ?? 'keinem Paket zugeordnet'}
                />
              ) : (
                <Select
                  value={form.paketId ?? ''}
                  onChange={(v) => (v === NEU ? setSchnell('paket') : set('paketId', v || null))}
                  placeholder="– keinem Paket zugeordnet –"
                  options={[
                    ...pakete.map((d) => ({ value: d.id, label: d.titel || d.nummer })),
                    { value: NEU, label: '+ Neues Planpaket anlegen …' },
                  ]}
                />
              )}
            </Field>
            <Field label={NUMMER_LABEL[form.kind]}>
              <TextInput
                value={form.nummer}
                onChange={(v) => set('nummer', v)}
                placeholder={form.kind === 'plan' ? 'NK-KIB-EÜ-001' : 'NK-KIB-PV-001'}
              />
            </Field>
            <Field label={INDEX_LABEL[form.kind]} hint="bleibt leer, solange nichts vergeben ist">
              <TextInput value={form.index} onChange={(v) => set('index', v)} placeholder="ohne" />
            </Field>
            <Field label="Titel" full>
              <TextInput value={form.titel} onChange={(v) => set('titel', v)} />
            </Field>
            <Field label="Gewerk" hint="Auswahl oder freie Eingabe">
              <input
                className="input"
                list="gewerke-liste"
                value={form.gewerk}
                onChange={(e) => set('gewerk', e.target.value)}
                placeholder="KIB, VA, OLA …"
              />
              <datalist id="gewerke-liste">
                {gewerkeFuerProjekt(data, project.id).map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
            <Field label="Planungsphase" hint="Auswahl oder freie Eingabe">
              <input
                className="input"
                list="phasen-liste"
                value={form.planungsphase}
                onChange={(e) => set('planungsphase', e.target.value)}
                placeholder="Ausführungsplanung …"
              />
              <datalist id="phasen-liste">
                {PLANUNGSPHASEN.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field
              label="Eingang Soll"
              hint={
                laeuftMit && !verzeichnisOhneLauf
                  ? 'Der Plan läuft im Planlauf seines Verzeichnisses mit – maßgeblich ist das Eingang Soll des Verzeichnisses.'
                  : 'Soll-Termin des ersten Schritts (bei „Eingang PLM“ die Übergabe durch den Planer), solange er im ersten Durchlauf ist. Alle weiteren Fristen zählen ab dem tatsächlichen Eingang – dem Abschluss des vorherigen Schritts.'
              }
            >
              <TextInput value={form.eingangSoll} onChange={(v) => set('eingangSoll', v)} type="date" />
            </Field>
            {form.kind === 'verzeichnis' ? (
              <Field label="Datum der Ausgabe">
                <TextInput value={form.datum} onChange={(v) => set('datum', v)} type="date" />
              </Field>
            ) : null}
            {form.kind === 'verzeichnis' ? (
              <Field
                label="Planlauf"
                full
                hint={
                  modusGesperrt
                    ? verzeichnisEinzeln
                      ? 'Die Pläne laufen bereits einzeln. Über „Pläne wieder bündeln …“ lassen sich ausgewählte Pläne zurückführen.'
                      : 'Es bestehen bereits Planläufe. Die Pläne lassen sich nur noch nachträglich einzeln weiterführen.'
                    : 'Ohne Haken durchläuft das Verzeichnis den Planlauf gebündelt, seine Pläne laufen mit.'
                }
              >
                <div className="row wrap" style={{ gap: 12 }}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={verzeichnisEinzeln}
                      disabled={modusGesperrt}
                      onChange={(e) => set('planlaufModus', e.target.checked ? 'einzeln' : 'gebuendelt')}
                    />
                    Pläne einzeln durch den Planlauf führen
                  </label>
                  {doc && planeMitEigenemLauf(data.documents, data.runs, doc.id).length > 0 ? (
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setNachtrag('buendeln')}>
                      Pläne wieder bündeln …
                    </button>
                  ) : null}
                  {buendelLauf && planIds.length > 0 ? (
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setNachtrag('aufteilen')}>
                      Alle Pläne einzeln weiterführen …
                    </button>
                  ) : null}
                </div>
              </Field>
            ) : null}
            <Field label="Bemerkung" full>
              <TextArea value={form.bemerkung} onChange={(v) => set('bemerkung', v)} rows={2} />
            </Field>
          </div>

          {braucheLauf ? (
            <>
              <div className="divider" />
              {verzeichnisOhneLauf ? (
                <Callout icon="i">
                  Das Planverzeichnis „{verzeichnisOhneLauf.nummer || verzeichnisOhneLauf.titel}“ hat noch keinen
                  Planlauf. Er startet mit dem Speichern nach diesem Workflow; der Plan läuft darin mit
                  {eigenerAktiverLauf ? ' bzw. behält seinen eigenen Lauf' : ''}.
                </Callout>
              ) : null}
              <div className="form-grid">
                <Field label="Workflow" full hint={vorlagen.find((t) => t.id === templateId)?.beschreibung}>
                  <Select
                    value={templateId}
                    onChange={vorlageWechseln}
                    options={vorlagen.map((t) => ({ value: t.id, label: `${t.name} (${t.steps.length} Schritte)` }))}
                  />
                </Field>
                <Field label="Start des Planlaufs">
                  <TextInput value={start} onChange={setStart} type="date" />
                </Field>
              </div>

              <LaufSchritte
                vorlage={vorlagen.find((t) => t.id === templateId)}
                steps={steps}
                angepasst={angepasst}
                rollen={funktionenFuerGewerk(rollen, laufZiel.gewerk)}
                arbeitstage={project.settings.fristenInArbeitstagen}
                onUebernehmen={(neu) => {
                  setSteps(neu);
                  setAngepasst(true);
                }}
                onZuruecksetzen={() => vorlageWechseln(templateId)}
              />
            </>
          ) : verzeichnisEinzeln ? (
            <Callout icon="i">
              Die Pläne dieses Verzeichnisses durchlaufen den Planlauf einzeln; das Verzeichnis selbst ordnet sie
              nur. Den Planlauf eines Plans startest du über den Plan.
            </Callout>
          ) : laeuftMit ? (
            <Callout icon="i">
              <div className="row-between wrap" style={{ gap: 10 }}>
                <span>
                  Dieser Plan läuft im Planlauf des Verzeichnisses mit
                  {elternLauf ? ` („${elternLauf.name}“)` : ''}.
                </span>
                {elternLauf ? (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => setNachtrag('herausloesen')}>
                    Aus dem Verzeichnislauf herauslösen …
                  </button>
                ) : null}
              </div>
            </Callout>
          ) : (
            <Callout icon="i">
              Für diesen Eintrag läuft bereits der Planlauf „{vorhandenerLauf?.name}“. Die Schritte werden dort
              gepflegt.
            </Callout>
          )}
        </div>
      </Modal>

      {schnell ? (
        <SchnellDialog
          art={schnell}
          onClose={() => setSchnell(null)}
          onAnlegen={(titel, nummer) => schnellAnlegen(schnell, titel, nummer)}
        />
      ) : null}

      {nachtrag === 'herausloesen' && doc && elternLauf ? (
        <ConfirmDialog
          titel="Plan herauslösen?"
          text={`„${doc.titel}“ erhält einen eigenen Planlauf und übernimmt dazu den Stand von „${elternLauf.name}“ – erledigte Schritte bleiben erledigt. Der Lauf des Verzeichnisses geht für die übrigen Pläne weiter.`}
          bestaetigenLabel="Herauslösen"
          onConfirm={() => {
            const runId = planHerausloesen(doc.id);
            if (!runId) return;
            toast('Plan herausgelöst – er läuft jetzt einzeln weiter.');
            schliessen();
            onLaufGestartet(runId);
          }}
          onClose={() => setNachtrag(null)}
        />
      ) : null}

      {nachtrag === 'buendeln' && doc ? (
        <BuendelnDialog verzeichnis={doc} onClose={() => setNachtrag(null)} onGebuendelt={() => schliessen()} />
      ) : null}

      {nachtrag === 'aufteilen' && doc && buendelLauf ? (
        <ConfirmDialog
          titel="Alle Pläne einzeln weiterführen?"
          text={`${ohneEigenenLauf === 1 ? 'Ein Plan erhält' : `${ohneEigenenLauf} Pläne erhalten`} einen eigenen Planlauf mit dem Stand von „${buendelLauf.name}“. Der gebündelte Lauf endet, das Verzeichnis ordnet die Pläne danach nur noch. Das lässt sich nicht rückgängig machen.`}
          bestaetigenLabel="Einzeln weiterführen"
          onConfirm={() => {
            const anzahl = verzeichnisAufteilen(doc.id);
            toast(
              anzahl === 1 ? 'Ein Plan läuft jetzt einzeln weiter.' : `${anzahl} Pläne laufen jetzt einzeln weiter.`,
            );
            schliessen();
          }}
          onClose={() => setNachtrag(null)}
        />
      ) : null}

      {loeschen && doc ? (
        <ConfirmDialog
          titel="Eintrag löschen?"
          text={
            doc.kind === 'verzeichnis' && planIds.length > 0
              ? `„${doc.titel}“ wird mit seinem Planlauf gelöscht. Seine Pläne bleiben als Einzelpläne im Planpaket des Verzeichnisses erhalten${
                  data.runs.some((r) => r.documentId === doc.id && r.status !== 'abgebrochen') &&
                  data.documents.some((d) => d.parentId === doc.id && !hatEigenenPlanlauf(d, data.documents))
                    ? '; wer bisher mitlief, führt den Stand des Verzeichnislaufs in einem eigenen Planlauf weiter.'
                    : '.'
                }`
              : `„${doc.titel}“ wird mit seinem Planlauf gelöscht.`
          }
          onConfirm={() => {
            deleteDocument(doc.id);
            toast('Eintrag gelöscht.');
            schliessen();
          }}
          onClose={() => setLoeschen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Kleiner Dialog, um aus der Auswahl heraus ein Planverzeichnis oder ein
 * Planpaket anzulegen, ohne den Eintrag zu verlassen. Den Planlauf eines
 * Planverzeichnisses startet der Plandialog beim Speichern.
 */
function SchnellDialog({
  art,
  onClose,
  onAnlegen,
}: {
  art: 'verzeichnis' | 'paket';
  onClose: () => void;
  onAnlegen: (titel: string, nummer: string) => void;
}) {
  const toast = useToast();
  const [titel, setTitel] = useState('');
  const [nummer, setNummer] = useState('');
  const verzeichnis = art === 'verzeichnis';

  const speichern = () => {
    if (verzeichnis ? !titel.trim() && !nummer.trim() : !titel.trim()) {
      toast(verzeichnis ? 'Bitte Codierung oder Titel angeben.' : 'Bitte eine Bezeichnung angeben.');
      return;
    }
    // Ohne Titel trägt das Verzeichnis seine Codierung auch als Titel
    onAnlegen(titel.trim() || nummer.trim(), nummer.trim());
    onClose();
  };

  return (
    <Modal
      titel={verzeichnis ? 'Neues Planverzeichnis' : 'Neues Planpaket'}
      sub={
        verzeichnis
          ? 'Wird angelegt und dem Plan übergeordnet – sein Planlauf startet mit dem Speichern des Plans.'
          : 'Wird angelegt und dem Eintrag zugeordnet.'
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Anlegen
          </button>
        </>
      }
    >
      <div className="form-grid">
        {verzeichnis ? (
          <>
            <Field label={NUMMER_LABEL.verzeichnis} full>
              <TextInput
                value={nummer}
                onChange={setNummer}
                autoFocus
                placeholder="NK-KIB-PV-001"
                onKeyDown={(e) => e.key === 'Enter' && speichern()}
              />
            </Field>
            <Field label="Titel" full>
              <TextInput
                value={titel}
                onChange={setTitel}
                placeholder="Planverzeichnis Überbau"
                onKeyDown={(e) => e.key === 'Enter' && speichern()}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label={NUMMER_LABEL.paket} full>
              <TextInput
                value={titel}
                onChange={setTitel}
                autoFocus
                placeholder="Eisenbahnüberführung Nordkanal"
                onKeyDown={(e) => e.key === 'Enter' && speichern()}
              />
            </Field>
            <Field label="Kurzzeichen" full hint="optional">
              <TextInput value={nummer} onChange={setNummer} placeholder="PP-Nordkanal" />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
