/**
 * Sammel-Erledigen („Schritte erledigen …“ im Reiter „Planläufe“): schließt
 * die anstehenden Schritte mehrerer Planläufe in einem Zug ab – über
 * `schritteAbschliessen` im Store, nacheinander auf dem jeweils aktuellen Stand.
 *
 * Gemeinsam gelten Ist-Datum und Art (erledigt bzw. übersprungen). Je Lauf
 * stehen seine anstehenden Schritte zur Wahl – in parallelen Zweigen mehrere.
 * Gleichnamige Schritte lassen sich zusammen wählen und mit derselben Antwort
 * versehen; die Freigabe- bzw. Prüfbericht-Nr. wird je Zeile erfasst und lässt
 * sich auf alle gleichen Schritte übertragen. Ein Ist vor dem Eingang ist nur
 * nach ausdrücklicher Bestätigung möglich. Die Vorschau rechnet den Abschluss
 * auf dem aktuellen Stand durch („führt zurück zu …“, „schließt Planlauf ab“);
 * danach meldet der Dialog das Ergebnis mit Zahlen und bietet für die neu
 * anstehenden Schritte den Dialog „E-Mail senden“ an.
 */
import { useMemo, useState } from 'react';
import { formatDate, today, type ISODate } from '../../../shared/dates';
import { braucheNachweis } from '../domain/abschluss';
import { abschluesseAnwenden, type AbschlussErgebnis, type SchrittAbschluss } from '../domain/bestand';
import { anstehendeSchritte } from '../domain/uebersicht';
import { NACHWEIS_LABEL, type ID, type PlanDocument, type PlanRun, type RunStep } from '../domain/types';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Segmented, Select, TextInput } from '../../../shared/ui';
import { NeuZustaendig, type NeuZustaendigEintrag } from './NeuZustaendig';
import './auswahl.css';

type Art = 'erledigt' | 'uebersprungen';

/** Ein anstehender Schritt eines gewählten Laufs. */
interface Zeile {
  /** `<runId>#<stepId>` */
  schluessel: string;
  run: PlanRun;
  doc: PlanDocument | undefined;
  step: RunStep;
}

/** Zahlen des Ergebnisses. */
interface Zahlen {
  erledigt: number;
  ruecksprung: number;
  abgeschlossen: number;
  ausgelassen: number;
  neuAnstehend: number;
  /** Neu anstehende Schritte je Lauf – für den Dialog „E-Mail senden“. */
  neu: NeuZustaendigEintrag[];
  art: Art;
}

