/**
 * Sammel-Erinnern („Erinnern …“ im Reiter „Planläufe“): eine Sammel-E-Mail je
 * Person über alle ihre anstehenden Schritte in den gewählten Planläufen
 * (email.sammelMailVorbereiten, Platzhalter {{liste}}).
 *
 * Je Person eine Zeile mit eigenen Schaltflächen – Outlook, Outlook im Web,
 * Kopieren –, denn ein Browser öffnet je Klick nur eine E-Mail. Vermerkt
 * werden nur die Schritte der angeklickten Person (Erinnerungen, Protokoll).
 * Wird die E-Mail-Verknüpfung zu lang (MAILTO_GRENZE), bleibt nur „Kopieren“.
 *
 * Als Versandmail (`art="versand"`, „Versandmail …“): je Empfänger und
 * Anliegen eine E-Mail mit der Vorlage „Versand“ über alle gewählten Pläne, die
 * an einem Versandschritt stehen (email.versandPosten) – Empfänger ist, wer
 * nach dem Versandschritt zuständig ist. Vermerkt wird am anstehenden Schritt.
 */
import { useState } from 'react';
import { formatDate } from '../../../shared/dates';
import { ampelFuerSchritt, kontaktName } from '../domain/engine';
import {
  fehlendeAngaben,
  mailHtml,
  sammelMailVorbereiten,
  versandPosten,
  vorlageVorschlagen,
  type SammelPosten,
} from '../domain/email';
import { formatiertKopieren } from '../../../shared/zwischenablage';
import { anstehendeSchritte } from '../domain/uebersicht';
import { EMAIL_ANLASS_LABEL, VERSAND_ANLIEGEN_LABEL, type Contact, type ID, type VersandAnliegen } from '../domain/types';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Select } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import './auswahl.css';

type Weg = 'outlook' | 'web' | 'kopie';

/** Eine E-Mail: Person, ihre Pläne und die Schritte, an denen vermerkt wird. */
interface Gruppe {
  schluessel: string;
  kontakt: Contact;
  posten: SammelPosten[];
  vermerk: SammelPosten[];
  anliegen: VersandAnliegen | null;
}

const WEG_TEXT: Record<Weg, string> = {
  outlook: 'in Outlook geöffnet',
  web: 'in Outlook im Web geöffnet',
  kopie: 'in die Zwischenablage kopiert',
};

