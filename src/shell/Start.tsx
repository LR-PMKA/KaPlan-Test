/** Startbildschirm: Auswahl des Bereichs. */
import { Icon } from '../shared/icons';
import { KaPlanLogo, MailaenderLogo } from '../shared/logos';
import { BEREICHE } from './bereiche';
import { zumBereich } from './router';

export function Start() {
  return (
    <div className="start">
      <div className="start-inner">
        <header className="start-kopf">
          <h1 className="start-marke">
            <KaPlanLogo variante="Startseite" width="100%" />
          </h1>
          <div className="start-logo">
            <MailaenderLogo height={34} />
          </div>
        </header>

        <p className="start-hinweis">Bitte einen Bereich wählen.</p>

        <div className="start-kacheln">
          {BEREICHE.map((b) => (
            <button key={b.id} type="button" className="bereich-kachel" onClick={() => zumBereich(b.id)}>
              <span className="bereich-kachel-bild">
                <Icon name={b.icon} size={64} strokeWidth={1.3} />
                {b.marke ? <span className="bereich-kachel-marke">{b.marke}</span> : null}
              </span>
              <span className="bereich-kachel-inhalt">
                <strong className="bereich-kachel-titel">{b.titel}</strong>
                {b.untertitel ? <span className="bereich-kachel-sub">{b.untertitel}</span> : null}
                <span className="bereich-kachel-text">{b.beschreibung}</span>
                <span className="bereich-kachel-pfeil">
                  <Icon name="chevron" size={16} />
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="start-fuss">
          Die Bereiche arbeiten unabhängig voneinander – jeder mit eigenem Datenbestand und eigenen
          Einstellungen. Daten werden lokal im Browser gespeichert.
        </p>
      </div>
    </div>
  );
}
