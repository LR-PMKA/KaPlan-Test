/**
 * Reiter „Leistungsnachweise“ des Controllings: alle Nachweise aller Projekte
 * mit erfassten Stunden, Aufschlag und abgerechneten Stunden – gefiltert nach
 * Status, Projekt und Zeitraum (Jahr oder Monat). Ein Klick öffnet die
 * Abrechnung des Nachweises; „Neuer Leistungsnachweis“ fragt nach dem Projekt.
 */
import { useState } from 'react';
import { Icon } from '../../../../shared/icons';
import { Badge, Callout, Card, CardHeader, EmptyState, Field, Segmented, Select } from '../../../../shared/ui';
import { NachweisDialog } from '../../components/NachweisDialog';
import { NachweisStatusBadge, anzahl } from '../../components/common';
import {
  anzahlAufschlaege,
  leistungenOhneNachweis,
  nachweisSummen,
  nachweisTitel,
  standVeraltet,
  zeilenFuerAnzeige,
} from '../../domain/nachweis';
import { RASTER_KURZ, projektTitel, type Leistungsnachweis, type NachweisStatus, type Projekt } from '../../domain/types';
import { langDatum, monatText, monatVersetzt, monatsanfang, runden, stundenText } from '../../domain/zeitraum';
import type { Route } from '../../lib/router';
import { useStore } from '../../store/store';
import { nachweisAuswahl, type NachweisAuswahl } from './auswahl';
import { aufschlagText, useAuswahl } from './hilfen';

const STATUS: { value: NachweisStatus | 'alle'; label: string }[] = [
  { value: 'alle', label: 'Alle' },
  { value: 'entwurf', label: 'In Bearbeitung' },
  { value: 'abgeschlossen', label: 'Abgeschlossen' },
];

/** Monate (JJJJ-MM), die ein Nachweis berührt. */
function monateVon(n: Pick<Leistungsnachweis, 'von' | 'bis'>): string[] {
  const monate: string[] = [];
  for (let m = monatsanfang(n.von); m <= n.bis && monate.length < 240; m = monatVersetzt(m, 1)) monate.push(m.slice(0, 7));
  return monate;
}

/** Berührt der Nachweis das Jahr „2026“ bzw. den Monat „2026-10“? */
const imZeitraum = (n: Leistungsnachweis, zeitraum: string) =>
  !zeitraum || (zeitraum.length === 4 ? n.von.slice(0, 4) <= zeitraum && n.bis.slice(0, 4) >= zeitraum : monateVon(n).includes(zeitraum));

