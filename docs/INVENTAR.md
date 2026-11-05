# Inventar der Anwendung

Stand: Analyse des Quellcodes im Repository `Mailander-Consult-GmbH/MC-Plan`
(Zweig `main`). Es sind ausschließlich Sachverhalte
aufgeführt, die sich im Code belegen lassen; Dateipfade verweisen auf die
jeweilige Fundstelle.

## 1. Zweck der Anwendung

**KaPlan** besteht aus den Bereichen **Planlaufmanagement**,
**Baubetriebsplanung** und **Projektsteuerung**; die beiden letzten liegen als
erster Entwurf vor. Die Abschnitte 1 bis 6 beschreiben das
Planlaufmanagement, Abschnitt 7 die Baubetriebsplanung, Abschnitt 8 die
Projektsteuerung.

Der Bereich verwaltet die Planläufe von Bauprojekten: Zu
jedem Plan bzw. Planverzeichnis wird ein Workflow (Prozesskette) gestartet,
dessen Schritte Soll-Termine, eine zuständige Funktion und eine Person tragen
(`src/bereiche/planlauf/domain/engine.ts`, `src/bereiche/planlauf/domain/types.ts`).
Ein Planverzeichnis durchläuft den Planlauf entweder **gebündelt** – das
Verzeichnis hat den Lauf, seine Pläne laufen mit – oder mit **Plänen einzeln**,
dann hat jeder Plan einen eigenen Lauf und das Verzeichnis ordnet nur
(`planlaufModus`; ohne Angabe gilt gebündelt). Einzelne Pläne eines
gebündelten Verzeichnisses lassen sich nachträglich herauslösen
(`eigenerLauf`), Pläne mit eigenem Lauf wieder bündeln (`planeBuendeln`). Welcher Eintrag einen eigenen Lauf hat, entscheidet allein
`hatEigenenPlanlauf` in `types.ts`. Den Weg durch einen Workflow – samt
parallelen Blöcken, Ausstiegen und Rücksprüngen – bestimmt allein die
Ablaufverfolgung in `src/bereiche/planlauf/domain/ablauf.ts` (`nachfolger`,
`verfolgen`). Die Anwendung rechnet aus den Fristen je Schritt die
Soll-Termine ab dem tatsächlichen Eingang (`recalcSollDaten` in `engine.ts`),
überwacht sie mit einer Ampel (im Plan / fällig / überfällig), schätzt das Ende
eines Laufs (`prognose` in `src/bereiche/planlauf/domain/simulation.ts`), weist
den Verzug gegenüber dem Basisplan je Seite nach
(`terminnachweis` in `src/bereiche/planlauf/domain/nachweis.ts`) und bereitet
Erinnerungen als E-Mail für Outlook vor (`ampelFuerSchritt`,
`src/bereiche/planlauf/components/EmailDialog.tsx`). Sie läuft vollständig im
Browser: Der gesamte Bestand liegt in `localStorage`, ein Server wird nicht
angesprochen (`src/bereiche/planlauf/store/storage.ts`).

## 2. Routen und Seiten

Die Anwendung besteht aus drei getrennten Bereichen. Die erste Wegmarke der
Adresse benennt den Bereich; die Shell (`src/shell/router.ts`) wählt danach
aus, welcher Bereich geladen wird: `#/` zeigt die Bereichsauswahl
(`src/shell/Start.tsx`: drei hochkante Kacheln nebeneinander – Planlaufmanagement,
Baubetriebsplanung und Projektsteuerung, die beiden letzten mit dem Kennzeichen
„Erster Entwurf“ aus `marke` in
`src/shell/bereiche.ts`), `#/planlauf/…` das Planlaufmanagement,
`#/baubetrieb/…` die Baubetriebsplanung (Abschnitt 7), `#/projektsteuerung/…` die
Projektsteuerung (Abschnitt 8). Innerhalb des Bereichs adressiert ein Hash-Router ohne
Bibliothek (`src/bereiche/planlauf/lib/router.ts`); unbekannte Adressen führen
auf die Übersicht. Adressen aus der Fassung ohne Bereiche (`#/dashboard`,
`#/projekt/<id>/<reiter>` …) werden beim Aufruf auf `#/planlauf/…` umgelenkt
und bleiben damit als Lesezeichen gültig.

### 2.1 Hauptrouten

| Route | Seite | Aktionen |
| --- | --- | --- |
| `#/planlauf` bzw. `#/planlauf/dashboard` | Übersicht (`src/bereiche/planlauf/pages/Dashboard.tsx`) | Vier Kacheln: Laufende Planläufe, To-Dos (Planlaufmanagement), Überfällige Schritte, Demnächst fällig – die beiden letzten führen per Klick auf `#/planlauf/fristen`. Tabelle „Meine To-Dos“ mit Schritt, Gewerk, Projekt, Soll-Termin, Status, Erinnerungs-Mail und Erledigt-Haken. Tabelle „Projekte“ mit Anzahl Pläne/Verzeichnisse, laufenden Planläufen, demnächst fällig, überfällig, Fortschrittsbalken und „Projekt öffnen“. Angezeigt werden markierte Projekte; ohne Markierung alle (`sichtbareProjekte`). |
| `#/planlauf/fristen` | Fristen & Erinnerungen (`src/bereiche/planlauf/pages/Fristen.tsx`) | Alle anstehenden Schritte über alle Projekte – bei parallelen Zweigen mehrere je Planlauf (`offeneFristen` in `engine.ts`) –, gegliedert nach Projekt; je Schritt „E-Mail vorbereitet am …“, wenn schon erinnert wurde. Filter Alle / Überfällig / Fällig / Im Plan mit Zählern, Suche über Schritt, Planlauf, Projekt, Funktion, Nachname und Firma. Je Zeile: Planlauf öffnen, Erinnerungs-Mail vorbereiten, Schritt als erledigt setzen. Kein Eintrag in der Seitenleiste – erreichbar über die Kacheln der Übersicht. |
| `#/planlauf/projekte` | Projekte (`src/bereiche/planlauf/pages/Projekte.tsx`) | Projektliste mit Suche über Name, Nummer und Beschreibung; Projekt anlegen (übernimmt alle projektübergreifenden Funktionen als Projektfunktionen), bearbeiten, mit ★ markieren bzw. Markierung aufheben, Projekt öffnen. |
| `#/planlauf/ketten` | Workflows (`src/bereiche/planlauf/pages/Workflows.tsx`) | Karten unter „Projektübergreifende Workflows“ (Projektvarianten erscheinen nur im Reiter „Workflows“ ihres Projekts), je Karte Kennzeichen „Standard“, „Eigener Workflow“ oder „Projektvariante“, Zahlen und die Punktkette des Standardverlaufs (`AblaufVorschau` in `src/bereiche/planlauf/components/AblaufVorschau.tsx`); „Neuer Workflow“, „Öffnen“, „Duplizieren“, Löschen. „Öffnen“ startet den Workflow-Editor (`src/bereiche/planlauf/components/WorkflowEditor.tsx`, Logik in `src/bereiche/planlauf/domain/workflowGraph.ts`): Spalten „Standardverlauf“ und „Abweichungen“ mit Karten von „Planlauf starten“ bis „Planlauf beenden“, „Rücksprung“-Kennzeichen, „+“ („Schritt hier einfügen“), „Schritt hinzufügen“, Rückgängig/Wiederholen (Strg+Z/Strg+Y), „Übersicht“. „Schrittdetails“ je Schritt: Bezeichnung, Art (Aufgabe / Entscheidung), „Verantwortliche Funktion“, Frist, „Nachweis bei Abschluss“, „Weiter mit“ bzw. Antworten mit „→ Weiter mit“ und „Als Standardverlauf“, „E-Mail nach Abschluss“ samt Vorlage und „Anliegen in der Versandmail“ (keins / Freigabe / Vorprüfung / Prüfung / Genehmigung, `ANLIEGEN_OPTIONEN` und Feld `versandAnliegen` in `src/bereiche/planlauf/domain/types.ts`; dieselbe Auswahl in „Schritt anpassen“ des Planlaufs, `PlanlaufDetail.tsx`), „Im Standardverlauf“ früher/später (`imVerlaufVerschieben`), „Duplizieren“, „Entfernen“ (Verweise gehen an das Standardziel, `entfernen`). Hinweise in der Fußzeile aus `pruefen`; wer mit Änderungen schließt, erhält „Änderungen verwerfen?“. Parallele Blöcke: Containerkarte „Parallel · … Zweige“ mit „Weiter, wenn alle Zweige erledigt sind“, „Abweichungen im Zweig“ und „Ausstieg aus dem Block“; angelegt über „Schritt hinzufügen“ → „Parallele Zweige“ oder in den Schrittdetails „Parallel dazu ausführen“, gelöst über „Aus dem Block lösen“; Blöcke lassen sich nicht schachteln. Benennen im Abschnitt „Parallel“ der Schrittdetails mit „Name des Blocks“ und „Name des Zweigs“ (`blockBenennen`, `zweigBenennen` in `workflowGraph.ts`; Tippen zählt für Rückgängig als ein Schritt); ein Klick auf den Kopf der Containerkarte wählt den ersten Schritt des Blocks und fokussiert „Name des Blocks“. Ein benannter Block heißt „… · parallel, … Zweige“ (`blockTitel` in `ablauf.ts`), Zweigköpfe zeigen den Namen, sonst „Zweig …“ (`zweigTitel`). Die Namen stehen am Marker jedes Schritts (`name`, `zweigName` in `Parallel`, `src/bereiche/planlauf/domain/types.ts`); `namenVereinheitlichen` in `ablauf.ts` gleicht sie beim Ordnen der Blöcke an, `bereinigen` kürzt sie beim Speichern. Die Standard-Workflows benennen ihre Blöcke „Prüfung“, „Versand“ und „Postversand“ samt Zweigen (`BLOCK_NAMEN` in `seed.ts`). Je Antwort der Haken „führt zu Nacharbeit“. Ändert eine Umstellung den Anschluss hinter einem Block, meldet der Editor das (`bloeckeOrdnenMitHinweis` in `ablauf.ts`). |
| `#/planlauf/rollen` | Funktionen (`src/bereiche/planlauf/pages/Funktionen.tsx`) | Projektübergreifende Funktionen, gegliedert in „Übergreifend“ und je Gewerk. Neue Funktion anlegen (Bezeichnung, Kürzel, Farbe, Gewerk, Beschreibung), vorhandene Funktion eines anderen Gewerks übernehmen, bearbeiten, löschen. Über das **+** an den Reitern entsteht ein Gewerk, über „Gewerk … löschen“ am Seitenende entfällt es. Feld „Seite für den Verzug“ (Planer, Prüfer, Auftraggeber, PLM oder „nicht festgelegt“; `SEITE_LABEL` in `types.ts`, Auswahl in `src/bereiche/planlauf/components/SeiteAuswahl.tsx`), bei neuen Funktionen vorbelegt aus der Bezeichnung (`seiteAusFunktion`); Abzeichen in der Liste, „Seite offen“ ohne Seite. |
| `#/planlauf/terminrechner` | Terminrechner (`src/bereiche/planlauf/pages/Terminrechner.tsx`, Logik in `src/bereiche/planlauf/domain/terminrechner.ts`) | Menüpunkt „Terminrechner“ unter „Projekte“. „Richtung“: „Rückwärts“ („Termin auf der Baustelle → späteste Übergabe des Planers“ bzw. „Termin auf der Baustelle → spätester Start des Planlaufs“) oder „Vorwärts“ („Eingang der Planung → Ende des Planlaufs“ bzw. „Start des Planlaufs → Ende des Planlaufs“) – Anker ist die Übergabe des Planers, wenn der Workflow mit „Eingang PLM“ beginnt, sonst der Start. Eingaben: Projekt (Arbeitstage, Feiertage; „Ohne Projekt: Mo–Fr, ohne Feiertage“), Workflow (übergreifend und Projektvarianten), Datum, Fristen, „Szenario“ („Antwort je Entscheidung im ersten Durchlauf; Vorgabe ist der Standardverlauf.“) und „Zielschritt“ (Vorgabe „Ende des Planlaufs“). Gerechnet wird über `simulieren` bzw. `rueckwaerts` in `simulation.ts`, also mit denselben Regeln wie im Planlauf. „Zwischenergebnisse“ mit Schritt, Funktion, Frist, Eingang, Fristende und Puffer, auf dem kritischen Weg „spätestens“; Schritte in Zweigen mit „Zweig … von …“, bei benannten Zweigen mit dem Namen davor (`zweigKennung`); Druck über `src/shared/print.ts`. Zustände: „Noch kein Datum“, „Kein Workflow vorhanden“, „Der Workflow enthält keine Schritte“, „Das Datum ist ungültig.“, Schleife („Der Ablauf endet in diesem Szenario in einer Schleife – Terminrechnung nicht möglich.“), Grenze („Der Ablauf kommt auch nach 500 Abschlüssen nicht zum Ende – Terminrechnung abgebrochen.“, `SIMULATION_GRENZE`), Zielschritt nicht erreicht, Übergabe bzw. Start vor heute (frühestes Ende bei Übergabe bzw. Start heute) und „Das eingegebene Datum liegt vor heute – gerechnet wird trotzdem ab diesem Tag.“ |
| `#/planlauf/vorlagen` | Vorlagen (`src/bereiche/planlauf/pages/Vorlagen.tsx`) | Reiter **E-Mail-Texte**: Vorlagen anlegen, bearbeiten, löschen; Editor mit Bausteinen aus `PLATZHALTER` (`src/bereiche/planlauf/domain/email.ts`) und Vorschau mit Beispielwerten; Anlass je Vorlage (Erinnerung, Mahnung, Freigabe, Übergabe, Allgemein). Reiter **Excel-Vorlagen**: Vorlagen „Planliste“ und „Funktion“ als `.xlsx` herunterladen, mit Spaltenerläuterung. |
| `#/planlauf/projekt/<id>/<reiter>` | Projektarbeitsbereich (`src/bereiche/planlauf/pages/ProjektDetail.tsx`) | Reiter siehe 2.2. Frühere Adressen werden umgeleitet: `planlaeufe` → `plaene`, `pakete` → `plaene`, `adressbuch` → `rollen`. |
| `#/planlauf/projekt/<id>/planlauf/<runId>` | Planlauf (`src/bereiche/planlauf/pages/projekt/PlanlaufDetail.tsx`) | Siehe 2.3. |

### 2.2 Reiter im Projekt

