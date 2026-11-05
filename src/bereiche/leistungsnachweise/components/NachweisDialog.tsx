/**
 * Neuer Leistungsnachweis bzw. Zeitraum, Raster und Überschrift eines
 * vorhandenen ändern. Der Zeitraum ist ein Kalendermonat (Schnellwahl) oder
 * frei mit Beginn und Ende – auch über mehrere Monate. Nachweise eines
 * Projekts überschneiden sich nie; welche Leistungen ein Nachweis zeigt,
 * ergibt sich allein aus seinem Zeitraum.
 */
import { useState } from 'react';
import { addDays, today } from '../../../shared/dates';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Segmented, TextInput } from '../../../shared/ui';
import { leistungenIm, nachweisTitel, nachweiseVon, neuerNachweis, stundenVon, ueberschneidung } from '../domain/nachweis';
import {
  RASTER_LABEL,
  newId,
  projektTitel,
  type Leistungsnachweis,
  type Projekt,
  type Raster,
} from '../domain/types';
import { imZeitraum, istDatum, monatsanfang, monatsende, stundenText, zeitraumText } from '../domain/zeitraum';
import type { Route } from '../lib/router';
import { useStore } from '../store/store';
import { RASTER_OPTIONEN, anzahl } from './common';
import './nachweis.css';

type Art = 'monat' | 'frei';

/** Ist [von, bis] genau ein Kalendermonat? */
const istMonat = (von: string, bis: string) => istDatum(von) && von === monatsanfang(von) && bis === monatsende(von);

/** „2026-10“ aus dem Monatsfeld; Browser ohne Monatsauswahl liefern Text – „10.2026“ und „10/2026“ gelten auch. */
function monatLesen(wert: string): string | null {
  const t = wert.trim();
  const iso = /^(\d{4})-(\d{1,2})$/.exec(t);
  const de = /^(\d{1,2})[./](\d{4})$/.exec(t);
  const [jahr, monat] = iso ? [iso[1], iso[2]] : de ? [de[2], de[1]] : [null, null];
  if (!jahr || !monat || Number(monat) < 1 || Number(monat) > 12) return null;
  return `${jahr}-${monat.padStart(2, '0')}`;
}

