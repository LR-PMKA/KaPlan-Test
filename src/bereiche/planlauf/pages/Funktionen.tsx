/**
 * Projektübergreifende Funktionen (vormals Rollen), gegliedert nach Gewerken.
 *
 * Je Gewerk gibt es eine eigene Seite; „Übergreifend“ führt die Funktionen,
 * die für alle Gewerke gelten und nur einmal besetzt werden. Neue Projekte
 * übernehmen diese Funktionen; besetzt werden sie im Projekt unter „Funktion“.
 * Die eigene Funktion Planlaufmanagement ist fest vorgegeben und erscheint
 * hier nicht – sie füllt stets die angemeldete Person aus.
 */
import { useState } from 'react';
import {
  EIGENE_ROLLE,
  UEBERGREIFEND,
  istEigeneFunktion,
  kuerzelAus,
  seiteAusFunktion,
  type Seite,
  type StandardRolle,
} from '../domain/types';
import { SeiteBadge, SeiteFeld } from '../components/SeiteAuswahl';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import {
  Badge,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Select,
  TextArea,
  TextInput,
} from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import { GewerkDialog, GewerkLoeschenDialog } from '../components/GewerkDialog';

const FARBEN = ['#24456e', '#5856d6', '#ff9500', '#34c759', '#ff3b30', '#af52de', '#00a0a0', '#c77700'];