| Reiter | Seite | Aktionen |
| --- | --- | --- |
| `uebersicht` | Planläufe – Reiterbezeichnung „Planläufe“ (`src/bereiche/planlauf/pages/projekt/Uebersicht.tsx`, Liste in `src/bereiche/planlauf/components/PlanlaufListe.tsx`) | Kennzahlen (Planpakete, Planverzeichnisse, Pläne – je ein Klick führt auf die Planliste –, fällige und überfällige Schritte) und Gesamtfortschritt. Liste der Planläufe, gegliedert nach Planpaketen, je Eintrag in der Spalte „Aktueller Stand“ mit dem zuletzt erledigten Schritt vor dem offenen – übersprungene Schritte zählen nicht, nach dem Wiederöffnen eines früheren Schritts also nie ein späterer – und darunter in Grau seinem Ist-Datum („ohne Datum“, wenn keines eingetragen ist; `letzterAbgeschlossenerSchritt` in `src/bereiche/planlauf/domain/uebersicht.ts`), in der Spalte „Nächster Schritt“ mit dem offenen Schritt: Gliederung umschalten („Planpakete“ / „+ Pläne & Verzeichnisse“), Pakete und Planverzeichnisse am Pfeil auf- und zuklappen (Verzeichnisse zunächst zugeklappt; der Pfeil steht vor Symbol und Titel, sodass Pläne und Verzeichnisse auf einer Linie beginnen), Suche, Filter in den Spaltenüberschriften (Gewerk, Zuständig, Status – einschließlich „Angekündigt“), Sortierung je Spalte („Aktueller Stand“ nach dem Datum des zuletzt erledigten Schritts), Erinnerungs-Mail, Erledigt-Haken, Planlauf öffnen, „Export“ (`ExportDialog.tsx`, siehe `einstellungen`; bei gesetztem Filter sind die gezeigten Einträge vorgewählt – „Vorgewählt sind die Einträge, die der Filter im Reiter „Planläufe“ zeigt.“). Welche Läufe die Liste zeigt und wie sie sie gliedert, legen `massgeblicheLaeufe`, `gliederungBilden` und `knotenBilden` in `uebersicht.ts` fest – dieselben Funktionen gliedern den Export. Die Bezeichnung steht gelb, solange „Eingang PLM“ aussteht – diese Läufe tragen den Status „Angekündigt“, ist der Eingang überfällig jedoch „Überfällig“; Filter und Sortierung folgen derselben Regel –, und grün, wenn der Lauf abgeschlossen ist. Unter einem gebündelten Verzeichnis stehen seine Pläne mit „läuft im Planlauf des Verzeichnisses mit“ – solange der Verzeichnislauf läuft, mit der Schaltfläche „Herauslösen …“ (`planHerausloesen`; die Liste bleibt danach stehen) –, herausgelöste Pläne dagegen mit ihrem eigenen Schritt und Status. Ein Verzeichnis mit Plänen einzeln erscheint als Zeile „… · Pläne einzeln“ ohne eigenen Lauf, mit der Zahl seiner laufenden Pläne, dem aus ihnen zusammengefassten Fortschritt und Status (wie ein Planpaket) und der Schaltfläche „Bündeln …“; seine Pläne stehen darunter. Abgebrochene Läufe – ersatzlos wie durch neuen Index ersetzt – stehen gesammelt am Ende unter der zunächst zugeklappten Zeile „Abgebrochen · … Planläufe“, ausgegraut ohne Schritt, Fortschritt und Schaltflächen, mit dem Index des abgebrochenen Laufs, „Abgebrochen am …“ und dem Zusatz *ersatzlos* bzw. *ersetzt durch Index …*. Aufgeteilte bzw. wieder gebündelte Läufe erscheinen dort nicht (`laufUeberfuehrt` in `engine.ts`). Fortschrittsbalken stehen immer in der Hausfarbe; der Fortschritt ist nach Fristen gewichtet und schließt die laut Prognose noch ausstehenden Ausführungen ein (`fortschritt` in `engine.ts`, Mittel in `mittlererFortschritt`). Nach einem Rücksprung nennt „Aktueller Stand“ den zuletzt bis zum Wiedereingang erledigten Schritt. Stehen in parallelen Zweigen mehrere Schritte an, zeigt die Zeile den führenden mit „+… parallel“ (`src/bereiche/planlauf/components/common.tsx`); Erinnerungs-Mail und Erledigt-Haken fragen dann nach dem Schritt („… Schritte stehen an – welcher ist erledigt?“), Status, Filter und Suche berücksichtigen alle anstehenden Schritte. **Mehrfachauswahl:** Kästchen-Spalte – Planpaket, „Ohne Planpaket“, Verzeichnis und Kopfzeile wählen ihren Inhalt dreistufig, abgebrochene Läufe sind nicht wählbar; Aktionsleiste („Aktionen für die Auswahl“, „… ausgewählt“) mit „Schritte erledigen …“ (`src/bereiche/planlauf/components/SammelErledigen.tsx`: Ist-Datum, erledigt oder übersprungen, je Lauf die anstehenden Schritte, gemeinsame Antwort und Nachweis-Nr. für gleichnamige Schritte, Vorschau mit Rücksprüngen und Abschlüssen, danach Ergebnis und auf Wunsch „E-Mail senden“; Store `schritteAbschliessen`), „Erinnern …“ (`src/bereiche/planlauf/components/SammelErinnern.tsx`: eine Zeile je Person mit Outlook, Web, Kopieren und „Kopieren (formatiert)“), „Versandmail …“ (dieselbe Komponente mit `art="versand"`, Titel „Versandmail“: je Empfänger und Anliegen eine E-Mail mit der Vorlage „Versand“ über alle gewählten Pläne am Versandschritt – `versandPosten` in `src/bereiche/planlauf/domain/email.ts`: steht ein Versandschritt an, sind die Zuständigen der Schritte danach Empfänger, steht ein Schritt direkt nach einem erledigten Versandschritt an, dessen Zuständige; vermerkt wird am anstehenden Schritt; Läufe ohne Versandschritt nennt „Ohne Versandschritt und hier außen vor: …“), „Exportieren …“ („Vorgewählt ist Ihre Auswahl im Reiter „Planläufe“.“) und „Auswahl aufheben“. Vor den Aktionen wird die Auswahl in Planläufe aufgelöst; ein mitlaufender Plan wirkt auf den Lauf seines Verzeichnisses. |
| `plaene` | Planliste (`src/bereiche/planlauf/pages/projekt/Plaene.tsx`) | Alle Pläne und Planverzeichnisse mit laufender Nummer, Art, Bezeichnung/Titel, Gewerk, zugehörigem Planverzeichnis und Eingang Soll, gegliedert nach Planpaketen: je Paket eine Kopfzeile mit Name, Kurzzeichen, Gewerk und Zahl der angezeigten Einträge samt eingerückter Pläne („noch nichts zugeordnet“ bei leeren Paketen) – der Pfeil klappt sie zu, ein Klick öffnet das Paket –, danach die Einträge ohne Paket, sobald Pakete angezeigt werden unter „Ohne Planpaket · …“ (gleich gezählt). Leere Pakete erscheinen ohne Suche und Filter bzw. wenn Name, Kurzzeichen oder Gewerk zur Suche passen; die Suche erfasst auch den Paketnamen. Die Schaltflächen über der Liste brechen auf schmalen Bildschirmen um. „Neues Planpaket“ und die Kopfzeilen öffnen den Paketdialog (`src/bereiche/planlauf/components/PaketDialog.tsx`): Name, Kurzzeichen, Gewerk, Bemerkung, Löschen mit Rückfrage – die Einträge bleiben mit ihren Planläufen erhalten und verlieren ihre Paketzuordnung (`deleteDocument`) –, beim Bearbeiten außerdem „Inhalt“ (mit dem Hinweis „gilt sofort“) mit „Entfernen“ je Eintrag und „Hinzufügen:“ für Planverzeichnisse und Pläne ohne Verzeichnis und ohne (noch vorhandenes) Paket; Pläne eines Verzeichnisses folgen dessen Paket (`paketVon` in `uebersicht.ts`). Reines Ordnungsmerkmal ohne Einfluss auf Planläufe. Pläne eines Planverzeichnisses stehen unter ihm, mit Symbol, Art und Titel eingerückt; der Pfeil zum Auf- und Zuklappen steht zwischen Nummer und Symbol (zunächst aufgeklappt). Ist das Verzeichnis ausgefiltert, stehen seine Pläne für sich. Filter (Alle / Pläne / Verzeichnisse), Suche, Sortierung je Spalte. Einträge, deren Planlauf noch beim Schritt „Eingang PLM“ steht, tragen eine gelbe Bezeichnung und das Kennzeichen „Angekündigt“; bei abgeschlossenen Läufen steht die Bezeichnung grün. Kennzeichen „Pläne einzeln“ an Verzeichnissen mit Einzelläufen, „eigener Lauf“ an herausgelösten Plänen eines gebündelten Verzeichnisses. Eintrag anlegen (startet zugleich den Planlauf, sofern der Eintrag einen eigenen hat; „Ablauf dieses Planlaufs“ zeigt den gewählten Workflow, „Individueller Workflow“ öffnet den Workflow-Editor nur für diesen Lauf, Kennzeichen „Individuell angepasst“, „Auf Workflow zurücksetzen“ – `LaufSchritte` in `AblaufVorschau.tsx`), bearbeiten, löschen – beim Löschen eines gebündelten Verzeichnisses bleiben seine Pläne als Einzelpläne im Paket des Verzeichnisses, mitlaufende führen den Stand des Verzeichnislaufs in einem eigenen Lauf weiter (`deleteDocument` mit `laufUebernehmen`); Planverzeichnis oder Planpaket direkt aus den Auswahlfeldern neu anlegen – ein so angelegtes Planverzeichnis fragt „Codierung“ und „Titel“ ab (ohne Titel gilt die Codierung als Titel); sein Planlauf startet mit „Anlegen und Planlauf starten“ des Plans nach dem Workflow im Dialog, der Hinweis „Das Planverzeichnis „…“ hat noch keinen Planlauf.“ steht darüber (`verzeichnisOhneLauf`; gilt für jedes gebündelte Verzeichnis, das noch nie einen Lauf hatte). Bei „Abbrechen“ oder Wahl eines anderen Verzeichnisses entfällt das angelegte Verzeichnis wieder. Excel-Import (`PlaeneImport.tsx`): jede Zeile erhält ihren eigenen Eintrag; jeder Eintrag mit eigenem Planlauf – auch ohne Codierung, ein beim Import neu angelegtes Verzeichnis und ein vorhandenes gebündeltes Verzeichnis, das noch nie einen Lauf hatte – startet ihn sofort, nach dem Workflow der Spalte „Workflow“, sonst nach dem unter „Workflow für Einträge ohne Angabe“ gewählten (`planlaufAusWorkflow` in `engine.ts`). Pakete und Verzeichnisse werden je Art über Codierung bzw. Kurzzeichen oder Titel gefunden, auch in derselben Datei; ein neu angelegtes Verzeichnis übernimmt das früheste Eingang Soll seiner Pläne. Die Nummer eines Planverzeichnisses heißt „Codierung“ (`NUMMER_LABEL` in `types.ts`). Einträge, deren Lauf durch einen neuen Index ersetzt oder ersatzlos abgebrochen wurde, tragen einen grauen Zusatz; aufgeteilte bzw. wieder gebündelte Läufe zählen nicht als Abbruch. Im Dialog eines Planverzeichnisses: Haken „Pläne einzeln durch den Planlauf führen“ – frei wählbar, solange weder das Verzeichnis noch seine Pläne einen Lauf haben – und bei laufendem gebündeltem Lauf „Alle Pläne einzeln weiterführen …“ (`verzeichnisAufteilen`). Im Dialog eines mitlaufenden Plans: „Aus dem Verzeichnislauf herauslösen …“ (`planHerausloesen`). Haben Pläne des Verzeichnisses einen eigenen Lauf, bietet der Verzeichnis-Dialog „Pläne wieder bündeln …“: Der Dialog (`src/bereiche/planlauf/components/BuendelnDialog.tsx`) listet diese Pläne mit Haken, aktuellem Schritt und Fortschritt; die angekreuzten kehren in einen gemeinsamen Verzeichnislauf zurück (`planeBuendeln`), ihre eigenen Läufe enden mit der Abbruchart `gebuendelt`, nicht angekreuzte behalten ihren Lauf. Läuft das Verzeichnis noch, übernehmen sie dessen Stand – ein Plan, der weiter ist, wird mit „weiter als das Verzeichnis – fällt zurück“ gekennzeichnet. Ist es aufgeteilt, entsteht ein neuer Verzeichnislauf; sein Stand wird unter „Stand des Verzeichnislaufs übernehmen von“ gewählt, vorgeschlagen ist der am wenigsten weit gediehene Plan. In beiden Fällen übernimmt der Plan den Stand des Verzeichnislaufs – erledigte Schritte bleiben erledigt, Start und Termine laufen weiter (`laufUebernehmen` in `engine.ts`); der gebündelte Lauf endet beim Aufteilen mit der Abbruchart `aufgeteilt`. Ein Plan, der schon einen eigenen Lauf hat, behält ihn beim Verschieben in ein anderes Verzeichnis. „Angekündigt“ prüft alle anstehenden Schritte. Läuft ein Plan im Lauf seines Verzeichnisses mit, nennt der Dialog zu „Eingang Soll“: „Der Plan läuft im Planlauf seines Verzeichnisses mit – maßgeblich ist das Eingang Soll des Verzeichnisses.“ **Mehrfachauswahl:** Kästchen-Spalte (ein Verzeichnis wählt sich samt seinen sichtbaren Plänen; Paketzeile, „Ohne Planpaket“ und Kopfzeile wählen ihren Inhalt; was Suche oder Filter ausblenden, fällt aus der Auswahl) mit Aktionsleiste „… ausgewählt“: „Planpaket zuweisen …“ (`dokumentePaketZuweisen`, auch „– keinem Paket –“; Pläne folgen dem Paket ihres Verzeichnisses), „Neues Planpaket aus Auswahl …“ (PaketDialog mit `paketAusAuswahl`, das kein leeres Paket anlegt), „Gewerk/Planungsphase …“ (`dokumenteAendern`, „Leer lassen = unverändert“), „Löschen …“ (`dokumenteLoeschen`; die Rückfrage nennt Verzeichnisse mit oder ohne ihre Pläne, die Zahl der Planläufe samt denen mit Ist-Daten bzw. Protokoll und die künftigen Einzelpläne, mit „Sicherung vorher herunterladen“) und „Auswahl aufheben“ – Dialoge in `src/bereiche/planlauf/components/PlanlisteAktionen.tsx`. Auch „Hinzufügen“ und „Entfernen“ im Paketdialog laufen über `dokumentePaketZuweisen`. |
| `rollen` | Funktion (`src/bereiche/planlauf/pages/projekt/RollenFunktionen.tsx`) | Nach Gewerken gegliedert („Übergreifend“ + je Gewerk, **+** für ein weiteres Gewerk, „Gewerk … löschen“ am Seitenende). Je Funktion die Besetzung mit einer Person samt Adressdaten und den Feldern „SharePoint-Link Eingang“ und „SharePoint-Link Ausgang“ (`sharepointEingang`, `sharepointAusgang` an `Contact`; in der Liste als kleine Links „SharePoint Eingang“ / „SharePoint Ausgang“): Funktion anlegen, bearbeiten, löschen; Besetzung setzen, wechseln, aufheben – von der Funktion aus (Person übernehmen oder neu erfassen) oder über „Person hinzufügen“ von der Person aus (Funktion optional gleich mitwählen). Suche über Funktion, Person und Firma; Personen ohne Funktion in einer eigenen Liste, je Zeile bearbeiten und löschen (Rückfrage „Person löschen?“); das Planlaufmanagement wird nicht angezeigt (immer die angemeldete Person); Excel-Import (`RollenImport.tsx`), der fehlende Gewerke und Funktionen anlegt; die optionale Spalte „Seite“ setzt die Seite für den Verzug, die Spalten „SharePoint Eingang“ und „SharePoint Ausgang“ (`ROLLEN_SPALTEN` in `src/bereiche/planlauf/domain/importVorlagen.ts`) die Links – leere Zellen lassen vorhandene stehen. Feld „Seite für den Verzug“ im Funktionsdialog, Abzeichen in der Liste („Seite offen“ ohne Seite). |
| `ketten` | Workflows im Projekt (`src/bereiche/planlauf/pages/Workflows.tsx` mit `projectId`) | Wie der globale Bereich, zusätzlich unter „Projektvarianten“ die Varianten dieses Projekts. |
| `einstellungen` | Einstellungen (`src/bereiche/planlauf/pages/projekt/Einstellungen.tsx`) | Projektdaten bearbeiten; Vorlaufzeit für Erinnerungen, Fristenrechnung in Arbeitstagen, Feiertage, Absendername und Absender-E-Mail pflegen; Hinweis auf die projektübergreifenden E-Mail-Texte; **Export** (`ExportDialog.tsx`, Titel „Planläufe exportieren“; ebenso im Reiter „Planläufe“): Kurz- oder Langfassung; Auswahl der Einträge in der Gliederung der Planlaufliste – je Planpaket, „Ohne Planpaket“ und „Abgebrochen“ ein Haken für die Gruppe; gewählt wird je Planlauf bzw. mitlaufendem Plan (`zeilenSchluessel`), ein Verzeichnis wählt die Pläne unter sich mit, ein mitlaufender Plan – gekennzeichnet mit „läuft im Verzeichnis mit“ – sein Verzeichnis, abgebrochene Läufe tragen ihren eigenen Index; PDF und Excel bleiben gesperrt, solange der Bericht leer wäre; eine Auswahl nach Arten gibt es nicht. Ausgabe als Excel-Datei (`src/shared/xlsx.ts`) oder als PDF über den Druckdialog (`src/shared/print.ts`). Aufbereitung in `src/bereiche/planlauf/domain/export.ts` (`berichtBilden` auf Grundlage von `uebersicht.ts`): Überschriften sind nur die Planpakete (dazu wie in der Liste „Ohne Planpaket“ und „Abgebrochen“); ein gebündeltes Verzeichnis ist ein Planlauf mit seinen mitlaufenden Plänen, ein Verzeichnis mit Plänen einzeln nur eine Klammer. Kurzfassung als PDF: die Tabelle der Planlaufliste (Plan / Planverzeichnis, Gewerk, Aktueller Stand, Nächster Schritt, Zuständig, Fortschritt, Status) ohne Schaltflächen, mit `EXPORT_STIL`; in Excel ein formatiertes Blatt (`kurzBlatt`): A1 „Projekt: …“, A2 „Stand: …“, Kopfzeile in Zeile 4 (`KURZ_KOPF`: Planpaket, Plancode, Index/Ausgabe, Titel, Gewerk, Aktueller Stand, Datum, Nächster Schritt, Frist; Planpaket „ohne Planpaket“, wenn keines), erst die laufenden Planläufe, dann gesondert „Abgeschlossen (…)“ grün und „Abgebrochen (…)“ grau hinterlegt; Datum und Frist als Excel-Daten, Frist bei fälligen Schritten orange, bei überfälligen rot; mitlaufende Pläne mit „läuft im Planlauf von … mit“, Verzeichnisklammern ohne eigene Zeile; Kopfzeilen fixiert, Druck quer auf Seitenbreite (Zellformate in `src/shared/xlsx.ts`). Langfassung: je Planlauf alle Schritte, in Excel je Schritt eine Zeile (`LANG_KOPF`, u. a. mit Durchlauf, Seite, Eingang, Soll, Ist und Verzug); frühere Durchläufe stehen als eigene graue Zeilen, voraussichtliche Termine kursiv. Die Kurzfassung nennt bei parallelen Zweigen alle anstehenden Schritte. Projekt löschen. |

