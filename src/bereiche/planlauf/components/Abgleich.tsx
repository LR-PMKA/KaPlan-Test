/**
 * „Abgleichen und auswählen“: zeigt die Unterschiede zwischen Bestand und
 * Sicherung als Baum mit Kästchen (domain/abgleich.ts) und übernimmt die
 * gewählten Elemente samt Abhängigkeiten über store.datenAbgleichen.
 *
 * Das breite Modal schließt bewusst nicht per Klick auf den Hintergrund, damit
 * eine aufwendige Auswahl nicht versehentlich verloren geht.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ZUSTAND_LABEL,
  abgleichAnwenden,
  abgleichErmitteln,
  mitAbhaengigkeiten,
  vorbelegung,
  type AbgleichAuswahl,
  type AbgleichElement,
  type AbgleichGruppe,
  type AbgleichProjekt,
} from '../domain/abgleich';
import type { ID } from '../domain/types';
import { newId, useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Callout, EmptyState } from '../../../shared/ui';
import { formatDate, today } from '../../../shared/dates';
import type { Sicherung } from './SicherungEinspielen';
import './abgleich.css';

/** Breites Modal ohne Schließen per Hintergrundklick (Escape und ✕ schließen). */
function BreitesModal({
  titel,
  sub,
  children,
  footer,
  onClose,
}: {
  titel: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay">
      <div className="modal wide ab-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h2>{titel}</h2>
            {sub ? <div className="sub">{sub}</div> : null}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

const ZUSTAND_FARBE: Record<AbgleichElement['zustand'], string> = {
  neu: 'blue',
  geaendert: 'orange',
  gleich: 'green',
  nur_bestand: '',
  geloescht: 'red',
};

/** Zeitpunkt für „zuletzt geändert“ – ohne Angabe „unbekannt“. */
function zeitText(iso: string | null): string {
  if (!iso) return 'unbekannt';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unbekannt';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Text der Quelle für Protokoll und Abbruchgrund, z. B. „Sicherung vom 12.10.2026“. */
export function quelleText(sicherung: Sicherung): string {
  return sicherung.stand ? `Sicherung vom ${formatDate(sicherung.stand)}` : `Sicherung „${sicherung.datei}“`;
}

const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;

export function AbgleichDialog({
  sicherung,
  onClose,
  onUebernommen,
}: {
  sicherung: Sicherung;
  onClose: () => void;
  onUebernommen?: () => void;
}) {
  const { data, datenAbgleichen } = useStore();
  const toast = useToast();
  const [getrennt, setGetrennt] = useState<ID[]>([]);
  const [kopien, setKopien] = useState<ID[]>([]);
  const [nurUnterschiede, setNurUnterschiede] = useState(true);
  const [fehler, setFehler] = useState<string[]>([]);
  const abgleich = useMemo(() => abgleichErmitteln(data, sicherung.daten, getrennt), [data, sicherung.daten, getrennt]);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set(vorbelegung(abgleich)));

  // Auswahl samt Abhängigkeiten; Elemente eines Projekts, das als Kopie kommt, entfallen
  const alle = useMemo(() => {
    const kopie = new Set(kopien);
    return new Set(
      [...mitAbhaengigkeiten(abgleich, gewaehlt)].filter((k) => {
        const e = abgleich.elemente[k];
        return !(e.projectId !== null && kopie.has(e.projectId));
      }),
    );
  }, [abgleich, gewaehlt, kopien]);
  const direkt = [...alle].filter((k) => gewaehlt.has(k)).length;
  const mitgenommen = alle.size - direkt;

  const sichtbar = (e: AbgleichElement) => !nurUnterschiede || e.waehlbar;
  const gruppeSichtbar = (g: AbgleichGruppe) => g.elemente.some(sichtbar);
  const projektSichtbar = (p: AbgleichProjekt) =>
    sichtbar(p.projekt) || p.andereNummer !== null || p.gruppen.some(gruppeSichtbar);
  const nichtsZuZeigen = !abgleich.global.some(gruppeSichtbar) && !abgleich.projekte.some(projektSichtbar);

  const umschalten = (schluessel: string, an: boolean) => {
    setFehler([]);
    setGewaehlt((g) => {
      const neu = new Set(g);
      if (an) neu.add(schluessel);
      else neu.delete(schluessel);
      return neu;
    });
  };

  const gruppeUmschalten = (g: AbgleichGruppe, an: boolean) => {
    setFehler([]);
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      for (const e of g.elemente) {
        if (!e.waehlbar) continue;
        if (an) neu.add(e.schluessel);
        else neu.delete(e.schluessel);
      }
      return neu;
    });
  };

  /** Eintrag „vermutlich dasselbe“: zusammenführen oder getrennt übernehmen – die Auswahl wandert mit. */
  const trennen = (e: AbgleichElement, trennenJa: boolean) => {
    const v = e.vermutlichDasselbe;
    if (!v || v.getrennt === trennenJa) return;
    setFehler([]);
    const von = `eintrag:${trennenJa ? v.bestandId : v.sicherungId}`;
    const nach = `eintrag:${trennenJa ? v.sicherungId : v.bestandId}`;
    setGewaehlt((g) => {
      const neu = new Set(g);
      if (trennenJa || neu.has(von)) neu.add(nach);
      neu.delete(von);
      return neu;
    });
    setGetrennt((g) => (trennenJa ? [...g, v.sicherungId] : g.filter((id) => id !== v.sicherungId)));
  };

  const kopieUmschalten = (projectId: ID, an: boolean) => {
    setFehler([]);
    setKopien((k) => (an ? [...k, projectId] : k.filter((id) => id !== projectId)));
  };

  const uebernehmen = () => {
    const auswahl: AbgleichAuswahl = {
      elemente: [...gewaehlt],
      kopien,
      getrennt,
      quelle: quelleText(sicherung),
      zeitpunkt: new Date().toISOString(),
      bearbeiter: data.bearbeiter.name,
      heute: today(),
    };
    // Erst auf dem angezeigten Stand prüfen – bei einem Verstoß wird nichts übernommen
    const probe = abgleichAnwenden(data, sicherung.daten, auswahl, newId);
    if (!probe.ok) {
      setFehler(probe.fehler);
      return;
    }
    datenAbgleichen((d) => {
      const ergebnis = abgleichAnwenden(d, sicherung.daten, auswahl, newId);
      return ergebnis.ok ? ergebnis.daten : d;
    });
    const teile = [anzahl(probe.uebernommen, 'Element übernommen', 'Elemente übernommen')];
    if (probe.mitgenommen) teile.push(`${probe.mitgenommen} als Abhängigkeit mitgenommen`);
    if (probe.kopien) teile.push(anzahl(probe.kopien, 'Projekt als Kopie', 'Projekte als Kopie'));
    if (probe.beendet) teile.push(`${anzahl(probe.beendet, 'Planlauf', 'Planläufe')} durch die Sicherung ersetzt`);
    toast(`Abgleich übernommen – ${teile.join(', ')}.`);
    onClose();
    onUebernommen?.();
  };

  const zeile = (e: AbgleichElement, gesperrt = false) => {
    const direktGewaehlt = gewaehlt.has(e.schluessel);
    const imErgebnis = alle.has(e.schluessel);
    const nurMitgenommen = imErgebnis && !direktGewaehlt;
    const v = e.vermutlichDasselbe;
    const zuletzt: string[] = [];
    if (e.zustand !== 'neu' && e.zustand !== 'geloescht') zuletzt.push(`Bestand: ${zeitText(e.zuletztBestand)}`);
    if (e.zustand !== 'nur_bestand') zuletzt.push(`Sicherung: ${zeitText(e.zuletztSicherung)}`);
    return (
      <li className={`ab-zeile ab-${e.zustand}`} key={e.schluessel}>
        <label className="ab-wahl">
          <input
            type="checkbox"
            checked={e.waehlbar && !gesperrt && imErgebnis}
            disabled={!e.waehlbar || gesperrt || nurMitgenommen}
            onChange={(ev) => umschalten(e.schluessel, ev.target.checked)}
          />
          <span className="ab-name">
            {e.bezeichnung}
            {e.zusatz ? <span className="ab-zusatz"> · {e.zusatz}</span> : null}
          </span>
        </label>
        <span className="ab-kennzeichen">
          <span className={`badge ${ZUSTAND_FARBE[e.zustand]}`}>
            {e.zustand === 'geloescht' && e.geloescht
              ? `im Bestand gelöscht am ${formatDate(e.geloescht.am.slice(0, 10))}`
              : ZUSTAND_LABEL[e.zustand]}
          </span>
          {nurMitgenommen && !gesperrt ? <span className="badge purple">wird mitgenommen</span> : null}
          {v ? <span className="badge gelb">vermutlich dasselbe</span> : null}
        </span>
        {e.zustand !== 'gleich' || e.unterschiede.length || e.hinweise.length || v ? (
          <div className="ab-details">
            <div>zuletzt geändert – {zuletzt.join(' · ')}</div>
            {e.zustand === 'geloescht' && e.geloescht ? (
              <div className="ab-hinweis">
                Im Bestand von {e.geloescht.bearbeiter || 'unbekannt'} gelöscht ({zeitText(e.geloescht.am)}) – nur auf
                ausdrücklichen Wunsch wieder übernehmen.
              </div>
            ) : null}
            {e.zustand === 'nur_bestand' ? <div>Bleibt unverändert.</div> : null}
            {e.unterschiede.length ? <div className="ab-unterschiede">{e.unterschiede.join(' · ')}</div> : null}
            {e.hinweise.map((h) => (
              <div className="ab-hinweis" key={h}>
                {h}
              </div>
            ))}
            {v ? (
              <div className="ab-optionen" role="radiogroup" aria-label="Vermutlich derselbe Eintrag">
                <span>Im Bestand: {v.bestandBezeichnung}</span>
                <label className="checkbox">
                  <input type="radio" checked={!v.getrennt} onChange={() => trennen(e, false)} /> zusammenführen
                </label>
                <label className="checkbox">
                  <input type="radio" checked={v.getrennt} onChange={() => trennen(e, true)} /> getrennt übernehmen
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  const gruppe = (g: AbgleichGruppe, schluessel: string, gesperrt = false) => {
    const elemente = g.elemente.filter(sichtbar);
    if (elemente.length === 0) return null;
    const waehlbar = g.elemente.filter((e) => e.waehlbar);
    const alleAn = waehlbar.length > 0 && waehlbar.every((e) => alle.has(e.schluessel));
    return (
      <div className="ab-gruppe" key={schluessel}>
        <div className="ab-gruppe-kopf">
          {waehlbar.length > 1 && !gesperrt ? (
            <input
              type="checkbox"
              aria-label={`${g.titel}: alle wählen`}
              checked={alleAn}
              onChange={(ev) => gruppeUmschalten(g, ev.target.checked)}
            />
          ) : null}
          <span>
            {g.titel} ({elemente.length})
          </span>
        </div>
        <ul className="ab-liste">{elemente.map((e) => zeile(e, gesperrt))}</ul>
      </div>
    );
  };

  const projekt = (p: AbgleichProjekt) => {
    if (!projektSichtbar(p)) return null;
    const alsKopie = kopien.includes(p.projectId);
    return (
      <section className="ab-projekt" key={p.projectId}>
        <ul className="ab-liste ab-projekt-kopf">{zeile(p.projekt, alsKopie)}</ul>
        {p.andereNummer ? (
          <Callout ton="warn" icon="!">
            Gleiche Kennung, aber andere Projektnummer: im Bestand „{p.andereNummer.bestand}“, in der Sicherung „
            {p.andereNummer.sicherung}“ – vermutlich ein anderes Projekt.
            <div style={{ marginTop: 6 }}>
              <label className="checkbox">
                <input type="checkbox" checked={alsKopie} onChange={(ev) => kopieUmschalten(p.projectId, ev.target.checked)} />
                Als Kopie übernehmen (Projekt samt Inhalt mit neuen Kennungen)
              </label>
            </div>
          </Callout>
        ) : null}
        {alsKopie ? (
          <div className="ab-kopie-hinweis">
            Das Projekt der Sicherung wird mit Funktionen, Kontakten, Workflows, Einträgen und Planläufen als neues Projekt
            übernommen; das Projekt im Bestand bleibt unverändert.
          </div>
        ) : (
          p.gruppen.map((g) => gruppe(g, `${p.projectId}-${g.titel}`))
        )}
      </section>
    );
  };

  return (
    <BreitesModal
      titel="Sicherung abgleichen"
      sub={sicherung.datei}
      onClose={onClose}
      footer={
        <>
          <span className="ab-zahl">
            {anzahl(direkt, 'Element', 'Elemente')} gewählt
            {mitgenommen ? `, ${mitgenommen} mitgenommen` : ''}
            {kopien.length ? `, ${anzahl(kopien.length, 'Projekt', 'Projekte')} als Kopie` : ''}
          </span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={alle.size === 0 && kopien.length === 0}
            onClick={uebernehmen}
          >
            Übernehmen
          </button>
        </>
      }
    >
      <div className="ab-kopf">
        <label className="checkbox">
          <input type="checkbox" checked={nurUnterschiede} onChange={(e) => setNurUnterschiede(e.target.checked)} />
          Nur Unterschiede
        </label>
        <span className="ab-zahl">
          {abgleich.unterschiede === 0 ? 'Keine Unterschiede' : anzahl(abgleich.unterschiede, 'Unterschied', 'Unterschiede')}
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setGewaehlt(new Set(vorbelegung(abgleich)))}>
          Vorbelegung
        </button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setGewaehlt(new Set())}>
          Nichts wählen
        </button>
      </div>

      {fehler.length ? (
        <div style={{ marginBottom: 14 }}>
          <Callout ton="error" icon="!">
            Nichts übernommen – der Stand nach dem Abgleich wäre nicht stimmig:
            <ul className="ab-fehler">
              {fehler.slice(0, 8).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {fehler.length > 8 ? `… und ${fehler.length - 8} weitere.` : null}
          </Callout>
        </div>
      ) : null}

      {nichtsZuZeigen ? (
        <EmptyState
          icon="check"
          titel="Keine Unterschiede"
          text="Die Sicherung enthält nichts, was vom Bestand in diesem Browser abweicht."
        />
      ) : (
        <>
          {abgleich.global.some(gruppeSichtbar) ? (
            <section className="ab-abschnitt">
              <div className="ab-abschnitt-titel">Übergreifend</div>
              {abgleich.global.map((g) => gruppe(g, `global-${g.titel}`))}
            </section>
          ) : null}
          {abgleich.projekte.some(projektSichtbar) ? (
            <section className="ab-abschnitt">
              <div className="ab-abschnitt-titel">Projekte</div>
              {abgleich.projekte.map(projekt)}
            </section>
          ) : null}
        </>
      )}
    </BreitesModal>
  );
}
