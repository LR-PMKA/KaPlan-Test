/**
 * Ablauflogik einer Anmeldung: Statuswechsel samt Übernahme in eine neue
 * Phase (einen anderen Workflow) und Aufteilung, Rücknahme des letzten
 * Wechsels, Duplizieren und Abgleich des Sperrzeitraums. Reine Funktionen – der Store ruft
 * sie in `mutate()` auf.
 */
import { fahrplanjahrBeginn, fahrplanjahrEnde, fahrplanjahrVon, ganzesFahrplanjahr } from './fristen';
import {
  LOESCHEN,
  type Anmeldung,
  type AnmeldungStand,
  type AnmeldungsArt,
  type AnnexVIIGrund,
  type BaubetriebDaten,
  type ID,
  type ISODate,
  type StatusZiel,
  type VerlaufEintrag,
  type Workflow,
} from './types';
import {
  anmeldungBezeichnung,
  anmeldungTitel,
  istAenderung,
  istUebernahme,
  nachfolgerVon,
  statusInfo,
  statusVon,
  titelFeld,
  zielText,
} from './workflow';

/** Sperrzeitraum einer übernommenen bzw. aufgeteilten Anmeldung (Felder bauVon/bauBis). */
export interface Bauzeitraum {
  bauVon: ISODate | null;
  bauBis: ISODate | null;
  fahrplanjahr: number | null;
}

/** Weitere Anmeldung, die bei der Übernahme aus diesem Eintrag entsteht. */
export interface Aufteilung extends Bauzeitraum {
  anmeldeId: string;
  bfStrecke: string;
}

export interface Wechsel {
  nach: StatusZiel;
  datum: ISODate;
  bemerkung: string;
  /** Beim Eintritt in eine Änderungsabstimmung. */
  aenderungsNr?: string;
  annexVII?: AnnexVIIGrund | null;
  /** Beim Wechsel in einen anderen Workflow: neue Maßnahmenart, Anmelde-ID und Sperrzeitraum. */
  uebernahme?: Bauzeitraum & { art: AnmeldungsArt; anmeldeId: string };
  /** Beim Wechsel in einen anderen Workflow: weitere Anmeldungen aus diesem Eintrag. */
  weitere?: Aufteilung[];
}

/** Vorab vergebene Kennungen – der Store erzeugt sie außerhalb von `mutate()`. */
export interface WechselIds {
  verlauf: ID;
  /** Je weiterer Anmeldung eine Kennung für die Anmeldung und eine für ihren Verlauf. */
  weitere: { anmeldung: ID; verlauf: ID }[];
}

/**
 * Führt der Workflow den Sperrzeitraum als ganzes Fahrplanjahr (SKM, MKM),
 * reicht er vom Fahrplanwechsel bis zum nächsten; sonst folgt das
 * Fahrplanjahr dem Sperrbeginn.
 */
export function bauzeitraumAbgleichen<T extends Bauzeitraum & { statusId: ID }>(a: T, workflows: Workflow[]): T {
  if (ganzesFahrplanjahr(statusVon(workflows, a.statusId).workflow)) {
    const fpj = a.fahrplanjahr ?? fahrplanjahrVon(a.bauVon);
    return fpj
      ? { ...a, fahrplanjahr: fpj, bauVon: fahrplanjahrBeginn(fpj), bauBis: fahrplanjahrEnde(fpj) }
      : { ...a, fahrplanjahr: null };
  }
  return { ...a, fahrplanjahr: fahrplanjahrVon(a.bauVon) };
}

function standVon(a: Anmeldung): AnmeldungStand {
  return {
    statusId: a.statusId,
    statusSeit: a.statusSeit,
    art: a.art,
    anmeldeId: a.anmeldeId,
    bauVon: a.bauVon,
    bauBis: a.bauBis,
    fahrplanjahr: a.fahrplanjahr,
    aenderungsNr: a.aenderungsNr,
    annexVII: a.annexVII,
    terminManuell: a.terminManuell,
  };
}