### 2.3 Planlauf

`src/bereiche/planlauf/pages/projekt/PlanlaufDetail.tsx`: Kopf mit Stammdaten, Status,
„Fortschritt“, „Voraussichtliches Ende“ bzw. „Abgeschlossen am“ samt geplantem
Ende, „Verzug gegenüber Basis“ und dem am stärksten überfälligen Schritt,
Verlaufskette und Schrittliste („Prozessschritte“ – „Die Frist zählt ab dem
tatsächlichen Eingang – dem Abschluss des vorherigen Schritts.“). Die
Schrittliste folgt den Abschnitten aus `verfolgen` (`ablauf.ts`): ein paralleler
Block erscheint als Gruppe mit dem Kopf „Parallel · … Zweige“ bzw. bei einem
benannten Block „… · parallel, … Zweige“ (`blockTitel`) („Die Zweige laufen
gleichzeitig.“, „Weiter, wenn alle Zweige erledigt sind.“), je Zweig mit Namen
(sonst „Zweig …“), Stand, Zweig-Rücksprung, Ausstieg
und abgeschnittenen Schritten. Aktionen an jedem anstehenden Schritt
(`aktuelleSchritte`; ein abgebrochener Lauf hat keine): **Erledigt**,
**Überspringen**, **Erinnern** (E-Mail vorbereiten). Je Schritt stehen Eingang
(fest, „voraussichtlich“, „geschätzt“ oder „Wiedereingang am …“), Frist, Soll,
Ist, Verzug bzw. Abweichung, Seite, die beim Abschluss festgehaltene Person,
die vorbereiteten E-Mails („E-Mail vorbereitet am …“) und aufklappbar die
früheren Durchläufe aus `historie`. Abgeschlossene Schritte bieten **Wieder
öffnen …**: Dialog „Schritt wieder öffnen“ („Wie soll der Schritt wieder
geöffnet werden?“) mit „Korrektur“ – nur solange kein Nachfolger ein Ist hat
(`wiederOeffnenArt` in `abschluss.ts`) – oder „Erneute Bearbeitung“ mit
„Eingang des neuen Durchlaufs“; Store `wiederOeffnen`. Jede Zeile **Anpassen**
(„Schritt anpassen“: Bezeichnung, Art, Funktion, zuständige Person – „– laut
Funktion –“ –, Frist, Eingang, „Ist-Termin“ nur bei erledigten Schritten,
„Soll-Termin festsetzen“, Bemerkung, Nachweis; kein Statusfeld). Ändert sich
dabei ein Eingang oder Ist, fragt „Eingang der Nachfolger ebenfalls
anpassen?“; gespeichert wird in einem Aufruf von `aenderungenAnwenden`. Zur Wahl der Funktion stehen die Funktionen des Gewerks
des Eintrags und die übergreifenden, je Bezeichnung einmal
(`funktionenFuerGewerk` in `engine.ts`); eine bereits gesetzte Funktion bleibt
wählbar. Beim Lauf eines Planverzeichnisses steht unter dem Kopf die Karte
**Pläne dieses Verzeichnisses**, zunächst zugeklappt, mit der Zahl der
mitlaufenden Pläne und der Pläne mit eigenem Lauf. Läuft der gebündelte Lauf,
bietet sie **Alle Pläne einzeln weiterführen …** (`verzeichnisAufteilen`) und
je mitlaufendem Plan **Herauslösen …** (`planHerausloesen`); Pläne mit eigenem
Lauf haben **Planlauf öffnen**. Gibt es solche Pläne, steht dort auch **Pläne
wieder bündeln …** – ebenso auf der Seite eines bereits aufgeteilten Laufs;
entsteht dabei ein neuer Verzeichnislauf, öffnet die Seite ihn. Ein
aufgeteilter Lauf zeigt statt der roten Abbruchmeldung den Hinweis „In
Einzelläufe der Pläne aufgeteilt am …“, der eigene Lauf eines wieder
gebündelten Plans „Wieder im Planlauf des Verzeichnisses gebündelt am …“.
Weiter: **Schritt einfügen** (nur an Stellen, hinter denen nichts erledigt ist
– `einfuegenMoeglich` in `ablauf.ts` –, im Block in den Zweig des gewählten
Schritts, „am Ende von Zweig …“ (bei benannten Zweigen „am Ende von „…““) oder
„nach dem parallelen Block (bevor es weitergeht)“; Store `schrittImLaufEinfuegen`), Antwort einer Entscheidung
wählen, **Workflow ändern …**, **Planlauf abbrechen** (ersatzlos oder mit neuem Index bzw. neuer
Ausgabe – dann startet ein Nachfolgelauf in einem Schritt, `neuerIndexStarten`) und **Lauf löschen**. „Workflow
ändern …“ öffnet „Workflow ändern und neu starten“: Workflow, „Erledigte Schritte
übernehmen“ (`erledigteUebernehmen` in `engine.ts`), „Start des
Planlaufs“, „Eingang Soll“ (wird am Eintrag nachgetragen; ein vergangenes
Datum ist nicht vorbelegt, leer gelten die Termine ab dem Start), „Grund“ und
„Ablauf des neuen Planlaufs“ mit „Individueller Workflow“ (`LaufSchritte` in
`src/bereiche/planlauf/components/AblaufVorschau.tsx`); „Neu starten“ beendet den Lauf
mit der Abbruchart `neu_gestartet` und legt einen neuen mit Name und Index des
Eintrags an (`planlaufNeuStarten` in `store/store.tsx`). Ein so beendeter Lauf
gilt wie ein aufgeteilter nicht als Abbruch (`laufUeberfuehrt`), behält seine
Soll-Termine (`recalcRun` lässt ihn stehen) und zeigt „Mit geändertem Workflow
neu gestartet am …“ mit „Aktuellen Planlauf öffnen“; der neue Lauf führt unter
„Frühere Läufe vor dem Neustart:“ zu den Läufen der Neustart-Kette vor ihm. Ein
abgebrochener Lauf ist schreibgeschützt: `beendet = run.status !== 'laufend'`
blendet alle Schaltflächen aus. Verlangt ein Schritt einen Nachweis
(`Freigabe-Nr.` oder `Prüfbericht-Nr.`), wird die Nummer beim Erledigen
abgefragt (`src/bereiche/planlauf/components/SchrittStatus.tsx`).

Folgt ein laufender Lauf noch einer früheren Fassung seines Workflows
(`alteFassung`), steht im Kopf der Hinweis mit „Auf aktuelle Fassung umstellen
…“ – derselbe Neustart-Dialog, Grund vorbelegt mit „Auf die aktuelle Fassung des
Workflows umgestellt“. Nach jedem Erledigen oder Überspringen öffnet sich –
sofern `mailNachfrage` gesetzt ist – „E-Mail senden“
(`src/bereiche/planlauf/components/NeuZustaendig.tsx`): je Person eine Zeile mit
den neu anstehenden Schritten, Vorlage, „E-Mail …“ und dem Kennzeichen „E-Mail
vorbereitet“; steht ein Schritt nach einem Versandschritt an (`versandSchrittVor`
in `email.ts`), ist die Vorlage „Versand“ vorgewählt und die Zeile nennt „Versand
zur …“ (fehlt der Link, „SharePoint-Link Eingang fehlt“). Der E-Mail-Dialog fasst mehrere Schritte einer Person zu einer
Sammel-E-Mail zusammen und vermerkt jede vorbereitete E-Mail am Schritt
(`erinnerungenVermerken`).

Karte **Terminnachweis** (`src/bereiche/planlauf/components/Terminnachweis.tsx`,
Rechnung `terminnachweis` in `nachweis.ts`): „Verzug gegenüber dem Basisplan –
und welcher Seite er zuzurechnen ist“, „Geplantes Ende (Basis)“, „Gesamtverzug“,
Summen je Seite, „Seite fehlt“, „Zeitgewinn“, „Nicht erklärt“ und Warnungen;
„Verzug je Ausführung“ mit Posten (`POSTEN_ART_LABEL`: Fristüberschreitung,
Nacharbeit, Planänderung, Soll von Hand, Übergabelücke, Erster Termin
verschoben, Nacharbeit (paralleler Block), Zeitgewinn) und „Zuordnen …“ (Dialog
„Verzug zuordnen“, Tage je Seite, „Grund (Pflicht)“; Store `verzugZuordnen`),
„Ursache der Nacharbeit“ je Entscheidung (`nacharbeitSeiteSetzen`), „Basisplan“
mit „Basis neu festlegen …“ (Grund Pflicht, `basisNeuFestlegen`) und „Nachweis
als Excel“ mit den Blättern „Ausführungen“, „Verzug je Seite“, „Erinnerungen“ und
„Protokoll“. Karte **Protokoll** (`src/bereiche/planlauf/components/Protokoll.tsx`):
Änderungen am Lauf, neueste zuerst, 20 Einträge, dann „Alle (…)“; geschrieben
von `protokollNachziehen` (`src/bereiche/planlauf/domain/protokoll.ts`).

### 2.4 Übergreifende Bedienelemente

* **Seitenleiste** (`src/bereiche/planlauf/App.tsx`): Navigation (Übersicht, Projekte, Terminrechner
  und die aufklappbare Gruppe „Einstellungen“ mit Workflows, Funktionen und Vorlagen – aufgeklappt, sobald
  eine dieser Seiten offen ist), darunter die markierten Projekte mit vorangestellter
  Projektnummer und der Anzahl überfälliger Schritte. Ganz unten
  **Bereich wechseln** zurück zur Bereichsauswahl
  (`src/shell/BereichWechsel.tsx`).
* **Angemeldet als** (unten links): Name (Vorgabe `STANDARD_BEARBEITER =
  'Max Mustermann'`), Schalter „Nachfragen zulassen, wenn ein Workflow-Schritt
  eine E-Mail vorsieht“ und Schalter „Farbmodus für Rot-Grün-Sehschwäche
  (hoher Kontrast)“.
* **Sicherung**: lädt den gesamten Bestand als JSON herunter
  (`exportiereDaten`); nach einem Lade- oder Fassungsfehler stattdessen den
  gespeicherten Stand unverändert („Gespeicherten Stand unverändert
  herunterladen“, `rohdatenHerunterladen`). **Einspielen**
  (`src/bereiche/planlauf/components/SicherungEinspielen.tsx`): wählt eine
  solche JSON-Datei, liest sie mit `sicherungLesen`
  (`src/bereiche/planlauf/store/storage.ts`, Anhebung wie beim Laden) und
  zeigt „Sicherung einspielen“ – mit der Zahl der Projekte, Pläne und
  Planverzeichnisse und Planläufe, der Warnung, dass der jetzige Bestand
  ersetzt wird, „Aktuellen Stand sichern“ und, wenn die Namen abweichen, dem
  Haken „„Angemeldet als“ aus der Sicherung übernehmen“ (vorgewählt, solange
  der Name `STANDARD_BEARBEITER` ist); ohne gesetzten Haken bleiben Name,
  Farbmodus und E-Mail-Nachfrage der Person am Rechner. „Alles ersetzen“ ersetzt den Bestand über
  `ersetzeDaten` und wechselt zur Übersicht. „Abgleichen und auswählen …“
  öffnet „Sicherung abgleichen“ (`src/bereiche/planlauf/components/Abgleich.tsx`,
  Logik `abgleichErmitteln`/`abgleichAnwenden` in
  `src/bereiche/planlauf/domain/abgleich.ts`): ein Baum mit Kästchen –
  „Übergreifend“ (Gewerke, Funktionen, E-Mail-Vorlagen, Workflows) und
  „Projekte“ (Projektdaten, Funktionen, Kontakte, Projekt-Workflows,
  Eintragseinheiten) –, je Element neu, geändert, gleich, nur im Bestand oder
  im Bestand gelöscht (Löschvermerke `AppData.geloescht`), „vermutlich dasselbe“
  bei gleicher Codierung mit anderer Kennung, Projekt bei abweichender
  Projektnummer „als Kopie“; Abhängigkeiten aus `VERWEISFELDER` werden „mitgenommen“.
  Ohne Unterschiede: „Keine Unterschiede“. Übernommen wird über `datenAbgleichen`;
  Läufe gleicher Kennung vereinigen Protokoll, Historie und Erinnerungen.
  Stammt der gespeicherte Stand aus einer neueren Fassung, sind beide Wege
  gesperrt, nach einem Ladefehler das Abgleichen. **Zurücksetzen**: verwirft den
  Bestand und lädt die Demodaten (`zuruecksetzen` in
  `src/bereiche/planlauf/store/store.tsx`); gesperrt, solange der gespeicherte
  Stand aus einer neueren Fassung stammt („Gesperrt, damit der Stand aus der
  neueren Fassung erhalten bleibt“).