export function NachweisListe({ navigate }: { navigate: (r: Route) => void }) {
  const { data } = useStore();
  const [auswahl, setAuswahl] = useAuswahl(nachweisAuswahl);
  const setze = (patch: Partial<NachweisAuswahl>) => setAuswahl({ ...auswahl, ...patch });
  const [neu, setNeu] = useState(false);

  const projekte = [...data.projekte].sort((a, b) => a.nummer.localeCompare(b.nummer, 'de', { numeric: true }) || a.name.localeCompare(b.name, 'de'));
  const projektVon = new Map(data.projekte.map((p) => [p.id, p]));
  // Ein gewähltes, inzwischen gelöschtes Projekt gilt nicht mehr
  const projektId = auswahl.projektId && projektVon.has(auswahl.projektId) ? auswahl.projektId : '';

  // Auswahl des Zeitraums: Jahre und Monate, die Nachweise berühren – neueste zuerst
  const monate = [...new Set(data.nachweise.flatMap(monateVon))].sort().reverse();
  const jahre = [...new Set(monate.map((m) => m.slice(0, 4)))];
  const zeitraumOptionen = [
    { value: '', label: 'Alle Zeiträume' },
    ...jahre.flatMap((j) => [
      { value: j, label: `Jahr ${j}` },
      ...monate.filter((m) => m.startsWith(j)).map((m) => ({ value: m, label: `– ${monatText(`${m}-01`)}` })),
    ]),
  ];
  const zeitraum = zeitraumOptionen.some((o) => o.value === auswahl.zeitraum) ? auswahl.zeitraum : '';

  const nachweise = data.nachweise
    .filter(
      (n) =>
        (auswahl.status === 'alle' || n.status === auswahl.status) &&
        (!projektId || n.projektId === projektId) &&
        imZeitraum(n, zeitraum),
    )
    .sort((a, b) => b.von.localeCompare(a.von) || (projektVon.get(a.projektId)?.nummer ?? '').localeCompare(projektVon.get(b.projektId)?.nummer ?? '', 'de', { numeric: true }));
  const zeilen = nachweise.map((n) => ({ n, p: projektVon.get(n.projektId), summen: nachweisSummen(zeilenFuerAnzeige(data, n)) }));
  const gesamt = {
    erfasst: runden(zeilen.reduce((s, z) => s + z.summen.erfasst, 0)),
    aufschlag: runden(zeilen.reduce((s, z) => s + z.summen.aufschlag, 0)),
    abgerechnet: runden(zeilen.reduce((s, z) => s + z.summen.abgerechnet, 0)),
  };
  const ohneNachweis = leistungenOhneNachweis(data, projektId || undefined).length;
  const gefiltert = auswahl.status !== 'alle' || !!projektId || !!zeitraum;

  const oeffne = (n: Leistungsnachweis) => navigate({ view: 'abrechnung', projektId: n.projektId, nachweisId: n.id });
  const neuProjekt: Projekt | undefined = (projektId ? projektVon.get(projektId) : undefined) ?? projekte.find((p) => p.status === 'aktiv') ?? projekte[0];

  return (
    <div className="stack">
      <Card>
        <div className="card-pad ln-co-filter">
          <div className="ln-co-filter-auswahl ln-co-filter-nachweise">
            <Field label="Status">
              <Segmented<NachweisStatus | 'alle'> value={auswahl.status} onChange={(status) => setze({ status })} options={STATUS} />
            </Field>
            <Field label="Projekt">
              <Select
                value={projektId}
                onChange={(v) => setze({ projektId: v })}
                options={[{ value: '', label: 'Alle Projekte' }, ...projekte.map((p) => ({ value: p.id, label: projektTitel(p) }))]}
              />
            </Field>
            <Field label="Zeitraum">
              <Select value={zeitraum} onChange={(v) => setze({ zeitraum: v })} options={zeitraumOptionen} />
            </Field>
            <div className="row wrap ln-co-filter-knoepfe">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!neuProjekt}
                title={neuProjekt ? undefined : 'Erst ein Projekt anlegen'}
                onClick={() => setNeu(true)}
              >
                <Icon name="plus" size={14} /> Neuer Leistungsnachweis
              </button>
            </div>
          </div>
        </div>
      </Card>

      {ohneNachweis > 0 ? (
        <Callout ton="warn" icon="!">
          {ohneNachweis === 1
            ? '1 Leistung liegt in keinem Leistungsnachweis'
            : `${ohneNachweis} Leistungen liegen in keinem Leistungsnachweis`}
          {projektId ? '' : ' (alle Projekte)'} – sie erscheinen erst in der Abrechnung, wenn ein Nachweis ihren Tag umfasst.
        </Callout>
      ) : null}

      {zeilen.length === 0 ? (
        <Card>
          <EmptyState
            icon="stunden"
            titel={gefiltert ? 'Keine Leistungsnachweise zur Auswahl' : 'Noch keine Leistungsnachweise'}
            text={
              gefiltert
                ? 'Für Status, Projekt und Zeitraum gibt es keinen Leistungsnachweis – ändern Sie die Auswahl.'
                : 'Leistungsnachweise entstehen beim Erfassen und Importieren von Leistungen von selbst; hier lässt sich einer auch für einen freien Zeitraum anlegen.'
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            titel="Leistungsnachweise"
            sub={`${anzahl(zeilen.length, 'Nachweis', 'Nachweise')} · ${anzahl(
              zeilen.filter((z) => z.n.status === 'entwurf').length,
              'in Bearbeitung',
              'in Bearbeitung',
            )} · Klick öffnet die Abrechnung`}
          />
          <div className="table-scroll">
            <table className="table table-stack ln-co-tabelle ln-co-nachweise">
              <thead>
                <tr>
                  <th>Projekt</th>
                  <th>Nachweis / Zeitraum</th>
                  <th className="col-optional ln-spalte-weit">Raster</th>
                  <th>Status</th>
                  <th className="ln-stunden">Erfasst</th>
                  <th className="ln-stunden">Aufschlag</th>
                  <th className="ln-stunden">Abgerechnet</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map(({ n, p, summen }) => {
                  const titel = n.status === 'abgeschlossen' && n.stand ? n.stand.titel : nachweisTitel(n);
                  const aufschlaege = anzahlAufschlaege(n);
                  return (
                    <tr key={n.id} className="clickable" onClick={() => oeffne(n)}>
                      <td className="ln-co-projektzelle">
                        <span className="mono tertiary ln-co-nummer">{p?.nummer || '–'}</span>
                        <span className="small muted ln-co-projektname">{p?.kurzname || p?.name || '?'}</span>
                      </td>
                      <td>
                        <strong>{titel}</strong>
                        <div className="small tertiary">
                          {langDatum(n.von)} – {langDatum(n.bis)}
                        </div>
                      </td>
                      <td className="col-optional ln-spalte-weit small muted">{RASTER_KURZ[n.raster]}</td>
                      <td>
                        <span className="row wrap" style={{ gap: 6 }}>
                          <NachweisStatusBadge status={n.status} />
                          {standVeraltet(data, n) ? (
                            <Badge ton="orange">
                              <span title="Seit dem Abschluss haben sich Leistungen im Zeitraum geändert">geändert</span>
                            </Badge>
                          ) : null}
                        </span>
                      </td>
                      <td className="ln-stunden ln-co-erfasst" data-label="erfasst">
                        {stundenText(summen.erfasst)}
                      </td>
                      <td
                        className={`ln-stunden ln-co-wert ${summen.aufschlag ? '' : 'ln-co-leer'}`}
                        data-label="Aufschlag"
                        title={aufschlaege ? anzahl(aufschlaege, 'Aufschlag', 'Aufschläge') : undefined}
                      >
                        {aufschlagText(summen.aufschlag)}
                      </td>
                      <td className="ln-stunden ln-co-abgerechnet" data-label="abgerechnet">
                        {stundenText(summen.abgerechnet)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="ln-co-summe">
                  <td>Summe</td>
                  <td className="small muted">{anzahl(zeilen.length, 'Nachweis', 'Nachweise')}</td>
                  <td className="col-optional ln-spalte-weit" />
                  <td />
                  <td className="ln-stunden" data-label="erfasst">
                    {stundenText(gesamt.erfasst)}
                  </td>
                  <td className="ln-stunden" data-label="Aufschlag">
                    {aufschlagText(gesamt.aufschlag)}
                  </td>
                  <td className="ln-stunden" data-label="abgerechnet">
                    {stundenText(gesamt.abgerechnet)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {neu && neuProjekt ? (
        <NachweisDialog projekt={neuProjekt} projektWahl onClose={() => setNeu(false)} navigate={navigate} ziel="abrechnung" />
      ) : null}
    </div>
  );
}