/**
 * Wendet einen Statuswechsel an. Zulässig sind nur die Nachfolger des
 * aktuellen Status. `LOESCHEN` entfernt den Eintrag vollständig – in den
 * Standard-Workflows der Schritt nach dem Status „Anmeldeleiche“.
 */
export function wechselAnwenden(
  d: BaubetriebDaten,
  id: ID,
  w: Wechsel,
  ids: WechselIds,
  bearbeiter: string,
  erfasst: string,
): BaubetriebDaten {
  const alt = d.anmeldungen.find((a) => a.id === id);
  if (!alt || !nachfolgerVon(d.workflows, alt.statusId).includes(w.nach)) return d;

  if (w.nach === LOESCHEN) {
    return {
      ...d,
      anmeldungen: d.anmeldungen
        .filter((a) => a.id !== id)
        .map((a) => (a.herkunftId === id ? { ...a, herkunftId: null } : a)),
    };
  }

  const warAenderung = istAenderung(d.workflows, alt.statusId);
  const wirdAenderung = istAenderung(d.workflows, w.nach);
  const uebernahme = istUebernahme(d.workflows, alt.statusId, w.nach) ? w.uebernahme : undefined;
  const vonText = zielText(d.workflows, alt.statusId);
  const nachText = zielText(d.workflows, w.nach);

  const eintrag: VerlaufEintrag = {
    id: ids.verlauf,
    typ: 'wechsel',
    datum: w.datum,
    erfasst,
    bearbeiter,
    von: alt.statusId,
    nach: w.nach,
    vonText,
    nachText,
    text: w.bemerkung.trim(),
    vorher: standVon(alt),
  };
  // Eine abgeschlossene Änderungsabstimmung bleibt im Verlauf dokumentiert.
  if (warAenderung && !wirdAenderung && (alt.aenderungsNr || alt.annexVII)) {
    eintrag.aenderungsNr = alt.aenderungsNr;
    eintrag.annexVII = alt.annexVII;
  }

  const neu: Anmeldung = bauzeitraumAbgleichen(
    {
      ...alt,
      statusId: w.nach,
      statusSeit: w.datum,
      terminManuell: null,
      art: uebernahme?.art ?? alt.art,
      anmeldeId: uebernahme ? uebernahme.anmeldeId.trim() : alt.anmeldeId,
      bauVon: uebernahme ? uebernahme.bauVon : alt.bauVon,
      bauBis: uebernahme ? uebernahme.bauBis : alt.bauBis,
      fahrplanjahr: uebernahme ? uebernahme.fahrplanjahr : alt.fahrplanjahr,
      aenderungsNr: wirdAenderung ? (w.aenderungsNr ?? alt.aenderungsNr).trim() : '',
      annexVII: wirdAenderung ? (w.annexVII !== undefined ? w.annexVII : alt.annexVII) : null,
      verlauf: [...alt.verlauf, eintrag],
    },
    d.workflows,
  );

  const weitere: Anmeldung[] = uebernahme
    ? (w.weitere ?? []).map((t, i) =>
        bauzeitraumAbgleichen(
          {
            ...neu,
            id: ids.weitere[i].anmeldung,
            anmeldeId: t.anmeldeId.trim(),
            bfStrecke: t.bfStrecke.trim() || alt.bfStrecke,
            bauVon: t.bauVon,
            bauBis: t.bauBis,
            fahrplanjahr: t.fahrplanjahr,
            herkunftId: alt.id,
            verlauf: [
              {
                id: ids.weitere[i].verlauf,
                typ: 'anlage',
                datum: w.datum,
                erfasst,
                bearbeiter,
                von: alt.statusId,
                nach: w.nach,
                vonText,
                nachText,
                text: `Bei der Übernahme aus „${anmeldungTitel(alt)}“ (${vonText}) aufgeteilt`,
              },
            ],
          },
          d.workflows,
        ),
      )
    : [];

  const index = d.anmeldungen.findIndex((a) => a.id === id);
  const anmeldungen = [...d.anmeldungen];
  anmeldungen.splice(index, 1, neu, ...weitere);
  return { ...d, anmeldungen };
}