* **Hinweisleisten** (`src/bereiche/planlauf/components/Hinweisleisten.tsx`,
  zwischen Kopfzeile und Inhalt) nach `ladeZustand`, `speicherZustand` und
  `stammdatenKopien` des Stores: „Der gespeicherte Stand ließ sich nicht laden.“
  mit „Gespeicherten Stand herunterladen“ und „Mit Demodaten neu beginnen?“; „Die
  gespeicherten Daten stammen aus einer neueren Fassung von KaPlan.“ mit „Seite
  neu laden“; „Nicht gespeichert – bitte Sicherung herunterladen.“ samt Grund
  („Der Speicher des Browsers ist voll“ bzw. „Der Browser lässt das Speichern
  nicht zu (etwa durch Datenschutzeinstellungen)“); „Standard-Workflows
  aktualisiert.“ mit den Kopien „… (eigene Fassung)“, quittiert mit „Verstanden“.
* **E-Mail-Dialog** (`src/bereiche/planlauf/components/EmailDialog.tsx`): Vorlage wählen, Betreff
  und Text bearbeiten, „In Outlook öffnen“ (mailto), „Outlook im Web“ oder „Kopieren“
  (in die Zwischenablage). Bei mehreren Schritten einer Person eine Sammel-E-Mail
  (Vorlage „Sammelerinnerung“, `sammelMailVorbereiten` in `email.ts`, Platzhalter
  `{{liste}}` und `{{anzahl}}`); ist der Link länger als `MAILTO_GRENZE`, bleibt
  nur „Kopieren“ („Zu lang für die Übergabe – bitte „Kopieren“ verwenden“).
  „Kopieren (formatiert)“ legt nur den Text als `text/html` und `text/plain` ab
  (`mailHtml` in `email.ts`, `formatiertKopieren` in `src/shared/zwischenablage.ts`):
  Links als Links, „ORDNERNAME EINFÜGEN“ und fehlende Angaben rot und fett.
  Lücken im Text („[SharePoint-Link Eingang fehlt]“, „[SharePoint-Link Ausgang
  fehlt]“, „[Anliegen fehlt]“, `fehlendeAngaben`) meldet „Im Text fehlen
  Angaben: …“. Jede vorbereitete E-Mail wird als Erinnerung am Schritt vermerkt.
* **Vorlage „Versand“** (`versandVorlage` in `seed.ts`, ID `mail-versand`):
  Platzhalter `{{anliegen}}` (Anliegen des vorangehenden Versandschritts),
  `{{sharepoint.eingang}}`, `{{sharepoint.ausgang}}` und `{{versandliste}}`
  (`versandListe`: je Planpaket „…:“ und „* Codierung Titel“, Planverzeichnisse
  mit „  – …“ ihrer mitlaufenden Pläne, ein einzelner Plan ohne Paket für sich,
  sonst „Ohne Planpaket:“); dazu wörtlich „Ordnername: ORDNERNAME EINFÜGEN“.
  Vorbelegte Versandschritte der Standard-Workflows: `VERSAND_ANLIEGEN_NACH_NAME`
  in `types.ts`.

## 3. Nutzerrollen und Rechte

**Es gibt keine Anmeldung, keine Benutzerverwaltung und keine Rechteprüfung.**
Weder `src/bereiche/planlauf/App.tsx` noch der Store (`src/bereiche/planlauf/store/store.tsx`) prüfen irgendeine
Berechtigung; jede Person, die die Anwendung im Browser öffnet, kann alles
lesen und ändern. Der Bestand liegt ausschließlich im `localStorage` des
jeweiligen Browsers, wird also ohnehin nicht geteilt.

Der Begriff „Rolle“ hat im Code zwei rein fachliche Bedeutungen:

1. **Bearbeiter** (`Bearbeiter` in `src/bereiche/planlauf/domain/types.ts`): Name,
   `mailNachfrage` und `farbmodus`. Die Funktion der angemeldeten Person ist
   stets `EIGENE_ROLLE = 'Planlaufmanagement'`; Schritte dieser Funktion gelten
   als eigene To-Dos (`eigeneTodos` in `src/bereiche/planlauf/domain/engine.ts`). In jedem
   markierten Projekt besetzt die Person automatisch das Planlaufmanagement
   (`eigeneKontakteSichern`). Diese Funktion (`istEigeneFunktion` in
   `src/bereiche/planlauf/domain/types.ts`) erscheint weder im Reiter „Funktion“
   noch unter „Funktionen“ und lässt sich dort weder bearbeiten noch neu
   anlegen; der Excel-Import übernimmt solche Zeilen ohne diese Funktion.
   Rechte verleiht das nicht.
2. **Funktionen** (`StandardRolle` projektübergreifend, `Role` je Projekt):
   fachliche Zuständigkeiten, die Prozessschritten zugeordnet und im Projekt mit
   Personen besetzt werden (`kontaktFuerRolleUndGewerk`). Ein Schritt speichert
   nur die Bezeichnung der Funktion; welche Funktion und damit welche Person
   gemeint ist, ergibt sich aus dem Gewerk des Eintrags – ersatzweise gilt die
   übergreifende Funktion gleichen Namens. Mitgeliefert werden 15
   Funktionen (`src/bereiche/planlauf/domain/seed.ts`), davon zwei übergreifend
   (Planlaufmanagement, Projektleitung) und dreizehn je Gewerk (Fachplaner,
   Fachspezialist, Bauvorlageberechtiger, Bau AN, Bauüberwachung,
   Fachtechnischer Prüfer, Prüfstatiker, Vermessungsprüfer, Erdungsprüfer,
   Schweißtechnischer Prüfer, Korrosionsschutzprüfer, Gleisgeometrie Prüfer,
   Geotechnischer Prüfer) für die mitgelieferten Gewerke EEA, KIB, LST, OLA,
   OSE, TK und VA. Gewerke und Funktionen lassen sich ergänzen und löschen.
   Jede Funktion trägt eine Seite für den Verzug (`seite` vom Typ `Seite` in
   `types.ts`: Planer, Prüfer, Auftraggeber, PLM oder `null`), nach der der
   Terminnachweis Verzug zurechnet; die mitgelieferten Funktionen bringen sie
   mit, neue werden aus der Bezeichnung vorbelegt (`seiteAusFunktion`).

Die Besetzung wirkt sofort: `zustaendigkeitenNachziehen` (`src/bereiche/planlauf/domain/engine.ts`)
setzt in laufenden Planläufen die zuständige Person aus der aktuellen Besetzung
– außer bei erledigten Schritten und bei von Hand gewählten Personen
(`contactManuell`).

## 4. Umgebungsvariablen

**Eine `.env.example` existiert in diesem Repository nicht**, ebenso wenig eine
`.env`-Datei oder ein Zugriff auf `process.env` im Anwendungscode. Die
Anwendung benötigt keine Umgebungsvariablen – es gibt keinen Server, keine
Datenbank und keine API-Schlüssel.

Verwendet werden ausschließlich die von Vite bereitgestellten Werte:

| Variable | Bedeutung | Pflicht |
| --- | --- | --- |
| `import.meta.env.BASE_URL` | Basispfad der Auslieferung; wird für die Pfade der Logos (`public/logos/`) und des Hauslogos verwendet (`src/shared/logos.tsx`). Vite setzt ihn aus `base: './'` in `vite.config.ts`. | von Vite gesetzt, keine eigene Pflege |
| `import.meta.env.PROD` | Nur im Produktionsbuild wird der Service Worker registriert (`src/shared/pwa.ts`). | von Vite gesetzt, keine eigene Pflege |

## 5. Setup von Null bis zur laufenden Anwendung

1. **Voraussetzungen**: Node.js und npm. Eine Fassung legt das Repository nicht
   fest (kein `engines`-Eintrag in `package.json`, keine `.nvmrc`); der
   Workflow `.github/workflows/pages.yml` baut mit Node 22. Weitere Werkzeuge
   sind nicht nötig.
2. **Abhängigkeiten installieren**: `npm install` (bzw. `npm ci` bei
   vorhandener `package-lock.json`). Laufzeitabhängigkeiten sind nur `react`
   und `react-dom`; Vite, TypeScript und die Typpakete sind Entwicklungs-
   abhängigkeiten (`package.json`).
3. **Datenbank**: entfällt. Es gibt keine Datenbank, keinen Server und keine
   Migrationsskripte. Der Bestand liegt unter dem Schlüssel
   `planlauf-management.data.v1` im `localStorage`
   (`src/bereiche/planlauf/store/storage.ts`). Vor einer Umstellung auf eine
   neue Daten- oder Stammdatenfassung legt `ladeDaten` den gespeicherten Text
   einmalig unter `planlauf-management.data.v1.vor-fassung-<n>` ab (n = bisherige
   `version`); ist der Speicher voll, entfernt `speichereDaten` diese Kopien
   zuerst und versucht es erneut.
4. **Migrationen**: laufen automatisch beim Laden. `DATEN_VERSION = 14` und
   `STAMMDATEN_VERSION = 6` (`src/bereiche/planlauf/domain/types.ts`) steuern, ob `migriere()`
   einen älteren Bestand auf die aktuelle Struktur hebt und ob neue Stammdaten
   (Funktionen, Standard-Workflows) übernommen werden. Seit Fassung 12 werden
   frühere Schrittarten außer Entscheidungen zur Aufgabe (`migriereTyp`), Ziele auf nicht
   mehr vorhandene Schritte entfallen (`zieleBereinigen`) und „Rückmeldung an
   Planer“ führt wieder zu „Erneute Vorlage von Planer“ (`rueckmeldungVerbinden`,
   bei Planläufen nur für laufende). Fassung 13 ergänzt Antworten mit
   `nacharbeit` (alle außer der ersten, `mitNacharbeit`), Funktionen mit Seite
   (`mitSeite`), Erinnerungen aus der früheren `letzteErinnerung`
   (`erinnerungenAus`) und die E-Mail-Vorlagen um `{{verzug.zahl}}` und die
   Sammelerinnerung (`vorlagenFassung13`); `laeufeFassung13` schätzt den
   Wiedereingang laufender Rücksprünge (`wiedereingangSchaetzen`, Eintrag im
   Protokoll „KaPlan (Umstellung auf Fassung 13)“, Kennzeichen „geschätzt“),
   gleicht den Status laufender Läufe mit dem Weg ab (`statusAbgleichen`) und
   legt für jeden Lauf ohne Basisplan einen fest (`basisplanFestlegen`) – alle in
   `store/storage.ts`. Fassung 14 ergänzt an Kontakten leere SharePoint-Links,
   an Workflow- und Laufschritten `versandAnliegen` nach dem Schrittnamen
   (`versandAnliegenNachName`, sonst `null`) und die Vorlage „Versand“
   (`vorlagenFassung13`). Eine neue Stammdatenfassung ersetzt die
   Standard-Workflows (`stammdatenAktualisieren`); hatte ein Bestand der
   Stammdatenfassung 4 bzw. 5 einen mitgelieferten Workflow selbst geändert
   (Vergleich mit `STANDARD_FASSUNG4_FINGERABDRUCK` bzw.
   `STANDARD_FASSUNG5_FINGERABDRUCK` in `seed.ts` über `FINGERABDRUECKE`;
   Fassung 5 mit Blöcken, `workflowFingerabdruck(t, true)`), bleibt dieser als
   Kopie „… (eigene Fassung)“ erhalten (`eigeneFassung`). Lässt sich der gespeicherte
   Stand nicht lesen (`ladefehler`) oder stammt er aus einer neueren Fassung
   (`neuere_fassung`), zeigt `ladeDaten` Demodaten, und der Store speichert nicht,
   solange `ladeZustand` nicht `ok` ist. Ohne gespeicherten Bestand werden die
   Demodaten aus `src/bereiche/planlauf/domain/seed.ts` geladen; ihre Läufe
   entstehen über die Engine mit zufälligen IDs.
5. **Entwicklung starten**: `npm run dev` – Vite startet auf Port 5173 und ist
   im Netz erreichbar (`server: { port: 5173, host: true }`).
6. **Prüfen und bauen**: `npm run typecheck` (`tsc --noEmit`) und `npm run
   build` (`tsc -b && vite build`, Ergebnis in `dist/`). `npm run preview`
   liefert den Build lokal aus.
7. **Veröffentlichen**: Der Workflow `.github/workflows/pages.yml` baut bei
   jedem Push auf `main` und stellt den Build über GitHub Pages bereit
   (Quelle „GitHub Actions“); zusätzlich legt er ihn im Branch `gh-pages` und
   im Ordner `app/` auf `main` ab. Steht Pages auf „Deploy from a branch“ mit
   `main`, liefert GitHub den Zweig selbst aus: Die Wurzel-`index.html`
   verweist auf `/src/main.tsx`, das der Browser nicht ausführen kann; ihr
   Skript wechselt deshalb nach 1,5 Sekunden auf `app/`. Bei Pull Requests
   baut der Workflow nur (einschließlich Typprüfung). Wegen
   `base: './'` funktioniert die Anwendung auch in einem Unterverzeichnis.

## 6. Bekannte Meldungen und ihre Ursachen

### Eingabeprüfungen (als Hinweis eingeblendet)

