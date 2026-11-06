/**
 * Reiter „Einstellungen“ eines Projekts: Vorgaben für den Kopf und die Zeilen
 * neuer Leistungsnachweise, die Abschnitte (ab zwei Abschnitten eigene
 * Stundenspalten unter „Aufwand (Std)“, `mitAbschnittsspalten`) und die Logos
 * im Druckkopf. Der Excel-Import ordnet Leistungen über die Kennung des
 * Projektelements (Spalte J) einem Abschnitt zu und legt fehlende selbst an.
 * Abgeschlossene Nachweise behalten ihren festgeschriebenen Stand samt
 * Abschnitten. Ändern darf jede angemeldete Person; ohne Anmeldung ist alles
 * gesperrt.
 */
import { useId, useState } from 'react';
import { Icon } from '../../../../shared/icons';
import { useToast } from '../../../../shared/toast';
import { Callout, Card, CardHeader, ConfirmDialog, Field, Modal, Segmented, Select, TextInput } from '../../../../shared/ui';
import { useAnmeldung } from '../../components/AnmeldeDialog';
import { LogoVerwaltung } from '../../components/Logos';
import { RASTER_OPTIONEN, REGEL_OPTIONEN, anzahl } from '../../components/common';
import { abschnitteAusElementen, kennungNormal, projektelementTeilen } from '../../domain/import';
import { mitAbschnittsspalten } from '../../domain/nachweis';
import { angemeldet } from '../../domain/rechte';
import {
  LEISTUNGSBEREICH_VORSCHLAEGE,
  newId,
  type Abschnitt,
  type Projekt,
  type Raster,
  type Zeitraumregel,
} from '../../domain/types';
import { useStore } from '../../store/store';
import '../../components/leistungen.css';


