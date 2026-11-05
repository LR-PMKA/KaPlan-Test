/**
 * Reiter „Leistungen“ eines Projekts: alle erfassten und importierten
 * Leistungen mit Filter nach Monat und Mitarbeiter, Suche, Summe der
 * angezeigten Stunden und Excel-Ausgabe. Jede Zeile nennt den
 * Leistungsnachweis, in dem sie erscheint – das ergibt sich allein aus dem
 * Datum. Mehrere Leistungen lassen sich mit Haken auswählen und gemeinsam
 * löschen.
 */
import { useState } from 'react';
import { wochentag } from '../../../../shared/dates';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Card, CardHeader, ConfirmDialog, EmptyState, Search, Select } from '../../../../shared/ui';
import { ImportDialog } from '../../components/ImportDialog';
import { LeistungDialog, abgeschlossenHinweis, nachweisName } from '../../components/LeistungDialog';
import { QuelleBadge, anzahl } from '../../components/common';
import { leistungenExportieren } from '../../domain/export';
import { nachweiseVon, nachweisTitel } from '../../domain/nachweis';
import { QUELLE_LABEL, mitarbeiterName, type Leistung, type Leistungsnachweis, type Projekt } from '../../domain/types';
import { langDatum, monatText, runden, stundenText } from '../../domain/zeitraum';
import type { Route } from '../../lib/router';
import { useStore } from '../../store/store';
import '../../components/leistungen.css';

/** Filterwert für alle Monate bzw. alle Mitarbeiter. */
const ALLE = '';

/** Neueste zuerst; am selben Tag nach Person und Erfassung. */
function nachDatum(namen: Map<string, string>) {
  return (a: Leistung, b: Leistung) =>
    (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0) ||
    (namen.get(a.mitarbeiterId) ?? '').localeCompare(namen.get(b.mitarbeiterId) ?? '', 'de') ||
    a.erfasst.localeCompare(b.erfasst);
}