export function SammelErinnern({
  runIds,
  hinweise = [],
  art = 'erinnern',
  onClose,
}: {
  /** „erinnern“: anstehende Schritte je Person; „versand“: Versandmail je Empfänger. */
  art?: 'erinnern' | 'versand';
  /** Die gewählten Planläufe (aus der Auswahl aufgelöst, ohne Dubletten). */
  runIds: ID[];
  /** Hinweise zur Auflösung – etwa „wirkt auf den Planlauf von …“. */
  hinweise?: string[];
  onClose: () => void;
}) {
  const { data, erinnerungenVermerken } = useStore();
  const toast = useToast();
  /** Je E-Mail (Gruppe), wie sie zuletzt vorbereitet wurde. */
  const [vermerkt, setVermerkt] = useState<Record<string, Weg>>({});
  const versand = art === 'versand';

  // Anstehende Schritte der gewählten Läufe, frisch aus dem Bestand
  const laeufe = runIds.flatMap((id) => {
    const run = data.runs.find((r) => r.id === id);
    return run && run.status === 'laufend' ? [run] : [];
  });
  type Posten = SammelPosten & { vermerk: SammelPosten; anliegen: VersandAnliegen | null };
  const posten: Posten[] = laeufe.flatMap((run): Posten[] =>
    versand
      ? versandPosten(run).map((p) => ({ run, step: p.step, vermerk: { run, step: p.vermerk }, anliegen: p.anliegen }))
      : anstehendeSchritte(run).map((step) => ({ run, step, vermerk: { run, step }, anliegen: null })),
  );
  const ohneVersand = versand ? laeufe.filter((r) => !posten.some((p) => p.run.id === r.id)) : [];
  const vorlauf = (p: SammelPosten) =>
    data.projects.find((pr) => pr.id === p.run.projectId)?.settings.erinnerungVorlaufTage ?? 0;
  const ueberfaellig = (p: SammelPosten) => ampelFuerSchritt(p.step, vorlauf(p), true) === 'ueberfaellig';

  // Je Person (bei der Versandmail je Person und Anliegen) ihre Schritte; Schritte ohne (bekannte) Person gesondert
  const personen: Gruppe[] = [];
  const ohnePerson: SammelPosten[] = [];
  for (const p of posten) {
    const kontakt = data.contacts.find((c) => c.id === p.step.contactId);
    if (!kontakt) {
      ohnePerson.push(p);
      continue;
    }
    const schluessel = `${kontakt.id}|${p.anliegen ?? ''}`;
    const gruppe = personen.find((g) => g.schluessel === schluessel);
    if (gruppe) {
      gruppe.posten.push({ run: p.run, step: p.step });
      if (!gruppe.vermerk.some((v) => v.run.id === p.run.id && v.step.id === p.vermerk.step.id)) gruppe.vermerk.push(p.vermerk);
    } else {
      personen.push({ schluessel, kontakt, posten: [{ run: p.run, step: p.step }], vermerk: [p.vermerk], anliegen: p.anliegen });
    }
  }
  personen.sort((a, b) => `${a.kontakt.nachname} ${a.kontakt.vorname}`.localeCompare(`${b.kontakt.nachname} ${b.kontakt.vorname}`, 'de'));

  const vorlagen = data.emailVorlagen;
  const [vorlageId, setVorlageId] = useState(
    () =>
      (versand
        ? vorlagen.find((v) => v.id === 'mail-versand' || /\{\{\s*versandliste\s*\}\}/.test(v.text))?.id
        : vorlagen.find((v) => v.id === 'mail-sammel')?.id) ??
      vorlageVorschlagen(vorlagen, posten.some(ueberfaellig))?.id ??
      vorlagen[0]?.id ??
      '',
  );
  const vorlage = vorlagen.find((v) => v.id === vorlageId) ?? vorlagen[0];

  /** Vermerkt die vorbereitete Sammel-E-Mail an allen Schritten dieser Person. */
  const vermerken = (gruppe: Gruppe, an: string, betreff: string, weg: Weg) => {
    const { kontakt } = gruppe;
    erinnerungenVermerken(
      gruppe.vermerk.map((p) => ({
        runId: p.run.id,
        stepId: p.step.id,
        erinnerung: {
          contactId: kontakt.id,
          kontaktName: kontaktName(kontakt),
          an,
          betreff,
          anlass: vorlage?.anlass ?? null,
          weg: 'sammel',
        },
      })),
    );
    setVermerkt((alt) => ({ ...alt, [gruppe.schluessel]: weg }));
  };

  if (!vorlage) {
    return (
      <Modal titel="Keine E-Mail-Vorlage" onClose={onClose}>
        <Callout ton="warn" icon="!">
          Es ist noch keine E-Mail-Vorlage hinterlegt. Legen Sie unter <strong>Vorlagen › E-Mail-Vorlagen</strong> eine Vorlage an.
        </Callout>
      </Modal>
    );
  }

  return (
    <Modal
      titel={versand ? 'Versandmail' : 'Erinnern'}
      sub={
        versand
          ? `${personen.length} ${personen.length === 1 ? 'E-Mail' : 'E-Mails'} · ${posten.length} ${
              posten.length === 1 ? 'Plan' : 'Pläne'
            } am Versandschritt`
          : `${personen.length} ${personen.length === 1 ? 'Person' : 'Personen'} · ${posten.length} anstehende ${
              posten.length === 1 ? 'Schritt' : 'Schritte'
            }`
      }
      wide
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Fertig
        </button>
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

        <Field
          label="Vorlage"
          hint={
            versand
              ? 'Je Empfänger und Anliegen eine E-Mail mit allen gewählten Plänen am Versandschritt – Empfänger ist, wer nach dem Versandschritt zuständig ist. Vermerkt wird nur bei der E-Mail, die Sie öffnen bzw. kopieren.'
              : 'Je Person eine E-Mail mit der Liste ihrer anstehenden Schritte. Vermerkt wird nur bei der Person, deren E-Mail Sie öffnen bzw. kopieren.'
          }
        >
          <Select
            value={vorlage.id}
            onChange={setVorlageId}
            options={vorlagen.map((t) => ({ value: t.id, label: `${t.name} · ${EMAIL_ANLASS_LABEL[t.anlass]}` }))}
          />
        </Field>

        {personen.length === 0 ? (
          <Callout ton="warn" icon="!">
            {versand
              ? 'Keiner der gewählten Planläufe steht an einem Versandschritt (Schritt mit „Anliegen in der Versandmail“) oder direkt danach.'
              : 'In den gewählten Planläufen steht kein Schritt mit zuständiger Person an.'}
          </Callout>
        ) : (
          <div className="pll-gruppen">
            {personen.map((gruppe) => {
              const { kontakt, posten: liste } = gruppe;
              const mail = sammelMailVorbereiten(vorlage, { contact: kontakt, posten: liste, data });
              const zuSpaet = versand ? 0 : liste.filter(ueberfaellig).length;
              const weg = vermerkt[gruppe.schluessel];
              const luecken = fehlendeAngaben(mail.text);
              const oeffnen = (weg: 'outlook' | 'web') => {
                if (weg === 'outlook') window.location.href = mail.mailto;
                else window.open(mail.outlookWeb, '_blank', 'noopener,noreferrer');
                vermerken(gruppe, mail.an, mail.betreff, weg);
                toast(weg === 'outlook' ? 'Outlook wird mit der E-Mail geöffnet.' : 'Outlook im Web wird geöffnet.');
              };
              const kopieren = async () => {
                try {
                  await navigator.clipboard.writeText(`An: ${mail.an}\nBetreff: ${mail.betreff}\n\n${mail.text}`);
                  vermerken(gruppe, mail.an, mail.betreff, 'kopie');
                  toast('E-Mail in die Zwischenablage kopiert.');
                } catch {
                  toast('Kopieren nicht möglich – bitte Text manuell markieren.');
                }
              };
              const kopierenFormatiert = async () => {
                try {
                  await formatiertKopieren(mailHtml(mail.text), mail.text);
                  vermerken(gruppe, mail.an, mail.betreff, 'kopie');
                  toast('Text formatiert kopiert – in Outlook in die neue E-Mail einfügen.');
                } catch {
                  toast('Kopieren nicht möglich – bitte Text manuell markieren.');
                }
              };
              return (
                <div key={gruppe.schluessel} className={`pll-person ${weg ? 'pll-vermerkt' : ''}`}>
                  <div className="pll-person-name">
                    <strong>
                      {kontakt.vorname} {kontakt.nachname}
                    </strong>
                    <div className="small tertiary">
                      {[kontakt.firma, kontakt.email || 'keine E-Mail-Adresse'].filter(Boolean).join(' · ')}
                    </div>
                    <div className="small muted">
                      {versand && gruppe.anliegen ? `${VERSAND_ANLIEGEN_LABEL[gruppe.anliegen]} · ` : ''}
                      {liste.length} {versand ? (liste.length === 1 ? 'Plan' : 'Pläne') : liste.length === 1 ? 'Schritt' : 'Schritte'}
                      {zuSpaet > 0 ? <span className="pll-fehlt"> · {zuSpaet} überfällig</span> : null}
                      {weg ? <span className="pll-vorschau"> · E-Mail {WEG_TEXT[weg]}, vermerkt</span> : null}
                    </div>
                  </div>
                  <div className="pll-person-knoepfe">
                    {!mail.zuLang ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          disabled={!mail.an}
                          onClick={() => oeffnen('outlook')}
                          title={mail.an ? 'In Outlook öffnen' : 'Keine E-Mail-Adresse hinterlegt'}
                        >
                          <Icon name="mail" size={13} /> Outlook
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          disabled={!mail.an}
                          onClick={() => oeffnen('web')}
                          title={mail.an ? 'In Outlook im Web öffnen' : 'Keine E-Mail-Adresse hinterlegt'}
                        >
                          Web
                        </button>
                      </>
                    ) : null}
                    <button type="button" className="btn btn-sm btn-outline" onClick={kopieren}>
                      <Icon name="kopieren" size={13} /> Kopieren
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={kopierenFormatiert}
                      title="Nur den Text mit Formatierung kopieren (Links, ORDNERNAME EINFÜGEN rot und fett)"
                    >
                      Kopieren (formatiert)
                    </button>
                  </div>
                  {luecken.length > 0 ? (
                    <span className="pll-warnung" style={{ flexBasis: '100%' }}>
                      Im Text fehlen Angaben: {luecken.join(', ')} – bitte bei der Person ergänzen bzw. von Hand eintragen.
                    </span>
                  ) : null}
                  {mail.zuLang ? (
                    <span className="pll-warnung" style={{ flexBasis: '100%' }}>
                      Die E-Mail ist für eine direkte Verknüpfung zu lang – bitte kopieren und in Outlook einfügen.
                    </span>
                  ) : null}
                  <details>
                    <summary>Text ansehen</summary>
                    <pre>{`Betreff: ${mail.betreff}\n\n${mail.text}`}</pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}

        {ohneVersand.length > 0 ? (
          <Callout ton="warn" icon="!">
            Ohne Versandschritt und hier außen vor:{' '}
            {ohneVersand.map((r) => data.documents.find((d) => d.id === r.documentId)?.nummer ?? r.name).join('; ')}.
          </Callout>
        ) : null}

        {ohnePerson.length > 0 ? (
          <Callout ton="warn" icon="!">
            {ohnePerson.length === 1 ? 'Ein Schritt hat' : `${ohnePerson.length} Schritte haben`} keine zuständige Person
            und {ohnePerson.length === 1 ? 'bleibt' : 'bleiben'} hier außen vor:{' '}
            {ohnePerson
              .map((p) => {
                const doc = data.documents.find((d) => d.id === p.run.documentId);
                return `${doc?.nummer ?? p.run.name} – ${p.step.name} (Soll ${formatDate(p.step.sollDatum)})`;
              })
              .join('; ')}
            .
          </Callout>
        ) : null}
      </div>
    </Modal>
  );
}
