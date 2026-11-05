/**
 * Projektübergreifende Liste der Mitarbeiter mit ihren Leistungen. Wer noch
 * Leistungen hat, lässt sich nicht löschen, sondern wird als ausgeschieden
 * markiert – seine Leistungen bleiben in den Nachweisen erhalten.
 */
import { useState } from 'react';
import { formatDate } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Badge, Card, CardHeader, ConfirmDialog, EmptyState, Search } from '../../../shared/ui';
import { MitarbeiterDialog } from '../components/MitarbeiterDialog';
import { anzahl, nachNamen } from '../components/common';
import { stundenVon } from '../domain/nachweis';
import { mitarbeiterName, type Mitarbeiter as MitarbeiterTyp, type Projekt } from '../domain/types';
import { stundenText } from '../domain/zeitraum';
import { useStore } from '../store/store';

export function Mitarbeiter() {
  const { data, deleteMitarbeiter } = useStore();
  const toast = useToast();
  const [suche, setSuche] = useState('');
  const [dialog, setDialog] = useState<{ mitarbeiter?: MitarbeiterTyp } | null>(null);
  const [loeschen, setLoeschen] = useState<MitarbeiterTyp | null>(null);

  const ich = data.einstellungen.mitarbeiterId;
  const leistungenVon = (m: MitarbeiterTyp) => data.leistungen.filter((l) => l.mitarbeiterId === m.id);
  const projektVon = new Map(data.projekte.map((p) => [p.id, p]));

  const mitarbeiter = data.mitarbeiter
    .filter((m) => [m.kuerzel, m.vorname, m.nachname].join(' ').toLowerCase().includes(suche.toLowerCase()))
    // Aktive zuerst, dann nach Nachname
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || nachNamen(a, b));
  const aktive = data.mitarbeiter.filter((m) => m.aktiv).length;

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div className="row wrap">
          <Search value={suche} onChange={setSuche} placeholder="Name, Kürzel …" />
          <p className="muted small" style={{ maxWidth: 560 }}>
            Mitarbeiter gelten projektübergreifend. Der Excel-Import erkennt sie am Kürzel („LR: Roese, Lukas“) oder am
            Namen und legt unbekannte an.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
          <Icon name="plus" size={14} /> Mitarbeiter anlegen
        </button>
      </div>

      <Card>
        <CardHeader
          titel="Mitarbeiter"
          sub={`${anzahl(aktive, 'aktiver', 'aktive')} · ${data.mitarbeiter.length - aktive} ausgeschieden`}
        />
        {mitarbeiter.length === 0 ? (
          <EmptyState
            icon="person"
            titel={suche ? 'Kein Mitarbeiter gefunden' : 'Keine Mitarbeiter'}
            text="Legen Sie die Personen an, die Leistungen erbringen – oder übernehmen Sie sie mit dem Excel-Import."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
                <Icon name="plus" size={14} /> Mitarbeiter anlegen
              </button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table table-stack ln-personen">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Kürzel</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th className="col-optional">Projekte</th>
                  <th className="ln-stunden">Stunden gesamt</th>
                  <th className="col-optional">Letzte Leistung</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map((m) => {
                  const leistungen = leistungenVon(m);
                  const projekte = [...new Set(leistungen.map((l) => l.projektId))]
                    .map((id) => projektVon.get(id))
                    .filter((p): p is Projekt => !!p);
                  const letzte = leistungen.reduce((max, l) => (l.datum > max ? l.datum : max), '');
                  return (
                    <tr key={m.id} className="clickable" onClick={() => setDialog({ mitarbeiter: m })}>
                      <td className="num">{m.kuerzel || '–'}</td>
                      <td>
                        <strong>{mitarbeiterName(m) || '–'}</strong>
                        {m.id === ich ? (
                          <span style={{ marginLeft: 8 }}>
                            <Badge ton="blue">Ich erfasse als</Badge>
                          </span>
                        ) : null}
                      </td>
                      <td>{m.aktiv ? <Badge ton="green">aktiv</Badge> : <Badge>ausgeschieden</Badge>}</td>
                      <td className="small muted col-optional" title={projekte.map((p) => `${p.nummer} ${p.name}`).join('\n')}>
                        {projekte.length === 0
                          ? '–'
                          : projekte.length <= 3
                            ? projekte.map((p) => p.nummer || p.name).join(', ')
                            : anzahl(projekte.length, 'Projekt', 'Projekte')}
                      </td>
                      <td className={`ln-stunden ${leistungen.length ? '' : 'tertiary'}`}>{stundenText(stundenVon(leistungen))}</td>
                      <td className="small col-optional">{letzte ? formatDate(letzte) : <span className="tertiary">–</span>}</td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Mitarbeiter löschen"
                          title="Mitarbeiter löschen"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (leistungen.length > 0) {
                              toast(
                                `„${mitarbeiterName(m)}“ hat noch ${anzahl(leistungen.length, 'Leistung', 'Leistungen')} und lässt sich deshalb nicht löschen – stattdessen als ausgeschieden markieren.`,
                              );
                              return;
                            }
                            setLoeschen(m);
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

      {dialog ? <MitarbeiterDialog mitarbeiter={dialog.mitarbeiter} onClose={() => setDialog(null)} /> : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Mitarbeiter löschen?"
          text={`„${mitarbeiterName(loeschen)}“ wird endgültig gelöscht.`}
          onConfirm={() => {
            deleteMitarbeiter(loeschen.id);
            toast('Mitarbeiter gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}
