/**
 * Einlesen von Rollen und ihrer Besetzung aus einer Excel-Datei (.xlsx) oder
 * Textliste (.csv).
 *
 * Je Zeile stehen Gewerk, Funktion und die Person mit ihren Adressdaten.
 * Gewerke und Funktionen, die es noch nicht gibt, werden angelegt; die Person
 * besetzt anschließend die Funktion.
 */
import { useRef, useState } from 'react';
import {
  EIGENE_ROLLE,
  SEITE_LABEL,
  UEBERGREIFEND,
  istEigeneFunktion,
  kuerzelAus,
  seiteAusFunktion,
  type Contact,
  type ID,
  type Project,
  type Seite,
  type Zuordnung,
} from '../../domain/types';
import { spaltenZuordnen, tabelleLesen } from '../../../../shared/xlsxLesen';
import {
  ROLLEN_KOPFZEILE as KOPFZEILE,
  ROLLEN_SPALTEN,
  rollenVorlageLaden,
} from '../../domain/importVorlagen';
import { seiteAusText } from '../../components/SeiteAuswahl';
import { useStore } from '../../store/store';
import { useToast } from '../../../../shared/toast';
import { Callout, Modal } from '../../../../shared/ui';
import { Icon } from '../../../../shared/icons';

/**
 * Spalten des Imports – dazu optional die Seite der Funktion für den Verzug
 * (Planer, Prüfer, Auftraggeber, PLM oder „nicht festgelegt“).
 */
const SPALTEN: Record<string, string[]> = {
  ...ROLLEN_SPALTEN,
  seite: ['Seite', 'Seite für den Verzug', 'Seite Verzug'],
};

const seiteText = (seite: Seite | null) => (seite ? SEITE_LABEL[seite] : 'nicht festgelegt');

const FARBEN = ['#24456e', '#5856d6', '#ff9500', '#34c759', '#ff3b30', '#af52de', '#00a0a0', '#c77700'];

/** Setzt die Anschrift aus Straße, Hausnummer, PLZ und Ort zusammen. */
function anschriftBauen(strasse: string, nr: string, plz: string, ort: string): string {
  const zeile1 = [strasse, nr].filter(Boolean).join(' ');
  const zeile2 = [plz, ort].filter(Boolean).join(' ');
  return [zeile1, zeile2].filter(Boolean).join('\n');
}

const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** SharePoint-Links nur, wenn die Zelle gefüllt ist – leere Zellen lassen vorhandene stehen. */
type Person = Omit<Contact, 'id' | 'projectId' | 'zuordnungen' | 'eigen' | 'sharepointEingang' | 'sharepointAusgang'> &
  Partial<Pick<Contact, 'sharepointEingang' | 'sharepointAusgang'>>;

interface Zeile {
  /** Gewerk der Funktion; null = übergreifend. */
  gewerk: string | null;
  funktion: string;
  kuerzel: string;
  /** Seite aus der Spalte „Seite“; undefined = leer bzw. unbekannt (neue Funktionen: aus der Bezeichnung). */
  seite: Seite | null | undefined;
  person: Person;
  neuesGewerk: boolean;
  neueFunktion: boolean;
  hinweis: string;
}

