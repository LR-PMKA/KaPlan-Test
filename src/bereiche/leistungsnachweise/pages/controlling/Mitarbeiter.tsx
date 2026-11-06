/**
 * Reiter „Mitarbeiter“ des Controllings: projektübergreifende Liste mit
 * Suche, Anlegen, Bearbeiten und Löschen – samt der Rolle Controlling
 * (`rolleSetzen`) und den Stunden im laufenden Monat. Wer noch Leistungen hat,
 * lässt sich nicht löschen, sondern wird als ausgeschieden markiert; die
 * letzte Person mit der Rolle Controlling behält sie (domain/rechte.ts).
 */
import { useState } from 'react';
import { formatDate, today } from '../../../../shared/dates';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Badge, Card, CardHeader, ConfirmDialog, EmptyState, Search } from '../../../../shared/ui';
import { MitarbeiterDialog } from '../../components/MitarbeiterDialog';
import { anzahl, nachNamen } from '../../components/common';
import { stundenVonMitarbeiter } from '../../domain/auswertung';
import { stundenVon } from '../../domain/nachweis';
import { LETZTE_ROLLE, controller, letzterController, mitarbeiterLoeschenPruefen } from '../../domain/rechte';
import { mitarbeiterName, type Mitarbeiter as MitarbeiterTyp, type Projekt } from '../../domain/types';
import { monatText, monatsanfang, monatsende, stundenText } from '../../domain/zeitraum';
import { useStore } from '../../store/store';

export function Mitarbeiter() {
  const { data, deleteMitarbeiter, rolleSetzen } = useStore();
  const toast = useToast();
  const [suche, setSuche] = useState('');
  const [dialog, setDialog] = useState<{ mitarbeiter?: MitarbeiterTyp } | null>(null);
  const [loeschen, setLoeschen] = useState<MitarbeiterTyp | null>(null);

  const ich = data.einstellungen.mitarbeiterId;
  const heute = today();
  const monat = { von: monatsanfang(heute), bis: monatsende(heute) };
  const leistungenVon = (m: MitarbeiterTyp) => data.leistungen.filter((l) => l.mitarbeiterId === m.id);
  const projektVon = new Map(data.projekte.map((p) => [p.id, p]));

  const mitarbeiter = data.mitarbeiter
    .filter((m) => [m.kuerzel, m.vorname, m.nachname].join(' ').toLowerCase().includes(suche.toLowerCase()))
    // Aktive zuerst, dann nach Nachname
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || nachNamen(a, b));
  const aktive = data.mitarbeiter.filter((m) => m.aktiv).length;
  const mitRolle = controller(data).length;

  const rolleWechseln = (m: MitarbeiterTyp, controlling: boolean) => {
    const meldung = rolleSetzen(m.id, controlling);
    const name = mitarbeiterName(m) || m.kuerzel;
    toast(meldung ?? (controlling ? `„${name}“ hat jetzt die Rolle Controlling.` : `„${name}“ hat die Rolle Controlling nicht mehr.`));
  };

  const loeschenPruefen = (m: MitarbeiterTyp) => {
    const meldung = mitarbeiterLoeschenPruefen(data, m.id);
    if (meldung) toast(meldung);
    else setLoeschen(m);
  };

  const anlegenKnopf = (
    <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
      <Icon name="plus" size={14} /> Mitarbeiter anlegen
    </button>
  );

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div className="row wrap">
          <Search value={suche} onChange={setSuche} placeholder="Name, Kürzel …" />
          <p className="muted small" style={{ maxWidth: 620 }}>
            Mitarbeiter gelten projektübergreifend. Der Excel-Import erkennt sie an Kürzel und Namen („MM: Mustermann,
            Max“); Sammel-Exporte des Controllings legen unbekannte an. Die Rolle Controlling erlaubt Auswertung,
            Aufschläge, Abschluss, Export und die Verwaltung der Mitarbeiter.
          </p>
        </div>
        {anlegenKnopf}
      </div>

      <Card>
        <CardHeader
          titel="Mitarbeiter"
          sub={`${anzahl(aktive, 'aktiver', 'aktive')} · ${data.mitarbeiter.length - aktive} ausgeschieden · ${anzahl(
            mitRolle,
            'Person',
            'Personen',
          )} mit der Rolle Controlling`}
        />
        {mitarbeiter.length === 0 ? (
          <EmptyState
            icon="person"
            titel={suche ? 'Kein Mitarbeiter gefunden' : 'Keine Mitarbeiter'}
            text="Legen Sie die Personen an, die Leistungen erbringen – oder übernehmen Sie sie mit dem Sammel-Export im Excel-Import."
            action={anlegenKnopf}
          />
        ) : (
          <div className="table-scroll">
            <table className="table table-stack ln-co-personen">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Kürzel</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Rolle</th>
                  <th className="col-optional ln-spalte-weit">Projekte</th>
                  <th className="ln-stunden">{monatText(heute)}</th>
                  <th className="ln-stunden col-optional">Stunden gesamt</th>
                  <th className="col-optional ln-spalte-weit">Letzte Leistung</th>
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
                  const imMonat = stundenVonMitarbeiter(data, m.id, monat.von, monat.bis);
                  const letzteRolle = m.controlling && letzterController(data, m.id);
                  return (
                    <tr key={m.id} className="clickable" onClick={() => setDialog({ mitarbeiter: m })}>
                      <td className="num">{m.kuerzel || '–'}</td>
                      <td>
                        <strong>{mitarbeiterName(m) || '–'}</strong>
                        {m.id === ich ? (
                          <span style={{ marginLeft: 8 }}>
                            <Badge ton="blue">angemeldet</Badge>
                          </span>
                        ) : null}
                      </td>
                      <td>{m.aktiv ? <Badge ton="green">aktiv</Badge> : <Badge>ausgeschieden</Badge>}</td>
                      <td className="ln-co-rolle" onClick={(e) => e.stopPropagation()}>
                        <label
                          className="checkbox"
                          title={
                            letzteRolle
                              ? LETZTE_ROLLE
                              : m.aktiv
                                ? undefined
                                : 'Ausgeschiedene Mitarbeiter erhalten die Rolle Controlling nicht.'
                          }
                        >
                          <input
                            type="checkbox"
                            checked={m.controlling}
                            disabled={!m.aktiv && !m.controlling}
                            onChange={(e) => rolleWechseln(m, e.target.checked)}
                          />
                          Controlling
                        </label>
                      </td>
                      <td className="small muted col-optional ln-spalte-weit" title={projekte.map((p) => `${p.nummer} ${p.name}`).join('\n')}>
                        {projekte.length === 0
                          ? '–'
                          : projekte.length <= 3
                            ? projekte.map((p) => p.nummer || p.name).join(', ')
                            : anzahl(projekte.length, 'Projekt', 'Projekte')}
                      </td>
                      <td className={`ln-stunden ${imMonat ? '' : 'tertiary'}`} data-label={monatText(heute)}>
                        {stundenText(imMonat)}
                      </td>
                      <td className={`ln-stunden col-optional ${leistungen.length ? '' : 'tertiary'}`}>{stundenText(stundenVon(leistungen))}</td>
                      <td className="small col-optional ln-spalte-weit">{letzte ? formatDate(letzte) : <span className="tertiary">–</span>}</td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Mitarbeiter löschen"
                          title="Mitarbeiter löschen"
                          onClick={(e) => {
                            e.stopPropagation();
                            loeschenPruefen(m);
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
            const meldung = deleteMitarbeiter(loeschen.id);
            toast(meldung ?? 'Mitarbeiter gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}
