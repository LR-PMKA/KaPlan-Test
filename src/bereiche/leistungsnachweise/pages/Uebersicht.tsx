/**
 * Startseite des Bereichs: Kennzahlen, die Leistungsnachweise in Bearbeitung,
 * Leistungen ohne Nachweis und die Projekte mit ihren Stunden im laufenden
 * Monat. Angezeigt werden die markierten Projekte; ohne Markierung alle.
 */
import { formatDate, today } from '../../../shared/dates';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Card, CardHeader, EmptyState, Stat } from '../../../shared/ui';
import { NachweisStatusBadge, RasterBadge, anzahl, nachweiseAngelegtText } from '../components/common';
import {
  bearbeiterVon,
  leistungenOhneNachweis,
  nachweisTitel,
  nachweiseVon,
  stundenVon,
  summeStunden,
  zeilenFuerAnzeige,
} from '../domain/nachweis';
import { projektKurzname, type Projekt } from '../domain/types';
import { MONATSNAMEN, monatsanfang, monatsende, stundenText, zeitraumText } from '../domain/zeitraum';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';

/** Markierte Projekte; ohne Markierung alle. */
export function sichtbareProjekte(projekte: Projekt[]): Projekt[] {
  const markiert = projekte.filter((p) => p.markiert);
  return markiert.length > 0 ? markiert : projekte;
}