export function ProjektEinstellungen({ projekt }: { projekt: Projekt }) {
  const { data } = useStore();
  const anmeldung = useAnmeldung();
  // Ohne Anmeldung nur ansehen – der Store ändert dann ohnehin nichts
  const gesperrt = !angemeldet(data);
  // Ändert sich das Projekt von anderer Stelle (Dialog „Bearbeiten“), beginnt das Formular neu
  const stand = [projekt.leistungsbereich, projekt.kurzname, projekt.raster, projekt.zeitraumregel].join('\u0000');
  return (
    <div className="stack">
      {gesperrt ? (
        <Callout icon="i">
          <div className="row-between wrap">
            <span>Die Einstellungen des Projekts ändert jede angemeldete Person – bitte zuerst anmelden.</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => anmeldung()}>
              Anmelden
            </button>
          </div>
        </Callout>
      ) : null}
      <NachweisVorgaben key={stand} projekt={projekt} gesperrt={gesperrt} />
      <Abschnitte projekt={projekt} gesperrt={gesperrt} />
      <LogoVerwaltung projekt={projekt} gesperrt={gesperrt} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vorgaben für Leistungsnachweise                                     */
/* ------------------------------------------------------------------ */

function NachweisVorgaben({ projekt, gesperrt }: { projekt: Projekt; gesperrt: boolean }) {
  const { updateProjekt } = useStore();
  const toast = useToast();
  const liste = useId();
  const [form, setForm] = useState({
    leistungsbereich: projekt.leistungsbereich,
    kurzname: projekt.kurzname,
    raster: projekt.raster,
    zeitraumregel: projekt.zeitraumregel,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const geaendert =
    form.leistungsbereich !== projekt.leistungsbereich ||
    form.kurzname !== projekt.kurzname ||
    form.raster !== projekt.raster ||
    form.zeitraumregel !== projekt.zeitraumregel;

  const speichern = () => {
    updateProjekt(projekt.id, {
      ...form,
      leistungsbereich: form.leistungsbereich.trim(),
      kurzname: form.kurzname.trim(),
    });
    toast('Vorgaben gespeichert.');
  };

  return (
    <Card>
      <CardHeader titel="Leistungsnachweis" sub="Kopf und Vorgaben für neue Leistungsnachweise dieses Projekts" />
      <fieldset className="ln-fieldset card-pad" disabled={gesperrt}>
        <div className="form-grid ln-zweispaltig">
          <Field label="Leistungsbereich" hint="Steht im Kopf des Leistungsnachweises, etwa „Projektsteuerung“.">
            <TextInput
              value={form.leistungsbereich}
              onChange={(v) => set('leistungsbereich', v)}
              list={liste}
              placeholder="z. B. Projektsteuerung"
            />
            <datalist id={liste}>
              {LEISTUNGSBEREICH_VORSCHLAEGE.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Bezeichnung im Nachweis" hint={`Kopf des Leistungsnachweises; leer = Projektname „${projekt.name}“.`}>
            <TextInput value={form.kurzname} onChange={(v) => set('kurzname', v)} placeholder={projekt.name || 'z. B. Hp Musterstadt'} />
          </Field>
          <Field
            label="Nachweis"
            hint="Zeilen je Tag, Woche oder Monat – Vorgabe für neue Leistungsnachweise. Vorhandene behalten ihr Raster; das Controlling stellt es dort unter „Zeitraum ändern“ um."
          >
            <Segmented<Raster> value={form.raster} onChange={(v) => set('raster', v)} options={RASTER_OPTIONEN} />
          </Field>
          <Field
            label="Neue Nachweise"
            hint="Für Leistungen außerhalb der vorhandenen Nachweise: je Kalendermonat ein eigener, oder der offene Nachweis wächst mit, bis er abgeschlossen wird – für Nachweise über mehrere Monate."
          >
            <Select value={form.zeitraumregel} onChange={(v) => set('zeitraumregel', v as Zeitraumregel)} options={REGEL_OPTIONEN} />
          </Field>
        </div>
        <div className="ln-einst-knoepfe">
          <button
            type="button"
            className="btn"
            disabled={!geaendert}
            onClick={() =>
              setForm({
                leistungsbereich: projekt.leistungsbereich,
                kurzname: projekt.kurzname,
                raster: projekt.raster,
                zeitraumregel: projekt.zeitraumregel,
              })
            }
          >
            Verwerfen
          </button>
          <button type="button" className="btn btn-primary" disabled={!geaendert} onClick={speichern}>
            Speichern
          </button>
        </div>
      </fieldset>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Abschnitte                                                          */
/* ------------------------------------------------------------------ */

function Abschnitte({ projekt, gesperrt }: { projekt: Projekt; gesperrt: boolean }) {
  const { data, updateProjekt, abschnitteAusProjektelementen } = useStore();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ abschnitt?: Abschnitt } | null>(null);
  const [loeschen, setLoeschen] = useState<Abschnitt | null>(null);

  const leistungen = data.leistungen.filter((l) => l.projektId === projekt.id);
  const gueltig = new Set(projekt.abschnitte.map((a) => a.id));
  const zahl = (a: Abschnitt) => leistungen.filter((l) => l.abschnittId === a.id).length;
  const ohne = leistungen.filter((l) => !l.abschnittId || !gueltig.has(l.abschnittId)).length;
  const mitElement = leistungen.some((l) => l.projektelement.trim());
  const spalten = mitAbschnittsspalten(projekt.abschnitte);
  const bearbeiten = (abschnitt: Abschnitt) => {
    if (!gesperrt) setDialog({ abschnitt });
  };

  const verschieben = (i: number, um: -1 | 1) => {
    const neu = [...projekt.abschnitte];
    [neu[i], neu[i + um]] = [neu[i + um], neu[i]];
    updateProjekt(projekt.id, { abschnitte: neu });
  };

  const ausElementen = () => {
    // Vorab auf dem angezeigten Stand rechnen, wie viele Leistungen dabei einen Abschnitt erhalten
    const vorschau = abschnitteAusElementen(data, projekt.id, (p) => `${p}-vorschau`);
    const zugeordnet = vorschau.daten.leistungen.filter((l, i) => l !== data.leistungen[i]).length;
    if (vorschau.anzahl === 0 && zugeordnet === 0) {
      toast('Keine neuen Projektelemente – alle Leistungen mit Projektelement haben bereits ihren Abschnitt.');
      return;
    }
    const neu = abschnitteAusProjektelementen(projekt.id);
    const zugeordnetText = zugeordnet ? anzahl(zugeordnet, 'Leistung', 'Leistungen') : '';
    toast(
      neu > 0
        ? `${anzahl(neu, 'Abschnitt', 'Abschnitte')} aus den Projektelementen angelegt${zugeordnetText ? `, ${zugeordnetText} zugeordnet` : ''}.`
        : `Keine neuen Abschnitte – ${zugeordnetText} zugeordnet.`,
    );
  };

  return (
    <Card className="ln-kopf-knoepfe">
      <fieldset className="ln-fieldset" disabled={gesperrt}>
        <CardHeader
          titel="Abschnitte"
          sub={
            spalten
              ? `${anzahl(projekt.abschnitte.length, 'Abschnitt', 'Abschnitte')} · im Nachweis je eine Spalte unter „Aufwand (Std)“`
              : projekt.abschnitte.length
                ? '1 Abschnitt · der Nachweis zeigt eine Spalte „Stunden“ – eigene Spalten erst ab zwei Abschnitten'
                : 'Ohne Abschnitte zeigt der Nachweis eine Spalte „Stunden“'
          }
          actions={
            <>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={ausElementen}
                disabled={!mitElement}
                title={
                  mitElement
                    ? 'Für jede neue Kennung der Projektelemente einen Abschnitt anlegen und Leistungen ohne Abschnitt zuordnen'
                    : 'Die Leistungen dieses Projekts nennen kein Projektelement'
                }
              >
                Aus Projektelementen übernehmen
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setDialog({})}>
                <Icon name="plus" size={12} /> Abschnitt hinzufügen
              </button>
            </>
          }
        />
        {projekt.abschnitte.length > 0 ? (
          <div className="table-scroll">
            <table className="table table-stack ln-ab-tabelle">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Kennung</th>
                  <th>Spaltenkopf</th>
                  <th>Bezeichnung</th>
                  <th className="col-optional">Leistungen</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {projekt.abschnitte.map((a, i) => (
                  <tr key={a.id} className={gesperrt ? '' : 'clickable'} onClick={() => bearbeiten(a)}>
                    <td className="num">{a.kennung || '–'}</td>
                    <td>
                      <strong>{a.kurz}</strong>
                    </td>
                    <td className="small muted">{a.name || '–'}</td>
                    <td className="small col-optional">{zahl(a) || <span className="tertiary">–</span>}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={i === 0}
                        title="Nach vorn"
                        aria-label="Abschnitt nach vorn"
                        onClick={() => verschieben(i, -1)}
                      >
                        <Icon name="hoch" size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={i === projekt.abschnitte.length - 1}
                        title="Nach hinten"
                        aria-label="Abschnitt nach hinten"
                        onClick={() => verschieben(i, 1)}
                      >
                        <Icon name="runter" size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Abschnitt bearbeiten"
                        aria-label="Abschnitt bearbeiten"
                        onClick={() => bearbeiten(a)}
                      >
                        <Icon name="bearbeiten" size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Abschnitt löschen"
                        aria-label="Abschnitt löschen"
                        onClick={() => setLoeschen(a)}
                      >
                        <Icon name="loeschen" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className={`small tertiary ${projekt.abschnitte.length ? 'ln-ab-hinweis' : 'card-pad'}`}>
          {projekt.abschnitte.length === 0 ? (
            <p style={{ marginBottom: 6 }}>
              Mit Abschnitten – etwa Streckenabschnitten – weist der Nachweis die Stunden je Abschnitt in eigenen Spalten aus,
              wie „Abschn.1“ bis „Abschn.6“ im Wochennachweis; das gilt ab zwei Abschnitten.
            </p>
          ) : null}
          <p>
            Der Excel-Import ordnet Leistungen über die Kennung des Projektelements (Spalte J) zu: „01: Nordheim,
            Strecke 9401“ gehört zum Abschnitt mit der Kennung „01“; fehlende Abschnitte legt er selbst an. „Aus
            Projektelementen übernehmen“ legt für Leistungen früherer Importe je neue Kennung einen Abschnitt an und ordnet
            Leistungen ohne Abschnitt zu.
            {spalten && ohne > 0
              ? ` ${anzahl(ohne, 'Leistung steht', 'Leistungen stehen')} ohne Abschnitt – im Nachweis in der Spalte „ohne“.`
              : ''}
          </p>
        </div>
      </fieldset>

      {dialog ? <AbschnittDialog projekt={projekt} abschnitt={dialog.abschnitt} onClose={() => setDialog(null)} /> : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Abschnitt löschen?"
          text={`„${loeschen.kurz}“ wird entfernt.${
            zahl(loeschen) > 0
              ? ` ${anzahl(zahl(loeschen), 'Leistung verliert', 'Leistungen verlieren')} die Zuordnung und ${
                  zahl(loeschen) === 1 ? 'steht' : 'stehen'
                } danach ohne Abschnitt.`
              : ''
          } Abgeschlossene Leistungsnachweise behalten ihren Stand.`}
          onConfirm={() => {
            updateProjekt(projekt.id, { abschnitte: projekt.abschnitte.filter((a) => a.id !== loeschen.id) });
            toast('Abschnitt gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </Card>
  );
}

/** Abschnitt anlegen oder bearbeiten: Kennung (für den Import), Spaltenkopf und Bezeichnung. */
function AbschnittDialog({ projekt, abschnitt, onClose }: { projekt: Projekt; abschnitt?: Abschnitt; onClose: () => void }) {
  const { data, updateProjekt } = useStore();
  const toast = useToast();
  const andere = projekt.abschnitte.filter((a) => a.id !== abschnitt?.id);
  const [form, setForm] = useState(() => {
    if (abschnitt) return { kennung: abschnitt.kennung, kurz: abschnitt.kurz, name: abschnitt.name };
    // Nächster freier Spaltenkopf „Abschn.<n>“
    const vergeben = new Set(andere.map((a) => a.kurz.trim().toLowerCase()));
    let n = projekt.abschnitte.length + 1;
    while (vergeben.has(`abschn.${n}`)) n++;
    return { kennung: '', kurz: `Abschn.${n}`, name: '' };
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const speichern = () => {
    const werte = { kennung: form.kennung.trim(), kurz: form.kurz.trim(), name: form.name.trim() };
    if (!werte.kurz) {
      toast('Bitte einen Spaltenkopf angeben.');
      return;
    }
    if (werte.kennung && andere.some((a) => kennungNormal(a.kennung) === kennungNormal(werte.kennung))) {
      toast(`Die Kennung „${werte.kennung}“ ist bereits vergeben.`);
      return;
    }
    if (andere.some((a) => a.kurz.trim().toLowerCase() === werte.kurz.toLowerCase())) {
      toast(`Der Spaltenkopf „${werte.kurz}“ ist bereits vergeben.`);
      return;
    }
    if (abschnitt) {
      updateProjekt(projekt.id, { abschnitte: projekt.abschnitte.map((a) => (a.id === abschnitt.id ? { ...a, ...werte } : a)) });
      toast('Abschnitt gespeichert.');
    } else {
      updateProjekt(projekt.id, { abschnitte: [...projekt.abschnitte, { id: newId('ab'), ...werte }] });
      // Leistungen mit dieser Kennung, die noch keinen Abschnitt haben
      const gueltig = new Set(projekt.abschnitte.map((a) => a.id));
      const passend = werte.kennung
        ? data.leistungen.filter(
            (l) =>
              l.projektId === projekt.id &&
              (!l.abschnittId || !gueltig.has(l.abschnittId)) &&
              l.projektelement.trim() &&
              kennungNormal(projektelementTeilen(l.projektelement).kennung) === kennungNormal(werte.kennung),
          ).length
        : 0;
      toast(
        passend > 0
          ? `Abschnitt angelegt – ${anzahl(passend, 'Leistung trägt', 'Leistungen tragen')} diese Kennung; „Aus Projektelementen übernehmen“ ordnet sie zu.`
          : 'Abschnitt angelegt.',
      );
    }
    onClose();
  };

  return (
    <Modal
      titel={abschnitt ? 'Abschnitt bearbeiten' : 'Abschnitt hinzufügen'}
      sub={[projekt.nummer, projekt.name].filter(Boolean).join(' ')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Speichern
          </button>
        </>
      }
    >
      <div className="form-grid ln-zweispaltig">
        <Field label="Spaltenkopf" hint="Kurz – steht über der Spalte im Nachweis.">
          <TextInput value={form.kurz} onChange={(v) => set('kurz', v)} placeholder="Abschn.1" autoFocus maxLength={16} />
        </Field>
        <Field label="Kennung" hint="Nummer vor dem Doppelpunkt im Projektelement, etwa „01“ – daran ordnet der Import zu.">
          <TextInput value={form.kennung} onChange={(v) => set('kennung', v)} placeholder="01" />
        </Field>
        <Field label="Bezeichnung" full hint="Erscheint als Hinweis zur Spalte, etwa „Nordheim, Strecke 9401“.">
          <TextInput value={form.name} onChange={(v) => set('name', v)} placeholder="z. B. Nordheim, Strecke 9401" />
        </Field>
      </div>
    </Modal>
  );
}
