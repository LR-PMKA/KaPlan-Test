/**
 * Protokolle eines Projekts: je Besprechungsreihe eine Karte mit ihren
 * Protokollen (öffnen, Folgeprotokoll, löschen), darunter die Logos im
 * Druckkopf. Dateien des eigenständigen Protokoll-Tools lassen sich
 * übernehmen.
 */
import { useRef, useState } from 'react';
import { formatDate, today } from '../../../../shared/dates';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Badge, Card, CardHeader, ConfirmDialog, EmptyState, Field, Modal, TextInput } from '../../../../shared/ui';
import { LogoVerwaltung } from '../../components/Logos';
import {
  ausProtokollTool,
  bezeichnung,
  mitgehendeEintraege,
  naechsteNr,
  neueReihe,
  protokollAufgaben,
  reihenVon,
  uebernommeneEintraege,
} from '../../domain/protokoll';
import { ampelFuer } from '../../domain/punkte';
import { BESPRECHUNG_VORSCHLAEGE, newId, personName, type Projekt, type Protokoll } from '../../domain/types';
import type { Route } from '../../lib/router';
import { useStore } from '../../store/store';

export function Protokolle({ projekt, navigate }: { projekt: Projekt; navigate: (r: Route) => void }) {
  const { data, deleteProtokoll, folgeprotokollAnlegen, protokolleUebernehmen } = useStore();
  const toast = useToast();
  const [neu, setNeu] = useState(false);
  const [loeschen, setLoeschen] = useState<Protokoll | null>(null);
  const datei = useRef<HTMLInputElement>(null);

  const protokolle = data.protokolle.filter((p) => p.projektId === projekt.id);
  const reihen = reihenVon(protokolle);
  const oeffne = (p: Protokoll) => navigate({ view: 'protokoll', projektId: projekt.id, protokollId: p.id });

  const folge = (p: Protokoll) => {
    const nr = naechsteNr(protokolle, p.reiheId);
    const mit = mitgehendeEintraege(p);
    const id = folgeprotokollAnlegen(p.id);
    if (!id) return;
    toast(`Folgeprotokoll Nr. ${nr} angelegt${mit ? ` – ${mit} ${mit === 1 ? 'Eintrag' : 'Einträge'} übernommen` : ''}.`);
    navigate({ view: 'protokoll', projektId: projekt.id, protokollId: id });
  };

  const importieren = async (dateien: File[]) => {
    let anzahl = 0;
    for (const f of dateien) {
      try {
        const liste = ausProtokollTool(await f.text(), projekt.id, data);
        protokolleUebernehmen(liste);
        anzahl += liste.length;
      } catch (e) {
        toast(`${f.name} ${e instanceof Error ? e.message : 'konnte nicht gelesen werden'}.`);
      }
    }
    if (anzahl > 0) toast(anzahl === 1 ? '1 Protokoll übernommen.' : `${anzahl} Protokolle übernommen.`);
  };

  return (
    <div className="stack">
      <div className="row-between wrap">
        <p className="small muted" style={{ maxWidth: 620 }}>
          Ein Folgeprotokoll übernimmt Teilnehmende und Tagesordnung mit allen Einträgen. Gestrichenes entfällt darin,
          erledigte Aufgaben stehen noch einmal durchgestrichen. Neue und geänderte Einträge erscheinen im Druck blau.
        </p>
        <div className="row wrap">
          <button
            type="button"
            className="btn btn-outline"
            title="Dateien des Protokoll-Tools (.protokoll oder Sicherung .json) in dieses Projekt übernehmen"
            onClick={() => datei.current?.click()}
          >
            <Icon name="importieren" size={14} /> Aus Protokoll-Tool
          </button>
          <input
            ref={datei}
            type="file"
            accept=".protokoll,.json,application/json"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const dateien = [...(e.target.files ?? [])];
              e.target.value = '';
              void importieren(dateien);
            }}
          />
          <button type="button" className="btn btn-primary" onClick={() => setNeu(true)}>
            <Icon name="plus" size={14} /> Neue Protokollreihe
          </button>
        </div>
      </div>

      {reihen.length === 0 ? (
        <Card>
          <EmptyState
            icon="protokoll"
            titel="Noch keine Protokolle"
            text="Legen Sie eine Protokollreihe an – etwa für die Baubesprechung oder den Jour fixe. Folgeprotokolle entstehen daraus mit einem Klick."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setNeu(true)}>
                <Icon name="plus" size={14} /> Neue Protokollreihe
              </button>
            }
          />
        </Card>
      ) : (
        reihen.map((r) => (
          <Card key={r.id}>
            <CardHeader
              titel={r.letztes.art || 'Besprechung'}
              sub={`${r.protokolle.length} ${r.protokolle.length === 1 ? 'Protokoll' : 'Protokolle'}${
                r.letztes.naechster ? ` · nächster Termin ${formatDate(r.letztes.naechster)}` : ''
              }`}
              actions={
                <button type="button" className="btn btn-sm btn-outline" onClick={() => folge(r.letztes)}>
                  <Icon name="plus" size={12} /> Folgeprotokoll
                </button>
              }
            />
            <div className="table-scroll">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>Datum</th>
                    <th>Protokoll</th>
                    <th>Offene Aufgaben</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {[...r.protokolle].reverse().map((p) => {
                    const eigene = protokollAufgaben([p]).filter((a) => a.eintrag.status !== 'erledigt');
                    const spaet = eigene.filter((a) => ampelFuer(a.eintrag.termin, a.eintrag.status) === 'ueberfaellig');
                    const uebernommen = uebernommeneEintraege(p);
                    return (
                      <tr key={p.id} className="clickable" onClick={() => oeffne(p)}>
                        <td className="num">{formatDate(p.datum)}</td>
                        <td>
                          <strong>{bezeichnung(p)}</strong>
                          <div className="small tertiary">
                            {p.teilnehmer.filter((t) => t.status === 'anwesend').length} anwesend
                            {uebernommen ? ` · ${uebernommen} ${uebernommen === 1 ? 'Eintrag' : 'Einträge'} übernommen` : ''}
                          </div>
                        </td>
                        <td>
                          {eigene.length ? (
                            <Badge ton={spaet.length ? 'red' : 'orange'}>
                              {eigene.length} offen{spaet.length ? `, ${spaet.length} überfällig` : ''}
                            </Badge>
                          ) : (
                            <span className="small tertiary">keine</span>
                          )}
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              oeffne(p);
                            }}
                          >
                            Öffnen
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            title="Folgeprotokoll aus diesem Protokoll anlegen"
                            onClick={(e) => {
                              e.stopPropagation();
                              folge(p);
                            }}
                          >
                            Folgeprotokoll
                          </button>{' '}
                          <button
                            type="button"
                            className="btn-icon"
                            title="Protokoll löschen"
                            aria-label="Protokoll löschen"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLoeschen(p);
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
          </Card>
        ))
      )}

      <LogoVerwaltung projekt={projekt} />

      {neu ? (
        <NeueReiheDialog
          projekt={projekt}
          onClose={() => setNeu(false)}
          onAngelegt={(id) => navigate({ view: 'protokoll', projektId: projekt.id, protokollId: id })}
        />
      ) : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Protokoll löschen?"
          text={`${bezeichnung(loeschen)} vom ${formatDate(loeschen.datum)} wird endgültig gelöscht. Aufgaben, die es weitergeführt hat, gelten im Vorprotokoll wieder als offen.`}
          onConfirm={() => {
            deleteProtokoll(loeschen.id);
            toast('Protokoll gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}

function NeueReiheDialog({
  projekt,
  onClose,
  onAngelegt,
}: {
  projekt: Projekt;
  onClose: () => void;
  onAngelegt: (id: string) => void;
}) {
  const { data, addProtokoll } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({ art: 'Baubesprechung', datum: today(), beginn: '', ort: '' });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Die Protokollführung übernimmt die angemeldete Person, sofern sie im Projekt geführt wird.
  const ich = data.einstellungen.bearbeiter.trim().toLowerCase();
  const fuehrung = data.beteiligte.find((b) => b.projektId === projekt.id && personName(b).toLowerCase() === ich);

  const anlegen = () => {
    if (!form.art.trim()) {
      toast('Bitte die Besprechung benennen.');
      return;
    }
    if (!form.datum) {
      toast('Bitte das Datum angeben.');
      return;
    }
    const id = newId('pt');
    addProtokoll(neueReihe(id, projekt.id, { ...form, art: form.art.trim() }, fuehrung, data.funktionen));
    toast(`${form.art.trim()} Nr. 1 angelegt.`);
    onClose();
    onAngelegt(id);
  };

  return (
    <Modal
      titel="Neue Protokollreihe"
      sub="Erstes Protokoll einer Besprechungsreihe – Teilnehmende folgen aus der Projektbeteiligtenliste"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={anlegen}>
            Anlegen
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Besprechung" full>
          <TextInput value={form.art} onChange={(v) => set('art', v)} list="ps-besprechungen" autoFocus />
          <datalist id="ps-besprechungen">
            {BESPRECHUNG_VORSCHLAEGE.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Datum">
          <TextInput type="date" value={form.datum} onChange={(v) => set('datum', v)} />
        </Field>
        <Field label="Beginn">
          <TextInput type="time" value={form.beginn} onChange={(v) => set('beginn', v)} />
        </Field>
        <Field
          label="Ort"
          full
          hint={
            fuehrung
              ? `Protokollführung: ${personName(fuehrung)} (angemeldet)`
              : 'Die Protokollführung lässt sich im Protokoll aus den Teilnehmenden wählen.'
          }
        >
          <TextInput value={form.ort} onChange={(v) => set('ort', v)} />
        </Field>
      </div>
    </Modal>
  );
}