| Meldung | Fundstelle | Ursache |
| --- | --- | --- |
| „Bitte einen Projektnamen angeben.“ | `src/bereiche/planlauf/pages/Projekte.tsx` | Projektname leer. |
| „Bitte einen Titel angeben.“ | `src/bereiche/planlauf/pages/projekt/Plaene.tsx` | Titel eines Plans / Planverzeichnisses leer. |
| „Bitte Codierung oder Titel angeben.“ | `src/bereiche/planlauf/pages/projekt/Plaene.tsx` | Ein Planverzeichnis soll aus dem Auswahlfeld heraus ohne Codierung und Titel angelegt werden. |
| „Bitte einen Namen für das Planpaket angeben.“ | `src/bereiche/planlauf/components/PaketDialog.tsx` | Name des Planpakets leer. |
| „Bitte die … angeben.“ | `src/bereiche/planlauf/components/SchrittStatus.tsx` | Beim Erledigen eines Schritts fehlt die verlangte Nachweisnummer. |
| „Bitte … angeben.“ | `src/bereiche/planlauf/pages/projekt/PlanlaufDetail.tsx` | Beim Abbruch mit neuem Index bzw. neuer Ausgabe fehlt dieser. |
| „Bitte einen Nachnamen angeben.“ | `src/bereiche/planlauf/pages/projekt/RollenFunktionen.tsx` | Besetzung ohne Nachname gespeichert. |
| „Bitte eine Bezeichnung angeben.“ | `Funktionen.tsx`, `RollenFunktionen.tsx`, `GewerkDialog.tsx`, `Plaene.tsx` | Funktion oder Gewerk ohne Bezeichnung bzw. Planpaket aus dem Auswahlfeld ohne Namen. |
| „Planlaufmanagement übernimmt stets die angemeldete Person.“ | `Funktionen.tsx`, `RollenFunktionen.tsx` | Eine übergreifende Funktion mit dieser Bezeichnung soll angelegt werden. |
| „„…“ ist bereits angelegt.“ | `src/bereiche/planlauf/components/GewerkDialog.tsx` | Gewerk mit diesem Namen existiert schon. |
| „Bitte einen Namen angeben.“ | `src/bereiche/planlauf/components/WorkflowEditor.tsx` | Workflow ohne Namen gespeichert. |
| „Schritt … hat keine Bezeichnung.“ / „Entscheidung … hat keine Antwort.“ / „Schritt … wird nie erreicht – kein Übergang führt zu ihm.“ | `src/bereiche/planlauf/domain/workflowGraph.ts` (`pruefen`) | Workflow-Editor: Hinweise in der Fußzeile; die ersten beiden (und „Der Workflow hat noch keinen Schritt.“) erscheinen beim Speichern bzw. Übernehmen als Meldung und verhindern es. |
| „Bitte jeden Schritt der Workflow benennen.“ | `src/bereiche/planlauf/pages/projekt/Plaene.tsx`, `PlanlaufDetail.tsx` | Beim Start bzw. Neustart eines Planlaufs ist ein Schritt unbenannt. |
| „Bitte einen Grund angeben.“ | `src/bereiche/planlauf/pages/projekt/PlanlaufDetail.tsx`, `src/bereiche/planlauf/components/Terminnachweis.tsx` | Abbruch bzw. „Basis neu festlegen“ ohne Begründung. |
| „Bitte einen Grund für … angeben.“ | `src/bereiche/planlauf/components/Terminnachweis.tsx` | „Verzug zuordnen“: Tage für eine Seite ohne Grund. |
| „Bitte den Eingang des neuen Durchlaufs angeben.“ | `src/bereiche/planlauf/pages/projekt/PlanlaufDetail.tsx` | „Wieder öffnen …“ als erneute Bearbeitung ohne Eingang. |
| „Bitte ein Ist-Datum angeben – zum Zurücknehmen „Wieder öffnen“ verwenden.“ | `src/bereiche/planlauf/pages/projekt/PlanlaufDetail.tsx` | „Schritt anpassen“: Ist eines erledigten Schritts geleert. |
| „Bitte den Soll-Termin angeben.“ | `src/bereiche/planlauf/pages/projekt/PlanlaufDetail.tsx` | „Soll-Termin festsetzen“ ohne Datum. |
| „Bitte eine Stelle zum Einfügen wählen.“ | `src/bereiche/planlauf/pages/projekt/PlanlaufDetail.tsx` | „Schritt einfügen“ ohne Einfügestelle. |
| „Dort lässt sich kein Schritt einfügen – dahinter ist schon etwas erledigt.“ | `src/bereiche/planlauf/domain/abschluss.ts` | Die gewählte Stelle ist nicht (mehr) zulässig (`einfuegenMoeglich`). |
| „Bitte ein Planpaket wählen.“ | `src/bereiche/planlauf/components/PlanlisteAktionen.tsx` | „Planpaket zuweisen“ ohne Ziel. |
| „Bitte mindestens einen Eintrag auswählen.“ | `src/bereiche/planlauf/pages/projekt/ExportDialog.tsx` | Export ohne Auswahl. |

### Import aus Excel/CSV

| Meldung | Ursache |
| --- | --- |
| „Die Datei enthält keine Datenzeilen.“ | Die Tabelle hat nur eine Kopfzeile oder ist leer (`PlaeneImport.tsx`, `RollenImport.tsx`). |
| „Weder ‚Plancodierung‘ noch ‚Titel‘ gefunden. Gelesene Überschriften: …“ | Die Kopfzeile der Planliste enthält keine der erkannten Schreibweisen (`PLAN_SPALTEN` in `src/bereiche/planlauf/domain/importVorlagen.ts`). |
| „Die Spalte ‚Name‘ wurde nicht gefunden. Gelesene Überschriften: …“ | Dasselbe für die Rollenliste (`ROLLEN_SPALTEN`). |
| „Die Datei ist keine gültige Excel-Datei (ZIP-Ende fehlt).“ | `src/shared/xlsxLesen.ts`: Die Datei ist kein ZIP – etwa eine alte `.xls`-Datei. |
| „Die Datei verwendet ein nicht unterstütztes Packverfahren.“ | Der ZIP-Eintrag ist nicht „deflate“ (`methode !== 8`). |
| „Dieser Browser kann keine Excel-Dateien entpacken – bitte die Liste als CSV speichern.“ | `DecompressionStream` fehlt im Browser. |
| „Die Datei konnte nicht gelesen werden.“ | Auffangmeldung für alle übrigen Lesefehler. |
| Hinweise je Zeile: „Eintrag mit dieser Bezeichnung ist bereits vorhanden“, „Planpaket ‚…‘ wird angelegt“, „Workflow ‚…‘ ist nicht hinterlegt – es gilt der im Dialog gewählte“, „Bezeichnung kommt in der Datei mehrfach vor“, „Planverzeichnis ‚…‘ wird angelegt“, „Planverzeichnis ‚…‘ startet seinen Planlauf“, „Gewerk ‚…‘ wird angelegt“, „Funktion ‚…‘ wird angelegt“, „ersetzt … in dieser Funktion“ | Kein Fehler: Die Vorschau nennt, was beim Übernehmen geschieht. |

### Sicherung einspielen

| Meldung | Ursache |
| --- | --- |
| „Die Datei ist keine gültige JSON-Datei.“ | Die gewählte Datei lässt sich nicht als JSON lesen (`sicherungLesen`). |
| „Die Datei ist keine Sicherung von KaPlan.“ | Das JSON enthält keine Liste `projects`. |
| „Die Sicherung stammt aus einer neueren Fassung von KaPlan. Bitte die Seite neu laden (Strg+Umschalt+R) und erneut einspielen.“ | `version` der Sicherung ist größer als `DATEN_VERSION` – die geladene Programmfassung ist älter als die, die gesichert hat. |
| „Die Sicherung ist unvollständig.“ | Einer Sicherung der aktuellen Fassung fehlt eine der Listen (Projekte, Funktionen, Kontakte, Einträge, Workflows, Planläufe …) oder der Name unter „Angemeldet als“. |
| „Die Sicherung konnte nicht gelesen werden.“ | Das Anheben auf die aktuelle Fassung schlug fehl. |
| „Sicherung eingespielt – ….“ | Kein Fehler: Der Bestand wurde ersetzt; die Meldung nennt die Zahl der Projekte und Planläufe. |
| „Nichts übernommen – der Stand nach dem Abgleich wäre nicht stimmig:“ | „Sicherung abgleichen“: Die Konsistenzprüfung nach `abgleichAnwenden` fand Verstöße, die der Abgleich neu erzeugen würde; die ersten acht werden aufgezählt. |
| „Abgleich übernommen – ….“ | Kein Fehler: Die gewählten Elemente wurden übernommen (`src/bereiche/planlauf/components/Abgleich.tsx`). |
| „Keine Unterschiede“ – „Die Sicherung enthält nichts, was vom Bestand in diesem Browser abweicht.“ | Kein Fehler: Sicherung und Bestand stimmen überein. |

### Laufzeit und Technik

| Meldung | Ursache |
| --- | --- |
| „Kopieren nicht möglich – bitte Text manuell markieren.“ | `navigator.clipboard.writeText` wurde abgelehnt (fehlende Berechtigung oder unsicherer Kontext), `src/bereiche/planlauf/components/EmailDialog.tsx`. |
| „Druckdialog geöffnet – dort ‚Als PDF sichern‘ wählen.“ | Kein Fehler: Der PDF-Export läuft über den Druckdialog des Browsers (`src/shared/print.ts`). |
| Konsole: „Daten konnten nicht lokal gespeichert werden: …“ | `localStorage.setItem` schlug fehl – Speicher voll oder gesperrt (privates Fenster), `src/bereiche/planlauf/store/storage.ts`. `speichereDaten` liefert dann `voll` oder `gesperrt` (bei vollem Speicher erst nach dem Entfernen der Rohkopien `…vor-fassung-…`). |
| Hinweisleiste „Nicht gespeichert – bitte Sicherung herunterladen.“ | Derselbe Fall in der Oberfläche (`speicherZustand`), mit „Der Speicher des Browsers ist voll“ bzw. „Der Browser lässt das Speichern nicht zu (etwa durch Datenschutzeinstellungen)“ (`src/bereiche/planlauf/components/Hinweisleisten.tsx`). |
| Hinweisleiste „Der gespeicherte Stand ließ sich nicht laden.“ | `ladeDaten` konnte den gespeicherten Text nicht lesen oder aufbereiten (`ladefehler`). Angezeigt werden Demodaten, gespeichert wird nicht; „Mit Demodaten neu beginnen?“ ersetzt den Stand erst nach Rückfrage. |
| Hinweisleiste „Die gespeicherten Daten stammen aus einer neueren Fassung von KaPlan.“ | `version` des gespeicherten Stands ist größer als `DATEN_VERSION` (`neuere_fassung`): Demodaten, kein Speichern, Einspielen und Zurücksetzen gesperrt; Abhilfe „Seite neu laden“. |
| Hinweisleiste „Standard-Workflows aktualisiert.“ | Kein Fehler: Beim Wechsel von Stammdatenfassung 4 bzw. 5 wurde ein selbst geänderter Standard-Workflow als Kopie „… (eigene Fassung)“ behalten (`stammdatenKopien`). |
| Terminnachweis: „Für diesen Planlauf ist kein Basisplan festgelegt – der Gesamtverzug lässt sich nicht bestimmen.“, „Die Prognose endet nicht (Schleife bzw. zu viele Schritte) – das Ende ist unsicher.“, „Der Planlauf wurde abgebrochen …“, „Frühere Durchläufe einzelner Schritte stammen aus der Zeit vor der Umstellung und sind nicht gespeichert – ihre Zeit erscheint als Übergabelücke, ein Rest ist möglich.“, „Zuordnung von Hand bei „…“ (Durchlauf …) übersteigt den Verzug um …“ | Hinweise der Karte „Terminnachweis“ (`warnungen` aus `terminnachweis` in `src/bereiche/planlauf/domain/nachweis.ts`). |
| Konsole: „Service Worker konnte nicht registriert werden: …“ | Registrierung abgelehnt, etwa ohne HTTPS (`src/shared/pwa.ts`). Die Anwendung läuft weiter, nur der Offline-Betrieb entfällt. |
| Ausnahme: „useStore muss innerhalb des StoreProvider verwendet werden.“ | Entwicklungsfehler: Eine Komponente nutzt `useStore` außerhalb von `StoreProvider` (`src/bereiche/planlauf/store/store.tsx`). |
| Seite „Nicht gefunden – Der aufgerufene Eintrag existiert nicht (mehr).“ | Die Adresse nennt ein Projekt oder einen Planlauf, den es nicht (mehr) gibt (`src/bereiche/planlauf/App.tsx`). |
| Ein alter Stand erscheint nach einer Aktualisierung | Entweder liegt unter `app/` noch ein älterer Build (siehe Abschnitt 5, Schritt 7), oder der Service Worker liefert aus seinem Cache, derzeit `mc-plan-v7` (`public/sw.js`). Beim Aktivieren löscht er alle älteren Caches; bis dahin hilft einmal Neuladen bzw. Strg+Umschalt+R. |
| Planliste: Haken „Pläne einzeln durch den Planlauf führen“ ist ausgegraut – „Es bestehen bereits Planläufe. Die Pläne lassen sich nur noch nachträglich einzeln weiterführen.“ bzw. „Die Pläne laufen bereits einzeln. Über „Pläne wieder bündeln …“ lassen sich ausgewählte Pläne zurückführen.“ | Kein Fehler: Sobald das Verzeichnis oder einer seiner Pläne einen Lauf hat, ist die Wahl gesperrt (`modusGesperrt` in `Plaene.tsx`). Weiter geht es über die Nachträge „Herauslösen …“, „Alle Pläne einzeln weiterführen …“ und „Pläne wieder bündeln …“ bzw. „Bündeln …“ – im Dialog der Planliste, in der Karte „Pläne dieses Verzeichnisses“ des Planlaufs und im Reiter „Planläufe“. |
| Konsole der Wurzelseite: 404 für `/src/main.tsx` und die Symbole unter `icons/` | Kein Fehler: Die Wurzelseite ist der ausgelieferte Quellcode und springt nur nach `app/` weiter; dort gibt es diese Fehlanfragen nicht. |

## 7. Bereich Baubetriebsplanung

Monitor für baubetriebliche Anmeldungen von Sperrpausen, erster Entwurf nach
dem Lastenheft der Anwender. Offene Fragen und Annahmen:
`docs/BAUBETRIEB_RUECKFRAGEN.md`. Der Bereich greift nicht auf das
Planlaufmanagement zu; Einstiegspunkt ist `src/bereiche/baubetrieb/index.tsx`,
Rahmen und Seitenleiste stehen in `src/bereiche/baubetrieb/App.tsx`. Die
„Projekthülle“ des Lastenhefts heißt in der Anwendung „Projekt“; die Phasen
heißen SKM, MKM, KM (n-2 & n-1) und KKM (unterjährig) (`PHASE_LABEL` in
`src/bereiche/baubetrieb/domain/types.ts`), im Lastenheft SKM, PzE, Vorprozess
N-x und unterjährige Anmeldung.

### 7.1 Datenmodell und Speicherung

* `src/bereiche/baubetrieb/domain/types.ts`: `Projekt`, `Anmeldung` mit
  `statusId` und `verlauf` (`VerlaufEintrag`: `anlage`, `wechsel`, `notiz`;
  `vonText`/`nachText` halten Workflow und Status zum Zeitpunkt des Eintrags
  fest), `Workflow` mit `status` (`WorkflowStatus`: Name, Art, Fristregel,
  `nachhaken`, Bemerkung, `nachfolger`), `Einstellungen` mit `rilFristen`.
  Maßnahmenarten in `ALLE_ARTEN` (SKM, MKM, A, B(0), B(S), B, C, Container;
  mit eigener KKM-Frist `MASSNAHMENARTEN`), AnnexVII-Gründe in `ANNEX_VII`
  („Entspricht Prozessphase“ und „Zustimmung EVU/EIU“ mit `selten`). Ein
  Nachfolger ist die ID eines Status – auch eines anderen Workflows – oder
  `LOESCHEN` (Eintrag löschen). Statusarten in `STATUS_ART_LABEL`, darunter
  `leiche` („Anmeldeleiche“). Je Status `zustaendig` (`ZUSTAENDIGKEIT_LABEL`:
  MIC, BBK, Projektleitung DB oder `null`); je Anmeldung `vorhaben`
  (Vorhabenname, führend bei der Art SKM – `vorhabenFuehrend`, `titelFeld`,
  `anmeldungTitel`; ohne Nummer „ohne ID“, in Rückfragen und Vermerken
  notfalls das Gewerk – `anmeldungBezeichnung`) und `bbk` (Zuständiger BBK).