export function Funktionen() {
  const { data, addStandardRolle, deleteStandardRolle } = useStore();
  const toast = useToast();
  const [seite, setSeite] = useState<string>(UEBERGREIFEND);
  const [dialog, setDialog] = useState<{ funktion?: StandardRolle } | null>(null);
  const [ergaenzen, setErgaenzen] = useState(false);
  const [loeschen, setLoeschen] = useState<StandardRolle | null>(null);
  const [gewerkDialog, setGewerkDialog] = useState(false);
  const [gewerkLoeschen, setGewerkLoeschen] = useState<string | null>(null);

  // Alle vorkommenden Gewerke – gepflegte Stammdaten und die der Funktionen
  const gewerke = [
    ...new Set([...data.gewerke, ...data.standardRollen.map((r) => r.gewerk).filter((g): g is string => Boolean(g))]),
  ].sort((a, b) => a.localeCompare(b, 'de'));

  const uebergreifend = seite === UEBERGREIFEND;
  const funktionen = data.standardRollen
    .filter((r) => !istEigeneFunktion(r))
    .filter((r) => (uebergreifend ? r.gewerk === null : r.gewerk === seite));

  // Funktionen, die es in anderen Gewerken schon gibt, hier aber noch nicht
  const ergaenzbar = uebergreifend
    ? []
    : [...new Map(
        data.standardRollen
          .filter((r) => r.gewerk !== null && r.gewerk !== seite && !funktionen.some((f) => f.name === r.name))
          .map((r) => [r.name, r]),
      ).values()];

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
        <p className="muted small" style={{ maxWidth: 640 }}>
          {uebergreifend
            ? 'Übergreifende Funktionen gelten für alle Gewerke und werden im Projekt einmal besetzt.'
            : `Funktionen des Gewerks ${seite}. Jedes Gewerk führt eigene Funktionen: „${
                funktionen[0]?.name ?? 'Planprüfer'
              } ${seite}“ ist eine andere Funktion als dieselbe Bezeichnung in einem anderen Gewerk.`}
        </p>
        <div className="row">
          {!uebergreifend && ergaenzbar.length > 0 ? (
            <button type="button" className="btn btn-outline" onClick={() => setErgaenzen(true)}>
              <Icon name="plus" size={14} /> Vorhandene Funktion
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
            <Icon name="plus" size={14} /> Neue Funktion
          </button>
        </div>
      </div>

      <Card>
        <CardHeader
          titel={uebergreifend ? 'Übergreifende Funktionen' : `Funktionen ${seite}`}
          sub={`${funktionen.length} Funktionen`}
        />
        {funktionen.length === 0 ? (
          <EmptyState
            icon="person"
            titel="Keine Funktionen"
            text={
              uebergreifend
                ? 'Legen Sie Funktionen an, die für alle Gewerke gelten.'
                : `Legen Sie die Funktionen an, die in ${seite} vorkommen.`
            }
            action={
              <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
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
                  <th>Kürzel</th>
                  <th className="col-optional">Gewerk</th>
                  <th className="col-optional">Beschreibung</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {funktionen.map((f) => (
                  <tr key={f.id} className="clickable" onClick={() => setDialog({ funktion: f })}>
                    <td>
                      <span className="row wrap" style={{ gap: 8 }}>
                        <span className="dot" style={{ background: f.farbe }} />
                        <strong>{f.name}</strong>
                        <SeiteBadge seite={f.seite} />
                      </span>
                    </td>
                    <td className="num">{f.kuerzel || '–'}</td>
                    <td className="col-optional">
                      {f.gewerk === null ? <Badge ton="blue">{UEBERGREIFEND}</Badge> : <Badge>{f.gewerk}</Badge>}
                    </td>
                    <td className="small muted col-optional">{f.beschreibung || '–'}</td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label="Funktion löschen"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLoeschen(f);
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
        )}
      </Card>

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

      {ergaenzen ? (
        <Modal
          titel={`Funktion in ${seite} ergänzen`}
          sub="Aus einem anderen Gewerk übernehmen – als eigene Funktion dieses Gewerks"
          onClose={() => setErgaenzen(false)}
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setErgaenzen(false)}>
              Fertig
            </button>
          }
        >
          <div className="row wrap" style={{ gap: 6 }}>
            {ergaenzbar.map((f) => (
              <button
                key={f.id}
                type="button"
                className="role-chip"
                style={{ color: f.farbe, cursor: 'pointer', padding: '4px 11px' }}
                onClick={() => {
                  const { id: _id, ...werte } = f;
                  addStandardRolle({ ...werte, gewerk: seite });
                  toast(`„${f.name} ${seite}“ angelegt.`);
                }}
              >
                <Icon name="plus" size={12} /> {f.name}
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {gewerkDialog ? <GewerkDialog onClose={() => setGewerkDialog(false)} onAngelegt={setSeite} /> : null}

      {gewerkLoeschen ? (
        <GewerkLoeschenDialog
          gewerk={gewerkLoeschen}
          onClose={() => setGewerkLoeschen(null)}
          onGeloescht={() => setSeite(UEBERGREIFEND)}
        />
      ) : null}

      {dialog ? (
        <FunktionsDialog
          funktion={dialog.funktion}
          anzahl={data.standardRollen.length}
          gewerke={gewerke}
          vorauswahl={uebergreifend ? null : seite}
          onClose={() => setDialog(null)}
          onAnlegen={(werte) => {
            addStandardRolle(werte);
            toast('Funktion angelegt.');
          }}
        />
      ) : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Funktion löschen?"
          text={`„${loeschen.name}“ steht neuen Projekten nicht mehr zur Verfügung. Bereits angelegte Projektfunktionen bleiben erhalten.`}
          onConfirm={() => {
            deleteStandardRolle(loeschen.id);
            toast('Funktion gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}

function FunktionsDialog({
  funktion,
  anzahl,
  gewerke,
  vorauswahl,
  onClose,
  onAnlegen,
}: {
  funktion?: StandardRolle;
  anzahl: number;
  gewerke: string[];
  vorauswahl: string | null;
  onClose: () => void;
  onAnlegen: (werte: Omit<StandardRolle, 'id'>) => void;
}) {
  const { updateStandardRolle } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    name: funktion?.name ?? '',
    kuerzel: funktion?.kuerzel ?? '',
    farbe: funktion?.farbe ?? FARBEN[anzahl % FARBEN.length],
    beschreibung: funktion?.beschreibung ?? '',
    gewerk: funktion?.gewerk ?? vorauswahl,
    seite: funktion ? funktion.seite : (null as Seite | null),
  });
  // Eine neue Funktion übernimmt die Seite aus ihrer Bezeichnung, bis sie von Hand gewählt wird
  const [seiteVonHand, setSeiteVonHand] = useState(Boolean(funktion));

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
      kuerzel: form.kuerzel.trim() || kuerzelAus(form.name),
    };
    if (funktion) {
      updateStandardRolle(funktion.id, werte);
      toast('Funktion gespeichert.');
    } else {
      onAnlegen(werte);
    }
    onClose();
  };

  return (
    <Modal
      titel={funktion ? 'Funktion bearbeiten' : 'Neue Funktion'}
      sub="Gilt projektübergreifend"
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
          <Select
            value={form.gewerk ?? UEBERGREIFEND}
            onChange={(v) => set('gewerk', v === UEBERGREIFEND ? null : v)}
            options={[UEBERGREIFEND, ...gewerke].map((g) => ({ value: g, label: g }))}
          />
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