export function NachweisDialog({
  projekt,
  nachweis,
  onClose,
  navigate,
}: {
  projekt: Projekt;
  nachweis?: Leistungsnachweis;
  onClose: () => void;
  navigate?: (r: Route) => void;
}) {
  const { data, addNachweis, updateNachweis } = useStore();
  const toast = useToast();
  const abgeschlossen = nachweis?.status === 'abgeschlossen';

  // Vorschlag für einen neuen Nachweis: der laufende Monat, sonst der Monat nach dem letzten Nachweis
  const vorschlag = () => {
    const heute = monatsanfang(today());
    if (!ueberschneidung(data, projekt.id, heute, monatsende(heute))) return heute.slice(0, 7);
    const letzter = nachweiseVon(data, projekt.id).at(-1);
    const danach = letzter ? monatsanfang(addDays(letzter.bis, 1)) : heute;
    return (ueberschneidung(data, projekt.id, danach, monatsende(danach)) ? heute : danach).slice(0, 7);
  };

  const [art, setArt] = useState<Art>(() => (!nachweis || istMonat(nachweis.von, nachweis.bis) ? 'monat' : 'frei'));
  const [monat, setMonat] = useState(() => (nachweis ? nachweis.von.slice(0, 7) : vorschlag()));
  const [von, setVon] = useState(nachweis?.von ?? '');
  const [bis, setBis] = useState(nachweis?.bis ?? '');
  const [raster, setRaster] = useState<Raster>(nachweis?.raster ?? projekt.raster);
  const [titel, setTitel] = useState(nachweis?.titel ?? '');

  const gewaehlt = monatLesen(monat);
  const zeitraum =
    art === 'monat'
      ? gewaehlt
        ? { von: `${gewaehlt}-01`, bis: monatsende(`${gewaehlt}-01`) }
        : { von: '', bis: '' }
      : { von, bis };
  const gueltig = istDatum(zeitraum.von) && istDatum(zeitraum.bis) && zeitraum.von <= zeitraum.bis;
  const andere = gueltig ? ueberschneidung(data, projekt.id, zeitraum.von, zeitraum.bis, nachweis?.id) : undefined;
  const automatisch = gueltig ? nachweisTitel({ titel: '', ...zeitraum }) : 'Leistungsnachweis';

  // Was im neuen Zeitraum liegt – und was beim Verkleinern aus jedem Nachweis fiele
  const darin = gueltig ? leistungenIm(data, projekt.id, zeitraum.von, zeitraum.bis) : [];
  const stunden = stundenVon(darin);
  const herausfallend =
    nachweis && gueltig
      ? data.leistungen.filter(
          (l) =>
            l.projektId === projekt.id &&
            imZeitraum(l.datum, nachweis.von, nachweis.bis) &&
            !imZeitraum(l.datum, zeitraum.von, zeitraum.bis),
        ).length
      : 0;

  const inhaltText = [
    `Im Zeitraum liegen ${anzahl(darin.length, 'Leistung', 'Leistungen')}${darin.length ? ` mit ${stundenText(stunden)} Stunden` : ''}.`,
    herausfallend ? `${anzahl(herausfallend, 'Leistung liegt', 'Leistungen liegen')} danach außerhalb dieses Leistungsnachweises.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const artWechseln = (neu: Art) => {
    // Beim Wechsel zu „frei“ beginnt der Zeitraum mit dem gewählten Monat
    if (neu === 'frei' && !von && !bis && gewaehlt) {
      setVon(`${gewaehlt}-01`);
      setBis(monatsende(`${gewaehlt}-01`));
    }
    if (neu === 'monat' && istDatum(von)) setMonat(von.slice(0, 7));
    setArt(neu);
  };

  const speichern = () => {
    const { von: beginn, bis: ende } = zeitraum;
    if (!istDatum(beginn) || !istDatum(ende)) {
      toast('Bitte Beginn und Ende angeben.');
      return;
    }
    if (ende < beginn) {
      toast('Das Ende liegt vor dem Beginn.');
      return;
    }
    if (andere) {
      toast(`Der Zeitraum überschneidet sich mit „${nachweisTitel(andere)}“.`);
      return;
    }
    if (nachweis) {
      updateNachweis(nachweis.id, { von: beginn, bis: ende, raster, titel: titel.trim() });
      toast('Leistungsnachweis gespeichert.');
      onClose();
      return;
    }
    const id = newId('ln');
    const neu: Leistungsnachweis = {
      ...neuerNachweis(id, projekt, beginn, ende, new Date().toISOString()),
      raster,
      titel: titel.trim(),
    };
    addNachweis(neu);
    toast(`„${nachweisTitel(neu)}“ angelegt.`);
    onClose();
    navigate?.({ view: 'nachweis', projektId: projekt.id, nachweisId: id });
  };

  return (
    <Modal
      titel={nachweis ? 'Zeitraum ändern' : 'Neuer Leistungsnachweis'}
      sub={projektTitel(projekt)}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {abgeschlossen ? 'Schließen' : 'Abbrechen'}
          </button>
          {abgeschlossen ? null : (
            <button type="button" className="btn btn-primary" onClick={speichern}>
              {nachweis ? 'Speichern' : 'Anlegen'}
            </button>
          )}
        </>
      }
    >
      {abgeschlossen ? (
        <Callout>
          Der Leistungsnachweis ist abgeschlossen. Zeitraum, Raster und Überschrift lassen sich erst nach „Wieder öffnen“
          ändern.
        </Callout>
      ) : (
        <div className="stack ln-nachweisdialog">
          <div className="form-grid">
            <Field label="Zeitraum" full>
              <Segmented<Art>
                value={art}
                onChange={artWechseln}
                options={[
                  { value: 'monat', label: 'Monat' },
                  { value: 'frei', label: 'Von – bis' },
                ]}
              />
            </Field>
            {art === 'monat' ? (
              <Field label="Monat" full hint={gewaehlt ? zeitraumText(zeitraum.von, zeitraum.bis) : undefined}>
                <TextInput type="month" value={monat} onChange={setMonat} placeholder="JJJJ-MM" autoFocus />
              </Field>
            ) : (
              <>
                <Field label="Von">
                  <TextInput type="date" value={von} onChange={setVon} autoFocus />
                </Field>
                <Field label="Bis" hint="Auch über mehrere Monate">
                  <TextInput type="date" value={bis} onChange={setBis} min={von || undefined} />
                </Field>
              </>
            )}
            <Field label="Raster" full hint={`Vorgabe des Projekts: ${RASTER_LABEL[projekt.raster]}`}>
              <Segmented<Raster>
                value={raster}
                onChange={setRaster}
                options={RASTER_OPTIONEN}
              />
            </Field>
            <Field label="Überschrift" full hint="Optional – leer lassen für die automatische Überschrift.">
              <TextInput value={titel} onChange={setTitel} placeholder={automatisch} />
            </Field>
          </div>

          {andere ? (
            <Callout ton="warn" icon="!">
              Der Zeitraum überschneidet sich mit „{nachweisTitel(andere)}“.
            </Callout>
          ) : gueltig ? (
            <p className="small muted">{inhaltText}</p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