* Schlüssel `baubetrieb-planung.data.v1` im `localStorage`
  (`src/bereiche/baubetrieb/store/storage.ts`), `DATEN_VERSION = 8`.
  `migriere()` hebt ältere Stände in einem Aufruf Schritt für Schritt: Fassung 1 kannte nur den
  Farbmodus und erhält die Demodaten; Fassung 2 führte Statusnummern (V0 … Y9),
  die `STATUS_AUS_NUMMER` (`src/bereiche/baubetrieb/domain/workflow.ts`) den
  Status der Standard-Workflows zuordnet – in Anmeldungen, Verlauf und
  gespeichertem Vorstand; der bisher eingestellte `nachhakTage` wird zum
  Abstand der Nachhak-Termine (`standardWorkflows(nachhakTage)`); Fassung 3
  (`ausFassung3`) erhält statt der Kurzbezeichnung „Unterjahr“ die aktuelle
  (auch in den Texten des Statusverlaufs), sofern sie nicht geändert wurde;
  Fassung 4 (`ausFassung4`) kannte die Anmeldeleiche nur als Nachfolger, der
  sofort löschte – jeder Workflow mit diesem Nachfolger erhält am Ende den
  Status „Anmeldeleiche“ (in den Standard-Workflows mit fester ID, z. B.
  `skm-anmeldeleiche`), auf den die bisherigen Verweise zeigen und dessen
  einziger Nachfolger `LOESCHEN` ist; hat eine ältere Fassung einen Bestand
  der Fassung 5 gespeichert und die Art dabei zu „Entwurf“ gemacht, führt
  `ausFassung4` den Status mit fester ID wieder als Anmeldeleiche; Fassung 5
  (`ausFassung5`) kannte die Phasennamen des Lastenhefts – Standard-Workflows
  erhalten Name, Kurzbezeichnung und Beschreibung von MKM, KM und KKM, soweit
  sie nicht geändert wurden (die Texte im Statusverlauf folgen), die Art PzE
  wird MKM, A_Vor_N-2, A_Vor_N-1 und A_unterjahr werden A (auch in den Arten
  der Workflows und im gespeicherten Vorstand), Fristbezug und
  Richtlinienfrist `pze` heißen `mkm`, die Prozessphase des ersten
  Anmeldetermins `mkm` bzw. `kkm`; Fassung 6 (`ausFassung6`) führte je Projekt
  eine geplante Sperrzeit (`bauzeitVon`/`bauzeitBis`) – daraus werden die
  betroffenen Fahrplanjahre (`fahrplanjahre`, über `fahrplanjahreZwischen`,
  höchstens zehn); Fassung 7 (`ausFassung7`) kannte keine Zuständigkeit – die
  Status der Standard-Workflows erhalten die Vorgabe der mitgelieferten, die
  übrigen die Vorgabe ihrer Art (`ZUSTAENDIG_NACH_ART`); `vorhaben` und `bbk`
  der Anmeldungen ergänzt `aufbereiten()` leer.
  Ohne gespeicherten Bestand lädt `seedDaten()`
  (`src/bereiche/baubetrieb/domain/seed.ts`) drei Projekte mit acht
  Anmeldungen, Termine relativ zum heutigen Tag, und die Standard-Workflows.
* Alle Schreibzugriffe über `mutate()` in
  `src/bereiche/baubetrieb/store/store.tsx`; Statuswechsel und Rücknahme als
  reine Funktionen `wechselAnwenden` und `wechselZuruecknehmen` in
  `src/bereiche/baubetrieb/domain/ablauf.ts`, Duplizieren über
  `anmeldungDuplizieren` (Kennungen vorab, Kopie direkt hinter dem Original;
  „(Kopie)“ an der führenden Bezeichnung, ohne Nummer wird „(Kopie)“ die
  Nummer, auch im gespeicherten Vorstand für das Zurücknehmen),
  Workflows über
  `workflowSpeichern`, `workflowLoeschen` und `workflowKopie` in
  `src/bereiche/baubetrieb/domain/workflowPflege.ts`.

### 7.2 Routen

| Route | Seite | Aktionen |
| --- | --- | --- |
| `#/baubetrieb` | Übersicht (`src/bereiche/baubetrieb/pages/Uebersicht.tsx`) | Kacheln „Anmeldungen“, „Terminfristen überfällig“, „Demnächst fällig“, „Nachhaken & Anmeldebedarf“. Karte „Anstehende Terminfristen“ (die ersten acht, `ANZAHL_TERMINE`, samt ausstehender Erstanmeldungen, diese mit Prozessphase und Projekt) mit „Status ändern …“ je Zeile; Karte „Anmeldebedarf aus den Projekten“ (nur wenn Bedarf besteht); Karte „Projekte“ mit der Zahl der Anmeldungen je Workflow, überfälligen Fristen (samt überfälliger Erstanmeldung) und nächster Frist (ohne Anmeldung die der Erstanmeldung). Angezeigt werden markierte Projekte, ohne Markierung alle (`sichtbareProjekte`). |
| `#/baubetrieb/termine` | Termine & Nachhaken (`src/bereiche/baubetrieb/pages/Termine.tsx`) | Alle Anmeldungen mit Terminfrist über alle Projekte, gegliedert nach Projekt; Filter Alle / Überfällig / Fällig / Im Plan / Zum Nachhaken, Suche; je Zeile „Nachgehakt“ (bei Status zum Nachhaken) und „Status ändern …“; je Projekt zuerst eine Zeile „Erstanmeldung ausstehend“ (`ausstehendeErstanmeldungen`) mit „Ausstehend“, Terminfrist und „Zum Projekt“ – sie zählt in den Filtern mit. Darunter „Anmeldebedarf aus den Projekten“. |
| `#/baubetrieb/projekte` | Projekte (`src/bereiche/baubetrieb/pages/Projekte.tsx`) | Karten mit DB-G-Nummer, MIC-Projektnummer, betroffenen Fahrplanjahren, Status der Betreuung, ★-Markierung, Zahl der Anmeldungen, überfälligen Fristen (samt überfälliger Erstanmeldung) und „Nächste Anmeldung“ aus dem Anmeldebedarf; „Neues Projekt“ (`ProjektDialog`). |
| `#/baubetrieb/projekt/<id>` | Projekt (`src/bereiche/baubetrieb/pages/ProjektDetail.tsx`) | „Excel“, „Bearbeiten“, „Löschen“ (samt Anmeldungen); Stammdaten; ohne Anmeldung (Anmeldeleichen zählen nicht) die Karte „Erstanmeldung ausstehend“ (`ErstanmeldungKarte`) mit Prozessphase, Terminfrist samt Ampel und Herkunft der Frist (`ERSTANMELDUNG_GRUND`), ohne Frist „Projekt bearbeiten“; Überschrift „Baubetriebliche Anmeldungen“ mit Suche und „Neue Anmeldung“; darunter je Workflow eine Tabelle (`AnmeldungenTabelle`) mit den Spalten Anmeldung (im SKM der Vorhabenname, darunter tVE-Nr; die Maßnahmenart in der zweiten Zeile nur, wo der Workflow mehrere führt), Sperrzeitraum, Status (ohne Workflow davor), Zuständig (`zustaendigText`: Rolle des Status samt Namen), Terminfrist (Ampelpunkt, Datum, Abstand; Regel im Tooltip) und „Status ändern …“. Jede Zeile umfasst höchstens zwei Textzeilen (`EINZEILIG` kürzt mit Auslassungspunkten). Workflows ohne Anmeldung zeigen nur die Kopfzeile mit „keine Anmeldung“; bei einer Suche entfallen Workflows ohne Treffer. Die frühere Karte zum Anmeldebedarf je Fahrplanjahr entfällt. |
| `#/baubetrieb/projekt/<id>/anmeldung/<id>` | Anmeldung (`src/bereiche/baubetrieb/pages/AnmeldungDetail.tsx`) | Weg durch die Workflows; Karte „Workflow …“ mit den Status des aktuellen Workflows in ihrer Reihenfolge – erreichte mit „zuletzt erreicht am …“, der aktuelle mit Terminfrist samt Rechenweg und den Nachfolgern („Weiter mit:“ – der Wechsel in eine Anmeldeleiche in Rot –, „Übernahme in neue Phase:“, „Abschluss:“ mit „Eintrag löschen“), „Nachgehakt …“, „Termin festlegen …“, „Letzten Wechsel zurücknehmen“, dazu „Zuständig:“ mit Rolle und Namen; Karte „Merkmale“ („Vorhabenname“ im SKM und wo er gesetzt ist, die Nummer als „tVE-Nr“ – bei älteren SKM-Einträgen ohne Vorhabenname weiter „Begriff / tVE-Nr“ –, „Zuständiger BBK“, Herkunft bzw. „Aufgeteilt in“); Karte „Statusverlauf“; oben rechts „Bearbeiten“, „Duplizieren“ (Kopie mit aktuellem Stand und Statusverlauf, Vermerk „Dupliziert aus …“, „(Kopie)“ an der führenden Bezeichnung; öffnet die Kopie) und „Löschen“. |
| `#/baubetrieb/workflows` | Workflows (`src/bereiche/baubetrieb/pages/Workflows.tsx`) | „Weg einer Anmeldung“; Liste „Workflows“ mit Kennzeichen „Standard“ bzw. „Eigener Workflow“, Zahl der Status und Anmeldungen, den Status in ihrer Reihenfolge, „Öffnen“, „Duplizieren“ und – bei eigenen Workflows ohne Anmeldungen – Löschen; „Neuer Workflow“; Übersicht der Richtlinienfristen nach Phase (`rilFristenNachPhase`) mit „Anpassen“. Editor siehe 7.3. Die frühere Adresse `#/baubetrieb/workflow` zeigt dieselbe Seite. |
| `#/baubetrieb/einstellungen` | Einstellungen (`src/bereiche/baubetrieb/pages/Einstellungen.tsx`) | Richtlinienfristen je Schlüssel (`RIL_SCHLUESSEL`), nach Phase gegliedert (`rilFristenNachPhase`, je Phase eine Gruppenzeile mit Hinweis aus `RIL_PHASE_HINWEIS`) und mit Kürzel (`RIL_KUERZEL`, z. B. „Ril_KM N-2“, „Ril_KKM B(S)“), als „Stichtag im Fahrplanjahr“ oder „Wochen vor Sperrbeginn“, Kennzeichen „Platzhalter“ mit „Geprüft“; „Fällig ab“, „Nachhak-Abstand – Vorgabe“, „Anmeldebedarf – Vorschau“. Änderungen gelten sofort. |

Router: `src/bereiche/baubetrieb/lib/router.ts`; unbekannte Adressen führen auf
die Übersicht.

### 7.3 Workflows, Statuswechsel und Fristen

* `standardWorkflows()` in `src/bereiche/baubetrieb/domain/workflow.ts` liefert
  die Standard-Workflows „SKM“, „MKM“, „KM (n-2 & n-1)“ und „KKM
  (unterjährig)“ (Kurzbezeichnungen SKM, MKM, KM, KKM) mit festen Status-IDs. Jeder endet mit dem Status
  „Anmeldeleiche“ (Art `leiche`, ohne Terminfrist, einziger Nachfolger
  `LOESCHEN`), erreichbar aus „Entwurf“ und „Abgelehnt“. `STATUS_TON` in
  `src/bereiche/baubetrieb/components/common.tsx` zeigt ihn rot. Neu angelegt wird im ersten Status eines
  Workflows (`AnmeldungDialog` in
  `src/bereiche/baubetrieb/components/AnmeldungDialog.tsx`: ein Auswahlfeld
  „Phase und Maßnahmenart“, nach Phase gegliedert; je Eintrag Kurzbezeichnung
  und Art, etwa KKM · B(S));
  vorbelegt ist KKM (`NEUANLAGE_WORKFLOW`).
* Editor (`WorkflowEditor` in `src/bereiche/baubetrieb/pages/Workflows.tsx`):
  Name, Kurzbezeichnung, Beschreibung, Sperrzeitraum, Maßnahmenarten; je Status
  eine Karte mit Bezeichnung, Art (`STATUS_ART_LABEL`), „Zuständig“ (MIC, BBK,
  Projektleitung DB oder „– niemand –“), Terminfrist
  (`FRIST_TYP_LABEL`: „Keine Terminfrist“, „Frist laut Richtlinie“, „Nächster
  Stichtag (TT.MM.)“, „Nachhak-Termin nach Statuswechsel“; der Bezug einer
  Frist laut Richtlinie nach Phase gegliedert, `RIL_BEZUG_LABEL` und
  `RIL_BEZUG_PHASE`, Kurzform mit `RIL_BEZUG_KUERZEL`), „Termin dient zum
  Nachhaken“, Bemerkung und Nachfolgern („Nachfolger hinzufügen …“ mit „Dieser
  Workflow“, „Übernahme in …“ und „Eintrag löschen (endgültig)“; zur Art
  „Anmeldeleiche“ ein Hinweis);
  Verschieben, Entfernen (nicht bei Status mit Anmeldungen), „Status“ fügt
  einen Status an. Der Sperrzeitraum ist gesperrt, solange Anmeldungen im
  Workflow stehen. Speichern prüft Name, Status-Bezeichnungen, Arten und
  belegte Status (`belegteEntfallendeStatus`); Nachfolger auf entfallene
  Status werden in allen Workflows entfernt. „Duplizieren“ (`workflowKopie`)
  hängt „(Kopie)“ an Name und Kurzbezeichnung.
* Die Auswahl „Status ändern …“ (`NachfolgerAuswahl` in
  `src/bereiche/baubetrieb/components/common.tsx`) bietet nur die Nachfolger
  des aktuellen Status an (`nachfolgerVon`).
* Statuswechsel im Dialog `src/bereiche/baubetrieb/components/StatusWechselDialog.tsx`:
  Datum, Bemerkung, beim Eintritt in eine Änderungsabstimmung ÄAbst-Nr und
  AnnexVII; bei einem Wechsel in einen anderen Workflow (`istUebernahme`)
  Maßnahmenart und je Zeile Anmelde-ID, Bf/Strecke und Sperrzeitraum, mit
  „Weitere Anmeldung“ zur Aufteilung (weitere Einträge erhalten `herkunftId`).
  Der Wechsel in eine Anmeldeleiche ist ein gewöhnlicher Statuswechsel mit
  Hinweis („Die Anmeldung bleibt als Anmeldeleiche rot gekennzeichnet im
  Projekt stehen …“). Erst „Eintrag löschen“ (`LOESCHEN`) fragt „Anmeldeleiche
  löschen?“ (bzw. „Anmeldung löschen?“, wenn ein eigener Workflow das Löschen
  aus einem anderen Status erlaubt) und löscht den Eintrag samt Verlauf.
* Terminfrist (`terminfrist` in `src/bereiche/baubetrieb/domain/fristen.ts`):
  von Hand festgelegter Termin (`terminManuell`, gilt bis zum nächsten
  Wechsel), sonst nach der Fristregel des Status. Richtlinienfristen aus
  `rilFristen`; welche gilt, entscheidet `rilSchluesselFuer`: Ril_KM nimmt die
  N-2-Frist, solange sie am Tag des Statuswechsels nicht verstrichen ist und
  nicht vor dem ersten Anmeldetermin des Projekts abzüglich `CA_TOLERANZ_TAGE`
  liegt, sonst die N-1-Frist (`kmGrundFuerN1`; der Rechenweg nennt den Grund),
  Ril_KKM die Frist der Maßnahmenart, für die Arten SKM und MKM die von A. Die Vorbelegung `standardRilFristen()` in `seed.ts` ist als
  `platzhalter` gekennzeichnet. Ampel `ampelFuer` mit `vorlaufTage`.
* Fahrplanjahr: `fahrplanjahrBeginn`, `fahrplanjahrEnde`, `fahrplanjahrVon` –
  Ende am zweiten Samstag im Dezember. Ob ein Workflow den Sperrzeitraum als
  ganzes Fahrplanjahr führt, entscheidet `ganzesFahrplanjahr`.
