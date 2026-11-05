/**
 * Projektbeteiligtenliste – aufgebaut wie die Funktionsliste im
 * Planlaufmanagement, aber ohne leere Funktionen: Es erscheinen nur Personen,
 * und jede trägt eine der projektübergreifenden Funktionen. Neue Personen
 * erhalten ihre Funktion aus einer Auswahl, in der sich auch gleich eine neue
 * Funktion anlegen lässt; ganze Listen kommen über den Excel-Import. Die
 * Reiter gliedern nach den Gewerken der Funktionen.
 */
import { useState } from 'react';
import { today } from '../../../../shared/dates';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Avatar, Card, CardHeader, ConfirmDialog, EmptyState, Search } from '../../../../shared/ui';
import { BeteiligteImport } from '../../components/BeteiligteImport';
import { BeteiligterDialog } from '../../components/BeteiligterDialog';
import { beteiligteHtml, blattDrucken } from '../../domain/druck';
import { beteiligteExportieren } from '../../domain/export';
import { logosVon } from '../../domain/seed';
import {
  UEBERGREIFEND,
  funktionsName,
  kuerzelVon,
  personName,
  type Beteiligter,
  type Funktion,
  type Projekt,
} from '../../domain/types';
import { useStore } from '../../store/store';

/**
 * Übergreifende Funktionen zuerst, dann nach Gewerk und Funktion, zuletzt
 * nach Nachname; Personen ohne Funktion am Ende.
 */
export function nachFunktion(beteiligte: Beteiligter[], funktionen: Funktion[]): Beteiligter[] {
  const rang = (b: Beteiligter) => {
    const f = funktionen.find((x) => x.id === b.funktionId);
    return f ? `${f.gewerk === null ? '0' : `1${f.gewerk}`} ${f.name}` : '\uffff';
  };
  return [...beteiligte].sort(
    (a, b) => rang(a).localeCompare(rang(b), 'de') || a.nachname.localeCompare(b.nachname, 'de'),
  );
}

/** Reiter „Alle“ der Beteiligtenliste. */
const ALLE = 'Alle';

