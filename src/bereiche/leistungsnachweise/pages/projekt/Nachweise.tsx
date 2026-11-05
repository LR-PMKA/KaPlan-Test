/**
 * Leistungsnachweise eines Projekts: Tabelle der Nachweise (Zeitraum und
 * Überschrift, Raster, Bearbeiter, Stunden, Status), „Neuer
 * Leistungsnachweis“ und ein Hinweis, wenn Leistungen in keinem Nachweis
 * liegen – mit „Nachweise anlegen“ nach der Zeitraumregel des Projekts.
 */
import { useState } from 'react';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Badge, Callout, Card, CardHeader, EmptyState } from '../../../../shared/ui';
import { NachweisDialog } from '../../components/NachweisDialog';
import { NachweisStatusBadge, RasterBadge, anzahl, nachweiseAngelegtText } from '../../components/common';
import {
  bearbeiterVon,
  leistungenOhneNachweis,
  nachweisTitel,
  nachweiseVon,
  standVeraltet,
  summeStunden,
  zeilenFuerAnzeige,
} from '../../domain/nachweis';
import { RASTER_LABEL, ZEITRAUMREGEL_LABEL, type Leistungsnachweis, type Projekt } from '../../domain/types';
import { langDatum, stundenText } from '../../domain/zeitraum';
import type { Route } from '../../lib/router';
import { useStore } from '../../store/store';
import '../../components/nachweis.css';

export function Nachweise({ projekt, navigate }: { projekt: Projekt; navigate: (r: Route) => void }) {
  const { data, nachweiseFuerOffeneLeistungen } = useStore();
  const toast = useToast();
  const [neu, setNeu] = useState(false);

  // Neueste zuerst
  const nachweise = [...nachweiseVon(data, projekt.id)].reverse();
  const offen = leistungenOhneNachweis(data, projekt.id);
  const oeffne = (n: Leistungsnachweis) => navigate({ view: 'nachweis', projektId: projekt.id, nachweisId: n.id });

  const anlegen = () => {
    const ergebnis = nachweiseFuerOffeneLeistungen(projekt.id);
    toast(nachweiseAngelegtText(ergebnis));
  };

  const neuKnopf = (
    <button type="button" className="btn btn-primary" onClick={() => setNeu(true)}>
      <Icon name="plus" size={14} /> Neuer Leistungsnachweis
    </button>
  );

  return (
    <div className="stack">
      <div className="row-between wrap">
        <p className="small muted" style={{ maxWidth: 640 }}>
          Ein Leistungsnachweis fasst die Leistungen seines Zeitraums je Tag, Woche oder Monat zu Zeilen zusammen –
          gemeinsam für alle Mitarbeiter des Projekts (Vorgabe: {RASTER_LABEL[projekt.raster]}). Leistungen außerhalb der
          Nachweise erhalten einen nach der Regel „{ZEITRAUMREGEL_LABEL[projekt.zeitraumregel]}“.
        </p>
        <div className="row wrap">{neuKnopf}</div>
      </div>

      {offen.length > 0 ? (
        <Callout ton="warn" icon="!">
          <div className="row-between wrap">
            <span>
              {offen.length === 1
                ? '1 Leistung liegt in keinem Leistungsnachweis.'
                : `${offen.length} Leistungen liegen in keinem Leistungsnachweis.`}
            </span>
            <button type="button" className="btn btn-sm btn-outline" onClick={anlegen}>
              <Icon name="plus" size={12} /> Nachweise anlegen
            </button>
          </div>
        </Callout>
      ) : null}

      {nachweise.length === 0 ? (
        <Card>
          <EmptyState
            icon="stunden"
            titel="Noch keine Leistungsnachweise"
            text="Leistungsnachweise entstehen beim Erfassen oder beim Excel-Import von Leistungen von selbst – je Kalendermonat oder fortlaufend, wie es das Projekt vorgibt. Hier lässt sich ein Nachweis auch für einen freien Zeitraum anlegen."
            action={neuKnopf}
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            titel="Leistungsnachweise"
            sub={`${anzahl(nachweise.length, 'Nachweis', 'Nachweise')} · ${anzahl(
              nachweise.filter((n) => n.status === 'entwurf').length,
              'in Bearbeitung',
              'in Bearbeitung',
            )}`}
          />
          <div className="table-scroll">
            <table className="table table-stack ln-nachweisliste">
              <thead>
                <tr>
                  <th>Zeitraum</th>
                  <th className="col-optional">Raster</th>
                  <th className="col-optional">Bearbeiter</th>
                  <th className="ln-stunden">Stunden</th>
                  <th>Status</th>
                  <th className="actions ln-spalte-weit" />
                </tr>
              </thead>
              <tbody>
                {nachweise.map((n) => {
                  const zeilen = zeilenFuerAnzeige(data, n);
                  const bearbeiter = bearbeiterVon(zeilen);
                  const veraltet = standVeraltet(data, n);
                  return (
                    <tr key={n.id} className="clickable" onClick={() => oeffne(n)}>
                      <td>
                        <strong>{n.status === 'abgeschlossen' && n.stand ? n.stand.titel : nachweisTitel(n)}</strong>
                        <div className="small tertiary">
                          {langDatum(n.von)} – {langDatum(n.bis)}
                        </div>
                      </td>
                      <td className="col-optional">
                        <RasterBadge raster={n.raster} />
                      </td>
                      <td className="col-optional small muted ln-nachweisliste-bearbeiter">
                        {bearbeiter.length ? bearbeiter.join(', ') : <span className="tertiary">noch keine Leistungen</span>}
                      </td>
                      <td className="ln-stunden">{stundenText(summeStunden(zeilen))}</td>
                      <td>
                        <span className="row wrap" style={{ gap: 6 }}>
                          <NachweisStatusBadge status={n.status} />
                          {veraltet ? (
                            <Badge ton="orange">
                              <span title="Seit dem Abschluss haben sich Leistungen im Zeitraum geändert">geändert</span>
                            </Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="actions ln-spalte-weit">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            oeffne(n);
                          }}
                        >
                          Öffnen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {neu ? <NachweisDialog projekt={projekt} onClose={() => setNeu(false)} navigate={navigate} /> : null}
    </div>
  );
}
