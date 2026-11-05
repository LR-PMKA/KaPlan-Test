/**
 * Projektübergreifende Vorlagen.
 *
 * Hier stehen die Excel-Vorlagen für den Upload von Plänen und Kontakten
 * sowie die Standardtexte der E-Mails. Die Texte arbeiten mit Bausteinen –
 * Platzhaltern, die beim Vorbereiten einer E-Mail aus Projekt, Plan, Schritt
 * und Empfänger befüllt werden.
 */
import { useRef, useState } from 'react';
import { EMAIL_ANLASS_LABEL, type EmailAnlass, type EmailTemplate } from '../domain/types';
import { PLATZHALTER, fuelleVorlage } from '../domain/email';
import {
  ROLLEN_HINWEISE,
  ROLLEN_KOPFZEILE,
  PLAN_HINWEISE,
  PLAN_KOPFZEILE,
  rollenVorlageLaden,
  planVorlageLaden,
} from '../domain/importVorlagen';
import { newId, useStore } from '../store/store';
import { useToast } from '../../../shared/toast';
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  Field,
  Modal,
  Select,
  TextArea,
  TextInput,
} from '../../../shared/ui';
import { Icon } from '../../../shared/icons';

type Seite = 'mail' | 'listen';

export function Vorlagen() {
  const { data, setEmailVorlage, deleteEmailVorlage } = useStore();
  const toast = useToast();
  const [seite, setSeite] = useState<Seite>('mail');
  const [dialog, setDialog] = useState<{ template?: EmailTemplate } | null>(null);
  const [loeschen, setLoeschen] = useState<EmailTemplate | null>(null);

  return (
    <div className="stack">
      <div className="tabs">
        <button type="button" className={seite === 'mail' ? 'active' : ''} onClick={() => setSeite('mail')}>
          E-Mail-Texte
        </button>
        <button type="button" className={seite === 'listen' ? 'active' : ''} onClick={() => setSeite('listen')}>
          Excel-Vorlagen
        </button>
      </div>

      {seite === 'listen' ? (
        <>
          <p className="muted small" style={{ maxWidth: 720 }}>
            Die Vorlagen enthalten die erwarteten Spalten und einige Beispielzeilen. Eingelesen werden sie im
            Projekt unter <strong>Planliste</strong> bzw. <strong>Funktion</strong> über
            <em> Excel-Import</em>.
          </p>

          <ListenKarte
            titel="Planliste"
            sub="Pläne, Planverzeichnisse und Planpakete"
            spalten={PLAN_KOPFZEILE}
            hinweise={PLAN_HINWEISE}
            onLaden={planVorlageLaden}
            text="Planpakete und Planverzeichnisse, die in der Liste genannt, im Projekt aber noch nicht angelegt sind, entstehen beim Import automatisch. Der Planlauf startet beim Import immer – nach dem genannten Workflow, sonst nach dem im Import gewählten."
          />

          <ListenKarte
            titel="Funktion"
            sub="Funktionen eines Projekts samt Besetzung"
            spalten={ROLLEN_KOPFZEILE}
            hinweise={ROLLEN_HINWEISE}
            onLaden={rollenVorlageLaden}
            text="Je Zeile eine Funktion mit der Person, die sie ausfüllt. Gewerke und Funktionen, die im Projekt noch nicht vorhanden sind, werden beim Import angelegt."
          />
        </>
      ) : (
        <>
          <div className="row-between wrap">
            <p className="muted small" style={{ maxWidth: 680 }}>
              Diese Texte stehen in allen Projekten zur Verfügung. Bausteine in doppelten geschweiften Klammern
              werden beim Vorbereiten einer E-Mail automatisch befüllt.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setDialog({})}>
              <Icon name="plus" size={14} /> Neue Vorlage
            </button>
          </div>

          <Card>
            <CardHeader titel="E-Mail-Vorlagen" sub={`${data.emailVorlagen.length} Vorlagen`} />
            {data.emailVorlagen.length === 0 ? (
              <div className="card-pad">
                <Callout ton="warn" icon="!">
                  Ohne Vorlage kann keine E-Mail vorbereitet werden.
                </Callout>
              </div>
            ) : (
              data.emailVorlagen.map((t) => (
                <div className="list-row" key={t.id}>
                  <span className="tertiary" style={{ display: 'flex' }}>
                    <Icon name="mail" size={17} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{t.name}</strong>
                      <Badge
                        ton={t.anlass === 'ueberfaellig' ? 'red' : t.anlass === 'erinnerung' ? 'orange' : 'blue'}
                      >
                        {EMAIL_ANLASS_LABEL[t.anlass]}
                      </Badge>
                    </div>
                    <div className="small tertiary truncate">{t.betreff}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => setDialog({ template: t })}
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => setLoeschen(t)}
                    aria-label="Vorlage löschen"
                  >
                    <Icon name="loeschen" size={15} />
                  </button>
                </div>
              ))
            )}
          </Card>
        </>
      )}

      {dialog ? (
        <MailVorlagenDialog
          template={dialog.template}
          onSpeichern={(t) => {
            setEmailVorlage(t);
            toast(dialog.template ? 'Vorlage gespeichert.' : 'Vorlage angelegt.');
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {loeschen ? (
        <ConfirmDialog
          titel="Vorlage löschen?"
          text={`„${loeschen.name}“ steht dann in keinem Projekt mehr zur Verfügung.`}
          onConfirm={() => {
            deleteEmailVorlage(loeschen.id);
            toast('Vorlage gelöscht.');
          }}
          onClose={() => setLoeschen(null)}
        />
      ) : null}
    </div>
  );
}

function ListenKarte({
  titel,
  sub,
  spalten,
  hinweise,
  text,
  onLaden,
}: {
  titel: string;
  sub: string;
  spalten: string[];
  hinweise: [string, string][];
  text: string;
  onLaden: () => void;
}) {
  return (
    <Card>
      <CardHeader
        titel={titel}
        sub={sub}
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={onLaden}>
            <Icon name="export" size={13} /> Vorlage herunterladen
          </button>
        }
      />
      <div className="card-pad stack" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          {spalten.map((s) => (
            <span key={s} className="badge">
              {s}
            </span>
          ))}
        </div>
        <dl className="kv kv-breit">
          {hinweise.map(([spalte, erklaerung]) => (
            <div key={spalte} style={{ display: 'contents' }}>
              <dt>{spalte}</dt>
              <dd>{erklaerung}</dd>
            </div>
          ))}
        </dl>
        <p className="small muted">{text}</p>
      </div>
    </Card>
  );
}

/** Beispielwerte für die Vorschau im Editor. */
const BEISPIEL: Record<string, string> = {
  anrede: 'Sehr geehrte Frau Berger,',
  empfaenger: 'Katrin Berger',
  'empfaenger.firma': 'Ingenieurbüro Berger',
  'empfaenger.anschrift': 'Billstraße 88, 20539 Hamburg',
  rolle: 'Fachplaner',
  projekt: 'Ausbaustrecke Nordkreuz',
  'projekt.nummer': '2026-014',
  plan: 'Planverzeichnis Überbau',
  'plan.nummer': 'NK-KIB-PV-001',
  'plan.index': 'C',
  'plan.gewerk': 'KIB',
  'plan.phase': 'Ausführungsplanung',
  planlauf: 'Planlauf NK-KIB-PV-001',
  schritt: 'Fachprüfung',
  soll: '30.09.2026',
  frist: 'in 5 Tagen',
  verzug: '0',
  heute: '15.09.2026',
  absender: 'Planlaufmanagement Nordkreuz',
};

function MailVorlagenDialog({
  template,
  onSpeichern,
  onClose,
}: {
  template?: EmailTemplate;
  onSpeichern: (t: EmailTemplate) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [vorschau, setVorschau] = useState(false);
  const [form, setForm] = useState<EmailTemplate>(
    template ?? {
      id: newId('mail'),
      name: '',
      anlass: 'erinnerung',
      betreff: '[{{projekt.nummer}}] {{schritt}} – {{plan.nummer}}',
      text: `{{anrede}}

zum Planlauf {{plan.nummer}} „{{plan}}“ steht der Schritt „{{schritt}}“ an.
Der Soll-Termin ist der {{soll}} ({{frist}}).

Mit freundlichen Grüßen
{{absender}}`,
    },
  );

  /** Fügt einen Baustein an der Schreibmarke ein. */
  const einfuegen = (schluessel: string) => {
    const feld = textRef.current;
    const baustein = `{{${schluessel}}}`;
    if (!feld) {
      setForm((f) => ({ ...f, text: f.text + baustein }));
      return;
    }
    const start = feld.selectionStart ?? feld.value.length;
    const ende = feld.selectionEnd ?? start;
    const neu = feld.value.slice(0, start) + baustein + feld.value.slice(ende);
    setForm((f) => ({ ...f, text: neu }));
    requestAnimationFrame(() => {
      feld.focus();
      feld.setSelectionRange(start + baustein.length, start + baustein.length);
    });
  };

  const speichern = () => {
    if (!form.name.trim()) {
      toast('Bitte einen Namen angeben.');
      return;
    }
    onSpeichern(form);
    onClose();
  };

  return (
    <Modal
      titel={template ? 'E-Mail-Vorlage bearbeiten' : 'Neue E-Mail-Vorlage'}
      sub="Bausteine werden beim Vorbereiten der E-Mail automatisch befüllt"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={() => setVorschau((v) => !v)}>
            {vorschau ? 'Vorschau ausblenden' : 'Vorschau'}
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={speichern}>
            Speichern
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="form-grid">
          <Field label="Name der Vorlage">
            <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          </Field>
          <Field label="Anlass" hint="Bestimmt, welche Vorlage automatisch vorgeschlagen wird.">
            <Select
              value={form.anlass}
              onChange={(v) => setForm({ ...form, anlass: v as EmailAnlass })}
              options={Object.entries(EMAIL_ANLASS_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="Betreff" full>
            <TextInput value={form.betreff} onChange={(v) => setForm({ ...form, betreff: v })} />
          </Field>
        </div>

        <div>
          <div className="row-between wrap" style={{ marginBottom: 8 }}>
            <h3>Bausteine</h3>
            <span className="small tertiary">Klick fügt den Baustein an der Schreibmarke ein</span>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {PLATZHALTER.map((p) => (
              <button
                key={p.schluessel}
                type="button"
                className="antwort-chip"
                title={p.beschreibung}
                onClick={() => einfuegen(p.schluessel)}
              >
                {p.schluessel}
              </button>
            ))}
          </div>
        </div>

        <Field label="Text" full>
          <TextArea
            value={form.text}
            onChange={(v) => setForm({ ...form, text: v })}
            rows={14}
            inputRef={textRef}
          />
        </Field>

        {vorschau ? (
          <Card>
            <CardHeader titel="Vorschau" sub="mit Beispielwerten eines Planlaufs" />
            <div className="card-pad">
              <div className="small tertiary">Betreff</div>
              <strong>{fuelleVorlage(form.betreff, BEISPIEL)}</strong>
              <pre className="mail-vorschau">{fuelleVorlage(form.text, BEISPIEL)}</pre>
            </div>
          </Card>
        ) : null}
      </div>
    </Modal>
  );
}
