# KaPlan – Hinweise für die Arbeit am Code

KaPlan ist eine React-19-/TypeScript-/Vite-Anwendung **ohne Server**; alle Daten liegen im
`localStorage` des Browsers. Installierbar als PWA, veröffentlicht über GitHub Pages. Sie besteht
aus drei getrennten Bereichen: **Planlaufmanagement** (`src/bereiche/planlauf/`),
**Baubetriebsplanung** (`src/bereiche/baubetrieb/`, erster Entwurf) und **Projektsteuerung**
(`src/bereiche/projektsteuerung/`, erster Entwurf). Überblick über Aufbau und
Funktionen: `README.md`; belegtes Inventar aller Routen, Aktionen und Meldungen: `docs/INVENTAR.md`.

## Nach jeder Änderung nachziehen

Eine Änderung ist erst fertig, wenn alle betroffenen Dateien zum Code passen:

1. **`README.md`** – Funktionsbeschreibung, Aufbau des Codes, Veröffentlichen.
2. **`docs/INVENTAR.md`** – nur Aussagen, die sich im Code belegen lassen. Vor dem Commit prüfen,
   dass jeder genannte Pfad existiert und jeder zitierte Oberflächentext wörtlich im Code steht.
3. **Weitere relevante Dateien**, insbesondere:
   * Code-Kommentare, die das geänderte Verhalten beschreiben,
   * der Hinweistext in `index.html` (erscheint, wenn der Quellcode statt des Builds ausgeliefert wird),
   * `public/sw.js`: Cache-Namen hochzählen, wenn sich die Hülle ändert (Titel, Symbole, Manifest).

Funktion und Dokumentation werden in getrennten Commits festgehalten.

## Prüfen, bauen, veröffentlichen

```bash
npm ci              # Abhängigkeiten
npm run dev         # Entwicklungsserver, Port 5173
npm run typecheck   # tsc --noEmit – vor jedem Commit
npm run build       # tsc -b && vite build → dist/
```

Tests und Linter gibt es nicht; `typecheck` (strict, `noUnusedLocals`, `noUnusedParameters`) und
`build` sind die einzigen Prüfungen.

`.github/workflows/pages.yml` baut bei jedem Pull Request (nur Prüfung) und bei jedem Push auf
`main`. Auf `main` stellt er den Build über GitHub Pages bereit und legt ihn zusätzlich im Branch
`gh-pages` und im Ordner **`app/`** ab. `app/` ist der eingecheckte Build, auf den die
Wurzel-`index.html` umschaltet, wenn Pages den Zweig selbst ausliefert („Deploy from a branch“).
**`app/` in Feature-Branches nicht von Hand neu bauen** – der Workflow erneuert ihn nach dem Merge;
von Hand gebaute Stände führen nur zu Konflikten zwischen den gehashten Dateinamen. `dist/` ist
ignoriert.

## Aufbau

* `src/shell/` – Startbildschirm und Bereichswahl; die erste Wegmarke der Hash-Adresse
  (`#/planlauf/…`, `#/baubetrieb/…`, `#/projektsteuerung/…`) bestimmt den Bereich. Ein neuer Bereich braucht einen
  Eintrag in `BereichId`/`BEREICHE` (`src/shell/bereiche.ts`) und in `src/shell/Shell.tsx`.
* `src/bereiche/<bereich>/` – in sich geschlossene Bereiche mit eigenem Store, eigenem
  `localStorage`-Schlüssel, eigenen Einstellungen und eigenem Router.
* `src/shared/` – fachfreie Bausteine (UI, Icons, Datumsrechnung, Excel lesen/schreiben, Druck,
  PWA, `global.css` mit den Design-Tokens).
