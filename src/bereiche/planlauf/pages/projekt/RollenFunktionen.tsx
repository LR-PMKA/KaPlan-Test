/**
 * Reiter „Funktion“ eines Projekts – nach Gewerken gegliedert.
 *
 * Im Vordergrund steht die Funktion, nicht die Person: Je Gewerk führt das
 * Projekt seine Funktionen, und zu jeder Funktion wird die Person mit ihren
 * Adressdaten hinterlegt. Die Gliederung entspricht dem projektübergreifenden
 * Reiter „Funktionen“.
 *
 * Die eigene Funktion Planlaufmanagement erscheint hier nicht: Sie füllt stets
 * die angemeldete Person mit ihrem Profil aus (siehe istEigeneFunktion).
 */
import { useState } from 'react';
import {
  EIGENE_ROLLE,
  UEBERGREIFEND,
  funktionsName,
  istEigeneFunktion,
  kuerzelAus,
  seiteAusFunktion,
  type Contact,
  type ID,
  type Project,
  type Role,
  type Seite,
} from '../../domain/types';
import { SeiteBadge, SeiteFeld } from '../../components/SeiteAuswahl';
import { gewerkeFuerProjekt } from '../../domain/engine';
import { useStore } from '../../store/store';
import { useToast } from '../../../../shared/toast';
import { GewerkDialog, GewerkLoeschenDialog } from '../../components/GewerkDialog';
import { RollenImport } from './RollenImport';
import {
  Avatar,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Search,
  Select,
  TextArea,
  TextInput,
} from '../../../../shared/ui';
import { Icon } from '../../../../shared/icons';
import '../../components/planlauf.css';

const FARBEN = ['#24456e', '#5856d6', '#ff9500', '#34c759', '#ff3b30', '#af52de', '#00a0a0', '#c77700'];

