/**
 * Projektübergreifende Funktionen, gegliedert nach Gewerken – wie im
 * Planlaufmanagement: eine Seite „Übergreifend“ und je Gewerk eine eigene.
 * Die Funktionen bilden die Auswahl, aus der jede Person der
 * Projektbeteiligtenliste ihre Funktion erhält. Eine Funktion – oder ein
 * Gewerk –, die noch Projektbeteiligten zugeordnet ist, lässt sich nicht
 * löschen.
 */
import { useState } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Badge, Card, CardHeader, ConfirmDialog, EmptyState, Modal, Search } from '../../../shared/ui';
import { FunktionDialog } from '../components/FunktionDialog';
import { GewerkDialog, GewerkLoeschenDialog } from '../components/GewerkDialog';
import { UEBERGREIFEND, funktionsName, kuerzelAus, type Funktion } from '../domain/types';
import { useStore } from '../store/store';

const kurz = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/**
 * Kürzel für die Übernahme in ein anderes Gewerk: „BÜ-LST“ wird „BÜ-OLA“.
 * Steckt das Gewerk nicht im Kürzel, entsteht eines aus Bezeichnung und Gewerk.
 */
function kuerzelFuer(f: Funktion, gewerk: string): string {
  const alt = f.gewerk ? kurz(f.gewerk) : '';
  if (alt && kurz(f.kuerzel).includes(alt)) return kurz(f.kuerzel).replace(alt, kurz(gewerk));
  return `${kuerzelAus(f.name)}-${kurz(gewerk)}`;
}

export function Funktionen() {
  const { data, addFunktion, deleteFunktion } = useStore();
  const toast = useToast();
  const [seite, setSeite] = useState<string>(UEBERGREIFEND);
  const [suche, setSuche] = useState('');
  const [dialog, setDialog] = useState<{ funktion?: Funktion } | null>(null);
  const [loeschen, setLoeschen] = useState<Funktion | null>(null);
  const [ergaenzen, setErgaenzen] = useState(false);
  const [gewerkDialog, setGewerkDialog] = useState(false);
  const [gewerkLoeschen, setGewerkLoeschen] = useState<string | null>(null);

  const uebergreifend = seite === UEBERGREIFEND;
  const personen = (f: Funktion) => data.beteiligte.filter((b) => b.funktionId === f.id);

  const aufSeite = data.funktionen.filter((f) => (uebergreifend ? f.gewerk === null : f.gewerk === seite));
  const funktionen = aufSeite
    .filter((f) => [f.name, f.kuerzel, f.beschreibung].join(' ').toLowerCase().includes(suche.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  // Funktionen anderer Gewerke, die es hier noch nicht gibt
  const ergaenzbar = uebergreifend
    ? []
    : [
        ...new Map(
          data.funktionen
            .filter((f) => f.gewerk !== null && f.gewerk !== seite)
            .filter((f) => !aufSeite.some((x) => x.name.toLowerCase() === f.name.toLowerCase()))
            .map((f) => [f.name.toLowerCase(), f]),
        ).values(),
      ];
  const gewerkInVerwendung = aufSeite.some((f) => personen(f).length > 0);

  return (
    <div className="stack">
      <div className="tabs">
        <button type="button" className={uebergreifend ? 'active' : ''} onClick={() => setSeite(UEBERGREIFEND)}>
          {UEBERGREIFEND}
        </button>
        {data.gewerke.map((g) => (
          <button key={g} type="button" className={seite === g ? 'active' : ''} onClick={() => setSeite(g)}>
            {g}
          </button>
        ))}
        <button type="button" className="tab-plus" title="Neues Gewerk anlegen" onClick={() => setGewerkDialog(true)}>
          <Icon name="plus" size={13} />
        </button>
      </div>

      <div className="row-between wrap">
        <div className="row wrap">
          <Search value={suche} onChange={setSuche} placeholder="Funktion, Kürzel …" />
          <p className="muted small" style={{ maxWidth: 560 }}>
            {uebergreifend
              ? 'Übergreifende Funktionen haben keinen Gewerkbezug. Wer eine Person in die Projektbeteiligtenliste aufnimmt, wählt ihre Funktion aus allen Seiten – oder legt dort eine neue an.'
              : `Funktionen des Gewerks ${seite}. Jedes Gewerk führt eigene Funktionen: „Fachplanung ${seite}“ ist eine andere Funktion als dieselbe Bezeichnung in einem anderen Gewerk.`}
          </p>
        </div>
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
          sub={`${aufSeite.length} Funktionen · ${data.funktionen.length} insgesamt, projektübergreifend`}
        />
        {funktionen.length === 0 ? (
          <EmptyState
            icon="person"
            titel={suche ? 'Keine Funktion gefunden' : 'Keine Funktionen'}
            text={
              uebergreifend
                ? 'Legen Sie die Funktionen ohne Gewerkbezug an.'
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
                  <th className="col-optional">Verwendet</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {funktionen.map((f) => {
                  const wer = personen(f);
                  const projekte = new Set(wer.map((b) => b.projektId)).size;
                  return (
                    <tr key={f.id} className="clickable" onClick={() => setDialog({ funktion: f })}>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <span className="dot" style={{ background: f.farbe }} />
                          <strong>{f.name}</strong>
                        </span>
                      </td>
                      <td className="num">{f.kuerzel || '–'}</td>
                      <td className="col-optional">
                        {f.gewerk === null ? <Badge ton="blue">{UEBERGREIFEND}</Badge> : <Badge>{f.gewerk}</Badge>}
                      </td>
                      <td className="small muted col-optional">{f.beschreibung || '–'}</td>
                      <td className="small muted col-optional">
                        {wer.length === 0
                          ? '–'
                          : `${wer.length} ${wer.length === 1 ? 'Person' : 'Personen'} in ${projekte} ${
                              projekte === 1 ? 'Projekt' : 'Projekten'
                            }`}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Funktion löschen"
                          title="Funktion löschen"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (wer.length > 0) {
                              toast(
                                `„${funktionsName(f)}“ ist noch ${wer.length} Projektbeteiligten zugeordnet und lässt sich deshalb nicht löschen.`,
                              );
                              return;
                            }
                            setLoeschen(f);
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

      {!uebergreifend ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            title={`Gewerk „${seite}“ mit seinen Funktionen löschen`}
            onClick={() =>
              gewerkInVerwendung
                ? toast(
                    `Funktionen des Gewerks „${seite}“ sind noch Projektbeteiligten zugeordnet – das Gewerk lässt sich deshalb nicht löschen.`,
                  )
                : setGewerkLoeschen(seite)
            }
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
                  addFunktion({
                    name: f.name,
                    kuerzel: kuerzelFuer(f, seite),
                    farbe: f.farbe,
                    beschreibung: '',
                    gewerk: seite,
                  });
                  toast(`„${f.name} ${seite}“ angelegt.`);
                }}
              >
                <Icon name="plus" size={12} /> {f.name}
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {dialog ? (
        <FunktionDialog
          funktion={dialog.funktion}
          vorauswahl={uebergreifend ? null : seite}
          onClose={() => setDialog(null)}
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

      {loeschen ? (
        <ConfirmDialog
          titel="Funktion löschen?"
          text={`„${funktionsName(loeschen)}“ steht danach in keinem Projekt mehr zur Auswahl.`}
          onConfirm={() => {
            deleteFunktion(loeschen.id);
            toast('Funktion gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}