* `src/bereiche/planlauf/`:
  * `domain/types.ts` Datenmodell (flache Listen in `AppData`, Verweise über IDs – außer: Schritte
    nennen ihre Funktion per `roleName`, Gewerke sind Namen; Umbenennungen müssen diese Stellen
    mitziehen),
  * `domain/ablauf.ts` Ablaufverfolgung – **die einzige Stelle, die Ziele auflöst**
    (`nachfolger`, `verfolgen`); Planlauf, Editor, Terminrechnung und Simulation folgen ihr.
    Blockregeln: Schritte bleiben eine flache Liste; ein paralleler Block ist nur der Marker
    `parallel: { block, zweig }`, seine Schritte stehen zusammenhängend und nach `zweig` sortiert
    (`bloeckeOrdnen` stellt das her), Blöcke werden nicht geschachtelt. Ein Ziel im Zweig führt im
    Zweig weiter, außerhalb des Blocks ist es ein Ausstieg, in einem anderen Zweig unzulässig; ein
    Ziel auf einen Blockschritt betritt den ganzen Block,
  * `domain/engine.ts` Soll-Termine ab dem tatsächlichen Eingang (`recalcSollDaten`),
    Rücksprung mit Historie, Ampel, Verzug, gewichteter Fortschritt, To-Dos, Zuständigkeiten,
  * `domain/abschluss.ts` Statuswechsel (`schrittStatusSetzen`), Wieder öffnen, Einfügen,
  * `domain/simulation.ts` Prognose, Basisplan und Rückwärtsrechnung – erledigt die Schritte mit
    `schrittStatusSetzen` und rechnet mit `recalcSollDaten`, also ohne eigene Regeln,
  * `domain/nachweis.ts` Terminnachweis (Verzug gegenüber dem Basisplan je Seite),
  * `domain/protokoll.ts` Änderungsprotokoll: `protokollNachziehen` vergleicht in jedem `mutate()`
    alten und neuen Stand und schreibt je Lauf, was jemand getan hat (nichts Berechnetes),
  * `domain/bestand.ts` Ablauf von `mutate()` (`bestandAendern`), Löschen mit Löschvermerk,
    Sammelaktionen als reine Funktionen,
  * `domain/abgleich.ts` selektiver Abgleich mit einer Sicherung; Verweise zwischen Objekten
    stehen zentral in `VERWEISFELDER`,
  * `domain/terminrechner.ts` Terminrechner über `simulieren`/`rueckwaerts`,
  * `domain/seed.ts` mitgelieferte Funktionen, Standard-Workflows, E-Mail-Vorlagen, Demodaten
    (Läufe über die Engine, zufällige IDs),
  * `store/store.tsx` alle Schreibzugriffe, `store/storage.ts` Laden, Speichern, Migration,
  * `lib/router.ts` Hash-Router, `pages/` Ansichten, `components/` fachliche Bausteine.
* `src/bereiche/baubetrieb/` – gleich aufgebaut: `domain/workflow.ts` Standard-Workflows je Phase
  und Nachschlagen von Status (Anmeldungen verweisen per `statusId` auf einen Status; die
  Workflows liegen im Bestand und sind bearbeitbar), `domain/workflowPflege.ts` Speichern,
  Duplizieren, Löschen von Workflows, `domain/fristen.ts` Fahrplanjahr, Terminfrist, Ampel,
  Anmeldebedarf, `domain/ablauf.ts` Statuswechsel samt Übernahme/Aufteilung, `store/` mit
  eigenem Schlüssel `baubetrieb-planung.data.v1`. Neue Felder dort über `DATEN_VERSION`
  (`baubetrieb/domain/types.ts`) und `migriere()` (`baubetrieb/store/storage.ts`). Die festen IDs
  der Standard-Status nicht ändern – `STATUS_AUS_NUMMER` ordnet ihnen ältere Stände zu.
* `src/bereiche/projektsteuerung/` – gleich aufgebaut, Schlüssel `projektsteuerung.data.v1`:
  `domain/types.ts` Datenmodell (projektübergreifende `Funktion`, `Beteiligter` mit `funktionId`,
  `Protokoll`), `domain/protokoll.ts` Reihen, Folgeprotokoll, Übernahme aus dem Protokoll-Tool und
  `teilnehmerNachziehen` (läuft nach jedem `mutate()` und hält Teilnehmende auf dem Stand der
  Projektbeteiligtenliste), `domain/beteiligteImport.ts` Excel-Import, `domain/punkte.ts` offene
  Aufgaben und Ampel, `domain/druck.ts` Druckfassungen. Eine Liste offener Punkte (LOP) gibt es
  nicht mehr; ältere Bestände verlieren sie beim Laden. Funktionen tragen ein Gewerk (`null` =
  übergreifend); angezeigt wird stets `funktionsName`. Ein Eintrag besteht aus `zeilen`; jede
  Zeile merkt sich ihr Ursprungsprotokoll (`herkunft`, im Druck „aus Prot. 1“). Eine Ergänzung mit
  eigener Art (`Zeile.typ` ≠ `null`) ist ein eigener Punkt unter dem Eintrag mit eigenem `wer`,
  `termin` und `status`; ohne Art läuft sie unter dem Ursprung mit. TOPs, Einträge und Zeilen
  werden standardmäßig gestrichen statt gelöscht (`entfaellt`) und entfallen im Folgeprotokoll;
  erledigte Aufgaben gehen noch einmal mit. Was ins Folgeprotokoll geht, entscheidet allein
  `uebernahme` mit `eintragUebernehmen` (`domain/protokoll.ts`). Eigene
  Gestaltung in `projektsteuerung.css` (Klassen mit Präfix `ps-`, nur Design-Tokens). Neue Felder
  über `DATEN_VERSION` (`projektsteuerung/domain/types.ts`) und `migriere()`
  (`projektsteuerung/store/storage.ts`). IDs, die die Oberfläche braucht (Fokus, Navigation),
  vor `mutate()` erzeugen – im StrictMode läuft die Änderungsfunktion doppelt.

## Randbedingungen

* `src/shared/` enthält nur Bausteine ohne fachlichen Bezug und importiert nichts aus
  `src/bereiche/`. Die Bereiche greifen nicht aufeinander zu.