export function RollenImport({ project, onClose }: { project: Project; onClose: () => void }) {
  const { data, addGewerk, addRole, updateRole, addContact, updateContact } = useStore();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [fehler, setFehler] = useState('');
  const [datei, setDatei] = useState('');
  const [vorschau, setVorschau] = useState<Zeile[]>([]);

  const rollen = data.roles.filter((r) => r.projectId === project.id);
  const kontakte = data.contacts.filter((c) => c.projectId === project.id);

  /** Vorhandene Funktion des Projekts zu Bezeichnung und Gewerk. */
  const findeRolle = (name: string, gewerk: string | null) =>
    rollen.find((r) => gleich(r.name, name) && (r.gewerk ?? '') === (gewerk ?? ''));

  /** Kennung einer Person: E-Mail, sonst der Name. */
  const personSchluessel = (p: Person) => (p.email || `${p.vorname} ${p.nachname}`).trim().toLowerCase();

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
      if (spalten.nachname === undefined) {
        setFehler(
          `Die Spalte „Name“ wurde nicht gefunden. Gelesene Überschriften: ${kopf.join(', ') || '(keine)'}`,
        );
        return;
      }

      const wert = (zeile: string[], feld: string) =>
        spalten[feld] !== undefined ? (zeile[spalten[feld]] ?? '').trim() : '';

      // Gewerke und Funktionen, die im Laufe der Datei neu hinzukommen
      const neueGewerke = new Set<string>();
      const neueFunktionen = new Set<string>();
      // Funktionen, deren Seite die Datei schon nennt – maßgeblich ist die erste Angabe
      const seiteGenannt = new Set<string>();

      const ergebnis: Zeile[] = zeilen.map((zeile) => {
        const gewerkRoh = wert(zeile, 'gewerk');
        const gewerk = !gewerkRoh || gleich(gewerkRoh, UEBERGREIFEND) ? null : gewerkRoh;
        const hinweise: string[] = [];
        // Das Planlaufmanagement füllt stets die angemeldete Person aus; die
        // Person der Zeile wird deshalb ohne diese Funktion übernommen.
        const funktionRoh = wert(zeile, 'funktion');
        const eigeneFunktion = Boolean(funktionRoh) && istEigeneFunktion({ name: funktionRoh, gewerk });
        const funktion = eigeneFunktion ? '' : funktionRoh;
        if (eigeneFunktion) {
          hinweise.push(`${EIGENE_ROLLE} übernimmt stets die angemeldete Person – die Person wird ohne Funktion hinterlegt`);
        }

        let neuesGewerk = false;
        if (gewerk && !data.gewerke.some((g) => gleich(g, gewerk))) {
          neuesGewerk = !neueGewerke.has(gewerk.toLowerCase());
          neueGewerke.add(gewerk.toLowerCase());
          if (neuesGewerk) hinweise.push(`Gewerk „${gewerk}“ wird angelegt`);
        }

        let neueFunktion = false;
        if (funktion) {
          const schluessel = `${funktion.toLowerCase()}|${gewerk ?? ''}`;
          if (!findeRolle(funktion, gewerk)) {
            neueFunktion = !neueFunktionen.has(schluessel);
            neueFunktionen.add(schluessel);
            if (neueFunktion) {
              hinweise.push(`Funktion „${funktion}${gewerk ? ` ${gewerk}` : ''}“ wird angelegt`);
            }
          }
        } else if (!eigeneFunktion) {
          hinweise.push('ohne Funktion – die Person wird nur im Projekt hinterlegt');
        }

        // Seite für den Verzug: optional; vorhandene Funktionen behalten ihre, wenn die Zelle leer ist
        const seiteRoh = wert(zeile, 'seite');
        let seite = seiteRoh ? seiteAusText(seiteRoh) : undefined;
        if (funktion && seiteRoh && seite === undefined) {
          const folge = findeRolle(funktion, gewerk) ? 'bleibt unverändert' : 'aus der Bezeichnung vorbelegt';
          hinweise.push(`Seite „${seiteRoh}“ unbekannt – ${folge}`);
        }
        if (funktion && seite !== undefined) {
          const schluessel = `${funktion.toLowerCase()}|${gewerk ?? ''}`;
          const vorhanden = findeRolle(funktion, gewerk);
          if (seiteGenannt.has(schluessel)) seite = undefined;
          else {
            seiteGenannt.add(schluessel);
            if (vorhanden && vorhanden.seite !== seite) {
              hinweise.push(`Seite für den Verzug wird „${seiteText(seite)}“ (bisher „${seiteText(vorhanden.seite)}“)`);
            }
          }
        }

        const person: Person = {
          anrede: wert(zeile, 'anrede'),
          vorname: wert(zeile, 'vorname'),
          nachname: wert(zeile, 'nachname'),
          firma: wert(zeile, 'firma'),
          email: wert(zeile, 'email'),
          telefon: wert(zeile, 'telefon'),
          anschrift: anschriftBauen(
            wert(zeile, 'strasse'),
            wert(zeile, 'hausnummer'),
            wert(zeile, 'plz'),
            wert(zeile, 'ort'),
          ),
          notiz: wert(zeile, 'notiz'),
          ...(wert(zeile, 'sharepointEingang') ? { sharepointEingang: wert(zeile, 'sharepointEingang') } : {}),
          ...(wert(zeile, 'sharepointAusgang') ? { sharepointAusgang: wert(zeile, 'sharepointAusgang') } : {}),
        };

        const vorhandeneRolle = funktion ? findeRolle(funktion, gewerk) : undefined;
        const bisher = vorhandeneRolle
          ? kontakte.find((c) => c.zuordnungen.some((z) => z.roleId === vorhandeneRolle.id))
          : undefined;
        if (bisher && personSchluessel(bisher) !== personSchluessel(person)) {
          hinweise.push(`ersetzt ${bisher.vorname} ${bisher.nachname} in dieser Funktion`);
        }

        return {
          gewerk,
          funktion,
          kuerzel: wert(zeile, 'kuerzel'),
          seite,
          person,
          neuesGewerk,
          neueFunktion,
          hinweis: hinweise.join('; '),
        };
      });

      setVorschau(ergebnis.filter((z) => z.person.nachname));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
    }
  };

  const uebernehmen = () => {
    // 1. Fehlende Gewerke anlegen
    const gewerkeNeu = [...new Set(vorschau.filter((z) => z.neuesGewerk).map((z) => z.gewerk!))];
    gewerkeNeu.forEach((g) => addGewerk(g));

    // 2. Fehlende Funktionen als Projektfunktionen anlegen; genannte Seiten vorhandener Funktionen übernehmen
    const rolleIds = new Map<string, ID>();
    let neueRollen = 0;
    let seitenGeaendert = 0;
    // Seite je Funktion: die erste Angabe der Datei (siehe Vorschau)
    const seiteVon = new Map<string, Seite | null>();
    for (const z of vorschau) {
      const schluessel = `${z.funktion.toLowerCase()}|${z.gewerk ?? ''}`;
      if (z.funktion && z.seite !== undefined && !seiteVon.has(schluessel)) seiteVon.set(schluessel, z.seite);
    }
    for (const z of vorschau) {
      if (!z.funktion) continue;
      const schluessel = `${z.funktion.toLowerCase()}|${z.gewerk ?? ''}`;
      if (rolleIds.has(schluessel)) continue;
      const vorhanden = findeRolle(z.funktion, z.gewerk);
      const seite = seiteVon.get(schluessel);
      if (vorhanden) {
        rolleIds.set(schluessel, vorhanden.id);
        if (seite !== undefined && vorhanden.seite !== seite) {
          updateRole(vorhanden.id, { seite });
          seitenGeaendert += 1;
        }
        continue;
      }
      const id = addRole({
        projectId: project.id,
        name: z.funktion,
        kuerzel: z.kuerzel || kuerzelAus(z.funktion),
        farbe: FARBEN[(rollen.length + neueRollen) % FARBEN.length],
        beschreibung: '',
        gewerk: z.gewerk,
        seite: seite !== undefined ? seite : seiteAusFunktion(z.funktion),
      });
      rolleIds.set(schluessel, id);
      neueRollen += 1;
    }

    // 3. Zeilen je Person bündeln – eine Person kann mehrere Funktionen ausfüllen
    const gruppen = new Map<string, { person: Person; zuordnungen: Zuordnung[] }>();
    for (const z of vorschau) {
      const schluessel = personSchluessel(z.person);
      const eintrag = gruppen.get(schluessel) ?? { person: z.person, zuordnungen: [] };
      eintrag.person = z.person;
      if (z.funktion) {
        const roleId = rolleIds.get(`${z.funktion.toLowerCase()}|${z.gewerk ?? ''}`);
        if (roleId && !eintrag.zuordnungen.some((x) => x.roleId === roleId)) {
          eintrag.zuordnungen.push({ roleId, gewerk: z.gewerk });
        }
      }
      gruppen.set(schluessel, eintrag);
    }

    // 4. Personen anlegen oder ergänzen
    const vergeben = new Set<ID>();
    let angelegt = 0;
    let ergaenzt = 0;
    for (const [schluessel, eintrag] of gruppen) {
      eintrag.zuordnungen.forEach((z) => vergeben.add(z.roleId));
      const vorhanden = kontakte.find((c) => personSchluessel(c) === schluessel);
      if (vorhanden) {
        const behalten = vorhanden.zuordnungen.filter(
          (z) => !eintrag.zuordnungen.some((n) => n.roleId === z.roleId),
        );
        updateContact(vorhanden.id, {
          ...eintrag.person,
          zuordnungen: [...behalten, ...eintrag.zuordnungen],
        });
        ergaenzt += 1;
      } else {
        addContact({
          sharepointEingang: '',
          sharepointAusgang: '',
          ...eintrag.person,
          projectId: project.id,
          zuordnungen: eintrag.zuordnungen,
          eigen: false,
        });
        angelegt += 1;
      }
    }

    // 5. Bisherige Besetzungen der vergebenen Funktionen aufheben
    for (const c of kontakte) {
      if (gruppen.has(personSchluessel(c))) continue;
      const bleibt = c.zuordnungen.filter((z) => !vergeben.has(z.roleId));
      if (bleibt.length !== c.zuordnungen.length) updateContact(c.id, { zuordnungen: bleibt });
    }

    const teile = [`${vorschau.length} Zeilen übernommen`];
    if (gewerkeNeu.length > 0) teile.push(`${gewerkeNeu.length} Gewerk(e) angelegt`);
    if (neueRollen > 0) teile.push(`${neueRollen} Funktion(en) angelegt`);
    if (seitenGeaendert > 0) teile.push(`Seite bei ${seitenGeaendert} Funktion(en) geändert`);
    if (angelegt > 0) teile.push(`${angelegt} Person(en) neu`);
    if (ergaenzt > 0) teile.push(`${ergaenzt} aktualisiert`);
    toast(`${teile.join(', ')}.`);
    onClose();
  };

  const mitHinweis = vorschau.filter((v) => v.hinweis).length;

  return (
    <Modal
      titel="Funktionen aus Excel einlesen"
      sub="Je Zeile eine Funktion mit ihrer Besetzung; .xlsx oder .csv"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={rollenVorlageLaden}>
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

        {vorschau.length === 0 && !fehler ? (
          <Callout icon="i">
            Erwartete Spalten: <strong>{KOPFZEILE.join(' · ')}</strong>. Zwingend ist nur <strong>Name</strong>.
            Optional ist <strong>Seite</strong> – die Seite der Funktion für den Verzug (Planer, Prüfer, Auftraggeber,
            PLM oder „nicht festgelegt“); ohne Angabe wird sie bei neuen Funktionen aus der Bezeichnung vorbelegt.
            Gewerke und Funktionen, die es noch nicht gibt, werden beim Import angelegt; „Übergreifend“ steht für
            Funktionen ohne Gewerkbezug. Über <em>Vorlage</em> erhalten Sie eine Datei mit genau diesen Spalten.
          </Callout>
        ) : null}

        {vorschau.length > 0 ? (
          <>
            {mitHinweis > 0 ? (
              <Callout ton="warn" icon="!">
                {mitHinweis} Zeile(n) mit Hinweisen – sie werden trotzdem übernommen.
              </Callout>
            ) : null}
            <div className="card" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Gewerk</th>
                    <th>Funktion</th>
                    <th>Person</th>
                    <th>Kontakt</th>
                    <th>Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {vorschau.map((z, i) => (
                    <tr key={i}>
                      <td className="small muted">{z.gewerk ?? UEBERGREIFEND}</td>
                      <td>
                        <strong>{z.funktion || '–'}</strong>
                        {z.funktion && z.seite !== undefined ? (
                          <div className="tertiary small">Seite: {seiteText(z.seite)}</div>
                        ) : null}
                      </td>
                      <td>
                        {z.person.vorname} {z.person.nachname}
                        {z.person.firma ? <div className="tertiary small">{z.person.firma}</div> : null}
                      </td>
                      <td className="small muted">
                        {z.person.email || '–'}
                        {z.person.anschrift ? (
                          <div className="tertiary small">{z.person.anschrift.replace(/\n/g, ', ')}</div>
                        ) : null}
                      </td>
                      <td className="small" style={{ color: z.hinweis ? 'var(--accent)' : undefined }}>
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