export function RollenFunktionen({ project }: { project: Project }) {
  const { data, deleteRole, deleteContact } = useStore();
  const toast = useToast();
  const [seite, setSeite] = useState<string>(UEBERGREIFEND);
  const [suche, setSuche] = useState('');
  const [besetzen, setBesetzen] = useState<Role | null>(null);
  const [funktionDialog, setFunktionDialog] = useState<{ rolle?: Role } | null>(null);
  const [gewerkDialog, setGewerkDialog] = useState(false);
  const [gewerkLoeschen, setGewerkLoeschen] = useState<string | null>(null);
  const [importOffen, setImportOffen] = useState(false);
  const [loeschen, setLoeschen] = useState<Role | null>(null);
  const [personLoeschen, setPersonLoeschen] = useState<Contact | null>(null);
  const [person, setPerson] = useState<Contact | null>(null);
  const [neuePerson, setNeuePerson] = useState(false);

  // Die eigene Funktion füllt immer die angemeldete Person aus – sie wird hier
  // weder angezeigt noch zur Auswahl angeboten.
  const rollen = data.roles.filter((r) => r.projectId === project.id && !istEigeneFunktion(r));
  const kontakte = data.contacts.filter((c) => c.projectId === project.id);

  /** Gewerke aus den Stammdaten, ergänzt um die im Projekt vorkommenden. */
  const gewerke = gewerkeFuerProjekt(data, project.id);

  const uebergreifend = seite === UEBERGREIFEND;
  /** Person, die eine Funktion ausfüllt. */
  const besetztVon = (rolle: Role) => kontakte.find((c) => c.zuordnungen.some((z) => z.roleId === rolle.id));

  const sichtbar = rollen
    .filter((r) => (uebergreifend ? r.gewerk === null : r.gewerk === seite))
    .filter((r) => {
      if (!suche.trim()) return true;
      const c = besetztVon(r);
      return [r.name, r.kuerzel, c?.vorname, c?.nachname, c?.firma, c?.email]
        .join(' ')
        .toLowerCase()
        .includes(suche.toLowerCase());
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const besetzt = sichtbar.filter((r) => besetztVon(r)).length;
  // Personen, die (noch) keine der hier geführten Funktionen ausfüllen – etwa
  // aus einem Import. Die angemeldete Person selbst gehört nicht dazu.
  const ohneFunktion = kontakte.filter(
    (c) => !c.eigen && !c.zuordnungen.some((z) => rollen.some((r) => r.id === z.roleId)),
  );

  return (
    <div className="stack">
      <div className="tabs">
        <button type="button" className={uebergreifend ? 'active' : ''} onClick={() => setSeite(UEBERGREIFEND)}>
          {UEBERGREIFEND}
        </button>
        {gewerke.map((g) => (
          <button key={g} type="button" className={seite === g ? 'active' : ''} onClick={() => setSeite(g)}>
            {g}
          </button>
        ))}
        <button type="button" className="tab-plus" title="Neues Gewerk anlegen" onClick={() => setGewerkDialog(true)}>
          <Icon name="plus" size={13} />
        </button>
      </div>

      <div className="row-between wrap">
        <Search value={suche} onChange={setSuche} placeholder="Funktion, Person, Firma …" />
        <div className="row">
          <button type="button" className="btn btn-outline" onClick={() => setImportOffen(true)}>
            <Icon name="importieren" size={14} /> Excel-Import
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setNeuePerson(true)}>
            <Icon name="person" size={14} /> Person hinzufügen
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setFunktionDialog({})}>
            <Icon name="plus" size={14} /> Neue Funktion
          </button>
        </div>
      </div>

      <Card>
        <CardHeader
          titel={uebergreifend ? 'Übergreifende Funktionen' : `Funktionen ${seite}`}
          sub={`${sichtbar.length} Funktionen · ${besetzt} besetzt · ${
            uebergreifend
              ? 'gelten für alle Gewerke und werden einmal besetzt; das Planlaufmanagement übernimmt stets die angemeldete Person'
              : 'je Funktion genau eine Person'
          }`}
        />
        {sichtbar.length === 0 ? (
          <EmptyState
            icon="person"
            titel="Keine Funktion"
            text={
              uebergreifend
                ? 'Legen Sie die Funktionen an, die für alle Gewerke gelten.'
                : `Legen Sie die Funktionen an, die in ${seite} vorkommen.`
            }
            action={
              <button type="button" className="btn btn-primary" onClick={() => setFunktionDialog({})}>
                <Icon name="plus" size={14} /> Neue Funktion
              </button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Funktion</th>
                  <th>Besetzt durch</th>
                  <th className="col-optional">Firma / Büro</th>
                  <th className="col-optional">Kontakt</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((rolle) => {
                  const c = besetztVon(rolle);
                  return (
                    <tr key={rolle.id} className="clickable" onClick={() => setBesetzen(rolle)}>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <span className="dot" style={{ background: rolle.farbe }} />
                          <span style={{ minWidth: 0 }}>
                            <strong>{rolle.name}</strong>
                            {rolle.kuerzel ? <span className="num tertiary"> · {rolle.kuerzel}</span> : null}{' '}
                            <SeiteBadge seite={rolle.seite} />
                            {rolle.beschreibung ? (
                              <div className="small tertiary truncate">{rolle.beschreibung}</div>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td>
                        {c ? (
                          <span className="row" style={{ gap: 8 }}>
                            <Avatar name={`${c.vorname} ${c.nachname}`} farbe={rolle.farbe} />
                            <strong>
                              {c.vorname} {c.nachname}
                            </strong>
                          </span>
                        ) : (
                          <span className="tertiary small">– nicht besetzt –</span>
                        )}
                      </td>
                      <td className="small muted col-optional">{c?.firma || '–'}</td>
                      <td className="small col-optional">
                        {c?.email ? (
                          <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()}>
                            {c.email}
                          </a>
                        ) : (
                          <span className="tertiary">–</span>
                        )}
                        {c?.telefon ? <div className="tertiary small">{c.telefon}</div> : null}
                        {c ? <SharePointLinks kontakt={c} /> : null}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Funktion bearbeiten"
                          title="Funktion bearbeiten"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFunktionDialog({ rolle });
                          }}
                        >
                          <Icon name="bearbeiten" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Funktion löschen"
                          title="Funktion löschen"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLoeschen(rolle);
                          }}
                        >
                          <Icon name="loeschen" size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {ohneFunktion.length > 0 ? (
        <Card>
          <CardHeader
            titel="Personen ohne Funktion"
            sub="Im Projekt hinterlegt, aber keiner Funktion zugeordnet"
          />
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="col-optional">Firma / Büro</th>
                  <th>Kontakt</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {ohneFunktion.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setPerson(c)}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <Avatar name={`${c.vorname} ${c.nachname}`} />
                        <strong>
                          {c.vorname} {c.nachname}
                        </strong>
                      </span>
                    </td>
                    <td className="small muted col-optional">{c.firma || '–'}</td>
                    <td className="small">{c.email || '–'}</td>
                    <td className="actions">
                      <button type="button" className="btn-icon" aria-label="Person bearbeiten" title="Person bearbeiten">
                        <Icon name="bearbeiten" size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label="Person löschen"
                        title="Person löschen"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPersonLoeschen(c);
                        }}
                      >
                        <Icon name="loeschen" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {!uebergreifend ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            title={`Gewerk „${seite}“ mit seinen Funktionen löschen`}
            onClick={() => setGewerkLoeschen(seite)}
          >
            <Icon name="loeschen" size={13} /> Gewerk „{seite}“ löschen
          </button>
        </div>
      ) : null}

      {besetzen ? (
        <BesetzungsDialog
          project={project}
          rolle={besetzen}
          rollen={rollen}
          kontakte={kontakte}
          onClose={() => setBesetzen(null)}
        />
      ) : null}

      {person ? (
        <BesetzungsDialog
          project={project}
          rolle={null}
          rollen={rollen}
          kontakt={person}
          kontakte={kontakte}
          onClose={() => setPerson(null)}
        />
      ) : null}

      {neuePerson ? (
        <BesetzungsDialog
          project={project}
          rolle={null}
          rollen={rollen}
          vorauswahlRolle={uebergreifend ? null : seite}
          kontakte={kontakte}
          onClose={() => setNeuePerson(false)}
        />
      ) : null}

      {funktionDialog ? (
        <FunktionsDialog
          project={project}
          rolle={funktionDialog.rolle}
          gewerke={gewerke}
          vorauswahl={uebergreifend ? null : seite}
          anzahl={rollen.length}
          onClose={() => setFunktionDialog(null)}
          onNeuesGewerk={() => setGewerkDialog(true)}
        />
      ) : null}

      {gewerkDialog ? <GewerkDialog onClose={() => setGewerkDialog(false)} onAngelegt={setSeite} /> : null}

      {gewerkLoeschen ? (
        <GewerkLoeschenDialog
          gewerk={gewerkLoeschen}
          onClose={() => setGewerkLoeschen(null)}
          onGeloescht={() => setSeite(UEBERGREIFEND)}
        />
      ) : null}

      {importOffen ? <RollenImport project={project} onClose={() => setImportOffen(false)} /> : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Funktion löschen?"
          text={`„${funktionsName(loeschen)}“ wird aus diesem Projekt entfernt. Prozessschritte mit dieser Funktion bleiben bestehen, sind dann aber unbesetzt.`}
          onConfirm={() => {
            deleteRole(loeschen.id);
            toast('Funktion gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}

      {personLoeschen ? (
        <ConfirmDialog
          titel="Person löschen?"
          text={`${personLoeschen.vorname} ${personLoeschen.nachname} wird aus diesem Projekt entfernt. Prozessschritte, denen die Person von Hand zugewiesen ist, sind danach unbesetzt.`}
          onConfirm={() => {
            deleteContact(personLoeschen.id);
            toast('Person gelöscht.');
          }}
          onClose={() => setPersonLoeschen(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Zwei Wege zum selben Ziel:
 *
 * – von der Funktion aus (`rolle` gesetzt): Person auswählen oder neu erfassen;
 * – von der Person aus (`rolle = null`): Angaben erfassen bzw. pflegen und die
 *   Funktion wahlweise gleich dabei zuweisen.
 */
function BesetzungsDialog({
  project,
  rolle,
  rollen,
  vorauswahlRolle,
  kontakt,
  kontakte,
  onClose,
}: {
  project: Project;
  rolle: Role | null;
  /** Alle Funktionen des Projekts – Auswahl, wenn von der Person aus besetzt wird. */
  rollen: Role[];
  /** Gewerk, dessen Funktionen zuerst angeboten werden. */
  vorauswahlRolle?: string | null;
  kontakt?: Contact;
  kontakte: Contact[];
  onClose: () => void;
}) {
  const { addContact, updateContact, deleteContact } = useStore();
  const toast = useToast();
  const bisher = kontakt ?? (rolle ? kontakte.find((c) => c.zuordnungen.some((z) => z.roleId === rolle.id)) : undefined);
  const [personId, setPersonId] = useState<ID | ''>(bisher?.id ?? '');
  // Von der Person aus gewählte Funktion; leer = (noch) ohne Funktion
  const [rolleId, setRolleId] = useState<ID | ''>('');
  const [loeschen, setLoeschen] = useState(false);
  const leer = {
    anrede: '',
    vorname: '',
    nachname: '',
    firma: '',
    email: '',
    telefon: '',
    anschrift: '',
    sharepointEingang: '',
    sharepointAusgang: '',
    notiz: '',
  };
  const werteVon = (c?: Contact) =>
    c
      ? {
          anrede: c.anrede,
          vorname: c.vorname,
          nachname: c.nachname,
          firma: c.firma,
          email: c.email,
          telefon: c.telefon,
          anschrift: c.anschrift,
          sharepointEingang: c.sharepointEingang ?? '',
          sharepointAusgang: c.sharepointAusgang ?? '',
          notiz: c.notiz,
        }
      : leer;
  const [form, setForm] = useState(werteVon(bisher));

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Funktionen zur Auswahl: das Gewerk der geöffneten Seite zuerst
  const auswahlRollen = [...rollen].sort((a, b) => {
    const rang = (r: Role) => (r.gewerk === (vorauswahlRolle ?? null) ? 0 : 1);
    return rang(a) - rang(b) || `${a.gewerk ?? ''} ${a.name}`.localeCompare(`${b.gewerk ?? ''} ${b.name}`, 'de');
  });
  const gewaehlteRolle = rollen.find((r) => r.id === rolleId);
  const vorherigerInhaber = gewaehlteRolle
    ? kontakte.find((c) => c.zuordnungen.some((z) => z.roleId === gewaehlteRolle.id))
    : undefined;

  /** Andere Person übernehmen – ihre Angaben füllen das Formular. */
  const personWechseln = (id: string) => {
    setPersonId(id);
    setForm(werteVon(kontakte.find((c) => c.id === id)));
  };

  const speichern = () => {
    if (!form.nachname.trim()) {
      toast('Bitte einen Nachnamen angeben.');
      return;
    }
    // Funktion: entweder die Zeile, aus der der Dialog kommt, oder die Auswahl
    const zielRolle = rolle ?? rollen.find((r) => r.id === rolleId);
    const ziel = personId ? kontakte.find((c) => c.id === personId) : kontakt;
    const zuordnung = zielRolle ? [{ roleId: zielRolle.id, gewerk: zielRolle.gewerk }] : [];
    const vorher = zielRolle
      ? kontakte.find((c) => c.zuordnungen.some((z) => z.roleId === zielRolle.id))
      : undefined;

    if (ziel) {
      const vorhanden = ziel.zuordnungen.filter((z) => !zielRolle || z.roleId !== zielRolle.id);
      updateContact(ziel.id, { ...form, zuordnungen: [...vorhanden, ...zuordnung] });
    } else {
      addContact({ ...form, projectId: project.id, zuordnungen: zuordnung, eigen: false });
    }

    // Bisherige Besetzung der Funktion aufheben, wenn jemand anderes übernimmt
    if (zielRolle && vorher && vorher.id !== ziel?.id) {
      updateContact(vorher.id, { zuordnungen: vorher.zuordnungen.filter((z) => z.roleId !== zielRolle.id) });
    }
    toast(zielRolle ? `${funktionsName(zielRolle)} besetzt.` : 'Person gespeichert.');
    onClose();
  };

  const freigeben = () => {
    if (!rolle || !bisher) return;
    updateContact(bisher.id, { zuordnungen: bisher.zuordnungen.filter((z) => z.roleId !== rolle.id) });
    toast('Besetzung aufgehoben – die Person bleibt im Projekt.');
    onClose();
  };

  return (
    <>
      <Modal
        titel={rolle ? funktionsName(rolle) : kontakt ? `${kontakt.vorname} ${kontakt.nachname}` : 'Neue Person'}
        sub={
          rolle
            ? 'Funktion besetzen – eine Person mit ihren Adressdaten'
            : 'Person erfassen und wahlweise gleich einer Funktion zuweisen'
        }
        onClose={onClose}
        footer={
          <>
            {rolle && bisher ? (
              <button type="button" className="btn btn-danger" onClick={freigeben}>
                Besetzung aufheben
              </button>
            ) : null}
            {!rolle && bisher && !bisher.eigen ? (
              <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
                <Icon name="loeschen" size={14} /> Person löschen
              </button>
            ) : null}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Abbrechen
            </button>
            <button type="button" className="btn btn-primary" onClick={speichern}>
              Speichern
            </button>
          </>
        }
      >
        <div className="form-grid">
          {rolle ? (
            <Field
              label="Person"
              full
              hint="Eine im Projekt bekannte Person übernehmen oder die Angaben unten neu erfassen."
            >
              <Select
                value={personId}
                onChange={personWechseln}
                placeholder="– neue Person erfassen –"
                options={kontakte.map((c) => ({
                  value: c.id,
                  label: `${c.vorname} ${c.nachname}${c.firma ? ` (${c.firma})` : ''}`,
                }))}
              />
            </Field>
          ) : (
            <Field
              label="Funktion"
              full
              hint={
                gewaehlteRolle && vorherigerInhaber
                  ? `Bisher besetzt durch ${vorherigerInhaber.vorname} ${vorherigerInhaber.nachname} – die Besetzung wechselt.`
                  : 'Kann auch offen bleiben; die Person lässt sich später einer Funktion zuweisen.'
              }
            >
              <Select
                value={rolleId}
                onChange={setRolleId}
                placeholder="– ohne Funktion –"
                options={auswahlRollen.map((r) => {
                  const inhaber = kontakte.find((c) => c.zuordnungen.some((z) => z.roleId === r.id));
                  return {
                    value: r.id,
                    label: `${r.gewerk ?? UEBERGREIFEND} · ${r.name}${
                      inhaber ? ` (besetzt: ${inhaber.vorname} ${inhaber.nachname})` : ''
                    }`,
                  };
                })}
              />
            </Field>
          )}
          <Field label="Anrede">
            <Select
              value={form.anrede}
              onChange={(v) => set('anrede', v)}
              options={[
                { value: '', label: 'ohne Anrede' },
                { value: 'Frau', label: 'Frau' },
                { value: 'Herr', label: 'Herr' },
              ]}
            />
          </Field>
          <Field label="Vorname">
            <TextInput value={form.vorname} onChange={(v) => set('vorname', v)} />
          </Field>
          <Field label="Nachname">
            <TextInput value={form.nachname} onChange={(v) => set('nachname', v)} />
          </Field>
          <Field label="Firma / Büro">
            <TextInput value={form.firma} onChange={(v) => set('firma', v)} />
          </Field>
          <Field label="E-Mail">
            <TextInput value={form.email} onChange={(v) => set('email', v)} type="email" />
          </Field>
          <Field label="Telefon">
            <TextInput value={form.telefon} onChange={(v) => set('telefon', v)} />
          </Field>
          <Field label="Anschrift" full hint="Straße, PLZ und Ort">
            <TextArea value={form.anschrift} onChange={(v) => set('anschrift', v)} rows={2} />
          </Field>
          <Field label="SharePoint-Link Eingang" full hint="Ordner, in dem die Unterlagen für die Person bereitliegen – für die Versandmail">
            <TextInput
              value={form.sharepointEingang}
              onChange={(v) => set('sharepointEingang', v)}
              type="url"
              inputMode="url"
              placeholder="https://…sharepoint.com/sites/…"
            />
          </Field>
          <Field label="SharePoint-Link Ausgang" full hint="Ordner, in den die Person ihre Unterlagen hochlädt">
            <TextInput
              value={form.sharepointAusgang}
              onChange={(v) => set('sharepointAusgang', v)}
              type="url"
              inputMode="url"
              placeholder="https://…sharepoint.com/sites/…"
            />
          </Field>
          <Field label="Notiz" full>
            <TextArea value={form.notiz} onChange={(v) => set('notiz', v)} rows={2} />
          </Field>
        </div>
      </Modal>

      {loeschen && bisher ? (
        <ConfirmDialog
          titel="Person löschen?"
          text={`„${bisher.vorname} ${bisher.nachname}“ wird aus dem Projekt entfernt und aus allen Prozessschritten ausgetragen.`}
          onConfirm={() => {
            deleteContact(bisher.id);
            toast('Person gelöscht.');
            onClose();
          }}
          onClose={() => setLoeschen(false)}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */

/** Anlage und Pflege einer Funktion dieses Projekts. */
function FunktionsDialog({
  project,
  rolle,
  gewerke,
  vorauswahl,
  anzahl,
  onClose,
  onNeuesGewerk,
}: {
  project: Project;
  rolle?: Role;
  gewerke: string[];
  vorauswahl: string | null;
  anzahl: number;
  onClose: () => void;
  onNeuesGewerk: () => void;
}) {
  const { addRole, updateRole } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    name: rolle?.name ?? '',
    kuerzel: rolle?.kuerzel ?? '',
    farbe: rolle?.farbe ?? FARBEN[anzahl % FARBEN.length],
    beschreibung: rolle?.beschreibung ?? '',
    gewerk: rolle?.gewerk ?? vorauswahl,
    seite: rolle ? rolle.seite : (null as Seite | null),
  });
  // Eine neue Funktion übernimmt die Seite aus ihrer Bezeichnung, bis sie von Hand gewählt wird
  const [seiteVonHand, setSeiteVonHand] = useState(Boolean(rolle));

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const nameAendern = (name: string) =>
    setForm((f) => ({ ...f, name, seite: seiteVonHand ? f.seite : seiteAusFunktion(name) }));

  const speichern = () => {
    if (!form.name.trim()) {
      toast('Bitte eine Bezeichnung angeben.');
      return;
    }
    if (istEigeneFunktion({ name: form.name, gewerk: form.gewerk })) {
      toast(`${EIGENE_ROLLE} übernimmt stets die angemeldete Person.`);
      return;
    }
    const werte = {
      ...form,
      name: form.name.trim(),
      kuerzel: form.kuerzel.trim() || kuerzelAus(form.name),
    };
    if (rolle) {
      updateRole(rolle.id, werte);
      toast('Funktion gespeichert.');
    } else {
      addRole({ ...werte, projectId: project.id });
      toast('Funktion angelegt.');
    }
    onClose();
  };

  return (
    <Modal
      titel={rolle ? 'Funktion bearbeiten' : 'Neue Funktion'}
      sub="Gilt in diesem Projekt"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Speichern
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Bezeichnung" full>
          <TextInput value={form.name} onChange={nameAendern} placeholder="z.B. Erdungsprüfer" />
        </Field>
        <Field label="Kürzel" hint="leer = aus der Bezeichnung gebildet">
          <TextInput value={form.kuerzel} onChange={(v) => set('kuerzel', v)} />
        </Field>
        <Field label="Farbe">
          <input
            type="color"
            value={form.farbe}
            onChange={(e) => set('farbe', e.target.value)}
            style={{ width: 52, height: 32, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
          />
        </Field>
        <Field
          label="Gewerk"
          full
          hint="Übergreifend bedeutet: eine Besetzung für alle Gewerke. Sonst gehört die Funktion genau zu diesem Gewerk."
        >
          <div className="row" style={{ gap: 8 }}>
            <Select
              value={form.gewerk ?? UEBERGREIFEND}
              onChange={(v) => set('gewerk', v === UEBERGREIFEND ? null : v)}
              options={[UEBERGREIFEND, ...gewerke].map((g) => ({ value: g, label: g }))}
            />
            <button type="button" className="btn btn-sm btn-outline" onClick={onNeuesGewerk}>
              <Icon name="plus" size={13} /> Gewerk
            </button>
          </div>
        </Field>
        <SeiteFeld
          value={form.seite}
          vorbelegt={!seiteVonHand}
          onChange={(v) => {
            setSeiteVonHand(true);
            set('seite', v);
          }}
        />
        <Field label="Beschreibung" full>
          <TextArea value={form.beschreibung} onChange={(v) => set('beschreibung', v)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

/** Kleine Links zu den SharePoint-Ordnern einer Person (nur, wenn hinterlegt). */
function SharePointLinks({ kontakt }: { kontakt: Contact }) {
  const links = [
    { text: 'SharePoint Eingang', url: kontakt.sharepointEingang },
    { text: 'SharePoint Ausgang', url: kontakt.sharepointAusgang },
  ].filter((l) => l.url?.trim());
  if (links.length === 0) return null;
  return (
    <div className="small pl-sharepoint">
      {links.map((l) => (
        <a key={l.text} href={l.url.trim()} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {l.text}
        </a>
      ))}
    </div>
  );
}