* Anmeldebedarf (`anmeldebedarf`, `faelligerBedarf`): je betroffenem
  Fahrplanjahr (`Projekt.fahrplanjahre`) und je SKM, MKM, KM N-2, KM N-1 die
  Frist (bei Wochen vor Sperrbeginn gerechnet ab Beginn des Fahrplanjahres) und der Zustand `abgedeckt`
  (Einträge im KM oder KKM decken beide KM-Fristen ab, bei mehreren zählt der
  frühere Workflow; Anmeldungen in einer Anmeldeleiche zählen nicht,
  `istLeiche`),
  `faellig`, `kuenftig`, `verstrichen`, `vorBeginn` oder `offen`; Fristen, die
  mehr als 31 Tage vor dem ersten Anmeldetermin liegen, gelten als `vorBeginn`
  (`CA_TOLERANZ_TAGE`, weil der erste Anmeldetermin nur ein ca.-Wert ist).
  Angezeigt wird er unter „Anmeldebedarf aus den Projekten“ in Übersicht und
  Terminen und als „Nächste Anmeldung“ der Projektliste.
* Erstanmeldung (`erstanmeldungAusstehend`, `ausstehendeErstanmeldungen`):
  Projekte, die nicht abgeschlossen sind und keine Anmeldung außer
  Anmeldeleichen haben; Frist ist der erste Anmeldetermin, sonst
  `ersterTerminVorschlag`. Die Seitenleiste zählt überfällige Erstanmeldungen
  bei „Termine & Nachhaken“ mit, ebenso die Kacheln „Terminfristen überfällig“
  und „Demnächst fällig“ der Übersicht.
* Ril_KKM in Wochen vor Sperrbeginn fällt auf den Mittwoch an oder vor
  diesem Datum (`rilDatum` mit `stichtagMittwoch`); der Rechenweg nennt
  „(Stichtag Mittwoch)“.

### 7.4 Übergreifende Bedienelemente

* Seitenleiste: Übersicht, „Termine & Nachhaken“ (mit der Zahl überfälliger
  Fristen), Projekte, Workflows, Einstellungen, darunter die markierten
  Projekte; unten „Angemeldet als“ (Name, Vorgabe `STANDARD_BEARBEITER =
  'Bearbeitung MIC'`, und „Farbmodus für Rot-Grün-Sehschwäche (hoher
  Kontrast)“), „Sicherung“, „Einspielen“, „Zurücksetzen“ und „Bereich
  wechseln“.
* Sicherung (`exportiereDaten`) lädt `baubetrieb-sicherung-<Datum>.json` mit
  `"bereich": "baubetrieb"`. Einspielen
  (`src/bereiche/baubetrieb/components/Sicherung.tsx`) fragt „Sicherung
  einspielen?“, bietet „Aktuellen Stand sichern“ und übernimmt „Angemeldet
  als“ und Farbmodus nur mit dem Haken „Auch „Angemeldet als“ und Farbmodus
  aus der Sicherung übernehmen“.
* Excel (`monitorExportieren` in `src/bereiche/baubetrieb/domain/export.ts`):
  Blätter „Anmeldungen“ (mit den Spalten „Workflow“ und „Status“) und
  „Projekte“, Terminfristen bei überfälligen Anmeldungen rot, bei fälligen
  orange hinterlegt.

### 7.5 Meldungen

| Meldung | Fundstelle | Ursache |
| --- | --- | --- |
| „Bitte eine Bezeichnung angeben.“ | `src/bereiche/baubetrieb/pages/Projekte.tsx` | Projekt ohne Bezeichnung. |
| „Bitte einen Workflow wählen.“ | `src/bereiche/baubetrieb/components/AnmeldungDialog.tsx` | Neuanlage ohne Workflow mit Status. |
| „Das Ende des Sperrzeitraums liegt vor dem Beginn.“ | `src/bereiche/baubetrieb/components/AnmeldungDialog.tsx` | Sperrzeitraum einer Anmeldung verkehrt. |
| „Bitte das Fahrplanjahr wählen.“ | `src/bereiche/baubetrieb/components/AnmeldungDialog.tsx` | Eintrag in einem Workflow mit ganzem Fahrplanjahr ohne Fahrplanjahr. |
| „Ohne Beginn des Sperrzeitraums lässt sich die Terminfrist nach Richtlinie nicht berechnen.“ | `src/bereiche/baubetrieb/components/AnmeldungDialog.tsx` | Hinweis bei tagesscharfen Anmeldungen ohne Beginn des Sperrzeitraums. |
| „Bitte das Datum des Statuswechsels angeben.“ | `src/bereiche/baubetrieb/components/StatusWechselDialog.tsx` | Datum geleert. |
| „Bitte je Eintrag das Fahrplanjahr wählen.“ | `src/bereiche/baubetrieb/components/StatusWechselDialog.tsx` | Übernahme in einen Workflow mit ganzem Fahrplanjahr ohne Fahrplanjahr. |
| „Das Ende eines Sperrzeitraums liegt vor dem Beginn.“ | `src/bereiche/baubetrieb/components/StatusWechselDialog.tsx` | Übernahme mit verkehrtem Sperrzeitraum. |
| „Anmeldeleiche gelöscht.“ / „Anmeldung gelöscht.“ | `src/bereiche/baubetrieb/components/StatusWechselDialog.tsx` | Kein Fehler: „Eintrag löschen“ aus der Anmeldeleiche bzw. aus einem anderen Status. |
| „Bitte einen Namen angeben.“ / „Bitte mindestens einen Status anlegen.“ / „Bitte jeden Status benennen.“ / „Bitte mindestens eine Maßnahmenart wählen.“ | `src/bereiche/baubetrieb/pages/Workflows.tsx` | Workflow-Editor: Pflichtangaben fehlen. |
| „„…“ kann nicht entfallen – darin stehen noch Anmeldungen.“ | `src/bereiche/baubetrieb/pages/Workflows.tsx` | Beim Speichern entfiele ein Status, in dem noch Anmeldungen stehen. |
| „Der Sperrzeitraum lässt sich nicht umstellen, solange Anmeldungen in diesem Workflow stehen.“ | `src/bereiche/baubetrieb/pages/Workflows.tsx` | Schutz beim Speichern; das Auswahlfeld ist in diesem Fall ohnehin gesperrt. |
| „Die Datei ist keine gültige JSON-Datei.“ | `src/bereiche/baubetrieb/store/storage.ts` | Einspielen einer Datei, die kein JSON ist. |
| „Die Datei ist eine Sicherung des Planlaufmanagements – bitte dort einspielen.“ | `src/bereiche/baubetrieb/store/storage.ts` | Das JSON enthält `projects`. |
| „Die Datei ist keine Sicherung der Baubetriebsplanung.“ | `src/bereiche/baubetrieb/store/storage.ts` | Kennzeichen `bereich` fehlt oder Listen fehlen. |
| „Die Sicherung stammt aus einer neueren Fassung von KaPlan. Bitte die Seite neu laden (Strg+Umschalt+R) und erneut einspielen.“ | `src/bereiche/baubetrieb/store/storage.ts` | `version` größer als `DATEN_VERSION`. |
| Seite „Nicht gefunden“ | `src/bereiche/baubetrieb/App.tsx` | Adresse nennt ein Projekt oder eine Anmeldung, die es nicht (mehr) gibt – etwa nach „Eintrag löschen“. |

## 8. Bereich Projektsteuerung

Erster Entwurf für die externe Projektsteuerung: je Projekt die
Projektbeteiligtenliste und die Besprechungsprotokolle. Einstiegspunkt ist `src/bereiche/projektsteuerung/index.tsx`, Rahmen und Seitenleiste stehen in
`src/bereiche/projektsteuerung/App.tsx`, die Gestaltung in `src/bereiche/projektsteuerung/projektsteuerung.css` (Klassen mit dem
Präfix `ps-`, Farben aus den Design-Tokens). Der Bereich greift nicht auf die
anderen Bereiche zu. Die Protokolle bilden das eigenständige Protokoll-Tool
(HTML-Datei) nach; dessen Dateien lassen sich übernehmen (`ausProtokollTool`
in `src/bereiche/projektsteuerung/domain/protokoll.ts`).

### 8.1 Datenmodell und Speicherung

* `src/bereiche/projektsteuerung/domain/types.ts`: `Projekt` (mit `logos`; `null` steht für
  `STANDARD_LOGOS` aus `src/bereiche/projektsteuerung/domain/seed.ts`), `Funktion` (projektübergreifend,
  mit `gewerk`; `null` = übergreifend, Seite `UEBERGREIFEND`; volle Bezeichnung
  `funktionsName`, etwa „Fachplanung LST“), Liste `gewerke`,
  `Beteiligter` (Person der Projektbeteiligtenliste mit `funktionId`),
  `Protokoll` mit `reiheId`, `teilnehmer` (`Teilnehmer` mit `beteiligterId`)
  und `tops` (`Top` mit `eintraege`, `entfaellt` für einen gestrichenen und
  `vorEntfaellt` für einen im Vorprotokoll gestrichenen Punkt; `Eintrag` vom
  Typ `I`, `F` oder `A`, `EINTRAG_TYP_LABEL`, mit `zeilen` – `Zeile` mit
  `herkunft` (Nummer des Ursprungsprotokolls, `null` = neu), `typ` (eigene
  Art einer Ergänzung mit `wer`, `termin` und `status`; `null` = läuft unter
  dem Ursprung mit), `entfaellt` und `vor` (`ZeileVorstand`) –; `vor`
  (`EintragVorstand`) hält den Stand im Vorprotokoll, `uebernommenIn` das
  Folgeprotokoll eines weitergeführten Eintrags mit Aufgaben, `entfaellt`
  einen gestrichenen Eintrag). Teilnahmestatus in `TEILNAHME` (anwesend, entschuldigt, abwesend, nur
  Verteiler).
* Schlüssel `projektsteuerung.data.v1` im `localStorage`
  (`src/bereiche/projektsteuerung/store/storage.ts`), `DATEN_VERSION = 5`. `aufbereiten()` ergänzt
  fehlende Felder (`entfaellt` als false, `typ` einer Zeile als `null`) und
  die Gewerke der Funktionen in `gewerke`. `migriere()` hebt Fassung 1 (ohne
  Gewerke) an: Sie erhält `STANDARD_GEWERKE`, ihre Funktionen gelten als
  übergreifend; Fassung 2 kannte keine gestrichenen Einträge. Bis Fassung 3
  bestand ein Eintrag aus Text, Ergänzung und Fundstelle: `zeilenAusAltform`
  (`src/bereiche/projektsteuerung/domain/protokoll.ts`) macht den Text zu einer Zeile aus dem
  Protokoll der Fundstelle, die Ergänzung zu einer neuen Zeile. Bis Fassung 4
  führte jedes Projekt eine Liste offener Punkte (LOP); sie entfällt beim
  Laden samt den Verweisen der Aufgaben. Ohne gespeicherten Bestand lädt `seedDaten()`
  (`src/bereiche/projektsteuerung/domain/seed.ts`) die Gewerke (`STANDARD_GEWERKE`: 50 Hz, KIB, LST, OLA,
  TK), die Standard-Funktionen (`STANDARD_FUNKTIONEN`, je Gewerk die
  Fachplanung, für LST und OLA zusätzlich die Bauüberwachung) und zwei
  Projekte mit Projektbeteiligten und zwei Protokollen einer Reihe; Termine
  relativ zum heutigen Tag.
* Alle Schreibzugriffe über `mutate()` in `src/bereiche/projektsteuerung/store/store.tsx`. Danach
  gleicht `teilnehmerNachziehen` (`src/bereiche/projektsteuerung/domain/protokoll.ts`) Name, Funktion,
  Firma und Kürzel verknüpfter Teilnehmender mit der Projektbeteiligtenliste
  ab; ist die Person gelöscht, bleiben die Angaben stehen und der Verweis
  entfällt.

### 8.2 Routen

| Route | Seite | Aktionen |
| --- | --- | --- |
| `#/projektsteuerung` bzw. `#/projektsteuerung/uebersicht` | Übersicht (`src/bereiche/projektsteuerung/pages/Uebersicht.tsx`) | Kacheln „Aktive Projekte“, „Offene Punkte“, „Überfällig“, „Demnächst fällig“. Karte „Offene Punkte“ mit den Aufgaben der Protokolle – Einträge vom Typ A und Ergänzungen mit eigener Art „Aufgabe“ (`offenePunkte` in `src/bereiche/projektsteuerung/domain/punkte.ts`, `protokollAufgaben`) –, Filter Alle / Überfällig / Fällig, zunächst zehn Zeilen (`ANZAHL_PUNKTE`), je Zeile „Erledigt“ (Store `punktErledigen`, auch für Ergänzungen); ein Klick führt zum Protokoll (`punktZiel`). Karte „Projekte“ mit Beteiligten, Protokollen, letzter Besprechung, nächstem Termin, offenen und überfälligen Punkten und „Protokolle“. Angezeigt werden markierte Projekte, ohne Markierung alle (`sichtbareProjekte`). |
| `#/projektsteuerung/projekte` | Projekte (`src/bereiche/projektsteuerung/pages/Projekte.tsx`) | Projektkarten mit Nummer, Status, ★-Markierung und der Zahl der Beteiligten, Protokolle und offenen Punkte; „Neues Projekt“ (`ProjektDialog`: Projektnummer, Status, Projektname, Beschreibung). |
| `#/projektsteuerung/funktionen` | Funktionen (`src/bereiche/projektsteuerung/pages/Funktionen.tsx`) | Reiter „Übergreifend“ und je Gewerk, **+** legt ein Gewerk an (`GewerkDialog` in `src/bereiche/projektsteuerung/components/GewerkDialog.tsx`). Je Seite die Funktionen mit Suche und Spalten Kürzel, Gewerk, Beschreibung, „Verwendet“; „Neue Funktion“ und Bearbeiten per Klick (`FunktionDialog` in `src/bereiche/projektsteuerung/components/FunktionDialog.tsx`: Bezeichnung, Gewerk mit „Gewerk“ zum Anlegen, Kürzel – leer aus der Bezeichnung gebildet, `kuerzelAus` –, Farbe, Beschreibung); auf Gewerkseiten „Vorhandene Funktion“ (Funktion eines anderen Gewerks übernehmen, Kürzel nach `kuerzelFuer`) und „Gewerk „…“ löschen“ (`GewerkLoeschenDialog`, entfernt das Gewerk samt Funktionen). Funktionen und Gewerke, die Projektbeteiligte tragen, lassen sich nicht löschen. |
| `#/projektsteuerung/projekt/<id>/<seite>` | Projekt (`src/bereiche/projektsteuerung/pages/ProjektDetail.tsx`) | Kopfzeile mit Nummer, Status, Beschreibung, „Bearbeiten“ und „Löschen“ (samt Beteiligten und Protokollen). Seiten `beteiligte` („Projektbeteiligte“) und `protokolle` („Protokolle“); die frühere Seite `lop` führt zu `protokolle`, ohne gültige Angabe `beteiligte`. Siehe 8.3 und 8.4. |
| `#/projektsteuerung/projekt/<id>/protokoll/<id>` | Protokoll (`src/bereiche/projektsteuerung/pages/projekt/ProtokollEditor.tsx`) | Siehe 8.4. |

Router: `src/bereiche/projektsteuerung/lib/router.ts`; unbekannte Adressen führen auf die Übersicht.

### 8.3 Projektbeteiligte