export function Beteiligte({ projekt }: { projekt: Projekt }) {
  const { data, deleteBeteiligter } = useStore();
  const toast = useToast();
  const [suche, setSuche] = useState('');
  const [dialog, setDialog] = useState<{ beteiligter?: Beteiligter } | null>(null);
  const [loeschen, setLoeschen] = useState<Beteiligter | null>(null);
  const [importOffen, setImportOffen] = useState(false);
  const [seite, setSeite] = useState(ALLE);

  const funktion = (b: Beteiligter) => data.funktionen.find((f) => f.id === b.funktionId);
  const alle = nachFunktion(
    data.beteiligte.filter((b) => b.projektId === projekt.id),
    data.funktionen,
  );
  // Reiter: Gewerke, die im Projekt vorkommen
  const gewerkVon = (b: Beteiligter) => funktion(b)?.gewerk ?? null;
  const gewerke = data.gewerke.filter((g) => alle.some((b) => gewerkVon(b) === g));
  const mitUebergreifend = alle.some((b) => gewerkVon(b) === null);
  const aktiveSeite = seite === ALLE || seite === UEBERGREIFEND || gewerke.includes(seite) ? seite : ALLE;
  const sichtbar = alle.filter((b) => {
    if (aktiveSeite === UEBERGREIFEND && gewerkVon(b) !== null) return false;
    if (aktiveSeite !== ALLE && aktiveSeite !== UEBERGREIFEND && gewerkVon(b) !== aktiveSeite) return false;
    if (!suche.trim()) return true;
    const f = funktion(b);
    return [f ? funktionsName(f) : '', f?.kuerzel, b.kuerzel, b.vorname, b.nachname, b.firma, b.email]
      .join(' ')
      .toLowerCase()
      .includes(suche.toLowerCase());
  });
  const funktionenImProjekt = new Set(alle.map((b) => b.funktionId).filter(Boolean)).size;

  const drucken = () =>
    blattDrucken(
      `Projektbeteiligte – ${projekt.name}`,
      beteiligteHtml(
        projekt,
        alle.map((b) => ({
          funktion: ((f) => (f ? funktionsName(f) : ''))(funktion(b)),
          name: [b.anrede, personName(b)].filter(Boolean).join(' '),
          firma: b.firma,
          kuerzel: kuerzelVon(b, data.funktionen),
          email: b.email,
          telefon: [b.telefon, b.mobil].filter(Boolean).join(' · '),
        })),
        logosVon(projekt),
        today(),
      ),
    );

  return (
    <div className="stack">
      {gewerke.length > 0 ? (
        <div className="tabs">
          {[ALLE, ...(mitUebergreifend ? [UEBERGREIFEND] : []), ...gewerke].map((g) => (
            <button key={g} type="button" className={aktiveSeite === g ? 'active' : ''} onClick={() => setSeite(g)}>
              {g}
            </button>
          ))}
        </div>
      ) : null}

      <div className="row-between wrap">
        <Search value={suche} onChange={setSuche} placeholder="Funktion, Person, Firma …" />
        <div className="row wrap">
          <button type="button" className="btn btn-outline" onClick={() => setImportOffen(true)}>
            <Icon name="importieren" size={14} /> Excel-Import
          </button>
          <button type="button" className="btn btn-outline" onClick={drucken} disabled={alle.length === 0}>
            <Icon name="plan" size={14} /> Drucken / PDF
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => beteiligteExportieren(projekt, alle, data.funktionen)}
            disabled={alle.length === 0}
          >
            <Icon name="export" size={14} /> Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
            <Icon name="plus" size={14} /> Person hinzufügen
          </button>
        </div>
      </div>

      <Card>
        <CardHeader
          titel="Projektbeteiligte"
          sub={`${alle.length} ${alle.length === 1 ? 'Person' : 'Personen'} · ${funktionenImProjekt} ${
            funktionenImProjekt === 1 ? 'Funktion' : 'Funktionen'
          } · Grundlage für Teilnehmende und Verantwortliche in Protokollen`}
        />
        {sichtbar.length === 0 ? (
          <EmptyState
            icon="person"
            titel={alle.length === 0 ? 'Noch keine Projektbeteiligten' : 'Keine Person gefunden'}
            text={
              alle.length === 0
                ? 'Nehmen Sie die Personen des Projekts auf – je Person mit ihrer Funktion aus den projektübergreifenden Funktionen.'
                : 'Für diese Suche gibt es keinen Treffer.'
            }
            action={
              alle.length === 0 ? (
                <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
                  <Icon name="plus" size={14} /> Person hinzufügen
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Funktion</th>
                  <th>Person</th>
                  <th className="col-optional">Firma / Büro</th>
                  <th className="col-optional">Kontakt</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((b) => {
                  const f = funktion(b);
                  const kuerzel = kuerzelVon(b, data.funktionen);
                  return (
                    <tr key={b.id} className="clickable" onClick={() => setDialog({ beteiligter: b })}>
                      <td>
                        {f ? (
                          <span className="row" style={{ gap: 8 }}>
                            <span className="dot" style={{ background: f.farbe }} />
                            <span style={{ minWidth: 0 }}>
                              <strong>{funktionsName(f)}</strong>
                              {kuerzel ? <span className="num tertiary"> · {kuerzel}</span> : null}
                            </span>
                          </span>
                        ) : (
                          <span className="tertiary small">– ohne Funktion –</span>
                        )}
                      </td>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <Avatar name={personName(b)} farbe={f?.farbe} />
                          <span style={{ minWidth: 0 }}>
                            <strong>{personName(b)}</strong>
                            {b.notiz ? <div className="small tertiary truncate">{b.notiz}</div> : null}
                          </span>
                        </span>
                      </td>
                      <td className="small muted col-optional">{b.firma || '–'}</td>
                      <td className="small col-optional">
                        {b.email ? (
                          <a href={`mailto:${b.email}`} onClick={(e) => e.stopPropagation()}>
                            {b.email}
                          </a>
                        ) : (
                          <span className="tertiary">–</span>
                        )}
                        {b.telefon || b.mobil ? (
                          <div className="tertiary small">{[b.telefon, b.mobil].filter(Boolean).join(' · ')}</div>
                        ) : null}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Person bearbeiten"
                          title="Person bearbeiten"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialog({ beteiligter: b });
                          }}
                        >
                          <Icon name="bearbeiten" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label="Person löschen"
                          title="Person löschen"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLoeschen(b);
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

      {importOffen ? <BeteiligteImport projekt={projekt} onClose={() => setImportOffen(false)} /> : null}

      {dialog ? (
        <BeteiligterDialog projektId={projekt.id} beteiligter={dialog.beteiligter} onClose={() => setDialog(null)} />
      ) : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Person löschen?"
          text={`${personName(loeschen)} wird aus der Projektbeteiligtenliste entfernt. In bestehenden Protokollen bleiben Name und Angaben als Text stehen.`}
          onConfirm={() => {
            deleteBeteiligter(loeschen.id);
            toast('Person gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}