export function SammelErledigen({
  runIds,
  hinweise = [],
  onClose,
}: {
  /** Die gewählten Planläufe (aus der Auswahl aufgelöst, ohne Dubletten). */
  runIds: ID[];
  /** Hinweise zur Auflösung – etwa „wirkt auf den Planlauf von …“. */
  hinweise?: string[];
  onClose: () => void;
}) {
  const { data, schritteAbschliessen } = useStore();
  const toast = useToast();
  const heute = today();
  const [istDatum, setIstDatum] = useState<ISODate>(heute);
  const [art, setArt] = useState<Art>('erledigt');
  /** Abgewählte Schritte – zunächst sind alle anstehenden gewählt. */
  const [aus, setAus] = useState<Set<string>>(() => new Set());
  /** Gewählte Antwort je Entscheidung (Antwort-ID). */
  const [antworten, setAntworten] = useState<Record<string, ID>>({});
  /** Freigabe- bzw. Prüfbericht-Nr. je Schritt. */
  const [nachweise, setNachweise] = useState<Record<string, string>>({});
  const [bestaetigt, setBestaetigt] = useState(false);
  const [ergebnis, setErgebnis] = useState<Zahlen | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);

  // Läufe und Schritte frisch aus dem Bestand
  const zeilen: Zeile[] = runIds.flatMap((id) => {
    const run = data.runs.find((r) => r.id === id);
    if (!run || run.status !== 'laufend') return [];
    const doc = data.documents.find((d) => d.id === run.documentId);
    return anstehendeSchritte(run).map((step) => ({ schluessel: `${run.id}#${step.id}`, run, doc, step }));
  });
  const laufIds = [...new Set(zeilen.map((z) => z.run.id))];

  const gewaehlt = (z: Zeile) => !aus.has(z.schluessel);
  /** Antwort einer Entscheidung: gewählt, sonst die im Lauf gewählte, sonst die erste. */
  const antwortVon = (z: Zeile): ID | null =>
    z.step.typ === 'entscheidung'
      ? (antworten[z.schluessel] ?? z.step.gewaehlteAntwortId ?? z.step.antworten[0]?.id ?? null)
      : null;
  /** Verlangt der Schritt beim Erledigen eine Freigabe- bzw. Prüfbericht-Nr.? */
  const nachweisNoetig = (z: Zeile) =>
    art === 'erledigt' && braucheNachweis({ ...z.step, gewaehlteAntwortId: antwortVon(z) }, 'erledigt');
  const istGueltig = /^\d{4}-\d{2}-\d{2}$/.test(istDatum);
  const istVorEingang = (z: Zeile) => Boolean(istGueltig && z.step.eingangIst && istDatum < z.step.eingangIst);

  const eintraege: SchrittAbschluss[] = zeilen.filter(gewaehlt).map((z) => {
    const nummer = (nachweise[z.schluessel] ?? '').trim();
    return {
      runId: z.run.id,
      stepId: z.step.id,
      status: art,
      istDatum: istGueltig ? istDatum : undefined,
      nachweisNummer: nummer || undefined,
      antwortId: antwortVon(z) ?? undefined,
    };
  });

  // Vorschau: derselbe Abschluss auf dem aktuellen Stand – nur gerechnet, nicht
  // gespeichert. Neu gerechnet wird nur, wenn sich Bestand oder Eingaben ändern
  // (die Liste entsteht bei jedem Rendern neu, darum über ihren Inhalt).
  const eintraegeText = JSON.stringify(eintraege);
  const vorschau = useMemo(() => {
    const karte = new Map<string, AbschlussErgebnis>();
    const liste = JSON.parse(eintraegeText) as SchrittAbschluss[];
    if (liste.length === 0) return karte;
    const { ergebnisse } = abschluesseAnwenden(data, liste, {
      zeitpunkt: new Date().toISOString(),
      bearbeiter: data.bearbeiter?.name ?? '',
      heute,
    });
    ergebnisse.forEach((e) => karte.set(`${e.runId}#${e.stepId}`, e));
    return karte;
  }, [data, eintraegeText, heute]);

  /** Vorschau-Text einer Zeile. */
  const vorschauText = (z: Zeile): { text: string; klasse: string } | null => {
    if (!gewaehlt(z)) return null;
    const e = vorschau.get(z.schluessel)?.ergebnis;
    if (e === undefined) return null;
    if (e === null) return { text: 'steht dann nicht mehr an – wird ausgelassen', klasse: 'pll-fehlt' };
    if (e.art === 'nachweis') return { text: `${NACHWEIS_LABEL[z.step.nachweis]} fehlt – wird ausgelassen`, klasse: 'pll-fehlt' };
    if (e.abgeschlossen) return { text: 'schließt den Planlauf ab', klasse: 'pll-vorschau' };
    if (e.ruecksprung) {
      const ziel = z.run.steps.find((s) => s.id === e.ruecksprung!.zielId);
      return { text: `führt zurück zu „${ziel?.name ?? 'früherem Schritt'}“`, klasse: 'pll-vorschau' };
    }
    return null;
  };

  // Gleichnamige Schritte – gemeinsam wählen, Antwort für alle setzen
  const namen = [...new Set(zeilen.map((z) => z.step.name))];
  const gruppen = namen.map((name) => {
    const glieder = zeilen.filter((z) => z.step.name === name);
    const texte = glieder[0].step.typ === 'entscheidung' ? [...new Set(glieder.flatMap((z) => z.step.antworten.map((a) => a.text)))] : [];
    const gewaehlteTexte = new Set(
      glieder.map((z) => z.step.antworten.find((a) => a.id === antwortVon(z))?.text ?? ''),
    );
    return {
      name,
      glieder,
      texte,
      antwortText: gewaehlteTexte.size === 1 ? [...gewaehlteTexte][0] : '',
      alle: glieder.every(gewaehlt),
      einige: glieder.some(gewaehlt),
    };
  });
  const mitGruppen = gruppen.some((g) => g.glieder.length > 1 || g.texte.length > 0);

  const schalten = (schluessel: string[], an: boolean) =>
    setAus((alt) => {
      const neu = new Set(alt);
      schluessel.forEach((k) => (an ? neu.delete(k) : neu.add(k)));
      return neu;
    });

  /** Setzt die Antwort mit diesem Text bei allen gleichnamigen Entscheidungen. */
  const antwortFuerAlle = (name: string, text: string) =>
    setAntworten((alt) => {
      const neu = { ...alt };
      for (const z of zeilen.filter((x) => x.step.name === name)) {
        const a = z.step.antworten.find((x) => x.text === text);
        if (a) neu[z.schluessel] = a.id;
      }
      return neu;
    });

  /** Überträgt die Nachweis-Nr. einer Zeile auf alle gleichnamigen Schritte. */
  const nachweisFuerAlle = (z: Zeile) => {
    const wert = nachweise[z.schluessel] ?? '';
    setNachweise((alt) => {
      const neu = { ...alt };
      for (const x of zeilen.filter((y) => y.step.name === z.step.name)) neu[x.schluessel] = wert;
      return neu;
    });
  };

  const aktiv = zeilen.filter(gewaehlt);
  const vorEingang = aktiv.filter(istVorEingang);
  const ohneNachweis = aktiv.filter((z) => nachweisNoetig(z) && !(nachweise[z.schluessel] ?? '').trim());
  const sperre = aktiv.length === 0 || !istGueltig || (vorEingang.length > 0 && !bestaetigt);

  const ausfuehren = () => {
    if (sperre) return;
    const ergebnisse = schritteAbschliessen(eintraege);
    const zahlen: Zahlen = { erledigt: 0, ruecksprung: 0, abgeschlossen: 0, ausgelassen: 0, neuAnstehend: 0, neu: [], art };
    for (const { runId, ergebnis: e } of ergebnisse) {
      if (!e || e.art !== 'aenderung') {
        zahlen.ausgelassen += 1;
        continue;
      }
      zahlen.erledigt += 1;
      if (e.ruecksprung) zahlen.ruecksprung += 1;
      if (e.abgeschlossen) zahlen.abgeschlossen += 1;
      zahlen.neuAnstehend += e.naechste.length;
      if (e.naechste.length > 0) {
        const eintrag = zahlen.neu.find((n) => n.runId === runId);
        const ids = e.naechste.map((s) => s.id);
        if (eintrag) eintrag.stepIds = [...new Set([...eintrag.stepIds, ...ids])];
        else zahlen.neu.push({ runId, stepIds: ids });
      }
    }
    setErgebnis(zahlen);
    toast(
      `${zahlen.erledigt} ${zahlen.erledigt === 1 ? 'Schritt' : 'Schritte'} ${
        art === 'erledigt' ? 'erledigt' : 'übersprungen'
      }${zahlen.ausgelassen ? `, ${zahlen.ausgelassen} ausgelassen` : ''}.`,
    );
  };

  if (ergebnis && neuOffen) {
    return <NeuZustaendig eintraege={ergebnis.neu} onClose={() => setNeuOffen(false)} />;
  }

  if (ergebnis) {
    const kachel = (wert: number, text: string) => (
      <div className="pll-zahl">
        <b>{wert}</b>
        <span>{text}</span>
      </div>
    );
    return (
      <Modal
        titel={ergebnis.art === 'erledigt' ? 'Schritte erledigt' : 'Schritte übersprungen'}
        sub={`Ist-Datum ${formatDate(istDatum)}`}
        onClose={onClose}
        footer={
          <>
            {ergebnis.neu.length > 0 ? (
              <button type="button" className="btn btn-outline" onClick={() => setNeuOffen(true)}>
                E-Mail senden …
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Schließen
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <div className="pll-zahlen">
            {kachel(ergebnis.erledigt, ergebnis.art === 'erledigt' ? 'erledigt' : 'übersprungen')}
            {kachel(ergebnis.ruecksprung, ergebnis.ruecksprung === 1 ? 'Rücksprung' : 'Rücksprünge')}
            {kachel(ergebnis.abgeschlossen, ergebnis.abgeschlossen === 1 ? 'Planlauf abgeschlossen' : 'Planläufe abgeschlossen')}
            {kachel(ergebnis.ausgelassen, 'ausgelassen')}
          </div>
          {ergebnis.neuAnstehend > 0 ? (
            <p className="small muted">
              {ergebnis.neuAnstehend === 1 ? 'Ein Schritt steht' : `${ergebnis.neuAnstehend} Schritte stehen`} jetzt neu an. Unter
              „E-Mail senden …“ lassen sich die Zuständigen je Person per E-Mail informieren.
            </p>
          ) : null}
          {ergebnis.ausgelassen > 0 ? (
            <Callout ton="warn" icon="!">
              Ausgelassen wurden Schritte ohne erforderliche Nachweis-Nr. und Schritte, die nach einem vorherigen Abschluss
              nicht mehr anstanden. Sie bleiben unverändert.
            </Callout>
          ) : null}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      titel="Schritte erledigen"
      sub={`${laufIds.length} ${laufIds.length === 1 ? 'Planlauf' : 'Planläufe'} · ${zeilen.length} anstehende ${
        zeilen.length === 1 ? 'Schritt' : 'Schritte'
      }`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={ausfuehren} disabled={sperre}>
            {aktiv.length === 1 ? '1 Schritt' : `${aktiv.length} Schritte`}{' '}
            {art === 'erledigt' ? 'erledigen' : 'überspringen'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {hinweise.length > 0 ? (
          <div className="pll-hinweise">
            {hinweise.map((h) => (
              <Callout key={h}>{h}</Callout>
            ))}
          </div>
        ) : null}

        <div className="pll-kopf">
          <Field label="Ist-Datum">
            <TextInput type="date" value={istDatum} onChange={setIstDatum} max={heute} aria-label="Ist-Datum" />
          </Field>
          <Field label="Vermerken als">
            <Segmented<Art>
              value={art}
              onChange={setArt}
              options={[
                { value: 'erledigt', label: 'Erledigt' },
                { value: 'uebersprungen', label: 'Übersprungen' },
              ]}
            />
          </Field>
        </div>
        {istGueltig && istDatum > heute ? (
          <span className="pll-warnung">Das Ist-Datum liegt in der Zukunft.</span>
        ) : null}

        {zeilen.length === 0 ? (
          <Callout ton="warn" icon="!">
            In den gewählten Planläufen steht kein Schritt an.
          </Callout>
        ) : (
          <>
            {mitGruppen ? (
              <div>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  Gleiche Schritte gemeinsam wählen bzw. beantworten
                </div>
                <div className="pll-gruppen">
                  {gruppen.map((g) => (
                    <div key={g.name} className="pll-gruppe">
                      <label className="pll-gruppe-name">
                        <input
                          type="checkbox"
                          className="pll-kaestchen"
                          checked={g.alle}
                          ref={(el) => {
                            if (el) el.indeterminate = g.einige && !g.alle;
                          }}
                          onChange={() => schalten(g.glieder.map((z) => z.schluessel), !g.alle)}
                        />
                        <span style={{ minWidth: 0 }}>
                          <strong>{g.name}</strong>
                          <span className="small tertiary"> · {g.glieder.length}×</span>
                        </span>
                      </label>
                      {g.texte.length > 0 ? (
                        <Select
                          value={g.antwortText}
                          onChange={(text) => text && antwortFuerAlle(g.name, text)}
                          placeholder={g.antwortText ? undefined : '– unterschiedlich –'}
                          options={g.texte.map((t) => ({ value: t, label: `Antwort: ${t}` }))}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="pll-laeufe">
              {laufIds.map((runId) => {
                const eigene = zeilen.filter((z) => z.run.id === runId);
                const { run, doc } = eigene[0];
                return (
                  <div key={runId} className="pll-lauf">
                    <div className="pll-lauf-kopf">
                      {doc?.nummer ? <span className="num">{doc.nummer} </span> : null}
                      <strong>{doc?.titel ?? run.name}</strong>
                      {eigene.length > 1 ? <span className="tertiary"> · {eigene.length} Schritte parallel</span> : null}
                    </div>
                    {eigene.map((z) => {
                      const an = gewaehlt(z);
                      const kontakt = data.contacts.find((c) => c.id === z.step.contactId);
                      const meldung = vorschauText(z);
                      const nachweisFeld = nachweisNoetig(z);
                      return (
                        <div key={z.schluessel} className={`pll-schritt ${an ? '' : 'pll-aus'}`}>
                          <label className="pll-schritt-info">
                            <input
                              type="checkbox"
                              className="pll-kaestchen"
                              checked={an}
                              onChange={() => schalten([z.schluessel], !an)}
                            />
                            <span style={{ minWidth: 0 }}>
                              <div>{z.step.name}</div>
                              <span className="small tertiary">
                                {z.step.roleName || 'ohne Funktion'}
                                {kontakt ? ` · ${kontakt.vorname} ${kontakt.nachname}` : ''} · Eingang{' '}
                                {formatDate(z.step.eingangIst ?? z.step.eingangDatum)} · Soll {formatDate(z.step.sollDatum)}
                              </span>
                            </span>
                          </label>
                          {an && (z.step.typ === 'entscheidung' || nachweisFeld) ? (
                            <div className="pll-schritt-felder">
                              {z.step.typ === 'entscheidung' ? (
                                <Select
                                  value={antwortVon(z) ?? ''}
                                  onChange={(id) => setAntworten((alt) => ({ ...alt, [z.schluessel]: id }))}
                                  options={z.step.antworten.map((a) => ({ value: a.id, label: `Antwort: ${a.text}` }))}
                                />
                              ) : null}
                              {nachweisFeld ? (
                                <>
                                  <TextInput
                                    value={nachweise[z.schluessel] ?? ''}
                                    onChange={(v) => setNachweise((alt) => ({ ...alt, [z.schluessel]: v }))}
                                    placeholder={NACHWEIS_LABEL[z.step.nachweis]}
                                    aria-label={NACHWEIS_LABEL[z.step.nachweis]}
                                  />
                                  {zeilen.filter((x) => x.step.name === z.step.name).length > 1 ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-ghost"
                                      disabled={!(nachweise[z.schluessel] ?? '').trim()}
                                      onClick={() => nachweisFuerAlle(z)}
                                      title={`Diese ${NACHWEIS_LABEL[z.step.nachweis]} bei allen Schritten „${z.step.name}“ eintragen`}
                                    >
                                      für alle gleichen Schritte
                                    </button>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          ) : null}
                          {an && (istVorEingang(z) || meldung) ? (
                            <div className="pll-schritt-meldungen">
                              {istVorEingang(z) ? (
                                <span className="pll-warnung">
                                  Ist liegt vor dem Eingang ({formatDate(z.step.eingangIst)})
                                </span>
                              ) : null}
                              {meldung ? <span className={meldung.klasse}>{meldung.text}</span> : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {ohneNachweis.length > 0 ? (
              <span className="pll-fehlt">
                Bei {ohneNachweis.length === 1 ? 'einem Schritt fehlt' : `${ohneNachweis.length} Schritten fehlt`} die
                Nachweis-Nr. – {ohneNachweis.length === 1 ? 'er wird' : 'sie werden'} ausgelassen.
              </span>
            ) : null}
            {vorEingang.length > 0 ? (
              <label className="checkbox">
                <input type="checkbox" checked={bestaetigt} onChange={(e) => setBestaetigt(e.target.checked)} />
                Ist-Datum vor dem Eingang bei{' '}
                {vorEingang.length === 1 ? 'einem Schritt' : `${vorEingang.length} Schritten`} bestätigen
              </label>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
