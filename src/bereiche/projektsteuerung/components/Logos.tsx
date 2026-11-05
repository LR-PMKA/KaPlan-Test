/**
 * Logos im Kopf von Protokollen und Projektbeteiligtenliste eines Projekts. Ohne eigene Auswahl
 * gelten die Standardlogos; hinzugefügte Bilder werden verkleinert und als
 * Bilddaten im Bestand gespeichert.
 */
import { useRef } from 'react';
import { Icon } from '../../../shared/icons';
import { useToast } from '../../../shared/toast';
import { Card, CardHeader } from '../../../shared/ui';
import { logoQuelle } from '../domain/druck';
import { STANDARD_LOGOS, logosVon } from '../domain/seed';
import { newId, type Logo, type Projekt } from '../domain/types';
import { useStore } from '../store/store';

/** Höhe, auf die Rasterbilder verkleinert werden. */
const LOGO_HOEHE = 240;

function logoLesen(datei: File): Promise<string> {
  return new Promise((aufloesen, ablehnen) => {
    const leser = new FileReader();
    leser.onerror = () => ablehnen(leser.error);
    leser.onload = () => {
      const url = String(leser.result);
      if (datei.type === 'image/svg+xml') {
        aufloesen(url);
        return;
      }
      const bild = new Image();
      bild.onerror = () => ablehnen(new Error('Bild'));
      bild.onload = () => {
        const h = Math.min(LOGO_HOEHE, bild.height);
        const w = Math.round((bild.width * h) / bild.height);
        const flaeche = document.createElement('canvas');
        flaeche.width = w;
        flaeche.height = h;
        flaeche.getContext('2d')?.drawImage(bild, 0, 0, w, h);
        aufloesen(flaeche.toDataURL('image/png'));
      };
      bild.src = url;
    };
    leser.readAsDataURL(datei);
  });
}

export function LogoVerwaltung({ projekt }: { projekt: Projekt }) {
  const { updateProjekt } = useStore();
  const toast = useToast();
  const eingabe = useRef<HTMLInputElement>(null);
  const logos = logosVon(projekt);

  const setzen = (neu: Logo[]) => updateProjekt(projekt.id, { logos: neu });

  const hinzufuegen = async (dateien: File[]) => {
    const neu: Logo[] = [];
    for (const datei of dateien) {
      try {
        neu.push({ id: newId('logo'), name: datei.name.replace(/\.[^.]+$/, ''), src: await logoLesen(datei) });
      } catch {
        toast(`${datei.name} konnte nicht gelesen werden.`);
      }
    }
    if (neu.length === 0) return;
    setzen([...logos, ...neu]);
    toast(neu.length === 1 ? 'Logo hinzugefügt.' : `${neu.length} Logos hinzugefügt.`);
  };

  return (
    <Card>
      <CardHeader
        titel="Logos im Druckkopf"
        sub={`Oben rechts in Protokollen und Beteiligtenliste dieses Projekts – in dieser Reihenfolge${
          projekt.logos === null ? ' (Standardlogos)' : ''
        }`}
        actions={
          <>
            {projekt.logos !== null ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  updateProjekt(projekt.id, { logos: null });
                  toast('Standardlogos wiederhergestellt.');
                }}
              >
                Standardlogos
              </button>
            ) : null}
            <button type="button" className="btn btn-sm btn-outline" onClick={() => eingabe.current?.click()}>
              <Icon name="plus" size={12} /> Logo hinzufügen
            </button>
            <input
              ref={eingabe}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const dateien = [...(e.target.files ?? [])];
                e.target.value = '';
                void hinzufuegen(dateien);
              }}
            />
          </>
        }
      />
      <div className="card-pad">
        {logos.length === 0 ? (
          <p className="small tertiary">
            Keine Logos – der Druckkopf bleibt rechts leer. „Standardlogos“ stellt {STANDARD_LOGOS.map((l) => l.name).join(' und ')} wieder her.
          </p>
        ) : (
          <div className="ps-logo-liste">
            {logos.map((l, i) => (
              <div key={l.id} className="ps-logo">
                <img src={logoQuelle(l.src)} alt={l.name} title={l.name} />
                <button
                  type="button"
                  className="btn-icon"
                  disabled={i === 0}
                  title="Nach links"
                  aria-label="Logo nach links"
                  onClick={() => {
                    const neu = [...logos];
                    [neu[i - 1], neu[i]] = [neu[i], neu[i - 1]];
                    setzen(neu);
                  }}
                >
                  <Icon name="zurueck" size={13} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  title="Logo entfernen"
                  aria-label="Logo entfernen"
                  onClick={() => {
                    setzen(logos.filter((x) => x.id !== l.id));
                    toast('Logo entfernt.');
                  }}
                >
                  <Icon name="loeschen" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
