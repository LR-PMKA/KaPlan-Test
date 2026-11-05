# KaPlan

KaPlan gliedert sich in drei getrennte Bereiche, zwischen denen der Startbildschirm wählt:

* **Planlaufmanagement** – Verwaltungssoftware für Planläufe: Projekte,
  Planpakete/Pläne/Planverzeichnisse und die Prozessketten, die diese durchlaufen – mit
  Soll-/Ist-Terminen ab dem tatsächlichen Eingang, parallelen Prüf- und Versandschritten,
  Fristenüberwachung, Terminnachweis je Seite und vorbereiteten Erinnerungs-E-Mails.
* **Baubetriebsplanung** (erster Entwurf) – Monitor für baubetriebliche Anmeldungen von
  Sperrpausen: Projekte mit ihren Anmeldungen, die anpassbare Workflows je Phase durchlaufen –
  SKM, MKM, KM (n-2 & n-1) und KKM (unterjährig) – mit Terminfristen laut Richtlinie,
  Nachhak-Terminen, ausstehenden Erstanmeldungen und dem Anmeldebedarf je Fahrplanjahr.
* **Projektsteuerung** (erster Entwurf) – je Projekt die Projektbeteiligtenliste mit
  projektübergreifenden Funktionen und Besprechungsprotokolle mit Folgeprotokollen.

