/**
 * Karte „Protokoll“ eines Planlaufs: die Einträge des Änderungsprotokolls
 * (domain/protokoll.ts), neueste zuerst – zunächst die letzten 20, auf Wunsch alle.
 */
import { useState } from 'react';
import type { PlanRun } from '../domain/types';
import { Badge, Card, CardHeader } from '../../../shared/ui';
import { zeitpunktText } from './common';
import './planlauf.css';

const ANZAHL = 20;

export function ProtokollKarte({ run }: { run: PlanRun }) {
  const [alle, setAlle] = useState(false);
  // Neueste zuerst; bei gleichem Zeitpunkt der später geschriebene Eintrag zuerst
  const eintraege = (run.protokoll ?? [])
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.zeitpunkt.localeCompare(a.e.zeitpunkt) || b.i - a.i);
  const sichtbar = alle ? eintraege : eintraege.slice(0, ANZAHL);

  return (
    <Card>
      <CardHeader
        titel="Protokoll"
        sub={
          eintraege.length === 0
            ? 'Noch keine Einträge'
            : `${eintraege.length} ${eintraege.length === 1 ? 'Eintrag' : 'Einträge'} – neueste zuerst`
        }
        actions={
          eintraege.length > ANZAHL ? (
            <button type="button" className="btn btn-sm" onClick={() => setAlle((a) => !a)}>
              {alle ? `Nur die neuesten ${ANZAHL}` : `Alle (${eintraege.length})`}
            </button>
          ) : null
        }
      />
      {sichtbar.map(({ e, i }) => (
        <div className="pl-protokoll-zeile" key={`${e.zeitpunkt}-${i}`}>
          <div className="pl-protokoll-zeit">
            {zeitpunktText(e.zeitpunkt)}
            {e.bearbeiter ? <div>{e.bearbeiter}</div> : null}
          </div>
          <div>
            {e.text}
            {e.quelle === 'import' ? (
              <>
                {' '}
                <Badge>aus Sicherung</Badge>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </Card>
  );
}