* **Schreibzugriffe nur über den Store.** Jede Änderung läuft über `mutate()` in
  `store/store.tsx`, das `bestandAendern` (`domain/bestand.ts`) aufruft: danach werden
  automatisch `eigeneKontakteSichern`, `zustaendigkeitenNachziehen` und `recalcRun` für alle
  Läufe ausgeführt, `protokollNachziehen` schreibt das Änderungsprotokoll und `geaendertAm` wird an
  geänderten Projekten, Einträgen, Kontakten, Funktionen und Workflows gesetzt (beides entfällt
  mit `mutate(fn, { protokoll: false })`). `fn` erhält `{ zeitpunkt, heute, bearbeiter }`. Neue
  Aktionen als Methode im `StoreValue` ergänzen, nicht an `mutate` vorbei, und möglichst in einem
  einzigen `mutate`. IDs mit `newId(prefix)`.
* Status und Ist eines Schritts nur über `domain/abschluss.ts` ändern (`schrittStatusSetzen`,
  `wiederOeffnen`, `aenderungenAufLauf`) – dort entstehen Historie, Rücksprung und die
  Momentaufnahme der Person. Der feste Eingang `eingangIst` wird beim Anstehen festgeschrieben und
  danach von der Fristenrechnung nicht mehr geändert, nur noch ausdrücklich.
* Wer löscht, hinterlässt einen Löschvermerk in `AppData.geloescht` (`loeschvermerk` bzw. die
  Löschfunktionen in `domain/bestand.ts`) – der Abgleich braucht ihn. Neue Verweisfelder in `VERWEISFELDER`
  (`domain/abgleich.ts`) eintragen.
* Gespeichert wird nur bei `ladeZustand === 'ok'`: Nach einem Ladefehler oder bei einem Stand aus
  einer neueren Fassung zeigt der Bereich Demodaten und lässt den gespeicherten Stand unberührt.
  Vor jeder Umstellung legt `ladeDaten` eine Rohkopie `<Schlüssel>.vor-fassung-<n>` an.
* Der localStorage-Schlüssel `planlauf-management.data.v1` bleibt unverändert. Neue Felder am
  Datenmodell sind optional oder werden in `migriere()` (`store/storage.ts`) nachgetragen – dann
  **`DATEN_VERSION`** (`domain/types.ts`) erhöhen: `migriere()` läuft nur, wenn die gespeicherte
  Fassung abweicht, und hebt jeden älteren Stand in einem Schritt auf die aktuelle.
* Mitgelieferte Stammdaten geändert (`STANDARD_ROLLEN`, `STANDARD_TEMPLATES` in `seed.ts`)?
  **`STAMMDATEN_VERSION`** erhöhen, damit vorhandene Bestände sie übernehmen
  (`stammdatenAktualisieren`). Achtung: Das ersetzt alle Standard-Workflows samt Änderungen der
  Nutzer, überschreibt Funktionen gleichen Namens und Gewerks und stellt gelöschte mitgelieferte
  Funktionen (auch in Projekten) wieder her.
* `window.planlaufGestartet` nicht umbenennen – `index.html` und `app/index.html` rufen ihn auf.
* Ob ein Eintrag einen eigenen Planlauf hat, entscheidet allein `hatEigenenPlanlauf`
  (`domain/types.ts`): Planverzeichnisse laufen gebündelt oder mit Plänen einzeln, Pläne lassen
  sich herauslösen und wieder bündeln.
* Neue Route: Typ `Route` sowie `routeToHash`/`hashToRoute` in `lib/router.ts` erweitern und in
  `App.tsx` rendern. Frühere Adressen bleiben per Umleitung gültig.
* Keine neuen Laufzeitabhängigkeiten ohne Rückfrage – Router, Excel-Import/-Export, PDF-Druck und
  Icons sind bewusst selbst geschrieben; Laufzeitabhängigkeiten sind nur `react`/`react-dom`.
* Gestaltung über die Design-Tokens in `src/shared/global.css`; die Oberfläche bleibt bis etwa
  400 px Breite bedienbar, der Farbmodus `kontrast` muss weiter funktionieren.
* Sprache in Oberfläche, Bezeichnern, Kommentaren und Commit-Nachrichten ist Deutsch.

## Hinweise für Prüfungen im Browser

* Die anstehenden Schritte eines Laufs folgen dem Verlauf (`aktuelleSchritte`, `verfolgen` in
  `domain/ablauf.ts`), nicht der Reihenfolge im Array – in parallelen Zweigen stehen mehrere an.
  Wer Testdaten vorbereitet, muss den Schritt auf dem Pfad ändern. Die Demodaten haben zufällige
  IDs.
* Nach dem Schreiben in den `localStorage` die Seite neu laden (`reload`) – ein Wechsel nur im
  Hash lädt nicht neu, und der laufende Store überschreibt die Änderung.
* Hilfsserver über ihre Prozessnummer beenden, nicht mit `pkill -f "<Befehl>"`: Das Muster trifft
  auch die eigene Shell, deren Befehlszeile denselben Text enthält.