Die Bereiche arbeiten unabhängig voneinander: eigener Datenbestand, eigener Speicherort im
Browser, eigene Einstellungen, eigener Router. Der Startbildschirm zeigt sie als Kacheln; in einem
Bereich führt **Bereich wechseln** unten in der Seitenleiste zurück. Der Abschnitt
**Funktionsumfang** beschreibt das Planlaufmanagement, die Abschnitte
[**Baubetriebsplanung**](#baubetriebsplanung) und [**Projektsteuerung**](#projektsteuerung) die
beiden anderen Bereiche.

Dieser Stand ist ein **lauffähiger Prototyp ohne Datenbank**: Alle Daten liegen lokal im Browser
(`localStorage`). Die Anwendung ist responsiv und als PWA installierbar.

Die Software ist auf die Nutzung durch mehrere Personen ausgelegt – alle sehen alle Projekte, und
jede Person stellt in der Seitenleiste ein, wer sie ist (eigene Funktion im Projekt:
**Planlaufmanagement**). Solange die
Daten lokal im Browser liegen, arbeitet allerdings jeder Arbeitsplatz auf einem eigenen Stand; ein
gemeinsamer Datenbestand setzt den nächsten Schritt – die Anbindung einer Datenbank – voraus. Das Datenmodell ist bereits so geschnitten, dass es später ohne Änderungen an
der Oberfläche auf eine relationale Datenbank umgestellt werden kann.

## Logos

Die Logos von KaPlan liegen unter `public/logos/`:

| Datei | Verwendung |
| --- | --- |
| `Logo_Startseite.png` | Startbildschirm (Bereichsauswahl), oben links |
| `Logo_Planlaufmanagement.png` | Kopf der Menüleiste im Planlaufmanagement |
| `Logo_Baubetriebsplanung.png` | Kopf der Menüleiste in der Baubetriebsplanung |
| `Logo_Projektsteuerung.png` | Kopf der Menüleiste in der Projektsteuerung |
| `Druck_DB_InfraGO.png`, `Druck_Mailaender_Consult.png` | Standardlogos im Druckkopf von Protokoll und Beteiligtenliste der Projektsteuerung |
| `Logo.png` | Symbol; daraus sind Favicons und App-Symbole unter `public/icons/` erzeugt |

Zum Austauschen genügt es, die Datei unter gleichem Namen zu ersetzen; die Logos werden nur über
die Breite bzw. Höhe skaliert. Nach einem neuen Symbol müssen die Dateien in `public/icons/`
(`favicon-32/64`, `icon-192/512`, `icon-maskable-512`, `apple-touch-icon`) neu erzeugt und der
Cache-Name in `public/sw.js` hochgezählt werden.

Die Wortmarke Mailänder Consult in der Kopfzeile stammt aus der Datei `public/mailaender-consult.svg`. Die derzeit
hinterlegte Fassung ist mit der Systemschrift nachgezeichnet. Um das Original zu verwenden, genügt
es, diese Datei durch die Originaldatei zu **ersetzen** – gleicher Name, gleicher Ort; eine
PNG-Datei funktioniert ebenso (`public/mailaender-consult.png`, dann in
`src/shared/logos.tsx` die Konstante `MAILAENDER_DATEI` anpassen). Die Anwendung skaliert die
Datei ausschließlich über die Höhe, das Seitenverhältnis bleibt damit unverändert.

## Starten

```bash
npm install
npm run dev      # Entwicklungsserver auf http://localhost:5173
npm run build    # Produktionsbuild nach dist/
npm run preview  # Produktionsbuild lokal ansehen
npm run typecheck
```

Beim ersten Start wird ein Demodatenbestand mit einem Projekt samt Funktionen, Besetzungen, Plänen
und laufenden Planläufen geladen. Über **Zurücksetzen** (unten in der Seitenleiste) lässt sich
dieser Stand jederzeit wiederherstellen, über **Sicherung** der gesamte Bestand als JSON sichern
und über **Einspielen** eine solche Sicherung wieder laden. Vor dem Einspielen nennt eine Rückfrage
Projekte, Pläne und Planläufe der Sicherung und bietet an, den jetzigen Stand vorher zu sichern –
denn er wird vollständig ersetzt. Sicherungen älterer Fassungen werden dabei auf den aktuellen Stand
gehoben. *Angemeldet als* bleibt erhalten, es sei denn, der Name aus der Sicherung wird ausdrücklich
übernommen.

## Veröffentlichen (GitHub Pages)

Veröffentlicht wird über [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Der Workflow
baut bei jedem Push auf `main` (`npm ci`, `npm run build`) und legt den Build an drei Stellen ab:

1. als **GitHub-Pages-Bereitstellung** – greift bei **Settings → Pages → Build and deployment →
   Source: „GitHub Actions“**,
2. im Branch **`gh-pages`** (nur der Build, ohne Verlauf) – für „Deploy from a branch“ mit
   `gh-pages` und `/ (root)`,
3. im Ordner **`app/`** auf `main` – für „Deploy from a branch“ mit `main` und `/ (root)`.

Bei Pull Requests baut der Workflow nur (einschließlich Typprüfung) und veröffentlicht nichts.
Die Seite erscheint unter `https://mailander-consult-gmbh.github.io/MC-Plan/`.

Zu Variante 3: GitHub liefert dabei den Zweig selbst aus. Die `index.html` im Stamm ist die
Einstiegsdatei für die Entwicklung und verweist auf `/src/main.tsx`, das ein Browser nicht ausführen
kann. Ihr kleines Skript wechselt deshalb nach 1,5 Sekunden auf **`app/`**, wo der eingecheckte Build
liegt (direkt erreichbar unter `…/MC-Plan/app/`). Fehlt dieser Build, erscheint statt einer weißen
Seite ein Hinweis. Der fertige Build selbst leitet nie um – auch nicht, wenn er langsam lädt. `app/` wird auf `main` vom Workflow erneuert und nicht von Hand gepflegt; nur wer
einen anderen Zweig über Pages ansehen will, baut dort selbst:

```bash
npm run build
rm -rf app && cp -r dist app
```

Die Quelle muss auf „GitHub Actions“, `gh-pages` oder `main` stehen. Zeigt „Deploy from a branch“
auf einen anderen Zweig, liefert GitHub dessen Stand aus und überschreibt damit auch die
Bereitstellung des Workflows. Mit „Deploy from a branch“ auf `main` laufen beide Wege parallel –
es gilt, was zuletzt fertig wird; eindeutig ist daher „GitHub Actions“.

Die Schreibrechte für die Ablage in `gh-pages` und `app/` fordert der Workflow selbst an
(`permissions: contents: write` im Job `ablage`); die Voreinstellung unter Settings → Actions →
General → Workflow permissions muss dafür nicht geändert werden. Ist `main` gegen direkte Pushes
geschützt, scheitert nur die Ablage in `app/` – der Workflow meldet das als Warnung. Wird der Push
nach `gh-pages` abgewiesen, schlägt der Lauf fehl. Für private Repositories setzt GitHub Pages
einen kostenpflichtigen GitHub-Plan voraus.

Ändert sich die Hülle (Titel, Symbole, Manifest), zusätzlich den Cache-Namen in `public/sw.js`
hochzählen, damit installierte Fassungen die neuen Dateien laden.

Technische Voraussetzung für Unterverzeichnisse: Der Build verwendet `base: './'` (relative Pfade).
Ohne diese Einstellung verweisen die Dateien auf `/assets/…` und die Seite bleibt unter einem
Unterverzeichnis wie `…/MC-Plan/` weiß. Die Navigation arbeitet mit Hash-Adressen (`#/planlauf/fristen`), daher
funktionieren Direktaufrufe und das Neuladen ohne zusätzliche Serverregeln.

## Als App installieren (PWA)

Die Anwendung ist eine installierbare Progressive Web App und läuft nach dem ersten Aufruf auch
ohne Netzverbindung – die Daten liegen ohnehin lokal im Browser.

* **iPhone/iPad (Safari):** Teilen → *Zum Home-Bildschirm*
* **Android (Chrome):** Menü → *App installieren*
* **Desktop (Chrome/Edge):** Installationssymbol in der Adressleiste

Enthalten sind `manifest.webmanifest`, App-Symbole aus `public/logos/Logo.png` (192/512 px, maskable und Apple-Touch-Icon)
sowie ein Service Worker (`public/sw.js`): Seitenaufrufe werden zuerst aus dem Netz geladen – eine
gültige Antwort ersetzt die zwischengespeicherte Startseite, eine Fehlerseite nicht – und
bei fehlender Verbindung aus dem Zwischenspeicher beantwortet, Programmdateien (gehashte Namen unter
`assets/`) kommen direkt aus dem Zwischenspeicher. Logos und Symbole werden wie Seitenaufrufe zuerst
aus dem Netz geladen – ein unter gleichem Namen ausgetauschtes Logo erscheint also sofort. Der Service Worker ist nur im Produktionsbuild aktiv, in der Entwicklung
stört er also nicht.

Die Oberfläche ist durchgehend responsiv: Ab etwa 860 px klappt die Seitenleiste in ein Menü, auf
Telefonbreite stehen die Kennzahlen zweispaltig, Tabellen scrollen quer bzw. werden – wie die
Fristenliste – zu gestapelten Karten, damit die Schaltflächen erreichbar bleiben.

## Funktionsumfang

### Projekte
Anlage und Pflege von Projekten (Projektnummer, Name, Status, Beschreibung). Beim Anlegen werden
die projektübergreifenden Funktionen als Projektfunktionen übernommen. Die E-Mail-Texte gelten
projektübergreifend und werden unter **Einstellungen › Vorlagen** in der Seitenleiste gepflegt.

### Funktionen und Gewerke
Im übergeordneten Reiter **Funktionen** werden die projektübergreifenden Funktionen gepflegt –
gegliedert in eine Seite je Gewerk sowie eine Seite **Übergreifend**. Neue Projekte übernehmen sie
automatisch. Mitgeliefert sind die vorgegebenen Funktionen: Planlaufmanagement (PLM), Projektleitung (PL), Fachplaner (FP),
Fachspezialist (FS), Bauvorlageberechtiger (BVB), Bau AN, Bauüberwachung (BÜW), Fachtechnischer
Prüfer (PSV), Prüfstatiker, Vermessungs-, Erdungs-, Schweißtechnischer, Korrosionsschutz-,
Gleisgeometrie- und Geotechnischer Prüfer.

Das **Planlaufmanagement** füllt stets die angemeldete Person mit ihrem Profil (*Angemeldet als*)
aus. Es steht deshalb weder hier noch im Projekt unter **Funktion** zur Bearbeitung, bleibt aber in
den Workflows als Verantwortlicher wählbar.

Übergreifende Funktionen (z.B. Projektleitung) werden im Projekt einmal besetzt; alle übrigen gehören zu einem oder mehreren Gewerken und werden je Gewerk mit einer
eigenen Person belegt – es gibt also z.B. einen Fachplaner je Gewerk. Beim Start eines Planlaufs
setzt die Anwendung die Verantwortlichen **nach dem Gewerk des Plans** ein: Zwei Pläne nach
demselben Workflow, aber mit unterschiedlichem Gewerk, erhalten unterschiedliche Verantwortliche.

Gewerke zur Auswahl: EEA, KIB, LST, OLA, OSE, TK, VA – weitere lassen sich über das **+** an den
Gewerk-Reitern anlegen; sie gelten dann überall.

Jede Funktion trägt eine **Seite für den Verzug** – *Planer*, *Prüfer*, *Auftraggeber*, *PLM* oder
„nicht festgelegt“. Der Terminnachweis rechnet Verzug in Schritten dieser Funktion der Seite zu.
Neue Funktionen erhalten sie aus der Bezeichnung vorbelegt (Planlaufmanagement → PLM, Planer und
Fachspezialisten → Planer, prüfende Funktionen → Prüfer, Bauvorlageberechtigte, Projektleitung und
Bauüberwachung → Auftraggeber), bis sie von Hand gewählt wird. Die Listen zeigen die Seite als
Abzeichen; fehlt sie, steht dort gelb *Seite offen*. Dasselbe Feld gibt es im Projekt unter
**Funktion**.

### Funktion (im Projekt)
Im Vordergrund steht die **Funktion, nicht die Person**: Die Seite ist – wie der projektübergreifende
Reiter *Funktionen* – nach **Gewerken** gegliedert (je Gewerk eine Seite, dazu „Übergreifend“). Je
Funktion steht in der Zeile, wer sie ausfüllt; ein Klick öffnet die Besetzung, in der eine im Projekt
bekannte Person übernommen oder eine neue mit Anrede, Firma, E-Mail, Telefon und Anschrift erfasst
wird – dazu die Felder **SharePoint-Link Eingang** (Ordner, in dem die Unterlagen für die Person
bereitliegen) und **SharePoint-Link Ausgang** (Ordner, in den sie ihre Unterlagen hochlädt) für die
Versandmail; hinterlegte Links stehen als kleine Links unter den Kontaktdaten in der Liste. Jede Funktion wird von genau einer Person ausgefüllt; eine Person kann mehrere Funktionen
haben.

Über das **+** an den Gewerk-Reitern entsteht ein weiteres Gewerk, über *Gewerk löschen* am Ende der
Seite verschwindet das gerade geöffnete wieder – der Dialog nennt vorher, welche Funktionen und Besetzungen damit
entfallen. Gewerke gelten projektübergreifend: angelegt oder gelöscht wird überall, also auch im
Reiter *Funktionen* im Hauptmenü, und jedes Gewerk des Projekts steht in der **Planliste** für Pläne,
Planverzeichnisse und Planpakete zur Auswahl – darüber findet ein Planlauf die Verantwortlichen seines Gewerks.
Über *Neue Funktion* entsteht eine weitere Funktion im gewählten Gewerk. Beide Wege führen zum Ziel: **Funktion anlegen und dort die Person
eintragen** oder mit *Person hinzufügen* die **Person erfassen und die Funktion gleich dabei
zuweisen** – die Zuweisung kann offen bleiben und später nachgeholt werden. Personen ohne Funktion –
aus einem Import, nach einem Wechsel oder bewusst ohne Zuordnung – stehen in einer eigenen Liste
darunter; ein Klick weist ihnen eine Funktion zu, das Papierkorb-Symbol rechts löscht sie aus dem
Projekt. Das Planlaufmanagement erscheint auf dieser Seite nicht – es ist immer die angemeldete Person.

**Excel-Import:** Je Zeile *Gewerk · Funktion · Kürzel · Anrede · Vorname · Name · Firma · Telefon ·
Email · Straße · Nr. · PLZ · Ort · Notiz · SharePoint Eingang · SharePoint Ausgang*; leere
SharePoint-Zellen lassen vorhandene Links stehen. Gewerke und Funktionen, die es noch nicht gibt, werden
beim Import angelegt; „Übergreifend“ steht für Funktionen ohne Gewerkbezug. Eine optionale Spalte
*Seite* setzt die Seite für den Verzug – bei neuen Funktionen (sonst gilt die Vorbelegung) und bei
vorhandenen, wenn sie abweicht. Die Vorschau nennt je Zeile, was angelegt wird, wen eine Besetzung
ersetzt und welche Seite sich ändert.

### Planliste
Planbestand aus Plänen, Planpaketen und Planverzeichnissen im Reiter **Planliste**. Je Eintrag
werden Plancodierung, Titel, Index (standardmäßig leer), Gewerk (EEA, KIB, LST, OLA, OSE, TK, VA oder
freie Eingabe), Planungsphase (Entwurfs-, Genehmigungs- oder Ausführungsplanung, ebenfalls frei ergänzbar),
der Soll-Termin für den Eingang und eine Bemerkung geführt.

Pläne lassen sich einem **Planpaket oder Planverzeichnis unterordnen**. Wie die Pläne eines
**Planverzeichnisses** laufen, legt das Verzeichnis fest (siehe nächster Abschnitt). In der
Planliste stehen die Pläne eingerückt unter ihrem Verzeichnis und lassen sich am Pfeil zwischen
Nummer und Symbol zuklappen.

**Planpakete** sind ein reines Ordnungsmerkmal ohne eigenen Planlauf – und gliedern die Planliste:
Je Paket steht eine Kopfzeile mit der Zahl seiner Einträge, darunter seine Planverzeichnisse und
Pläne; Einträge ohne Paket folgen – sobald Pakete angezeigt werden – unter **Ohne Planpaket**. Der
Pfeil an der Kopfzeile klappt das Paket zu, ein Klick auf die Zeile öffnet es zum Bearbeiten.
Angelegt werden Pakete über **Neues Planpaket** oder direkt beim Anlegen eines Eintrags. Im Dialog
des Pakets lassen sich unter **Inhalt** Planverzeichnisse und Pläne ohne Verzeichnis hinzufügen und
wieder entfernen – das gilt sofort; Pläne eines Verzeichnisses folgen dem Paket ihres Verzeichnisses.
Wird ein Paket gelöscht, bleiben seine Einträge mit ihren Planläufen erhalten. Die Suche erfasst
auch Name, Kurzzeichen und Gewerk des Pakets. Frühere Adressen der eigenen Seite *Planpakete*
führen auf die Planliste.

**Zu jedem Eintrag mit eigenem Lauf gehört genau ein laufender Planlauf – er startet immer
automatisch.** Er entsteht zusammen mit dem Eintrag: Im selben Dialog wird der Workflow gewählt; der
Abschnitt *Ablauf dieses Planlaufs* zeigt seinen Standardverlauf als Punktkette. Über **Individueller
Workflow** öffnet sich derselbe Workflow-Editor wie unter *Workflows*, um die Schritte nur für
diesen Lauf anzupassen (Kennzeichen *Individuell angepasst*, zurück über *Auf Workflow
zurücksetzen*); der Workflow selbst bleibt unverändert. Ein Planverzeichnis, das beim Anlegen eines Plans über
*+ Neues Planverzeichnis anlegen …* entsteht, fragt Codierung und Titel ab; sein Planlauf startet
mit dem Speichern des Plans (**Anlegen und Planlauf starten**) nach dem Workflow im Dialog, und der
Plan läuft darin mit. Wird der Plan nicht gespeichert oder ein anderes Verzeichnis gewählt, entfällt
das angelegte Verzeichnis wieder. Ebenso startet ein vorhandenes gebündeltes Verzeichnis, das noch
nie einen Planlauf hatte, ihn mit dem ersten Plan, der darin gespeichert wird. Die Planliste führt die Stammdaten – Art, Bezeichnung, Gewerk, Planverzeichnis und Eingang Soll – und
lässt sich über die Spaltenüberschriften sortieren; den Stand der Abläufe zeigt der Reiter
**Planläufe**. Ein Klick auf die Zeile öffnet den Eintrag.

Die Feldbezeichnungen richten sich nach der Art: **Plancodierung** beim Plan, **Name Planpaket**
beim Paket und **Codierung** beim Verzeichnis, wo statt *Index* die **Ausgabe** geführt wird.

**Farbige Bezeichnungen:** Steht in einem Planlauf noch der Schritt **Eingang PLM** aus, ist der
Plan angekündigt, aber noch nicht eingegangen – seine Bezeichnung steht in Planliste und
Planlaufliste **gelb**, in der Planlaufliste trägt er den Status **Angekündigt** (nach ihm lässt sich
auch filtern und sortieren), in der Planliste das Kennzeichen *Angekündigt*. Ist der Eingang
überfällig, lautet der Status **Überfällig**; die Bezeichnung bleibt gelb. Abgeschlossene
Planläufe stehen in **Grün**, abgebrochene grau.

**Mehrfachauswahl:** Über die Kästchen-Spalte lassen sich Einträge wählen. Das Kästchen eines
Verzeichnisses wählt es samt seinen sichtbaren Plänen; Paketzeile, *Ohne Planpaket* und Kopfzeile
wählen ihren Inhalt (bei abweichender Auswahl teilweise markiert). Was Suche oder Filter ausblenden,
fällt aus der Auswahl. Die Aktionsleiste bietet **Planpaket zuweisen …** (auch „– keinem Paket –“;
Pläne folgen dem Paket ihres Verzeichnisses), **Neues Planpaket aus Auswahl …**,
**Gewerk/Planungsphase …** (ein leeres Feld bleibt unverändert), **Löschen …** und **Auswahl
aufheben**. Die Rückfrage zum Löschen nennt jedes Verzeichnis mit oder ohne seine Pläne, die Zahl
der Planläufe – davon die mit Ist-Daten bzw. Protokoll –, die künftigen Einzelpläne und bietet
**Sicherung vorher herunterladen**.

### Planverzeichnisse: gebündelt oder Pläne einzeln
Jedes Planverzeichnis läuft auf eine von zwei Arten:

* **Gebündelt** (Vorgabe): Das Verzeichnis durchläuft den Planlauf, seine Pläne laufen darin mit.
* **Pläne einzeln**: Jeder Plan hat einen eigenen Planlauf; das Verzeichnis ordnet sie nur und
  zeigt – wie ein Planpaket – den aus ihnen zusammengefassten Fortschritt und Status.

Gewählt wird mit dem Haken **„Pläne einzeln durch den Planlauf führen“** im Dialog des Verzeichnisses,
solange weder das Verzeichnis noch seine Pläne einen Lauf haben. Danach geht es über Nachträge weiter:

* **Herauslösen …** – ein Plan erhält einen eigenen Lauf, das Verzeichnis läuft für die übrigen
  gebündelt weiter.
* **Alle Pläne einzeln weiterführen …** – jeder Plan ohne eigenen Lauf erhält einen; der gebündelte
  Lauf endet als „aufgeteilt“.
* **Pläne wieder bündeln …** – die angekreuzten Pläne mit eigenem Lauf kehren in einen gemeinsamen
  Verzeichnislauf zurück, nicht angekreuzte behalten ihren eigenen. Läuft das Verzeichnis noch,
  übernehmen sie dessen Stand; ein Plan, der schon weiter war, fällt dabei zurück (der Dialog weist
  darauf hin). Ist das Verzeichnis aufgeteilt, entsteht ein neuer Verzeichnislauf mit dem Stand
  eines der angekreuzten Pläne – vorgeschlagen ist der am wenigsten weit gediehene.

Beim Herauslösen und Aufteilen übernimmt der Plan den Stand des Verzeichnislaufs: erledigte
Schritte bleiben erledigt, Start und Termine laufen weiter. Aufgeteilte bzw. wieder gebündelte Läufe
gelten nicht als Abbruch. Die Nachträge stehen im Dialog des Verzeichnisses bzw. Plans in der
Planliste, in der Karte **Pläne dieses Verzeichnisses** des Planlaufs und in der Planlaufliste
des Projekts.

Wird ein gebündeltes Verzeichnis gelöscht, bleiben seine Pläne als Einzelpläne im Paket des
Verzeichnisses erhalten; wer bisher mitlief, führt den Stand des Verzeichnislaufs in einem eigenen
Planlauf weiter.

**Excel-Import:** Planlisten lassen sich als `.xlsx` oder `.csv` einlesen. Erwartete Spalten:
*Art · Plancodierung / Name · Index/Ausgabe · Titel · Gewerk · Planungsphase · Planpaket ·
Planverzeichnis · Eingang Soll · Datum Ausgabe · Workflow · Bemerkung* (frühere Schreibweisen wie
*Name PlanVZ* werden weiter erkannt). Genannte, aber noch nicht vorhandene Planpakete und
Planverzeichnisse entstehen beim Import; ein neues Verzeichnis übernimmt das früheste *Eingang Soll*
seiner Pläne. Verweise auf Pakete und Verzeichnisse gelten über Codierung bzw. Kurzzeichen oder
Titel, auch auf Einträge derselben Datei. **Jeder Eintrag mit eigenem Planlauf startet ihn beim
Import** – auch Zeilen ohne Codierung, ein dabei neu angelegtes Planverzeichnis und ein vorhandenes
gebündeltes Verzeichnis, das noch nie einen Lauf hatte: nach dem in *Workflow* genannten Workflow,
sonst nach dem im Dialog unter *Workflow für Einträge ohne Angabe* gewählten. Die Vorschau nennt je
Zeile den Workflow bzw. *läuft im Verzeichnis mit* und weist auf Bezeichnungen hin, die in der Datei
mehrfach vorkommen.

### Planläufe im Projekt
Der erste Reiter eines Projekts, **Planläufe**, zeigt Kennzahlen und die Planlaufliste. Je Eintrag
steht in der Spalte **Aktueller Stand** der zuletzt erledigte Prozessschritt vor dem offenen –
übersprungene Schritte zählen nicht, und auch nach dem Wiederöffnen eines früheren Schritts liegt er
nie dahinter; nach einem Rücksprung ist es der zuletzt bis zum Wiedereingang erledigte –, darunter
in Grau sein Erledigungsdatum, und in der Spalte **Nächster Schritt** der offene Schritt mit seiner
Frist. Stehen in parallelen Zweigen mehrere Schritte an, nennt die Zeile den dringlichsten mit
„+n parallel“; Erinnern und Erledigt-Haken fragen dann nach dem Schritt. Status, Filter und Suche
berücksichtigen alle anstehenden Schritte. Der **Fortschritt** ist nach Fristen gewichtet: die
Fristen der erledigten Schritte im Verhältnis zu ihnen plus den Fristen aller laut Prognose noch
ausstehenden Ausführungen – ein Rücksprung senkt ihn also; 100 % hat nur ein abgeschlossener Lauf.
Die Liste ist nach Planpaketen gegliedert; Planverzeichnisse lassen sich am Pfeil vor Symbol und Titel
aufklappen (zunächst zugeklappt). Darunter stehen die Pläne – mitlaufend mit **Herauslösen …**,
herausgelöst mit eigenem Schritt und Status. Ein Verzeichnis mit Plänen einzeln erscheint als
zusammenfassende Zeile mit **Bündeln …**. Abgebrochene Läufe stehen gesammelt am Ende unter einer
eigenen, zunächst zugeklappten Zeile **Abgebrochen**.

**Mehrfachauswahl:** Über die Kästchen-Spalte lassen sich Planläufe wählen – Planpaket, *Ohne
Planpaket*, Verzeichnis und Kopfzeile wählen ihren Inhalt, abgebrochene Läufe sind nicht wählbar.
Die Aktionsleiste bietet **Schritte erledigen …** (Ist-Datum, erledigt oder übersprungen, je Lauf
die anstehenden Schritte; gleichnamige Schritte lassen sich gemeinsam beantworten und mit einer
Nachweis-Nr. versehen; eine Vorschau nennt Rücksprünge und Abschlüsse, danach folgen das Ergebnis
und auf Wunsch **E-Mail senden**), **Erinnern …** (eine E-Mail je Person mit all ihren Schritten),
**Versandmail …** (siehe *Versandmail*),
**Exportieren …** (Export mit der Auswahl vorgewählt) und **Auswahl aufheben**. Ein gewählter
mitlaufender Plan wirkt auf den Planlauf seines Verzeichnisses.

Die Planlaufliste lässt sich über die Spaltenüberschriften **sortieren** – nach Bezeichnung, Gewerk,
Datum des aktuellen Stands, Soll-Termin des nächsten Schritts, Zuständigkeit, Fortschritt oder Status
(überfällige zuerst). Ein zweiter Klick kehrt die Richtung um, ein dritter hebt die Sortierung auf. Sortiert wird
innerhalb der Planpakete, die Paketzeilen folgen derselben Spalte.

Die **Kopfzeile der Tabellen bleibt beim Scrollen stehen**, sodass die Spaltenbezeichnungen auch in
langen Listen sichtbar sind.

**Filtern** geschieht in derselben Überschrift: Der Trichter neben *Gewerk*, *Zuständig* und *Status*
öffnet die Auswahl der vorhandenen Werte; der gewählte Wert steht anschließend in der Überschrift.
Die **Suche** über Nummer, Titel und Schritt steht oben in der Kartenzeile neben der Gliederung,
daneben erscheint bei gesetzten Filtern *Filter zurücksetzen*.

### Zuständigkeiten
Ein Schritt nennt eine **Funktion**; wer sie ausfüllt, steht unter **Funktion** des Projekts (das Planlaufmanagement übernimmt stets die angemeldete Person).
Gemeint ist stets die Funktion des Gewerks des Plans – ersatzweise die übergreifende gleichen
Namens. Darum bietet die Auswahl beim Anpassen eines Schritts nur die Funktionen dieses Gewerks und
die übergreifenden an, jede einmal. Die
Zuordnung wird laufend nachgezogen: Wird eine Person erst nach dem Start eines Planlaufs eingetragen
oder wechselt sie während des Projekts, gilt die neue Besetzung sofort auch in laufenden Planläufen.
Bereits erledigte Schritte behalten ihre Person, ebenso Schritte, in denen im Planlauf eine Person
von Hand gewählt wurde.

### Prozessketten
Ein Schritt ist eine **Aufgabe** oder eine **Entscheidung**, hat eine Frist in Tagen und
einen Verantwortlichen (Funktion). Entscheidungen erhalten zwei Antwortmöglichkeiten („Ja“/„Nein“ als
Vorbelegung, frei überschreibbar); weitere lassen sich ergänzen. Je Antwort wird festgelegt, mit
welchem Schritt es weitergeht – mit dem nächsten Schritt, einem beliebigen anderen oder dem Ende des
Laufs – und ob sie **zu Nacharbeit führt** (Vorgabe: alle außer der ersten); der Weg danach gilt im
Terminnachweis als Nacharbeit. Die erste Antwort bildet den **Standardverlauf**, die übrigen die
**Abweichungen**.

Zeigt eine Antwort oder das „Weiter mit“ einer Aufgabe auf einen bereits durchlaufenen Schritt
zurück, entsteht eine **Schleife** (z.B. Überarbeitung nach einer Prüfung): Der Ablauf endet dort
nicht, sondern nimmt den genannten Schritt in einem weiteren Durchlauf erneut auf.

**Parallele Blöcke.** Schritte, die gleichzeitig laufen, bilden einen parallelen Block aus zwei oder
mehr **Zweigen**. Ein Block wird immer als Ganzes betreten – alle Zweige beginnen zugleich –, und
weiter geht es hinter dem Block, wenn alle Zweige erledigt sind (Zusammenführung). Im Zweig geht es
zum nächsten Schritt des Zweigs, zum Zweigende oder zurück auf einen früheren Schritt desselben
Zweigs (**Zweig-Rücksprung**, etwa eine erneute Nachreichung); ein Ziel in einem anderen Zweig ist
unzulässig. Ein Ziel außerhalb des Blocks ist ein **Ausstieg** (etwa „Nein“ einer Prüfung zur
Rückmeldung an den Planer): Ist der auslösende Schritt erledigt, beginnen die übrigen Zweige nichts
Neues mehr – Laufendes wird noch erledigt –, und es geht am Ziel des Ausstiegs weiter. Ein
Rücksprung auf einen Schritt im Block betritt wieder den ganzen Block. Blöcke lassen sich nicht
schachteln.

**Workflow-Editor.** Workflows werden in einem bildschirmfüllenden Editor bearbeitet – projektübergreifend
unter *Workflows*, als Projektvariante im Reiter *Workflows* des Projekts und für einen einzelnen
Planlauf über *Individueller Workflow*. Links steht der Ablauf als Bild: in der Spalte
*Standardverlauf* die Karten des Regelwegs von *Planlauf starten* bis *Planlauf beenden*, rechts
daneben unter *Abweichungen* die Schritte, die nur über eine andere Antwort erreicht werden, mit
farbigen Linien und Antwortbeschriftungen; Rücksprünge sind eigens gekennzeichnet. Jede Karte zeigt
Art, Nummer, Bezeichnung, Funktion und Frist. Ein Klick öffnet rechts die *Schrittdetails*
(Bezeichnung, Art, verantwortliche Funktion, Frist, Nachweis, „Weiter mit“ bzw. die Antworten mit
*Als Standardverlauf*, *E-Mail nach Abschluss*, *Anliegen in der Versandmail*, Verschieben im Standardverlauf, Duplizieren,
Entfernen). „+“ zwischen zwei Karten fügt dort eine Aufgabe ein, *Schritt hinzufügen* hängt einen
Schritt an. Ein paralleler Block erscheint als Containerkarte „Parallel · … Zweige“ mit den
Zweigen nebeneinander (bei Platzmangel untereinander), Gabel- und Zusammenführungsbalken, „+“ je
Zweig, Abweichungen im Zweig gestrichelt darunter und Ausstiegen als Text; angelegt wird er über
*Schritt hinzufügen* → *Parallele Zweige* oder in den Schrittdetails mit *Parallel dazu ausführen*,
aufgelöst mit *Aus dem Block lösen*. Ändert sich dabei der Anschluss hinter einem Block, weist der
Editor darauf hin. Block und Zweige lassen sich **benennen**: im Abschnitt *Parallel* der
Schrittdetails mit *Name des Blocks* und *Name des Zweigs*; ein Klick auf den Kopf der
Containerkarte wählt den ersten Schritt des Blocks und setzt den Cursor in *Name des Blocks*. Die
Karte heißt dann etwa „Versand · parallel, 4 Zweige“, die Zweigköpfe tragen ihren Namen statt
„Zweig 1“ usw. Neue Schritte im Block bzw. Zweig übernehmen die Namen, ein neuer Block beginnt ohne;
Planläufe übernehmen sie mit dem Workflow. Änderungen lassen sich rückgängig machen (Strg+Z / Strg+Y); die Fußzeile meldet
Unvollständiges (fehlende Bezeichnung, Entscheidung ohne Antwort, nie erreichte Schritte), und
erst *Speichern* bzw. *Übernehmen* schreibt den Stand. Auf schmalen Bildschirmen stehen die
Schrittdetails in einem Blatt von unten, bei mittlerer Breite in einer Schublade.

Mitgeliefert sind die drei vorgegebenen Ketten **VVBau ohne Prüfstatik**, **VVBau mit Prüfstatik**
und **VVBau STE** mit ihren Verzweigungen und Rücksprüngen. Jede Prüf- bzw. Freigabeentscheidung
hat neben „Ja“ und „Nein“ die Antwort **Nachreichung**: Der Fachplaner reicht beim ablehnenden
Prüfer nach („Nachreichung an …“), dieselbe Funktion prüft bzw. gibt die Nachreichung frei – „Ja“
führt weiter wie das „Ja“ der Ausgangsentscheidung, „Nein“ zur Rückmeldung an den Planer, eine
weitere „Nachreichung“ zurück zur Nachreichung. In *VVBau mit Prüfstatik* laufen Fachprüfung und
Prüfstatik als paralleler Block (jede mit eigener Nachreichung im Zweig, „Nein“ als Ausstieg zur
Rückmeldung an den Planer); in allen drei Ketten laufen nach der Genehmigung der digitale Versand an
Bau AN, BVB und BÜW sowie der Plotauftrag parallel, danach der Postversand an Bau AN und BÜW. Die
Blöcke sind benannt: *Prüfung* (Zweige *Fachprüfung* und *Prüfstatik*), *Versand* (*Bau AN*,
*BVB*, *BÜW*, *Plot*) und *Postversand* (*Bau AN*, *BÜW*). Die
Fristen sind dort nicht vorgegeben und daher als Erfahrungswerte vorbelegt (z.B. 10 Tage
Planerstellung, 3 Tage formale Prüfung, 10 Tage BVB-Freigabe, 15 Tage Fachprüfung, je 5 Tage für
Nachreichung und Prüfung der Nachreichung); sie lassen sich je Kette und je Planlauf ändern.

**Versandschritte** tragen ein *Anliegen in der Versandmail*: „PLM an BVB zur Freigabe“ →
Freigabe, „PLM an BVB zur Freigabe zur fachtechnischen Prüfung“ → Vorprüfung, „PLM an Fachprüfer
und Prüfstatiker“ und „PLM an Planprüfer“ → Prüfung, „PLM an PL zur Genehmigung“ → Genehmigung;
alle übrigen Schritte keins.

Diese Ketten kamen mit Stammdatenfassung 5, das Anliegen mit Fassung 6. Ein vorhandener Bestand
übernimmt sie beim Laden; wer einen mitgelieferten Workflow der Fassung 4 bzw. 5 selbst geändert
hatte, behält diesen als eigene Kopie „… (eigene Fassung)“ – ein einmaliger Hinweis nennt sie.
Vorhandene Workflow-Kopien, Projektvarianten und Planläufe erhalten das Anliegen über den
Schrittnamen. Laufende Planläufe behalten ihre Schritte;
der Planlauf bietet dann **Auf aktuelle Fassung umstellen …**.

Ketten lassen sich duplizieren und als **Projektvariante** abweichend pflegen; Projektvarianten erscheinen nur im Reiter *Workflows* ihres Projekts. Die eigene Rolle im
Projekt ist **Planlaufmanagement (PLM)**.

### Nachweise: Freigabe- und Prüfbericht-Nummern
Je Schritt lässt sich hinterlegen, welcher Nachweis bei erfolgreichem Abschluss zu erfassen ist:

* **Freigabe-Nr.** – hinterlegt an den BVB-Freigaben (nicht an der Freigabe *zur fachtechnischen
  Prüfung*).
* **Prüfbericht-Nr.** – hinterlegt an den Fachprüfungen; bei Schritten mit prüfender Rolle
  (Erdungs-, Vermessungsprüfer …) wird sie automatisch vorgeschlagen.

Beim Erledigen fragt die Anwendung die Nummer ab – bei Entscheidungen nur, wenn die erste
(zustimmende) Antwort gewählt ist. Die Nummer steht anschließend am Schritt und in beiden
Exportfassungen.

### Prüfer individuell ergänzen
Über **Schritt einfügen** wird ein zusätzlicher Prüfschritt in den laufenden Verlauf eingehängt –
mit Funktion (z.B. Erdungsprüfer), Frist und Nachweis. Die Einfügeposition wird aus dem aktuellen
Verlauf gewählt, vorgeschlagen ist die Stelle hinter dem anstehenden Schritt; angeboten werden nur
Stellen, hinter denen noch nichts erledigt ist. Im parallelen Block landet der Schritt im Zweig des
gewählten Schritts, wahlweise am Ende eines Zweigs oder nach dem Block. Die Verkettung wird dabei
richtig gesetzt, auch hinter Entscheidungen.

### Planläufe (Soll-/Ist-Termine)
Ein Planlauf ist die laufende Instanz einer Prozesskette für einen Plan oder ein gebündeltes
Planverzeichnis. Beim Start werden die Schritte der Vorlage kopiert und lassen sich **für diesen Lauf**
noch ergänzen, ändern oder entfernen – **individuelle Abweichungen** wirken deshalb nur auf den
jeweiligen Lauf und sind als solche gekennzeichnet.

* **Die Frist zählt ab dem tatsächlichen Eingang.** Sobald ein Schritt ansteht, erhält er einen
  **festen Eingang**: den Abschluss seines Vorgängers – nach einem parallelen Block den spätesten
  Abschluss der Zweige –, beim ersten Schritt den Start. **Soll = Eingang + Frist**, wahlweise in
  Arbeitstagen (Mo–Fr, ohne hinterlegte Feiertage; das Soll fällt mindestens auf den nächsten
  Arbeitstag) oder Kalendertagen. Der erste Schritt erhält das *Eingang Soll* des Eintrags, falls
  hinterlegt. Der feste Eingang ändert sich danach nicht mehr von selbst; unter *Anpassen* lässt er
  sich ändern, auf Wunsch samt dem Eingang der Nachfolger.
* Künftige Schritte rechnen mit dem **voraussichtlichen Eingang** – erledigte Vorgänger mit ihrem
  Abschluss, offene mit ihrem Soll, frühestens heute. Diese **Prognose** liegt nie in der
  Vergangenheit und ist als „voraussichtlich“ gekennzeichnet; aus ihr ergibt sich auch das
  voraussichtliche Ende des Laufs.
* Ein Soll-Termin kann **manuell festgesetzt** werden und bildet dann die Basis für alle folgenden
  Schritte.
* Führt eine Antwort oder das „Weiter mit“ einer Aufgabe zurück auf einen früheren Schritt
  (**Rücksprung**), beginnt mit dem Erledigen dieses Schritts ein **weiterer Durchlauf** ab dem Ziel:
  Das Ziel und alles, was ab ihm schon begonnen war, wird zurückgesetzt und als „2. Durchlauf“
  gekennzeichnet; ein Zweig-Rücksprung betrifft nur den Rest des Zweigs, ein Rücksprung in einen
  Block den ganzen Block. Der bisherige Stand bleibt als **früherer Durchlauf** in der Historie des
  Schritts erhalten (aufklappbar). Das Ziel erhält als **Wiedereingang** den Abschluss des
  Auslösers („Wiedereingang am … (aus Rücksprung)“), und seine Frist zählt ab dann neu.
* **Parallele Blöcke** stehen in der Schrittliste als Gruppe mit dem Namen des Blocks, die Zweige
  nebeneinander (bei Platzmangel untereinander), je Zweig mit Namen, Stand, Zweig-Rücksprung, Ausstieg und abgeschnittenen
  Schritten. Jeder anstehende Schritt – in parallelen Zweigen also mehrere zugleich – bietet die
  Aktionen.
* **Ist-Termine** dokumentieren die Erledigung; Schritte lassen sich auch **überspringen**. Ein Ist
  vor dem Eingang wird angezeigt und verlangt beim gesammelten Erledigen eine Bestätigung. Mit dem
  Abschluss hält der Schritt die zuständige Person fest. Die folgenden Schritte werden automatisch
  aktiv, der Lauf schließt sich, wenn alle Schritte des Verlaufs erledigt sind.
* Nach jedem Erledigen oder Überspringen zeigt **E-Mail senden** die nun anstehenden Schritte je
  Person mit Vorlage und E-Mail-Schaltfläche – sofern unter *Angemeldet als* die Nachfrage
  zugelassen ist. War der erledigte Schritt ein Versandschritt, ist die Vorlage **Versand** für die
  neu zuständige Person vorgewählt („Versand zur Freigabe“ usw.).
* Bei **Entscheidungen** wird die Antwort im Lauf gewählt. Der angezeigte Verlauf folgt dieser
  Antwort; ohne Auswahl der ersten Möglichkeit. Schritte, die nur bei anderer Antwort durchlaufen
  werden, sind unterhalb der Liste aufgeführt.
* Im Planlauf sind die Schaltflächen (Erledigt, Überspringen, Erinnern) nur an **anstehenden
  Schritten** sichtbar; *Anpassen* steht als Stiftsymbol rechts an jeder Zeile.
* Abgeschlossene Schritte bieten **Wieder öffnen …**. Der Dialog fragt nach der Art: **Korrektur**
  (Fehlbedienung – das Ist entfällt, Nachfolger, die dadurch nicht mehr anstehen, warten wieder;
  nur solange kein Nachfolger ein Ist hat) oder **Erneute Bearbeitung** (ab diesem Schritt beginnt
  ein weiterer Durchlauf, dessen Eingang abgefragt wird; der bisherige bleibt in der Historie). Er
  nennt die betroffenen Schritte. Ein abgeschlossener Lauf läuft danach wieder.
* Der **Kopf** des Planlaufs zeigt den Fortschritt, das voraussichtliche bzw. tatsächliche Ende samt
  geplantem Ende, den Verzug gegenüber der Basis und den am stärksten überfälligen Schritt.
* Jede vorbereitete E-Mail wird am Schritt als **Erinnerung** vermerkt („E-Mail vorbereitet am … an
  …“). Die Karte **Protokoll** führt alle Änderungen am Lauf – wer wann einen Schritt erledigt,
  wieder geöffnet, angepasst, eine Person gewählt oder eine E-Mail vorbereitet hat, Rücksprünge,
  geänderte Arbeitstage, Feiertage oder Eingang Soll –, neueste zuerst; berechnete Termine
  erscheinen dort nicht.
* Ein Lauf kann mit Begründung **abgebrochen** werden – wahlweise **ersatzlos** oder mit **neuem
  Index bzw. neuer Ausgabe**. Im zweiten Fall erhält der Eintrag den angegebenen Index, und der
  Planlauf beginnt mit denselben Schritten von vorn.
* Über **Workflow ändern …** lässt sich ein laufender Planlauf mit einem anderen (oder demselben)
  Workflow **von vorn beginnen**: Workflow wählen, Schritte bei Bedarf über *Individueller Workflow* anpassen, Start und
  *Eingang Soll* setzen, optional einen Grund angeben, dann **Neu starten**. Mit **Erledigte Schritte
  übernehmen** behält der neue Lauf entlang seines Ablaufs ab Beginn die erledigten Schritte gleicher
  Bezeichnung und Funktion – mit Ist, Eingang, Antwort und Nachweis. Folgt ein laufender Planlauf
  noch einer früheren Fassung seines Workflows, weist er darauf hin und bietet **Auf aktuelle
  Fassung umstellen …** (derselbe Workflow, erledigte Schritte übernommen). Der bisherige Lauf gilt
  nicht als Abbruch – er erscheint nicht unter *Abgebrochen*, bleibt aber mit dem Hinweis „Mit
  geändertem Workflow neu gestartet am …“ zum Nachschlagen erhalten. Der neue Lauf vermerkt den
  vorherigen Workflow und führt unter *Frühere Läufe vor dem Neustart* zu ihm.
* Ein abgebrochener Lauf ist **nicht mehr zu bearbeiten**: In der Planlaufliste steht seine Zeile
  gesammelt am Ende unter **Abgebrochen**, ausgegraut, ohne aktuellen Schritt, Fortschritt und
  Schaltflächen – stattdessen mit seinem eigenen Index und in Grau „Abgebrochen am …“ mit dem
  Zusatz *ersatzlos abgebrochen* bzw. *ersetzt durch Index C*. Er lässt
  sich weiterhin zum Nachschlagen öffnen, bietet dort aber keine Aktionen mehr und erscheint nicht
  in der Fristenliste. In der **Planliste** trägt der Eintrag den entsprechenden Zusatz
  (`Index B → C` bzw. `abgebrochen`).

### Terminnachweis
Die Karte **Terminnachweis** im Planlauf zeigt den Verzug gegenüber dem **Basisplan** – dem beim
Start festgehaltenen Plan mit Fristen und geplantem Ende – und rechnet ihn einer **Seite** zu:
Planer, Prüfer, Auftraggeber oder PLM, vorbelegt aus der Funktion des Schritts. Der Gesamtverzug
zerfällt in Posten je Ausführung: Fristüberschreitung, Nacharbeit (der Weg nach einer Antwort, die
zu Nacharbeit führt, oder eine erneute Bearbeitung), Planänderung, Soll von Hand, Übergabelücke,
erster Termin verschoben und Zeitgewinn. Ein paralleler Block zählt als Ganzes: nur sein Verzug
gegenüber dem längsten Zweig des Basisplans, verteilt auf genau einen maßgeblichen Zweig; was
darüber hinausgeht, hat der Puffer aufgefangen. Bei laufenden Läufen geht die Prognose bis zum Ende
ein. Es gilt Gesamtverzug = Summe der Seiten + Seite fehlt − Zeitgewinn; ein Rest erscheint als
*Nicht erklärt*.

Die **Ursache der Nacharbeit** lässt sich je Entscheidung einer Seite zuordnen, mit **Zuordnen …**
der Verzug einer Ausführung von Hand auf die Seiten verteilen (Grund Pflicht) und mit **Basis neu
festlegen …** der Basisplan erneuern (Grund Pflicht). **Nachweis als Excel** gibt die Blätter
*Ausführungen*, *Verzug je Seite*, *Erinnerungen* und *Protokoll* aus.

### Terminrechner
Der **Terminrechner** (Seitenleiste, unter *Projekte*) rechnet mit den Regeln des Planlaufs –
Fristen ab Eingang, parallele Zweige, Rücksprünge und Nachreichungen –, ohne einen Lauf anzulegen:
**Rückwärts** vom Termin auf der Baustelle bis zur spätesten Übergabe des Planers (bzw. zum
spätesten Start des Planlaufs, wenn der Workflow nicht mit *Eingang PLM* beginnt), **Vorwärts** vom
Eingang der Planung bzw. Start bis zum Ende des Planlaufs. Eingaben: Projekt (Arbeitstage und
Feiertage; ohne Projekt Mo–Fr ohne Feiertage), Workflow (übergreifend und Projektvarianten),
Richtung, Datum, Fristen, ein **Szenario** (Antwort je Entscheidung im ersten Durchlauf, Vorgabe
der Standardverlauf) und wahlweise ein **Zielschritt** statt des Endes. Die Zwischenergebnisse
nennen je Schritt Eingang und Fristende, auf dem kritischen Weg „spätestens“, für die übrigen den
Puffer; Schritte in parallelen Zweigen tragen den Zweig samt Namen („Prüfstatik · Zweig 2 von 2“).
Das Ergebnis lässt sich drucken.

### Fristen & Erinnerungen
Fristenübersicht über alle Projekte, sortiert nach Dringlichkeit und gefiltert nach
überfällig / fällig / im Plan. Angezeigt werden **alle anstehenden Schritte** – bei parallelen
Zweigen mehrere je Planlauf. Ein Schritt gilt als *fällig*, sobald der Soll-Termin näher liegt als
die in den Projekteinstellungen gepflegte Vorlaufzeit.

Je Schritt öffnet der Button **Erinnern** ein Fenster mit der vorbereiteten E-Mail: Die zur Lage
passende Vorlage (Erinnerung oder Mahnung) wird ausgewählt, die Platzhalter aus Projekt, Plan,
Schritt, Frist und Empfänger ersetzt (`{{verzug}}` nennt die Einheit, etwa „5 Arbeitstage“,
`{{verzug.zahl}}` nur die Zahl). Von dort lässt sich die Nachricht in **Outlook** öffnen
(`mailto:`, also das eingerichtete Standardprogramm), in **Outlook im Web** anlegen oder in die
Zwischenablage kopieren; jede vorbereitete E-Mail wird am Schritt vermerkt. Stehen bei einer Person
mehrere Schritte an, entsteht eine **Sammel-E-Mail** (Vorlage *Sammelerinnerung*, Platzhalter
`{{liste}}` und `{{anzahl}}`). Ist sie für die Übergabe an das Mailprogramm zu lang, bleibt nur
„Kopieren“. **Kopieren (formatiert)** legt nur den Text mit Formatierung (Links anklickbar,
Aufzählungen, „ORDNERNAME EINFÜGEN“ rot und fett) und zugleich als Klartext in die Zwischenablage –
zum Einfügen in eine neue Outlook-Mail.

### Versandmail
Die Vorlage **Versand** schreibt der Person, die **nach einem Versandschritt** zuständig ist:

```
{{anrede}}

auf Ihrem SharePoint-Ordner {{sharepoint.eingang}} haben wir Ihnen die folgenden Unterlagen bereitgestellt und bitten um {{anliegen}}.

Hier der Link zum Hochladen der Unterlagen nach Ihrer {{anliegen}}:
{{sharepoint.ausgang}}

Ordnername: ORDNERNAME EINFÜGEN

{{versandliste}}
```

Die Anrede kommt aus `{{anrede}}` („Sehr geehrter Herr Lindqvist,“, ohne Anrede „Guten Tag Vorname
Nachname,“), das Anliegen aus dem
vorangehenden Versandschritt, die Links aus dem Kontakt. `{{versandliste}}` gliedert die Unterlagen
nach Planpaketen („PP-Nordkanal Eisenbahnüberführung Nordkanal:“, darunter „* Codierung Titel“),
ein Planverzeichnis mit seinen mitlaufenden Plänen eingerückt („  – …“); ein einzelner Plan ohne
Paket steht mit seinem Namen für sich, mehrere unter „Ohne Planpaket:“. Fehlt ein Link, steht
„[SharePoint-Link Eingang fehlt]“ bzw. „[SharePoint-Link Ausgang fehlt]“ im Text und der Dialog
weist darauf hin. „ORDNERNAME EINFÜGEN“ wird vor dem Absenden von Hand ersetzt.

Ausgelöst wird die Versandmail auf zwei Wegen: nach dem Erledigen eines Versandschritts in **Neu
zuständig** (siehe oben) und gesammelt über **Versandmail …** in der Planlaufliste. Dort gilt je
gewähltem Planlauf: Steht ein Versandschritt an (etwa „PLM an BVB zur Freigabe“), ist Empfänger
die Person des Schritts danach (bei einem parallelen Block jedes Zweigs); steht der Schritt direkt
nach einem erledigten Versandschritt an, dessen Person. Je Empfänger und Anliegen entsteht **eine**
Mail mit allen betroffenen Plänen; vermerkt wird wie bei Erinnerungen am anstehenden Schritt.
Planläufe ohne Versandschritt nennt ein Hinweis.

### Export je Projekt
Über **Export** im Reiter **Planläufe** (oder in den Projekteinstellungen) lassen sich die Planläufe
eines Projekts ausgeben. Die Auswahl der Einträge ist wie die Planlaufliste gegliedert – je
Planpaket, *Ohne Planpaket* und *Abgebrochen* mit eigenem Haken. Gewählt wird je Planlauf, sodass
ein abgebrochener Vorgänger und der laufende Lauf eines Eintrags getrennt bleiben; ein Verzeichnis
wählt die Pläne unter sich mit, ein mitlaufender Plan sein Verzeichnis. Ist im Reiter *Planläufe*
ein Filter gesetzt, sind die gezeigten Einträge vorgewählt. Zwei Umfänge:

* **Kurzfassung** – als PDF genau die Angaben der Planlaufliste: Aktueller Stand, Nächster
  Schritt (bei parallelen Zweigen alle anstehenden), Zuständig, Fortschritt und Status; in Excel
  nach Planpaket, Plancode, Stand und Frist (siehe unten).
* **Langfassung** – je Planlauf zusätzlich alle bereits durchlaufenen und alle ausstehenden
  Schritte mit Verantwortlichen, Durchlauf, Eingang, Soll, Ist, Verzug und Seite; frühere
  Durchläufe stehen als eigene graue Zeilen, voraussichtliche Termine kursiv.

Beides jeweils als **Excel** (.xlsx, ohne zusätzliche Programmbibliothek erzeugt) und als **PDF**
über den Druckdialog des Browsers („Als PDF sichern“). Das PDF der Kurzfassung sieht aus wie die
Planlaufliste im Programm – ohne Schaltflächen für E-Mail, Erledigt oder Auf-/Zuklappen.

Die **Kurzfassung in Excel** nennt in A1 das Projekt („Projekt: …“) und in A2 den Stand („Stand:
TT.MM.JJJJ“). Darunter steht je Zeile der Planlaufliste eine Zeile mit den Spalten *Planpaket*
(„ohne Planpaket“, wenn keines) · *Plancode* · *Index/Ausgabe* · *Titel* · *Gewerk* · *Aktueller
Stand* · *Datum* · *Nächster Schritt* · *Frist*. Laufende Planläufe stehen zuerst; abgeschlossene
folgen gesondert unter **Abgeschlossen (n)** grün hinterlegt, abgebrochene unter **Abgebrochen (n)**
grau – jeweils in der Reihenfolge der Liste. Datum und Frist sind echte Excel-Daten; eine fällige
Frist ist orange, eine überfällige rot hinterlegt. Ein mitlaufender Plan nennt in *Aktueller Stand*
das Verzeichnis, in dessen Planlauf er mitläuft; ein abgebrochener Lauf trägt sein Abbruchdatum und
den Zusatz *ersatzlos* bzw. *ersetzt durch Index …*. Die Kopfzeilen bleiben beim Scrollen stehen,
gedruckt wird quer auf Seitenbreite. Die Langfassung in Excel hat je Prozessschritt eine Zeile mit
Planpaket, Planverzeichnis, Art, Codierung, Index, Titel und Gewerk in eigenen Spalten.

Im PDF beider Umfänge und in der Excel-Langfassung sind **nur die Planpakete Überschriften** (dazu
wie in der Liste *Ohne Planpaket* und *Abgebrochen*); Planverzeichnisse folgen der Logik der
Planlaufliste – ein gebündeltes Verzeichnis ist ein Planlauf mit mitlaufenden Plänen, ein
Verzeichnis mit Plänen einzeln fasst diese nur zusammen und hat keine eigene Zeile mit
Schrittangaben.

### Übersicht und Markierung von Projekten
Alle Bearbeiter sehen alle Projekte. Mit ★ markierte Projekte erscheinen in der Übersicht und in der
Seitenleiste (mit vorangestellter Projektnummer); ohne Markierung werden alle angezeigt. Die
Übersicht zeigt Kennzahlen, die eigenen **To-Dos** (laufende Schritte des Planlaufmanagements) und
die laufenden Planläufe nach Projekt gegliedert. In einem markierten Projekt ist die angemeldete
Person automatisch das **Planlaufmanagement** und ist damit für dessen Schritte zuständig; unter
**Funktion** wird es deshalb nicht eigens geführt.

### Angemeldet als
Unten links in der Seitenleiste stehen der eigene Name (bis zur Anmeldung je Person „Max
Mustermann“), die Nachfrage nach E-Mails und der **Farbmodus für eine Rot-Grün-Sehschwäche**: er
stellt Blaugrün, Bernstein und Magenta statt Grün, Orange und Rot dar und erhöht die Kontraste.

### Sicherung, Abgleich und Hinweise
**Sicherung** (Seitenleiste) lädt den gesamten Bestand als JSON herunter. **Einspielen** liest eine
solche Datei und bietet danach **Alles ersetzen** oder **Abgleichen und auswählen**: Der Abgleich
vergleicht Sicherung und Bestand je Element – übergreifend Gewerke, Funktionen, E-Mail-Vorlagen und
Workflows, je Projekt Projektdaten, Funktionen, Kontakte, Projekt-Workflows und Einträge samt Plänen
und Planläufen – und kennzeichnet sie als neu, geändert, gleich, nur im Bestand oder im Bestand
gelöscht. Gewählte Elemente werden samt Abhängigkeiten übernommen; bei Läufen gleicher Kennung
werden Protokoll, frühere Durchläufe und Erinnerungen beider Seiten vereinigt. Einträge gleicher
Codierung mit anderer Kennung gelten als „vermutlich dasselbe“, ein Projekt mit gleicher Kennung und
anderer Projektnummer lässt sich als Kopie übernehmen. Wäre der Stand danach nicht stimmig, wird
nichts übernommen. Dazu merkt sich der Bestand Löschungen (Löschvermerke) und den
Änderungszeitpunkt von Projekten, Einträgen, Kontakten, Funktionen und Workflows.

**Hinweisleisten** unter der Kopfzeile melden, wenn sich der gespeicherte Stand nicht laden lässt
(*Gespeicherten Stand herunterladen* oder mit Demodaten neu beginnen), wenn er aus einer neueren
Fassung von KaPlan stammt (nur *Seite neu laden*; Einspielen und *Zurücksetzen* sind dann
gesperrt), wenn nicht gespeichert werden kann – Speicher voll oder vom Browser gesperrt (*Sicherung
herunterladen*) – und einmalig, wenn ein selbst geänderter Standard-Workflow als Kopie behalten
wurde. Bei einem Lade- oder Fassungsfehler zeigt die Anwendung Demodaten und speichert nicht, damit
der gespeicherte Stand erhalten bleibt. Vor jeder Umstellung auf eine neue Fassung legt sie den
gespeicherten Text als **Sicherungskopie** im Browser ab (Schlüssel
`planlauf-management.data.v1.vor-fassung-<n>`); wird der Speicher knapp, entfällt diese Kopie zuerst.

### Projekteinstellungen
Vorlaufzeit für Erinnerungen, Arbeitstage/Feiertage und Absenderangaben sowie – wie im Reiter
*Planläufe* – der **Export**. Die
**E-Mail-Texte** (Betreff und Text, mit Übersicht der Platzhalter) werden projektübergreifend unter
**Einstellungen › Vorlagen** in der Seitenleiste gepflegt; dort liegen auch die Excel-Vorlagen für die Importe.

## Baubetriebsplanung

Erster Entwurf nach dem Lastenheft „Laufender Baubetrieb – Ideensammler für einen groben Monitor“
der Anwender. Offene fachliche Fragen und die Annahmen des Entwurfs stehen in
[`docs/BAUBETRIEB_RUECKFRAGEN.md`](docs/BAUBETRIEB_RUECKFRAGEN.md).

### Projekt
Im Lastenheft „Projekthülle“; wird bei der MIC-Beauftragung angelegt: Bezeichnung, Projektleiter,
DB-G-Nummer, erster Anmeldetermin (ca.-Wert) samt Prozessphase, **betroffene Fahrplanjahre** (zum
Ankreuzen, statt einer geplanten Sperrzeit), Inbetriebnahme, Hauptbearbeiter MIC,
MIC-Projektnummer (wiko), Status der Betreuung (Aktiv, Betreuungspause, Abgeschlossen) und
Bemerkung. Aus Prozessphase und erstem betroffenen Fahrplanjahr schlägt der Dialog den ersten
Anmeldetermin laut Richtlinie vor („übernehmen“ unter dem Datumsfeld); Prozessphase, erster
Anmeldetermin, Inbetriebnahme und Status der Betreuung stehen in einer Zeile mit einzeiligen
Beschriftungen. Mit ★ markierte Projekte erscheinen in Übersicht und Seitenleiste.

**Erstanmeldung ausstehend:** Solange ein Projekt keine Anmeldung hat (Anmeldeleichen zählen nicht)
und nicht abgeschlossen ist, steht zwischen den Projektangaben und den Anmeldungen der Hinweis
„Erstanmeldung ausstehend“ mit Prozessphase und Terminfrist – dem ersten Anmeldetermin, sonst dem
Vorschlag laut Richtlinie. Dieselbe Frist erscheint als eigene Zeile unter **Termine & Nachhaken**
und in den anstehenden Terminfristen der **Übersicht** und zählt bei „überfällig“ mit.

**Anmeldebedarf:** Aus den betroffenen Fahrplanjahren berechnet die Anwendung je Jahr die Fristen
für SKM, MKM, KM N-2 und KM N-1 und ob dafür schon ein Eintrag besteht (ein Eintrag einer späteren
Phase deckt frühere ab, ein Eintrag im KM oder KKM beide KM-Fristen; Anmeldeleichen zählen nicht).
Was in die Vorschau fällt (Vorgabe 180 Tage), steht unter „Anmeldebedarf aus den Projekten“ in
Übersicht und Terminen; die Projektliste nennt die nächste Anmeldung. Die eigene Karte im Projekt
ist entfallen.

### Anmeldung
Je Anmeldung eine Zeile im Projekt: Anmelde-ID (in Workflows mit ganzem Fahrplanjahr Begriff bzw.
tVE-Nr, weil es in SKM und MKM noch keine Anmeldungen gibt; im **SKM** führt der
**Vorhabenname**, die tVE-Nr steht darunter – bei älteren SKM-Einträgen übernimmt
„als Vorhabenname übernehmen“ im Dialog den bisherigen Begriff), **Zuständiger BBK**, Maßnahmenart (SKM und MKM für die
Sammeleinträge dieser Phasen, sonst A, B(0), B(S), B, C, Container – dieselbe Art kann in mehreren
Phasen vorkommen, getrennt wird nach Workflow), Workflow und Status, Sperrzeitraum (ganzes
Fahrplanjahr oder tagesscharf – je nach Workflow), Terminfrist, Bf/Strecke, Gewerk/Tätigkeit,
Bemerkungen. ÄAbst-Nr und AnnexVII-Kennzeichen sind nur in Status der Art „Änderungsabstimmung“
aktiv; endet sie, werden beide im Statusverlauf festgehalten und in der Anmeldung geleert.

Im Projekt stehen die Anmeldungen **je Workflow in einer eigenen Tabelle** (SKM, MKM, KM (n-2 &
n-1), KKM (unterjährig)) mit den Spalten Anmeldung, Sperrzeitraum, Status, **Zuständig** und
Terminfrist, dazu „Status ändern …“. „Zuständig“ nennt die Rolle des aktuellen Status samt Namen:
BBK mit dem zuständigen BBK der Anmeldung, MIC mit dem Hauptbearbeiter, Projektleitung DB mit dem
Projektleiter des Projekts. Die Maßnahmenart steht in der zweiten Zeile, wo der Workflow mehrere
führt (KKM). Jede Anmeldung belegt höchstens zwei Textzeilen; Längeres
wird gekürzt und steht vollständig im Tooltip. Der Status steht hier ohne den Workflow davor, weil
die Tabelle ihn nennt. Workflows ohne Anmeldung zeigen nur ihre Kopfzeile.

Die Seite einer Anmeldung ist wie ein Planlauf aufgebaut: der Weg durch die Workflows, darunter
die Status des aktuellen Workflows in ihrer Reihenfolge – erreichte mit Haken und Datum, der
aktuelle mit Terminfrist, Ampel und den möglichen Nachfolgern („Weiter mit“, „Übernahme in neue
Phase“, „Abschluss“ mit „Eintrag löschen“) und wer zuständig ist. Darunter Merkmale und
Statusverlauf. Oben rechts stehen **Bearbeiten**, **Duplizieren** und **Löschen**: Duplizieren legt
direkt hinter dem Original eine Kopie mit aktuellem Stand und Statusverlauf an (Vermerk „Dupliziert
aus …“, die führende Bezeichnung erhält „(Kopie)“, ohne Nummer wird „(Kopie)“ die Nummer) und
öffnet sie.

### Workflows
Wie im Planlaufmanagement sind die Workflows **anpassbar**. Mitgeliefert wird je Phase ein
Standard-Workflow nach der Statustabelle des Lastenhefts: **SKM**, **MKM**, **KM (n-2 & n-1)**
und **KKM (unterjährig)** – im Lastenheft SKM, PzE, Vorprozess N-x und unterjährige Anmeldung.
Die Statusnummern des Lastenhefts (V0 … Y9) dienten nur der Veranschaulichung; die Status tragen
lesbare Namen („Entwurf“, „Mitwirkung BBK“, „Angemeldet (fristgerecht)“ …) und erscheinen
außerhalb der Projekttabellen mit der Kurzbezeichnung ihres Workflows, z. B. „MKM · Angemeldet“
oder „KKM · Entwurf“.

* Die Seite **Workflows** listet alle Workflows mit **Öffnen**, **Duplizieren** und – bei eigenen
  Workflows ohne Anmeldungen – **Löschen**; **Neuer Workflow** legt einen weiteren an.
* Im **Editor** stehen Name, Kurzbezeichnung, Beschreibung, Sperrzeitraum (ganzes Fahrplanjahr oder
  tagesscharf) und die zulässigen Maßnahmenarten; darunter je Status eine Karte mit
  Bezeichnung, Art (Entwurf, In Abstimmung, Angemeldet, Angemeldet (verspätet), Genehmigt,
  Abgelehnt, Änderungsabstimmung, Anmeldeleiche), **Zuständig** (MIC, BBK, Projektleitung DB oder
  niemand – in den Standard-Workflows MIC für Entwurf, Zugestimmt, Genehmigt und Abgelehnt, die BBK
  für Mitwirkung, Angemeldet und Änderungen), Terminfrist, „Termin dient zum Nachhaken“, Bemerkung und
  **Nachfolgern**. Status lassen sich verschieben, ergänzen und entfernen; der erste ist der
  **Startstatus**. Ein Status, in dem noch Anmeldungen stehen, kann nicht entfallen, und der
  Sperrzeitraum eines Workflows bleibt fest, solange Anmeldungen darin stehen. Eine Kopie erhält
  „(Kopie)“ an Name und Kurzbezeichnung.
* **Nachfolger** sind Status desselben Workflows, Status eines anderen Workflows (**Übernahme in
  eine neue Phase**) oder **Eintrag löschen**. Beim Statuswechsel stehen nur sie zur Wahl – in der
  Liste („Status ändern …“) und auf der Seite der Anmeldung.
* **Anmeldeleiche:** Jeder Standard-Workflow endet mit dem Status **Anmeldeleiche** (erreichbar aus
  „Entwurf“ und „Abgelehnt“). Er ist ein gewöhnlicher Status mit Datum im Statusverlauf, wird
  **rot** angezeigt, hat keine Terminfrist und deckt keinen Anmeldebedarf mehr ab. Gelöscht wird
  erst im **nächsten Schritt** mit „Eintrag löschen“ – samt Statusverlauf und ohne Rückweg; bis
  dahin lässt sich der Wechsel in die Anmeldeleiche zurücknehmen. Ältere Bestände erhalten den
  Status beim Laden automatisch (Fassung 5).
* **Neu angelegt** wird immer im ersten Status eines Workflows. Ein Auswahlfeld, nach Phase
  gegliedert, legt Phase und Maßnahmenart zugleich fest (z. B. „KKM · B(S)“); vorbelegt ist
  „KKM · A“.
* **Übernahme in eine neue Phase:** Maßnahmenart, Anmelde-ID und Sperrzeitraum werden neu
  erfasst. Der Eintrag lässt sich dabei auf mehrere Anmeldungen **aufteilen** – die weiteren
  verweisen auf ihn als Herkunft.
* **Statusverlauf:** Jeder Wechsel mit Datum (frei wählbar), Bearbeitung und Bemerkung; der Text
  des Status wird zum Zeitpunkt des Wechsels festgehalten. Der letzte Wechsel lässt sich
  **zurücknehmen** (der vorherige Stand samt Art, ID und Sperrzeitraum kehrt zurück), solange es
  den früheren Status noch gibt.

### Terminfristen und Nachhaken
Jeder Status trägt eine Terminfrist: **Frist laut Richtlinie** (Ril_SKM, Ril_MKM, Ril_KM N-2,
Ril_KM, Ril_KKM A oder Ril_KKM – im Lastenheft Ril_skm, Ril_pze, Ril_N-2, Ril_Nx, Ril_A und
Ril_X –, ggf. abzüglich einiger Tage, etwa „Ril_KKM − 14 Tage“), **nächster Stichtag** („Nächster
1.8.“ ab dem Statuswechsel), **Nachhak-Termin** (Tage nach dem Statuswechsel, je Status
einstellbar) oder **keine**; im Workflow-Editor ist die Auswahl nach Phase gegliedert. Die
Richtlinienfristen werden unter **Einstellungen** gepflegt, nach Phase gegliedert – je Frist als
Stichtag TT.MM. im Jahr N − k des Fahrplanjahres oder als Wochen vor Sperrbeginn. **Die
vorbelegten Werte sind Platzhalter** und als solche gekennzeichnet, bis sie geändert oder als
„Geprüft“ bestätigt werden. **Ril_KM** nimmt die N-2-Frist, solange sie am Tag des
Statuswechsels nicht verstrichen ist und nicht vor dem ersten Anmeldetermin des Projekts liegt,
sonst die N-1-Frist; der Rechenweg nennt den Grund. **Ril_KKM** richtet sich nach der Maßnahmenart
(Einträge der Art SKM oder MKM rechnen dabei wie A); ihr Stichtag ist ein Mittwoch – die Frist
fällt auf den Mittwoch an oder vor „Sperrbeginn minus Vorlauf“.
Das Fahrplanjahr N reicht vom Sonntag nach dem zweiten Samstag im Dezember N−1 bis zum zweiten
Samstag im Dezember N.

Die Ampel zeigt *Überfällig*, *Fällig* (Vorgabe 14 Tage vorher) und *Im Plan*; Status „zum
Nachhaken“ sind eigens gekennzeichnet. **Nachgehakt …** hält das Nachhaken mit Notiz und neuem
Termin fest, **Termin festlegen …** setzt die Frist im aktuellen Status von Hand.

### Ansichten
**Übersicht** (Kennzahlen, anstehende Terminfristen samt ausstehender Erstanmeldungen,
Anmeldebedarf, Projekte mit ihren Anmeldungen je Workflow), **Termine & Nachhaken** (alle Fristen
nach Projekten, je Projekt zuerst eine ausstehende Erstanmeldung, Filter
Überfällig/Fällig/Im Plan/Zum Nachhaken), **Projekte**, **Workflows**, **Einstellungen**.
**Excel** im Projekt lädt Anmeldungen und Projekt als Arbeitsmappe herunter.

### Daten
Eigener Schlüssel `baubetrieb-planung.data.v1` im `localStorage`, eigene Demodaten,
**Sicherung**/**Einspielen** (JSON mit dem Kennzeichen `"bereich": "baubetrieb"`; eine Sicherung
des Planlaufmanagements wird abgewiesen) und **Zurücksetzen** (lädt Demodaten und
Standard-Workflows neu). Stände der ersten Entwurfsfassung mit Statusnummern werden beim Laden
übernommen: Die Nummern werden den Status der Standard-Workflows zugeordnet, der bisher
eingestellte Nachhak-Abstand gilt für deren Nachhak-Termine. Ältere Stände übernehmen die
Phasennamen SKM, MKM, KM (n-2 & n-1) und KKM (unterjährig), sofern Name, Kurzbezeichnung bzw.
Beschreibung der Standard-Workflows nicht geändert wurden; die Maßnahmenart PzE wird MKM,
A_Vor_N-2, A_Vor_N-1 und A_unterjahr werden A. Aus der bisherigen geplanten Sperrzeit eines
Projekts werden seine betroffenen Fahrplanjahre. Die Status der Standard-Workflows erhalten ihre
vorgegebene Zuständigkeit (Fassung 8). Name unter „Angemeldet als“ und Farbmodus gelten
nur in diesem Bereich.

## Projektsteuerung

Erster Entwurf für die externe Projektsteuerung. Aufbau und Gestaltung folgen dem
Planlaufmanagement: Seitenleiste mit **Übersicht**, **Projekte** und **Funktionen**, darunter die
markierten Projekte; im Projekt zwei Seiten – **Projektbeteiligte** und **Protokolle**.
Die Protokolle übernehmen die Funktionen des bisherigen eigenständigen Protokoll-Tools
(HTML-Datei), in der Optik von KaPlan.

### Funktionen
Projektübergreifende Funktionen (Bezeichnung, Gewerk, Kürzel, Farbe, Beschreibung) – die Auswahl,
aus der jede Person der Projektbeteiligtenliste ihre Funktion erhält. Gegliedert wie im
Planlaufmanagement: eine Seite **Übergreifend** und je **Gewerk** eine eigene; „Fachplanung“ im
Gewerk LST ist eine andere Funktion als „Fachplanung“ in OLA und erscheint überall als
„Fachplanung LST“. Über das **+** an den Reitern entsteht ein Gewerk, **Vorhandene Funktion**
übernimmt eine Funktion aus einem anderen Gewerk, **Gewerk … löschen** entfernt ein Gewerk samt
seinen Funktionen. Mitgeliefert sind typische Funktionen einer DB-Baumaßnahme (übergreifend etwa
Auftraggeber, Projektleitung, Teilprojektleitung, Projektsteuerung, Objektplanung, Bauüberwachung,
Bauunternehmen, Prüfsachverständiger, Eisenbahn-Bundesamt; je Gewerk 50 Hz, KIB, LST, OLA und TK
die Fachplanung, für LST und OLA zusätzlich die Bauüberwachung). Funktionen und Gewerke, die noch
Projektbeteiligten zugeordnet sind, lassen sich nicht löschen.

### Projektbeteiligte
Aufgebaut wie die Seite **Funktion** im Planlaufmanagement, aber ohne leere Funktionen: Es stehen
nur Personen in der Liste, je Person mit ihrer Funktion, Firma/Büro, Kürzel und Kontaktdaten.
Beim Hinzufügen wird die Funktion aus einem Auswahlfeld gewählt, nach Gewerk gruppiert;
**+ Neue Funktion anlegen …** legt dort gleich eine neue projektübergreifende Funktion an. Ohne
eigenes Kürzel gilt das der Funktion. Reiter gliedern die Liste nach den Gewerken, die im Projekt
vorkommen. Die Liste lässt sich drucken (PDF) und als Excel-Datei herunterladen.

**Excel-Import** liest eine Liste (.xlsx oder .csv) mit den Spalten Funktion, Gewerk, Kürzel,
Anrede, Vorname, Nachname, Firma / Büro, E-Mail, Telefon, Mobil, Anschrift, Notiz; zwingend ist nur
der Nachname (oder eine Spalte „Name“ mit Vor- und Nachnamen). Die Vorschau nennt je Zeile, ob die
Person neu ist oder aktualisiert wird (gleicher Name im Projekt) und ob Funktion oder Gewerk neu
angelegt werden. **Vorlage** lädt eine leere Datei mit diesen Spalten; die Excel-Ausgabe der
Beteiligtenliste hat dieselben Spalten und lässt sich so in ein anderes Projekt übernehmen.

### Protokolle
Je Besprechung (z. B. Baubesprechung, Jour fixe) eine **Protokollreihe**. Ein Protokoll besteht
aus Kopfdaten (Besprechung, Nr., Datum, Beginn, Ende, Ort, nächster Termin, Protokollführung,
zusätzlicher Verteiler), den **Teilnehmenden**, der **Tagesordnung** mit Einträgen vom Typ
**I** (Information), **F** (Festlegung) und **A** (Aufgabe, mit Verantwortlich, Termin und
Erledigt) und einem Hinweis am Ende. **Verantwortlich** wird aus den Teilnehmenden des Protokolls
gewählt und erscheint mit ihrem Kürzel.

* **Teilnehmende** kommen aus der Projektbeteiligtenliste (**Aus Beteiligtenliste …**, auch mit
  **Neue Person …**); Name, Funktion, Firma und Kürzel werden dort gepflegt und im Protokoll
  nachgezogen. **Weitere Person** nimmt Gäste ohne Eintrag auf; über das Personensymbol lassen
  sie sich nachträglich in die Projektbeteiligtenliste übernehmen. Die Protokollführung wird aus
  den Teilnehmenden oder der Projektbeteiligtenliste gewählt; bei einer neuen Reihe übernimmt sie
  die angemeldete Person, sofern ihr Name in der Projektbeteiligtenliste steht.
* **Folgeprotokoll anlegen** übernimmt Kopfdaten, Teilnehmende und Tagesordnung mit allen
  Einträgen; Datum ist der „nächste Termin“. Ein Eintrag besteht aus **Zeilen**: Übernommene
  Zeilen stehen fest (✎ korrigiert sie), eine Ergänzung kommt als neue Zeile in ein eigenes Feld.
  Unter jeder übernommenen Zeile steht ihr Ursprung – in Protokoll Nr. 3 etwa unter der ersten
  Zeile „aus Prot. 1“ und unter der in Nr. 2 ergänzten „aus Prot. 2“. Im Druck erscheinen neue und
  gegenüber dem Vorprotokoll geänderte Angaben **blau**.
* **Ergänzungen mit eigener Art**: Unter einer Ergänzung lässt sich **I**, **F** oder **A** wählen
  – mit eigenem Verantwortlich, bei einer Aufgabe auch Termin und Erledigt. Im Druck steht sie in
  einer eigenen Tabellenzeile unter ihrem Eintrag. Ohne Auswahl läuft sie **unter dem Ursprung
  mit** und teilt dessen Art, Verantwortlich und Termin; ein zweiter Klick auf die gewählte Art hebt
  die Auswahl auf. Aufgaben aus Ergänzungen erscheinen in der Übersicht. Ist der Ursprung erledigt,
  laufen offene Ergänzungen mit eigener Art weiter; sobald der Ursprung entfällt, wird die erste
  von ihnen zum Eintrag.
* **Löschen heißt Durchstreichen** (Standard) – für Tagesordnungspunkte, Einträge und einzelne
  Zeilen (sobald ein Eintrag mehr als eine hat): Der Papierkorb bietet **Durchstreichen** und
  **Sofort löschen**. Gestrichenes steht im Druck und in der Live-Druckansicht dieses Protokolls
  mit **blauer Linie** durchgestrichen – der Text bleibt schwarz – und **entfällt im
  Folgeprotokoll**; ein gestrichener Tagesordnungspunkt nimmt seine Einträge mit. Erledigte
  Aufgaben stehen im Protokoll der Erledigung blau, im Folgeprotokoll noch einmal schwarz
  durchgestrichen und entfallen danach. Die Termin-Spalte nennt „entfällt“ bzw. „erledigt“.
  **Wiederherstellen** hebt das Streichen auf; **Sofort löschen** entfernt ohne Spur.
* **Druckansicht**, **Drucken / PDF** (Druckdialog des Browsers, „Als PDF speichern“) und
  **Live-Druckansicht ↗** – ein eigenes Fenster, etwa für den zweiten Bildschirm in der
  Besprechung, das jeder Eingabe folgt.
* **Logos im Druckkopf** je Projekt – Standard sind DB InfraGO und Mailänder Consult; eigene
  Bilder werden verkleinert im Bestand gespeichert.
* **Aus Protokoll-Tool** übernimmt Dateien des bisherigen Protokoll-Tools (`.protokoll` oder
  dessen Sicherung `.json`) in das Projekt. Teilnehmende, deren Name in der
  Projektbeteiligtenliste steht, werden mit ihr verknüpft; ein erneuter Import ersetzt die
  Protokolle, statt sie zu verdoppeln.

### Übersicht
Kennzahlen (aktive Projekte, offene Punkte, überfällig, demnächst fällig – 7 Tage vorher) und die
offenen Aufgaben der Protokolle aller markierten Projekte – Einträge vom Typ A und Ergänzungen mit
eigener Art „Aufgabe“ –, Überfälliges zuerst, mit **Erledigt** je Zeile; dazu die Projekte mit Beteiligten, Protokollen, letzter Besprechung,
nächstem Termin und offenen bzw. überfälligen Punkten. Die Seitenleiste zählt die überfälligen
Punkte je Projekt.

### Daten
Eigener Schlüssel `projektsteuerung.data.v1` im `localStorage`, eigene Demodaten (zwei Projekte
mit Projektbeteiligten und zwei Protokollen), **Sicherung**/**Einspielen** (JSON mit dem
Kennzeichen `"bereich": "projektsteuerung"`; Sicherungen der anderen Bereiche und des
Protokoll-Tools werden mit Hinweis abgewiesen) und **Zurücksetzen**. Stände der ersten Fassung
erhalten beim Laden die mitgelieferten Gewerke; ihre Funktionen gelten als übergreifend. Ältere
Stände kennen keine gestrichenen Einträge – ihre Einträge gelten als nicht gestrichen. Bis
Fassung 3 bestand ein Eintrag aus Text und Ergänzung: Beim Laden wird der Text eine Zeile aus dem
Protokoll seiner Fundstelle („Prot. 2, Pkt. 1.3“ → „aus Prot. 2“), die Ergänzung eine neue Zeile.
Bis Fassung 4 führte jedes Projekt eine Liste offener Punkte (LOP); sie entfällt beim Laden samt
den Verweisen der Aufgaben, vorhandene Zeilen laufen unter dem Ursprung mit. Die frühere Adresse
`#/projektsteuerung/projekt/<id>/lop` führt zu den Protokollen. Name unter „Angemeldet als“ und
Farbmodus gelten nur in diesem Bereich.

## Aufbau des Codes

Hinweise für die Arbeit am Code – was nach jeder Änderung nachzuziehen ist, wie gebaut und
veröffentlicht wird und welche Randbedingungen gelten – stehen in [`CLAUDE.md`](CLAUDE.md).

KaPlan besteht aus drei getrennten Bereichen. Jeder Bereich bringt seinen eigenen Datenbestand,
seinen eigenen localStorage-Schlüssel, seine eigenen Einstellungen und seinen eigenen Router mit;
die Bereiche greifen nicht aufeinander zu. Die Shell wählt anhand der ersten Wegmarke der Adresse
aus, welcher Bereich geladen wird, und hängt ihn erst beim Betreten ein.

```
src/
  main.tsx       Start der Anwendung, Umlenkung alter Lesezeichen
  shell/         Startbildschirm und Bereichswechsel
    Shell.tsx    Wählt Bereichsauswahl oder Bereich
    Start.tsx    Startbildschirm mit den Bereichskacheln
    bereiche.ts  Verzeichnis der Bereiche
    router.ts    #/ · #/planlauf/… · #/baubetrieb/… · #/projektsteuerung/…
    BereichWechsel.tsx  Rückweg aus einem Bereich zur Bereichsauswahl
  shared/        Bausteine ohne fachlichen Bezug – von keinem Bereich abhängig
    ui.tsx       Karten, Felder, Dialoge, Segmented Controls …
    icons.tsx    Strichsymbole
    logos.tsx    Logos KaPlan (public/logos/) und Wortmarke Mailänder Consult
    toast.tsx    Kurzmeldungen
    dates.ts     Fristen- und Datumsrechnung
    xlsx.ts      Erzeugt Excel-Arbeitsmappen ohne externe Abhängigkeit (mit Zellformaten)
    xlsxLesen.ts Liest Excel- und CSV-Listen für die Importe
    zwischenablage.ts  Formatiert (text/html) und als Klartext kopieren
    print.ts     Druckausgabe als Grundlage der PDF-Fassung
    pwa.ts       Registrierung des Service Workers
    global.css   Design-Tokens im hellen Apple-Erscheinungsbild
  bereiche/
    planlauf/    Bereich „Planlaufmanagement“
      index.tsx  Einstiegspunkt samt Datenbestand des Bereichs
      App.tsx    Seitenleiste, Kopfzeile und Auswahl der Ansicht
      domain/    Fachlogik ohne UI-Bezug
        types.ts     Datenmodell (Projekt, Rolle, Kontakt, Plan, Vorlage, Planlauf …)
        ablauf.ts    Ablaufverfolgung – die einzige Auflösung der Ziele, parallele Blöcke
                     (samt Namen), Zweige, Ausstiege, Rücksprünge, anstehende Schritte,
                     Einfügestellen
        engine.ts    Fristenrechnung ab dem tatsächlichen Eingang, Rücksprung mit Historie,
                     Ampel, Verzug, gewichteter Fortschritt, To-Dos, Zuständigkeiten
        simulation.ts  Simulation eines Laufs: Prognose, Basisplan, Rückwärtsrechnung
        nachweis.ts  Terminnachweis – Verzug gegenüber dem Basisplan je Seite
        protokoll.ts Änderungsprotokoll der Planläufe (protokollNachziehen)
        bestand.ts   Ablauf von mutate, Löschen mit Löschvermerk, Sammelaktionen
        abgleich.ts  Selektiver Abgleich mit einer Sicherung
        terminrechner.ts  Späteste Übergabe bzw. Ende des Planlaufs aus einem Workflow
        workflowGraph.ts  Gliederung und Bearbeitung eines Workflows für den Editor (blockbewusst)
        abschluss.ts Statuswechsel, Wieder öffnen, Einfügen eines Schritts samt Nachweis
        email.ts     Platzhalter und Aufbereitung der Vorlagen, Sammel-E-Mail, Versandmail
        uebersicht.ts  Gliederung und Zeilenwerte der Planlaufliste – auch für den Export
        export.ts    Kurz- und Langfassung für Excel und PDF
        importVorlagen.ts  Spalten und Schreibweisen der Excel-Vorlagen
        seed.ts      Standard-Prozessketten und Demodaten
      store/
        storage.ts   Persistenz (localStorage), Migration, Rohkopie vor der Umstellung, Sicherung
        store.tsx    Zentraler Zustand, alle Schreibzugriffe, Lade- und Speicherzustand
      lib/router.ts  Hash-Adressen unterhalb von #/planlauf
      pages/         Ansichten (Übersicht, Fristen, Projekte, Workflows, Funktionen, Vorlagen,
                     Terminrechner, Projektreiter)
      components/    Fachliche Bausteine (common.tsx, WorkflowEditor, AblaufVorschau, EmailDialog,
                     PlanlaufListe, PaketDialog, BuendelnDialog, SicherungEinspielen, Abgleich,
                     Hinweisleisten, Terminnachweis, Protokoll, NeuZustaendig, SammelErledigen,
                     SammelErinnern, PlanlisteAktionen, SeiteAuswahl …)
    baubetrieb/  Bereich „Baubetriebsplanung“ (erster Entwurf)
      index.tsx  Einstiegspunkt samt Datenbestand des Bereichs
      App.tsx    Seitenleiste, Kopfzeile und Auswahl der Ansicht
      domain/
        types.ts     Datenmodell (Projekt, Anmeldung, Workflow mit Status, Arten, AnnexVII, Richtlinienfristen)
        workflow.ts  Standard-Workflows je Phase, Nachschlagen von Status und Nachfolgern
        workflowPflege.ts  Workflows speichern, duplizieren, löschen – mit Prüfung belegter Status
        fristen.ts   Fahrplanjahr, Terminfrist je Status, Ampel, Anmeldebedarf
        ablauf.ts    Statuswechsel, Übernahme mit Aufteilung, Rücknahme
        export.ts    Excel-Ausgabe des Monitors
        seed.ts      Platzhalter der Richtlinienfristen und Demodaten
      store/         storage.ts (Laden, Migration, Sicherung) und store.tsx (alle Schreibzugriffe)
      lib/router.ts  Hash-Adressen unterhalb von #/baubetrieb
      pages/         Übersicht, Termine, Projekte, Projekt, Anmeldung, Workflows (mit Editor), Einstellungen
      components/    Status- und Fristanzeigen, Dialoge (Anmeldung, Statuswechsel, Nachhaken), Sicherung
    projektsteuerung/  Bereich „Projektsteuerung“ (erster Entwurf)
      index.tsx  Einstiegspunkt samt Datenbestand und Stylesheet des Bereichs
      App.tsx    Seitenleiste, Kopfzeile und Auswahl der Ansicht
      projektsteuerung.css  Gestaltung des Bereichs (Klassen mit Präfix ps-, nur Design-Tokens)
      domain/
        types.ts     Datenmodell (Projekt, Funktion mit Gewerk, Beteiligter, Protokoll mit TOPs, Einträgen
                     und Zeilen)
        protokoll.ts Reihen, Folgeprotokoll, Zeilen mit eigener Art und Streichen, Aufgaben,
                     Teilnehmende nachziehen, Übernahme aus dem Protokoll-Tool
        beteiligteImport.ts  Excel-/CSV-Import der Projektbeteiligten (Spalten, Abgleich von Funktionen)
        punkte.ts    Offene Aufgaben der Protokolle mit Ampel
        druck.ts     Druckfassungen (Protokoll, Beteiligtenliste) samt Gestaltung und Live-Fenster
        export.ts    Excel-Ausgabe und -Vorlage der Projektbeteiligten
        seed.ts      Standard-Funktionen, Standardlogos und Demodaten
      store/         storage.ts (Laden, Aufbereiten, Sicherung) und store.tsx (alle Schreibzugriffe)
      lib/router.ts  Hash-Adressen unterhalb von #/projektsteuerung
      pages/         Übersicht, Projekte, Funktionen, Projekt mit Projektbeteiligten und Protokollen
                     (Liste und Editor)
      components/    Dialoge (Person, Funktion, Gewerk), Excel-Import, Logos, Sicherung, Ampel, Live-Druckansicht
```

Alte Lesezeichen aus der Fassung ohne Bereiche (`#/dashboard`, `#/projekt/<id>/<reiter>` …) werden
beim Aufruf auf `#/planlauf/…` umgelenkt und bleiben damit gültig.

## Gestaltung

Helles Erscheinungsbild in Anlehnung an Apple: Systemschriftart (SF Pro / `-apple-system`),
zurückhaltende Flächen auf `#f5f5f7`, weiße Karten mit weichen Radien und feinen Schatten, die
Hausfarbe von Mailänder Consult `#24456e` als Akzent (auch für alle Fortschrittsbalken),
transluzente Seitenleiste und Kopfzeile, Segmented Controls und Pill-Buttons. Die Oberfläche ist bis auf Telefonbreite (~400 px) nutzbar.

## Nächste Schritte (Ausblick)

* Ablösung von `storage.ts` durch eine Datenbank (z.B. PostgreSQL) samt API – das Datenmodell in
  `domain/types.ts` ist bereits auf Tabellen mit ID-Referenzen ausgelegt.
* Mehrbenutzerbetrieb auf einem gemeinsamen Datenbestand mit Anmeldung und Rechten je Rolle
  (heute sieht jeder Arbeitsplatz nur seinen lokalen Stand).
* Automatischer Mailversand über SMTP statt `mailto:` inkl. Erinnerungslauf im Hintergrund.
* Dateiablage für die eigentlichen Plandateien (PDF/DWG) je Index.
* Auswertungen: Terminlisten, Planlieferlisten und projektweite Verzugsberichte als Export (heute
  gibt es den Terminnachweis je Planlauf).
