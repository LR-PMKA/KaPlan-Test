/**
 * Vorbereitete E-Mail zu einem Prozessschritt – bzw. als Sammel-E-Mail an eine
 * Person zu mehreren Schritten: Vorlage wählen, Text prüfen, per
 * E-Mail-Programm öffnen oder in die Zwischenablage kopieren. Jede vorbereitete
 * E-Mail wird an den Schritten vermerkt (Erinnerungen, Protokoll).
 *
 * Lauf und Schritt werden über ihre IDs frisch aus dem Bestand gelesen; die
 * übergebenen Objekte dienen nur als Rückfall.
 */
import { useState } from 'react';
import { EMAIL_ANLASS_LABEL, type ID, type PlanRun, type Project, type RunStep } from '../domain/types';
import {
  fehlendeAngaben,
  mailHtml,
  mailLinks,
  mailVorbereiten,
  sammelMailVorbereiten,
  vorlageVorschlagen,
} from '../domain/email';
import { formatiertKopieren } from '../../../shared/zwischenablage';
import { aktuelleSchritte, ampelFuerSchritt, kontaktName } from '../domain/engine';
import { useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import { Callout, Field, Modal, Select, TextArea, TextInput } from '../../../shared/ui';
import { Icon } from '../../../shared/icons';
import { formatDate } from '../../../shared/dates';
import { erinnerungText } from './common';
import './planlauf.css';

/** Ein Schritt, zu dem die E-Mail vorbereitet wird. */
export interface MailPosten {
  runId: ID;
  stepId: ID;
}

export function EmailDialog({
  project: projectVorgabe,
  run: runVorgabe,
  step: stepVorgabe,
  runId,
  stepId,
  posten,
  vorlageId,
  onClose,
  onVermerkt,
}: {
  /** Ohne Angabe das Projekt des (ersten) Laufs. */
  project?: Project;
  run?: PlanRun;
  step?: RunStep;
  runId?: ID;
  stepId?: ID;
  /** Mehrere Schritte derselben Person: eine Sammel-E-Mail (Platzhalter {{liste}}). */
  posten?: MailPosten[];
  /** Im Workflow hinterlegte bzw. vorgewählte Vorlage (etwa „Versand“); ohne Angabe wird nach Anlass gewählt. */
  vorlageId?: string | null;
  onClose: () => void;
  /** Nach dem Vermerken der vorbereiteten E-Mail. */
  onVermerkt?: () => void;
}) {
  const { data, erinnerungenVermerken } = useStore();
  const toast = useToast();

  const gesucht: MailPosten[] = posten ?? [
    { runId: runVorgabe?.id ?? runId ?? '', stepId: stepVorgabe?.id ?? stepId ?? '' },
  ];
  const eintraege = gesucht.flatMap(({ runId: r, stepId: s }) => {
    const run = data.runs.find((x) => x.id === r) ?? (runVorgabe?.id === r ? runVorgabe : undefined);
    const step = run?.steps.find((x) => x.id === s) ?? (stepVorgabe?.id === s ? stepVorgabe : undefined);
    return run && step ? [{ run, step }] : [];
  });
  const erster = eintraege[0];
  const sammel = eintraege.length > 1;
  const project = projectVorgabe ?? data.projects.find((p) => p.id === erster?.run.projectId);
  const kontakt = data.contacts.find((c) => c.id === erster?.step.contactId) ?? null;
  const vorlauf = project?.settings.erinnerungVorlaufTage ?? 0;
  const ueberfaellig = eintraege.some(
    ({ run, step }) =>
      ampelFuerSchritt(step, vorlauf, aktuelleSchritte(run).some((s) => s.id === step.id)) === 'ueberfaellig',
  );
  const vorlagen = data.emailVorlagen;

  const [templateId, setTemplateId] = useState(() => {
    // Die im Workflow hinterlegte Vorlage hat Vorrang, mehrere Schritte nennt die Sammelerinnerung
    const hinterlegt = vorlageId ? vorlagen.find((v) => v.id === vorlageId) : undefined;
    const sammelVorlage = sammel ? vorlagen.find((v) => /\{\{\s*liste\s*\}\}/.test(v.text)) : undefined;
    return (
      hinterlegt?.id ?? sammelVorlage?.id ?? vorlageVorschlagen(vorlagen, ueberfaellig)?.id ?? vorlagen[0]?.id ?? ''
    );
  });
  const template = vorlagen.find((t) => t.id === templateId) ?? vorlagen[0];

  const vorbereitet =
    !template || !erster
      ? null
      : sammel
        ? sammelMailVorbereiten(template, { contact: kontakt, posten: eintraege, data })
        : project
          ? mailVorbereiten(template, { project, run: erster.run, step: erster.step, contact: kontakt, data })
          : null;

  const [an, setAn] = useState(vorbereitet?.an ?? '');
  const [betreff, setBetreff] = useState(vorbereitet?.betreff ?? '');
  const [text, setText] = useState(vorbereitet?.text ?? '');
  const [zuletztVorlage, setZuletztVorlage] = useState(templateId);

  // Beim Vorlagenwechsel die Felder neu füllen
  if (zuletztVorlage !== templateId && vorbereitet) {
    setZuletztVorlage(templateId);
    setAn(vorbereitet.an);
    setBetreff(vorbereitet.betreff);
    setText(vorbereitet.text);
  }

  const { mailto, outlookWeb, zuLang } = mailLinks(an, betreff, text);

  /** Vermerkt die vorbereitete E-Mail an allen Schritten (Erinnerungen, Protokoll). */
  const merkeVersand = (weg: 'outlook' | 'web' | 'kopie') => {
    erinnerungenVermerken(
      eintraege.map(({ run, step }) => ({
        runId: run.id,
        stepId: step.id,
        erinnerung: {
          contactId: kontakt?.id ?? null,
          kontaktName: kontaktName(kontakt ?? undefined),
          an,
          betreff,
          anlass: template?.anlass ?? null,
          weg,
        },
      })),
    );
    onVermerkt?.();
  };

  /** Öffnet Outlook auf dem Rechner (Standard-Mailprogramm). */
  const inOutlook = () => {
    window.location.href = mailto;
    merkeVersand('outlook');
    toast('Outlook wird mit der vorbereiteten E-Mail geöffnet.');
    onClose();
  };

  /** Öffnet ein neues Fenster in Outlook im Web. */
  const imWeb = () => {
    window.open(outlookWeb, '_blank', 'noopener,noreferrer');
    merkeVersand('web');
    toast('Outlook im Web wird geöffnet.');
    onClose();
  };

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(`An: ${an}\nBetreff: ${betreff}\n\n${text}`);
      merkeVersand('kopie');
      toast('E-Mail in die Zwischenablage kopiert.');
    } catch {
      toast('Kopieren nicht möglich – bitte Text manuell markieren.');
    }
  };

  /** Nur der Text, formatiert (Links, ORDNERNAME EINFÜGEN rot und fett) – zum Einfügen in Outlook. */
  const kopierenFormatiert = async () => {
    try {
      await formatiertKopieren(mailHtml(text), text);
      merkeVersand('kopie');
      toast('Text formatiert kopiert – in Outlook in die neue E-Mail einfügen.');
    } catch {
      toast('Kopieren nicht möglich – bitte Text manuell markieren.');
    }
  };
  const luecken = fehlendeAngaben(text);

  if (!erster) {
    return (
      <Modal titel="E-Mail vorbereiten" onClose={onClose}>
        <Callout ton="warn" icon="!">
          Der Schritt ist nicht mehr vorhanden.
        </Callout>
      </Modal>
    );
  }

  if (!template) {
    return (
      <Modal titel="Keine E-Mail-Vorlage" onClose={onClose}>
        <Callout ton="warn" icon="!">
          Für dieses Projekt ist noch keine Vorlage hinterlegt. Legen Sie unter{' '}
          <strong>Projekt › Einstellungen › E-Mail-Vorlagen</strong> eine Vorlage an.
        </Callout>
      </Modal>
    );
  }

  // Bisherige Erinnerungen im laufenden Durchlauf
  const bisher = sammel
    ? []
    : (erster.step.erinnerungen ?? []).filter((e) => e.durchlauf === null || e.durchlauf === erster.step.durchlauf);

  return (
    <Modal
      titel={sammel ? 'Sammel-E-Mail für Outlook vorbereiten' : 'E-Mail für Outlook vorbereiten'}
      sub={sammel ? `${eintraege.length} Schritte · ${kontaktName(kontakt ?? undefined) || 'ohne Person'}` : `${erster.step.name} · ${erster.run.name}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-outline" onClick={kopieren}>
            <Icon name="kopieren" size={14} /> Kopieren
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={kopierenFormatiert}
            title="Nur den Text mit Formatierung kopieren (Links, ORDNERNAME EINFÜGEN rot und fett)"
          >
            <Icon name="kopieren" size={14} /> Kopieren (formatiert)
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={imWeb}
            disabled={!an || zuLang}
            title={zuLang ? 'Zu lang für die Übergabe – bitte „Kopieren“ verwenden' : undefined}
          >
            Outlook im Web
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={inOutlook}
            disabled={!an || zuLang}
            title={zuLang ? 'Zu lang für die Übergabe – bitte „Kopieren“ verwenden' : undefined}
          >
            <Icon name="mail" size={14} /> In Outlook öffnen
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {!kontakt ? (
          <Callout ton="warn" icon="!">
            Für den Schritt ist keine Person unter „Funktion“ hinterlegt – bitte Empfänger von Hand
            eintragen.
          </Callout>
        ) : null}
        {luecken.length > 0 ? (
          <Callout ton="warn" icon="!">
            Im Text fehlen Angaben: {luecken.join(', ')}. Bitte bei der Person unter „Funktionen“ ergänzen bzw. im
            Text von Hand eintragen.
          </Callout>
        ) : null}
        {zuLang ? (
          <Callout ton="warn" icon="!">
            Die E-Mail ist zu lang, um sie direkt an Outlook zu übergeben. Bitte „Kopieren“ verwenden und den Text
            in eine neue E-Mail einfügen.
          </Callout>
        ) : null}

        {sammel ? (
          <div className="pl-liste">
            {eintraege.map(({ run, step }) => (
              <span key={`${run.id}/${step.id}`}>
                {step.name} · {run.name} · Soll {formatDate(step.sollDatum)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="form-grid">
          <Field label="Vorlage">
            <Select
              value={templateId}
              onChange={setTemplateId}
              options={vorlagen.map((t) => ({
                value: t.id,
                label: `${t.name} · ${EMAIL_ANLASS_LABEL[t.anlass]}`,
              }))}
            />
          </Field>
          <Field label="Empfänger">
            <TextInput value={an} onChange={setAn} type="email" placeholder="name@firma.de" />
          </Field>
          <Field label="Betreff" full>
            <TextInput value={betreff} onChange={setBetreff} />
          </Field>
          <Field label="Nachricht" full>
            <TextArea value={text} onChange={setText} rows={14} />
          </Field>
        </div>

        {bisher.length > 0 ? (
          <div className="pl-liste">
            {bisher.slice(-3).map((e) => (
              <span key={e.zeitpunkt}>{erinnerungText(e)}</span>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