export function Uebersicht({ navigate, onImport }: { navigate: (r: Route) => void; onImport: () => void }) {
  const { data, nachweiseFuerOffeneLeistungen } = useStore();
  const toast = useToast();

  const projekte = sichtbareProjekte(data.projekte);
  const ids = new Set(projekte.map((p) => p.id));
  const heute = today();
  const anfang = monatsanfang(heute);
  const ende = monatsende(heute);
  const monat = MONATSNAMEN[Number(heute.slice(5, 7)) - 1];

  const imMonat = data.leistungen.filter((l) => ids.has(l.projektId) && l.datum >= anfang && l.datum <= ende);
  const offen = leistungenOhneNachweis(data).filter((l) => ids.has(l.projektId));
  const inBearbeitung = projekte.flatMap((p) => nachweiseVon(data, p.id).filter((n) => n.status === 'entwurf'));
  const alleMarkiert = data.projekte.filter((p) => p.markiert).length;
  const projektVon = new Map(data.projekte.map((p) => [p.id, p]));

  return (
    <div className="stack">
      <div className="row-between wrap">
        <p className="small muted" style={{ maxWidth: 620 }}>
          Leistungen aus der Zeiterfassung übernehmen – ein Import kann mehrere Projekte enthalten und ergänzt nur die
          Leistungen der Personen in der Datei.
        </p>
        <button type="button" className="btn btn-primary" onClick={onImport}>
          <Icon name="importieren" size={14} /> Excel-Import
        </button>
      </div>

      <div className="grid grid-4">
        <Stat
          wert={projekte.filter((p) => p.status === 'aktiv').length}
          label="Aktive Projekte"
          onClick={() => navigate({ view: 'projekte' })}
        />
        <Stat wert={stundenText(stundenVon(imMonat))} label={`Stunden ${monat}`} ton="blue" />
        <Stat wert={inBearbeitung.length} label="In Bearbeitung" />
        <Stat wert={offen.length} label="Ohne Nachweis" ton={offen.length > 0 ? 'orange' : ''} />
      </div>

      {alleMarkiert === 0 ? (
        <p className="small tertiary">
          Kein Projekt markiert – es werden alle angezeigt. Unter <strong>Projekte</strong> lassen sich einzelne
          markieren; dann erscheinen nur diese hier und in der Seitenleiste.
        </p>
      ) : null}

      <Card>
        <CardHeader titel="Leistungsnachweise in Bearbeitung" sub="Noch nicht abgeschlossen – Klick öffnet den Nachweis" />
        {inBearbeitung.length === 0 ? (
          <EmptyState
            icon="check"
            titel="Kein Nachweis in Bearbeitung"
            text="Leistungsnachweise entstehen beim Erfassen oder Importieren von Leistungen – oder im Projekt über „Neuer Leistungsnachweis“."
          />
        ) : (
          <div className="table-scroll">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th>Leistungsnachweis</th>
                  <th>Projekt</th>
                  <th>Bearbeiter</th>
                  <th className="ln-stunden">Stunden</th>
                  <th className="col-optional ln-spalte-weit">Raster</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {inBearbeitung.map((n) => {
                  const projekt = projektVon.get(n.projektId);
                  const zeilen = zeilenFuerAnzeige(data, n);
                  const bearbeiter = bearbeiterVon(zeilen);
                  return (
                    <tr
                      key={n.id}
                      className="clickable"
                      onClick={() => navigate({ view: 'nachweis', projektId: n.projektId, nachweisId: n.id })}
                    >
                      <td>
                        <strong>{nachweisTitel(n)}</strong>
                        <div className="small tertiary">
                          {n.titel.trim() ? `${zeitraumText(n.von, n.bis)} · ` : ''}
                          {anzahl(zeilen.length, 'Zeile', 'Zeilen')}
                        </div>
                      </td>
                      <td className="small">
                        <span className="num">{projekt?.nummer}</span>
                        <div>{projekt ? projektKurzname(projekt) : '–'}</div>
                      </td>
                      <td className="small">
                        {bearbeiter.length ? bearbeiter.join(', ') : <span className="tertiary">noch keine Leistungen</span>}
                      </td>
                      <td className="ln-stunden">{stundenText(summeStunden(zeilen))}</td>
                      <td className="col-optional ln-spalte-weit">
                        <RasterBadge raster={n.raster} />
                      </td>
                      {/* Auf dem Telefon öffnet die ganze Karte den Nachweis */}
                      <td className="actions ln-nur-breit">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({ view: 'nachweis', projektId: n.projektId, nachweisId: n.id });
                          }}
                        >
                          Öffnen <Icon name="chevron" size={13} />
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

      {offen.length > 0 ? (
        <Card>
          <CardHeader
            titel="Leistungen ohne Nachweis"
            sub="Diese Leistungen liegen in keinem Leistungsnachweis ihres Projekts."
          />
          <div className="table-scroll">
            <table className="table table-stack">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Leistungen</th>
                  <th className="ln-stunden">Stunden</th>
                  <th className="col-optional">Zeitraum</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {projekte
                  .map((p) => ({ projekt: p, leistungen: offen.filter((l) => l.projektId === p.id) }))
                  .filter((x) => x.leistungen.length > 0)
                  .map(({ projekt, leistungen }) => {
                    const daten = leistungen.map((l) => l.datum).sort();
                    return (
                      <tr
                        key={projekt.id}
                        className="clickable"
                        onClick={() => navigate({ view: 'projekt', projektId: projekt.id, tab: 'leistungen' })}
                      >
                        <td>
                          <span className="num tertiary">{projekt.nummer}</span>
                          <div>
                            <strong>{projekt.name}</strong>
                          </div>
                        </td>
                        <td className="small">{anzahl(leistungen.length, 'Leistung', 'Leistungen')}</td>
                        <td className="ln-stunden">{stundenText(stundenVon(leistungen))}</td>
                        <td className="small col-optional">
                          {formatDate(daten[0])}
                          {daten.length > 1 && daten[daten.length - 1] !== daten[0]
                            ? ` – ${formatDate(daten[daten.length - 1])}`
                            : ''}
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast(nachweiseAngelegtText(nachweiseFuerOffeneLeistungen(projekt.id)));
                            }}
                          >
                            <Icon name="plus" size={13} /> Nachweise anlegen
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader titel="Projekte" sub={`Leistungsnachweise und Stunden je Projekt – im ${monat}`} />
        {projekte.length === 0 ? (
          <EmptyState
            icon="projekt"
            titel="Kein Projekt"
            text="Legen Sie unter „Projekte“ ein Projekt an – oder übernehmen Sie Leistungen per Excel-Import; unbekannte Projekte legt der Import an."
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Raster</th>
                  <th className="col-optional ln-spalte-weit">Leistungsbereich</th>
                  <th className="zahl">Stunden {monat}</th>
                  <th className="col-optional">Letzter Nachweis</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {projekte.map((projekt) => {
                  const stunden = stundenVon(imMonat.filter((l) => l.projektId === projekt.id));
                  const nachweise = nachweiseVon(data, projekt.id);
                  const letzter = nachweise[nachweise.length - 1];
                  return (
                    <tr
                      key={projekt.id}
                      className="clickable"
                      onClick={() => navigate({ view: 'projekt', projektId: projekt.id, tab: 'nachweise' })}
                    >
                      <td>
                        <span className="num tertiary">{projekt.nummer}</span>
                        <div>
                          <strong>{projekt.name}</strong>
                        </div>
                      </td>
                      <td>
                        <RasterBadge raster={projekt.raster} />
                      </td>
                      <td className="small muted col-optional ln-spalte-weit">{projekt.leistungsbereich || '–'}</td>
                      <td className={`zahl ${stunden ? '' : 'leer'}`}>{stundenText(stunden)}</td>
                      <td className="small col-optional">
                        {letzter ? (
                          <>
                            {nachweisTitel(letzter)}
                            <div style={{ marginTop: 3 }}>
                              <NachweisStatusBadge status={letzter.status} />
                            </div>
                          </>
                        ) : (
                          <span className="tertiary">–</span>
                        )}
                      </td>
                      <td className="actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({ view: 'projekt', projektId: projekt.id, tab: 'leistungen' });
                          }}
                        >
                          Leistungen <Icon name="chevron" size={13} />
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
    </div>
  );
}