`src/bereiche/projektsteuerung/pages/projekt/Beteiligte.tsx`: Tabelle mit Funktion (Farbpunkt, volle
Bezeichnung und Kürzel), Person, Firma / Büro und Kontakt – nur Personen,
keine leeren Funktionen; übergreifende Funktionen zuerst, dann nach Gewerk,
Funktion und Nachname (`nachFunktion`). Reiter „Alle“, „Übergreifend“ und je
Gewerk, das im Projekt vorkommt. Suche, „Excel-Import“ (siehe unten),
„Drucken / PDF“ (`beteiligteHtml` und `blattDrucken` in
`src/bereiche/projektsteuerung/domain/druck.ts`), „Excel“ (`beteiligteExportieren` in
`src/bereiche/projektsteuerung/domain/export.ts`), „Person hinzufügen“. Dialog `BeteiligterDialog`
(`src/bereiche/projektsteuerung/components/BeteiligterDialog.tsx`): Funktion als Auswahl der
projektübergreifenden Funktionen mit „+ Neue Funktion anlegen …“ (öffnet
`FunktionDialog`; die neue Funktion ist danach gewählt), Anrede, Vorname,
Nachname, Firma / Büro, Kürzel (leer: Kürzel der Funktion, `kuerzelVon`),
E-Mail, Telefon, Mobil, Anschrift, Notiz; die Funktionsauswahl ist nach
Gewerk gruppiert, der Hinweis nennt, wer die Funktion im Projekt bereits führt;
„Person löschen“.

Excel-Import (`BeteiligteImport` in
`src/bereiche/projektsteuerung/components/BeteiligteImport.tsx`, Logik in
`src/bereiche/projektsteuerung/domain/beteiligteImport.ts`): .xlsx oder .csv, Kopfzeile in den ersten 15
Zeilen gesucht, Spalten nach `BETEILIGTE_KOPF` (Funktion, Gewerk, Kürzel,
Anrede, Vorname, Nachname, Firma / Büro, E-Mail, Telefon, Mobil, Anschrift,
Notiz) mit weiteren Schreibweisen; statt Vor- und Nachname genügt „Name“
(„Berger, Anna“ oder „Anna Berger“). Funktionen über `funktionFinden`
(Bezeichnung und Gewerk, volle Bezeichnung, eindeutige Bezeichnung, Kürzel);
fehlende werden samt Gewerk angelegt. Personen gleichen Namens im Projekt
werden mit den ausgefüllten Angaben aktualisiert. Die Vorschau nennt je
Zeile „wird aktualisiert“, „neue Funktion“, „neues Gewerk“, „ohne Funktion“
bzw. „doppelt in der Liste“. „Vorlage“ lädt `Vorlage_Projektbeteiligte.xlsx`
(`beteiligteVorlageLaden`); die Excel-Ausgabe hat dieselben Spalten.

### 8.4 Protokolle

* Liste (`src/bereiche/projektsteuerung/pages/projekt/Protokolle.tsx`): je Reihe (`reihenVon`) eine
  Karte mit „Folgeprotokoll“ und den Protokollen (Datum, Bezeichnung,
  Anwesende, übernommene Einträge, offene Aufgaben; „Öffnen“,
  „Folgeprotokoll“, Löschen). „Neue Protokollreihe“ (`NeueReiheDialog`:
  Besprechung mit Vorschlägen aus `BESPRECHUNG_VORSCHLAEGE`, Datum, Beginn,
  Ort; die Protokollführung übernimmt die angemeldete Person, wenn ihr Name in
  der Projektbeteiligtenliste steht). „Aus Protokoll-Tool“ liest `.protokoll`-
  und `.json`-Dateien des Protokoll-Tools (`ausProtokollTool`); Teilnehmende
  gleichen Namens werden mit der Projektbeteiligtenliste verknüpft,
  Protokolle gleicher Kennung im Projekt ersetzt. Karte „Logos im Druckkopf“
  (`src/bereiche/projektsteuerung/components/Logos.tsx`): „Logo hinzufügen“ (PNG, JPEG, SVG, WebP;
  Rasterbilder auf `LOGO_HOEHE` = 240 px Höhe verkleinert), Reihenfolge,
  Entfernen, „Standardlogos“.
* Editor (`src/bereiche/projektsteuerung/pages/projekt/ProtokollEditor.tsx`): Umschalter „Bearbeiten“ /
  „Druckansicht“, „Live-Druckansicht ↗“ (`useLiveDruck` in
  `src/bereiche/projektsteuerung/components/common.tsx`: ein eigenes Fenster, das der jeweils
  geöffneten Ansicht folgt), „Drucken / PDF“, „Folgeprotokoll anlegen“.
  Karte „Kopfdaten“ (Besprechung, Nr., Datum, Beginn, Ende, Ort, „Nächster
  Termin“, „Protokollführung“ aus Teilnehmenden oder Projektbeteiligten,
  „Verteiler (zusätzlich)“); Karte „Teilnehmende“ („Aus Beteiligtenliste …“
  mit Mehrfachauswahl und „Neue Person …“, „Weitere Person“ für Gäste,
  Status aus `TEILNAHME`; das Personensymbol nimmt Gäste in die
  Projektbeteiligtenliste auf); „Tagesordnung“ („TOP hinzufügen“,
  verschieben, löschen; Einträge mit Umschalter I/F/A, Verantwortlich als
  Auswahl aus den Teilnehmenden – Kürzel und Name, gespeichert wird das
  Kürzel (`zuordnung`) –, bei Aufgaben Termin und „erledigt“); Karte
  „Abschluss“ („Hinweis am Protokollende“, Vorgabe `STANDARD_HINWEIS`).
  Übernommene Zeilen eines Eintrags stehen fest („Zeile korrigieren“), darunter
  ihr Ursprung, etwa „aus Prot. 1“ (`zeileHerkunft`); die Ergänzung dieses
  Protokolls kommt als neue Zeile in das Feld „Ergänzung eintragen“.
* Ergänzungen mit eigener Art (`ZeileArt` und `WerAuswahl` im Editor): Unter
  einer neuen Ergänzung und unter jeder mit eigener Art steht der Umschalter
  I/F/A; mit Auswahl folgen Verantwortlich (aus den Teilnehmenden), bei A
  Termin und „erledigt“. Ein zweiter Klick auf die gewählte Art hebt sie auf –
  die Ergänzung läuft dann unter dem Ursprung mit. Ergänzungen mit eigener Art
  tragen eine Randlinie in der Farbe ihres Typs.
* Löschen (`LoeschenDialog` im Editor): Der Papierkorb an einem TOP („TOP
  löschen“), einem Eintrag („Eintrag löschen“) oder – sobald ein Eintrag mehr
  als eine Zeile hat – an einer übernommenen Zeile („Zeile löschen“) bietet
  „Durchstreichen“ und „Sofort löschen“; ein leerer neuer TOP bzw. Eintrag und
  eine neue Ergänzung entfallen sofort. Gestrichenes zeigt „Wiederherstellen“, gestrichene Einträge
  und Einträge gestrichener TOPs zusätzlich „entfällt“.
* Folgeprotokoll (`folgeprotokoll` in `src/bereiche/projektsteuerung/domain/protokoll.ts`): Nummer =
  höchste der Reihe + 1 (`naechsteNr`), Datum = nächster Termin des
  Vorprotokolls, Teilnehmende mit Status anwesend (außer nur Verteiler).
  Die Tagesordnung übernimmt `uebernahme` mit `eintragUebernehmen`:
  gestrichene TOPs, Einträge und Zeilen entfallen bereits im Folgeprotokoll,
  ebenso leere Zeilen und Einträge, die schon weitergeführt wurden
  (`uebernommenIn`). Erledigte Aufgaben – Eintrag oder Ergänzung mit eigener
  Art – gehen noch einmal mit und entfallen, wenn sie schon im Vorprotokoll
  erledigt waren (`letztmalig`). Ist der Ursprung eines Eintrags in diesem
  Sinn erledigt, laufen nur seine offenen Ergänzungen mit eigener Art weiter;
  ohne mitlaufende Zeile wird die erste von ihnen zum Eintrag. Jede
  übernommene Zeile behält ihr Ursprungsprotokoll; neue Zeilen erhalten die
  Nummer des Vorprotokolls. Wird ein Protokoll gelöscht, gelten die von ihm
  weitergeführten Aufgaben im Vorprotokoll wieder als offen.
* Druckfassung `protokollHtml` (`src/bereiche/projektsteuerung/domain/druck.ts`): Kopf mit Logos,
  Datum, Zeit, Ort, Protokollführung, Teilnehmende und Verteiler, Legende,
  Tabelle Nr. / Inhalt / Typ / Verantwortlich / Termin, nächster Termin,
  „Aufgestellt:“ und „Freigegeben:“, Hinweis. Je Eintrag zuerst der Ursprung
  mit seinen mitlaufenden Ergänzungen, darunter je Ergänzung mit eigener Art
  eine eigene Tabellenzeile mit Typ, Verantwortlich und Termin, ohne Nummer
  (`eintragHtml`). Unter jeder übernommenen Zeile steht ihr Ursprung („aus
  Prot. …“), ohne Punktnummer. Neue und gegenüber dem
  Vorprotokoll geänderte Angaben stehen blau (`eintragNeu`, `feldNeu`,
  `zeileFeldNeu`, `topNeu`; neue Zeilen ganz, ergänzter Text einer Zeile nur
  im Nachtrag).
  Erledigte und gestrichene TOPs, Einträge und Zeilen stehen durchgestrichen
  (Klasse `ps-gestrichen`): mit blauer Linie, wenn sie in diesem Protokoll
  erledigt bzw. gestrichen wurden (`zeileNeuGestrichen`, `topNeuGestrichen`,
  `ps-gestrichen-neu`), sonst mit schwarzer; der Text behält seine Farbe. Die
  Termin-Spalte nennt „entfällt“ bzw. „erledigt“, die Legende
  „Durchgestrichene Einträge sind erledigt oder entfallen.“ Die Druckansicht
  zeigt nur das Blatt; gedruckt wird über „Drucken / PDF“.

### 8.5 Übergreifende Bedienelemente

* Seitenleiste: Übersicht (mit der Zahl überfälliger Punkte), Projekte,
  Funktionen, darunter die markierten Projekte mit ihren überfälligen
  Punkten; unten „Angemeldet als“ (Name, Vorgabe `STANDARD_BEARBEITER =
  'Projektsteuerung MIC'`, und „Farbmodus für Rot-Grün-Sehschwäche (hoher
  Kontrast)“), „Sicherung“, „Einspielen“, „Zurücksetzen“ und „Bereich
  wechseln“.
* Ampel (`ampelFuer` in `src/bereiche/projektsteuerung/domain/punkte.ts`, Bezeichnungen in
  `AMPEL_LABEL`): erledigt, überfällig, demnächst fällig (`VORLAUF_TAGE = 7`
  Tage vorher), im Plan, ohne Termin.
* Sicherung (`exportiereDaten`) lädt `projektsteuerung-sicherung-<Datum>.json`
  mit `"bereich": "projektsteuerung"`. Einspielen
  (`src/bereiche/projektsteuerung/components/Sicherung.tsx`) fragt „Sicherung einspielen?“, bietet
  „Aktuellen Stand sichern“ und übernimmt „Angemeldet als“ und Farbmodus nur
  mit dem Haken „Auch „Angemeldet als“ und Farbmodus aus der Sicherung
  übernehmen“.

### 8.6 Meldungen

| Meldung | Fundstelle | Ursache |
| --- | --- | --- |
| „Bitte einen Projektnamen angeben.“ | `src/bereiche/projektsteuerung/pages/Projekte.tsx` | Projekt ohne Namen. |
| „Bitte eine Bezeichnung angeben.“ | `src/bereiche/projektsteuerung/components/FunktionDialog.tsx`, `src/bereiche/projektsteuerung/components/GewerkDialog.tsx` | Funktion bzw. Gewerk ohne Bezeichnung. |
| „Die Funktion „…“ gibt es bereits.“ | `src/bereiche/projektsteuerung/components/FunktionDialog.tsx` | Bezeichnung im selben Gewerk schon vergeben (ohne Rücksicht auf Groß- und Kleinschreibung). |
| „„…“ ist bereits angelegt.“ | `src/bereiche/projektsteuerung/components/GewerkDialog.tsx` | Gewerk gibt es schon (auch „Übergreifend“). |
| „Funktionen des Gewerks „…“ sind noch Projektbeteiligten zugeordnet – das Gewerk lässt sich deshalb nicht löschen.“ | `src/bereiche/projektsteuerung/pages/Funktionen.tsx` | Löschen eines Gewerks, dessen Funktionen Personen tragen. |
| „In der Datei fehlt eine Spalte „Nachname“ oder „Name“.“ | `src/bereiche/projektsteuerung/domain/beteiligteImport.ts` | Excel-Import ohne erkennbare Kopfzeile. |
| „Die Datei enthält keine Zeile mit einem Nachnamen.“ | `src/bereiche/projektsteuerung/components/BeteiligteImport.tsx` | Excel-Import ohne verwertbare Zeile. |
| „Eintrag … durchgestrichen.“ / „Eintrag … gelöscht.“, ebenso für „TOP …“ und „Zeile … von Eintrag …“ | `src/bereiche/projektsteuerung/pages/projekt/ProtokollEditor.tsx` | Kein Fehler: „Durchstreichen“ bzw. „Sofort löschen“ im Dialog „… aus dem Protokoll löschen?“. |
| „„…“ ist noch … Projektbeteiligten zugeordnet und lässt sich deshalb nicht löschen.“ | `src/bereiche/projektsteuerung/pages/Funktionen.tsx` | Löschen einer Funktion, die Personen tragen. |
| „Bitte eine Funktion wählen.“ / „Bitte einen Nachnamen angeben.“ | `src/bereiche/projektsteuerung/components/BeteiligterDialog.tsx` | Pflichtangaben einer Person fehlen. |
| „Bitte die Besprechung benennen.“ / „Bitte das Datum angeben.“ | `src/bereiche/projektsteuerung/pages/projekt/Protokolle.tsx` | Neue Protokollreihe ohne Besprechung bzw. Datum. |
| Dateiname mit „ist keine gültige JSON-Datei“, „enthält keine Protokolle“ bzw. „ist keine gültige Protokolldatei“ | `src/bereiche/projektsteuerung/domain/protokoll.ts` | Übernahme aus dem Protokoll-Tool mit unpassender Datei. |
| „Das Vorschaufenster wurde blockiert. Bitte Pop-ups für KaPlan zulassen und erneut auf „Live-Druckansicht“ klicken.“ | `src/bereiche/projektsteuerung/components/common.tsx` | Der Browser verhindert das Fenster der Live-Druckansicht. |
| „Die Datei ist keine gültige JSON-Datei.“ | `src/bereiche/projektsteuerung/store/storage.ts` | Einspielen einer Datei, die kein JSON ist. |
| „Die Datei ist eine Sicherung des Planlaufmanagements – bitte dort einspielen.“ | `src/bereiche/projektsteuerung/store/storage.ts` | Das JSON enthält `projects`. |
| „Die Datei ist eine Sicherung der Baubetriebsplanung – bitte dort einspielen.“ | `src/bereiche/projektsteuerung/store/storage.ts` | Kennzeichen `"bereich": "baubetrieb"`. |
| „Die Datei stammt aus dem Protokoll-Tool – bitte im Projekt unter „Protokolle“ importieren.“ | `src/bereiche/projektsteuerung/store/storage.ts` | Das JSON enthält `protocols`. |
| „Die Datei ist keine Sicherung der Projektsteuerung.“ | `src/bereiche/projektsteuerung/store/storage.ts` | Kennzeichen `bereich` fehlt oder Listen fehlen. |
| „Die Sicherung stammt aus einer neueren Fassung von KaPlan. Bitte die Seite neu laden (Strg+Umschalt+R) und erneut einspielen.“ | `src/bereiche/projektsteuerung/store/storage.ts` | `version` größer als `DATEN_VERSION`. |
| Seite „Nicht gefunden“ | `src/bereiche/projektsteuerung/App.tsx` | Adresse nennt ein Projekt oder Protokoll, das es nicht (mehr) gibt. |