/** Der letzte Eintrag des Verlaufs, der ein Statuswechsel ist und zurückgenommen werden kann. */
export function letzterWechsel(a: Anmeldung, workflows: Workflow[]): VerlaufEintrag | null {
  const letzter = [...a.verlauf].reverse().find((v) => v.typ !== 'notiz');
  if (!letzter || letzter.typ !== 'wechsel' || !letzter.vorher) return null;
  // Gibt es den früheren Status nicht mehr, lässt sich nicht zurückkehren.
  return statusInfo(workflows, letzter.vorher.statusId) ? letzter : null;
}

/**
 * Nimmt den letzten Statuswechsel zurück und stellt den vorherigen Stand her.
 * Bei einer Aufteilung entstandene weitere Anmeldungen bleiben bestehen.
 */
export function wechselZuruecknehmen(d: BaubetriebDaten, id: ID): BaubetriebDaten {
  return {
    ...d,
    anmeldungen: d.anmeldungen.map((a) => {
      if (a.id !== id) return a;
      const letzter = letzterWechsel(a, d.workflows);
      if (!letzter?.vorher) return a;
      return { ...a, ...letzter.vorher, verlauf: a.verlauf.filter((v) => v.id !== letzter.id) };
    }),
  };
}

/** Vorab vergebene Kennungen einer Kopie: die Anmeldung, je Verlaufseintrag eine, der Vermerk. */
export interface KopieIds {
  anmeldung: ID;
  verlauf: ID[];
  vermerk: ID;
}

/**
 * Kopie einer Anmeldung mit aktuellem Stand und Statusverlauf; ein Vermerk
 * hält fest, woraus sie entstand. Die führende Bezeichnung erhält „(Kopie)“ –
 * ohne Nummer wird „(Kopie)“ die Nummer –, auch im gespeicherten Vorstand,
 * damit ein Zurücknehmen die Kopie nicht wieder wie das Original benennt.
 * Die Kopie steht direkt hinter dem Original.
 */
export function anmeldungDuplizieren(
  d: BaubetriebDaten,
  id: ID,
  ids: KopieIds,
  bearbeiter: string,
  erfasst: string,
  datum: ISODate,
): BaubetriebDaten {
  const index = d.anmeldungen.findIndex((a) => a.id === id);
  if (index < 0) return d;
  const alt = d.anmeldungen[index];
  const kennzeichnen = (t: string) => (t.trim() ? `${t.trim()} (Kopie)` : '(Kopie)');
  const nachVorhaben = titelFeld(alt) === 'vorhaben';
  const kopie: Anmeldung = {
    ...alt,
    id: ids.anmeldung,
    vorhaben: nachVorhaben ? kennzeichnen(alt.vorhaben) : alt.vorhaben,
    anmeldeId: nachVorhaben ? alt.anmeldeId : kennzeichnen(alt.anmeldeId),
    herkunftId: null,
    verlauf: [
      ...alt.verlauf.map((v, i) => ({
        ...v,
        id: ids.verlauf[i] ?? `${ids.anmeldung}-vl${i}`,
        ...(v.vorher && !nachVorhaben ? { vorher: { ...v.vorher, anmeldeId: kennzeichnen(v.vorher.anmeldeId) } } : {}),
      })),
      {
        id: ids.vermerk,
        typ: 'notiz',
        datum,
        erfasst,
        bearbeiter,
        von: null,
        nach: null,
        vonText: '',
        nachText: '',
        text: `Dupliziert aus „${anmeldungBezeichnung(alt)}“`,
      },
    ],
  };
  const anmeldungen = [...d.anmeldungen];
  anmeldungen.splice(index + 1, 0, kopie);
  return { ...d, anmeldungen };
}

/** Herkunft und Aufteilung: aus welchem Eintrag diese Anmeldung entstand und welche aus ihr. */
export function verwandte(d: BaubetriebDaten, a: Anmeldung): { herkunft: Anmeldung | null; aufgeteilt: Anmeldung[] } {
  return {
    herkunft: a.herkunftId ? (d.anmeldungen.find((x) => x.id === a.herkunftId) ?? null) : null,
    aufgeteilt: d.anmeldungen.filter((x) => x.herkunftId === a.id),
  };
}