export function Leistungen({ projekt, navigate }: { projekt: Projekt; navigate: (r: Route) => void }) {
  const { data, deleteLeistung, deleteLeistungen } = useStore();
  const toast = useToast();
  const [suche, setSuche] = useState('');
  const [monat, setMonat] = useState(ALLE);
  const [person, setPerson] = useState(ALLE);
  const [auswahl, setAuswahl] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<{ leistung?: Leistung } | null>(null);
  const [loeschen, setLoeschen] = useState<Leistung | null>(null);
  const [auswahlLoeschen, setAuswahlLoeschen] = useState(false);
  const [importOffen, setImportOffen] = useState(false);

  const mitarbeiter = new Map(data.mitarbeiter.map((m) => [m.id, m]));
  const name = (id: string) => {
    const m = mitarbeiter.get(id);
    return m ? mitarbeiterName(m) || m.kuerzel || '?' : '?';
  };
  const namen = new Map(data.mitarbeiter.map((m) => [m.id, mitarbeiterName(m)]));
  const abschnitte = new Map(projekt.abschnitte.map((a) => [a.id, a]));
  const mitAbschnitten = projekt.abschnitte.length > 0;
  const nachweise = nachweiseVon(data, projekt.id);
  const nachweisZu = (l: Leistung): Leistungsnachweis | undefined => nachweise.find((n) => l.datum >= n.von && l.datum <= n.bis);

  const alle = data.leistungen.filter((l) => l.projektId === projekt.id).sort(nachDatum(namen));

  // Auswahlfelder aus den vorhandenen Leistungen
  const monate = [...alle.reduce((m, l) => m.set(l.datum.slice(0, 7), (m.get(l.datum.slice(0, 7)) ?? 0) + 1), new Map<string, number>())];
  const personen = [...new Set(alle.map((l) => l.mitarbeiterId))].sort((a, b) => name(a).localeCompare(name(b), 'de'));
  const aktiverMonat = monat === ALLE || monate.some(([m]) => m === monat) ? monat : ALLE;
  const aktivePerson = person === ALLE || personen.includes(person) ? person : ALLE;

  const begriff = suche.trim().toLowerCase();
  const sichtbar = alle.filter((l) => {
    if (aktiverMonat !== ALLE && l.datum.slice(0, 7) !== aktiverMonat) return false;
    if (aktivePerson !== ALLE && l.mitarbeiterId !== aktivePerson) return false;
    if (!begriff) return true;
    const m = mitarbeiter.get(l.mitarbeiterId);
    const a = l.abschnittId ? abschnitte.get(l.abschnittId) : undefined;
    return [l.text, m?.kuerzel, m ? mitarbeiterName(m) : '', a?.kurz, a?.name, l.projektelement, langDatum(l.datum)]
      .join(' ')
      .toLowerCase()
      .includes(begriff);
  });
  const summe = runden(sichtbar.reduce((s, l) => s + l.stunden, 0));
  const gefiltert = aktiverMonat !== ALLE || aktivePerson !== ALLE || !!begriff;

  // Ausgewählt zählt nur, was gerade zu sehen ist
  const gewaehlt = sichtbar.filter((l) => auswahl.has(l.id));
  const alleGewaehlt = sichtbar.length > 0 && gewaehlt.length === sichtbar.length;
  const umschalten = (id: string) =>
    setAuswahl((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  const geschlosseneIn = (liste: Leistung[]) =>
    [...new Set(liste.map(nachweisZu).filter((n): n is Leistungsnachweis => n?.status === 'abgeschlossen'))];

  const filterZuruecksetzen = () => {
    setSuche('');
    setMonat(ALLE);
    setPerson(ALLE);
  };

  const neuKnopf = (
    <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
      <Icon name="plus" size={14} /> Leistung erfassen
    </button>
  );
  const importKnopf = (
    <button type="button" className="btn btn-outline" onClick={() => setImportOffen(true)}>
      <Icon name="importieren" size={14} /> Excel-Import
    </button>
  );

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div className="ln-le-filter">
          <Search value={suche} onChange={setSuche} placeholder="Text, Mitarbeiter, Abschnitt …" />
          <Select
            value={aktiverMonat}
            onChange={setMonat}
            options={[
              { value: ALLE, label: 'Alle Monate' },
              ...monate.map(([m, n]) => ({ value: m, label: `${monatText(`${m}-01`)} (${n})` })),
            ]}
          />
          <Select
            value={aktivePerson}
            onChange={setPerson}
            options={[
              { value: ALLE, label: 'Alle Mitarbeiter' },
              ...personen.map((id) => {
                const m = mitarbeiter.get(id);
                return { value: id, label: m ? `${m.kuerzel ? `${m.kuerzel}: ` : ''}${mitarbeiterName(m)}` : '? (unbekannt)' };
              }),
            ]}
          />
        </div>
        <div className="row wrap">
          {importKnopf}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => leistungenExportieren(data, projekt, sichtbar)}
            disabled={sichtbar.length === 0}
            title={gefiltert ? 'Die angezeigten Leistungen als Excel-Liste' : 'Alle Leistungen als Excel-Liste'}
          >
            <Icon name="export" size={14} /> Excel
          </button>
          {neuKnopf}
        </div>
      </div>

      <Card>
        <CardHeader
          titel="Leistungen"
          sub={`${anzahl(sichtbar.length, 'Leistung', 'Leistungen')}${
            gefiltert ? ` von ${alle.length}` : ''
          } · ${stundenText(summe)} Std. · Jede Leistung erscheint im Leistungsnachweis ihres Zeitraums`}
        />

        {gewaehlt.length > 0 ? (
          <div className="ln-le-auswahl">
            <span>
              <strong>{gewaehlt.length}</strong> ausgewählt ·{' '}
              <strong>{stundenText(runden(gewaehlt.reduce((s, l) => s + l.stunden, 0)))}</strong> Std.
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAuswahl(new Set())}>
              Auswahl aufheben
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setAuswahlLoeschen(true)}>
              <Icon name="loeschen" size={12} /> Auswahl löschen
            </button>
          </div>
        ) : null}

        {sichtbar.length === 0 ? (
          alle.length === 0 ? (
            <EmptyState
              icon="stunden"
              titel="Noch keine Leistungen"
              text="Erfassen Sie Leistungen von Hand oder übernehmen Sie sie mit dem Excel-Import aus der Zeiterfassung – jede Leistung erscheint automatisch im Leistungsnachweis ihres Zeitraums."
              action={
                <div className="row wrap" style={{ justifyContent: 'center' }}>
                  {importKnopf}
                  {neuKnopf}
                </div>
              }
            />
          ) : (
            <EmptyState
              icon="suche"
              titel="Keine Leistung gefunden"
              text="Für diese Auswahl gibt es keinen Treffer."
              action={
                <button type="button" className="btn btn-outline" onClick={filterZuruecksetzen}>
                  Filter zurücksetzen
                </button>
              }
            />
          )
        ) : (
          <>
            <div className="table-scroll ln-le-scroll">
              <table className="table table-stack ln-le-tabelle">
                <thead>
                  <tr>
                    <th className="ln-le-haken">
                      <input
                        type="checkbox"
                        checked={alleGewaehlt}
                        ref={(el) => {
                          if (el) el.indeterminate = gewaehlt.length > 0 && !alleGewaehlt;
                        }}
                        onChange={() =>
                          setAuswahl((alt) => {
                            const neu = new Set(alt);
                            for (const l of sichtbar) {
                              if (alleGewaehlt) neu.delete(l.id);
                              else neu.add(l.id);
                            }
                            return neu;
                          })
                        }
                        aria-label="Alle angezeigten Leistungen auswählen"
                        title="Alle angezeigten Leistungen auswählen"
                      />
                    </th>
                    <th>Datum</th>
                    <th className="ln-le-spalte-wer">Mitarbeiter</th>
                    <th>Leistungstext</th>
                    {mitAbschnitten ? <th className="col-optional ln-le-breit">Abschnitt</th> : null}
                    <th className="ln-stunden">Stunden</th>
                    <th>Nachweis</th>
                    <th className="col-optional ln-le-breit">Quelle</th>
                    <th className="actions" />
                  </tr>
                </thead>
                <tbody>
                  {sichtbar.map((l) => {
                    const m = mitarbeiter.get(l.mitarbeiterId);
                    const a = l.abschnittId ? abschnitte.get(l.abschnittId) : undefined;
                    const n = nachweisZu(l);
                    const geschlossen = n?.status === 'abgeschlossen';
                    const markiert = auswahl.has(l.id);
                    return (
                      <tr
                        key={l.id}
                        className={`clickable ${markiert ? 'ln-le-gewaehlt' : ''}`}
                        onClick={() => setDialog({ leistung: l })}
                      >
                        <td className="ln-le-haken" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={markiert}
                            onChange={() => umschalten(l.id)}
                            aria-label="Leistung auswählen"
                          />
                        </td>
                        <td className="ln-le-datum">
                          <span className="ln-le-wochentag">{wochentag(l.datum)}</span> {langDatum(l.datum)}
                          <span className="ln-le-wer">{name(l.mitarbeiterId)}</span>
                        </td>
                        <td
                          className="ln-le-person ln-le-spalte-wer"
                          title={m ? `${m.kuerzel} – ${mitarbeiterName(m)}` : 'Unbekannter Mitarbeiter'}
                        >
                          {name(l.mitarbeiterId)}
                          {m && !m.aktiv ? <span className="small tertiary"> (ausgeschieden)</span> : null}
                        </td>
                        <td className="ln-le-text">
                          {l.text}
                          {l.projektelement && !a ? <span className="ln-le-element">{l.projektelement}</span> : null}
                          {a || l.quelle === 'import' ? (
                            <span className="ln-le-meta">{[a?.kurz, l.quelle === 'import' ? QUELLE_LABEL.import : ''].filter(Boolean).join(' · ')}</span>
                          ) : null}
                        </td>
                        {mitAbschnitten ? (
                          <td className="small col-optional ln-le-breit" title={a?.name}>
                            {a ? a.kurz : <span className="tertiary">ohne</span>}
                          </td>
                        ) : null}
                        <td className="ln-stunden">{stundenText(l.stunden)}</td>
                        <td className="ln-le-nachweis" onClick={(e) => e.stopPropagation()}>
                          {n ? (
                            <>
                              <button
                                type="button"
                                className="link-btn"
                                title={`${nachweisTitel(n)} öffnen`}
                                onClick={() => navigate({ view: 'nachweis', projektId: projekt.id, nachweisId: n.id })}
                              >
                                {nachweisName(n)}
                              </button>
                              {geschlossen ? <span className="ln-le-zu">abgeschlossen</span> : null}
                            </>
                          ) : (
                            <span className="ln-le-ohne" title="Liegt in keinem Leistungsnachweis">
                              ohne
                            </span>
                          )}
                        </td>
                        <td className="col-optional ln-le-breit">
                          <QuelleBadge quelle={l.quelle} />
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn-icon ln-le-bearbeiten"
                            aria-label="Leistung bearbeiten"
                            title={
                              geschlossen && n
                                ? `Leistung bearbeiten – sie liegt im abgeschlossenen Nachweis „${nachweisName(n)}“`
                                : 'Leistung bearbeiten'
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setDialog({ leistung: l });
                            }}
                          >
                            <Icon name="bearbeiten" size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label="Leistung löschen"
                            title="Leistung löschen"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLoeschen(l);
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
            <div className="ln-le-summe">
              <span>
                Summe{gefiltert ? ' der angezeigten Leistungen' : ''} ({sichtbar.length})
              </span>
              <strong>{stundenText(summe)} Std.</strong>
            </div>
          </>
        )}
      </Card>

      {dialog ? (
        <LeistungDialog
          key={dialog.leistung?.id ?? 'neu'}
          projektId={projekt.id}
          leistung={dialog.leistung}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {importOffen ? <ImportDialog onClose={() => setImportOffen(false)} navigate={navigate} /> : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Leistung löschen?"
          text={`Die Leistung vom ${langDatum(loeschen.datum)} (${name(loeschen.mitarbeiterId)}, ${stundenText(
            loeschen.stunden,
          )} Std.) wird gelöscht.${geschlosseneIn([loeschen]).length ? ` ${abgeschlossenHinweis(geschlosseneIn([loeschen])[0])}` : ''}`}
          onConfirm={() => {
            deleteLeistung(loeschen.id);
            toast('Leistung gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}

      {auswahlLoeschen ? (
        <ConfirmDialog
          titel="Auswahl löschen?"
          text={`${anzahl(gewaehlt.length, 'Leistung', 'Leistungen')} mit zusammen ${stundenText(
            runden(gewaehlt.reduce((s, l) => s + l.stunden, 0)),
          )} Std. ${gewaehlt.length === 1 ? 'wird' : 'werden'} gelöscht.${
            geschlosseneIn(gewaehlt).length
              ? ` Abgeschlossene Nachweise (${geschlosseneIn(gewaehlt).map(nachweisName).join(', ')}) ändern sich erst nach „Wieder öffnen“.`
              : ''
          }`}
          onConfirm={() => {
            const ids = gewaehlt.map((l) => l.id);
            deleteLeistungen(ids);
            setAuswahl(new Set());
            toast(`${anzahl(ids.length, 'Leistung', 'Leistungen')} gelöscht.`);
          }}
          onClose={() => setAuswahlLoeschen(false)}
        />
      ) : null}
    </div>
  );
}
