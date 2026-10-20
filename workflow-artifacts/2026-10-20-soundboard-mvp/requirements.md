# Anforderungen – Soundboard-MVP

Status: **ready**. Stand: 2026-10-20. Quelle: `request.md`; ergänzender Default aus Host-Handoff: nicht destruktiver Ausschnitt mit gespeichertem Start/Ende, Original bleibt erhalten.

## Ziel, Akteure und Bestand

Eine einzelne Person erstellt und bedient persönliche Soundboards mit eigenen lokalen Audiodateien auf iPhone, iPad und im Browser. Hauptansicht ist das minimalistische Soundboard; Bearbeiten und Abspielen sind klar unterscheidbar.

Bestandsaufnahme: Das Repository enthält derzeit ausschließlich `workflow-artifacts/2026-10-20-soundboard-mvp/`; keine Anwendung, Tests, Paketdateien, CI, öffentlichen APIs oder vorhandenen Datenformate. `request.md` beschreibt das Nutzerziel; `state.md` dokumentiert Toolchain und Arbeitsablauf. Es gibt somit keine bestehenden Ausführungspfade oder Symbole, deren Verhalten erhalten werden muss. Laut Host keine anwendbare `AGENTS.md` in Ancestors. Eigene Dateiliste/Verzeichnisprüfung bestätigt den leeren Anwendungsbestand.

Gewünscht ist eine gemeinsame TypeScript-Basis, die iOS und Web unterstützt; Expo/React Native ist geeignet, aber noch keine implementierte Technologie. Keine Behauptung bestehender Frameworks oder Testbefehle.

## Umfang und Prioritäten

**P0** = für das nutzbare MVP erforderlich; **P1** = ebenfalls Abnahmeumfang, nach dem Kernfluss umsetzbar. In Scope: Import lokaler Dateien, lokale Soundbibliothek, Ausschnittdefinition und Vorschau, Sound-/Button-/Board-Zuordnung, Abspielen, mehrere Boards, Position/Größe, dauerhafte lokale Speicherung und Bedienbarkeit auf allen drei Oberflächen.

Out of Scope: Cloud, Konten, Synchronisierung zwischen Geräten/Browsern, gemeinsames Bearbeiten, Aufnahme, Stream-/URL-Import, Effekte/Mischpult, Hintergrundwiedergabe, WAV/MP3-Export geschnittener Dateien, Veröffentlichung im App Store, Hosting/Produktivdeployment. Diese Funktionen sind für den Kernfluss nicht notwendig. Kein künstlich kleines Limit für Anzahl der Boards/Buttons; reale Ressourcen- und Speichergrenzen bleiben zulässig und müssen erklärt werden.

## Funktionale Anforderungen und Abnahme

### REQ-IMPORT (P0): Eigene Audiodateien importieren

- **AC-IMPORT-01:** Eine Person kann über einen Datei-Auswahldialog eine lokale Audiodatei wählen. Nach erfolgreicher Prüfung erscheint sie mit erkennbarem Namen und gültiger Dauer in der Bibliothek und steht für einen Button zur Verfügung. Mindestens eine kleine MP3- und eine unkomprimierte PCM-WAV-Testdatei müssen im tatsächlichen Web- und iOS-Ziel erfolgreich importiert und abgespielt werden; zusätzliche Formate nur nach belegter Unterstützung zusagen.
- **AC-IMPORT-02:** Abbruch der Auswahl ändert Bibliothek und Boards nicht und erzeugt keine Fehlermeldung. Leere, beschädigte, nicht decodierbare oder nicht unterstützte Dateien erzeugen einen verständlichen Fehler; vorherige Sounds bleiben bedienbar. Ungültige Dauer (nicht endlich oder <= 0) gilt als Importfehler.
- **AC-IMPORT-03:** Importierte Bytes werden in app-/browserlokalen dauerhaften Speicher übernommen. Ein flüchtiger Auswahl-/Vorschauverweis allein genügt nicht. Nach Neustart ist die App nicht auf den ursprünglichen Auswahlvorgang oder einen temporären Objekt-URL angewiesen.
- **AC-IMPORT-04:** Gleichnamige Dateien bleiben eindeutig zuordenbar; ein Import überschreibt keine frühere Datei nur aufgrund ihres Namens. Speicherfehler führen zu einer Fehlermeldung und keinem scheinbar erfolgreichen, später fehlenden Sound.

### REQ-TRIM (P0): Ausschnitt nicht destruktiv festlegen

- **AC-TRIM-01:** Für einen Sound sind Start und Ende innerhalb seiner Dauer einstellbar; der Standard ist die vollständige Datei. Die Auswahl ist mit sichtbaren Zeitwerten verständlich und auf Touch-Geräten bedienbar. Eine grafische Wellenform ist keine Pflicht.
- **AC-TRIM-02:** Nur endliche Werte mit `0 <= Start < Ende <= Dauer` werden gespeichert. Leere, negative, vertauschte, gleiche und überlange Grenzen werden verhindert oder verständlich als ungültig markiert; die letzte gültige Auswahl bleibt erhalten. Rundungs-/Darstellungspräzision darf den Endpunkt der vollständigen Datei nicht ungültig machen.
- **AC-TRIM-03:** Vorschau startet am gewählten Start und endet am gewählten Ende; Speichern beeinflusst die nachfolgende Button-Wiedergabe identisch. Abbrechen verwirft ungespeicherte Änderungen. Die Originalbytes bleiben unverändert. Es muss keine neue Audiodatei gerendert werden.
- **AC-TRIM-04:** Ausschnittgrenzen und Soundbezug bleiben nach Neustart erhalten. Eine nachträgliche gültige Änderung wird bei allen zugewiesenen Buttons dieses Sounds verwendet (Default: Ausschnitt gehört zum Sound).

### REQ-BUTTON (P0): Sound einem Board-Button zuweisen

- **AC-BUTTON-01:** Auf dem gewählten Board kann ein Button mit sichtbarer Beschriftung und einem importierten Sound angelegt werden. Beschriftung und Sound lassen sich anschließend ändern; Änderungen betreffen ausschließlich den bearbeiteten Button, abgesehen von gemeinsam genutzten Sound-Ausschnitten.
- **AC-BUTTON-02:** Ein Sound kann mehreren Buttons und mehreren Boards zugewiesen werden. Das Löschen eines Buttons entfernt weder den Sound noch andere Buttons. Buttons ohne gültigen Sound werden nicht als abspielbereit dargestellt.
- **AC-BUTTON-03:** Ein Button kann wieder entfernt werden; das letzte Element eines Boards darf entfernt werden. Leerzustände bieten einen klaren nächsten Schritt zum Import/Anlegen.

### REQ-PLAYBACK (P0): Zuverlässig und direkt abspielen

- **AC-PLAYBACK-01:** Im Abspielmodus startet eine bewusste Button-Aktivierung den gespeicherten Soundausschnitt. Beim Laden, Importieren, Verschieben oder Ändern der Größe startet keine unbeabsichtigte Wiedergabe.
- **AC-PLAYBACK-02:** Default: genau eine aktive Wiedergabe. Erneutes Aktivieren desselben Buttons startet dessen Ausschnitt neu; Aktivieren eines anderen Buttons beendet die vorherige Wiedergabe und startet die neue. Ein erreichbarer Stopp beendet auch eine lange Vorschau/Wiedergabe. Es bleiben keine verwaisten Timer oder hörbaren vorherigen Instanzen aktiv.
- **AC-PLAYBACK-03:** Nach Ausschnittende ist der Wiedergabezustand wieder inaktiv. Stoppen, Boardwechsel und neue Wiedergabe während laufender Wiedergabe hinterlassen konsistenten UI-/Audiozustand. Boardwechsel stoppt laufendes Audio (Default).
- **AC-PLAYBACK-04:** Fehlende lokale Bytes, Decoderfehler oder verweigerter Wiedergabestart werden sichtbar erklärt; andere Buttons bleiben nutzbar. Wiedergabe beginnt über eine Nutzeraktion und setzt kein Autoplay beim Seitenstart voraus.

### REQ-BOARD (P0): Boards verwalten

- **AC-BOARD-01:** Boards lassen sich mit einem Namen erstellen, auswählen und umbenennen. Neue Buttons gehören zum ausgewählten Board; ein Wechsel zeigt dessen eigene Buttons und Anordnung. Die Startansicht erlaubt ohne versteckte Voraussetzung das erste Board/den ersten Sound anzulegen.
- **AC-BOARD-02:** Mehrere Boards mit ähnlichen/gleichen Namen bleiben intern getrennt. Leere oder nur aus Leerzeichen bestehende Namen werden nicht gespeichert. Kein kleiner fest codierter Demo-Maximalbestand begrenzt das Hinzufügen.
- **AC-BOARD-03:** Ein Board kann mit bewusstem Löschschritt entfernt werden. Seine Buttons verschwinden, seine Sounds bleiben in der Bibliothek für andere Boards erhalten. Das letzte Board darf entfernt werden; ein verständlicher Leerzustand folgt.

### REQ-LAYOUT (P0): Position und Größe verändern

- **AC-LAYOUT-01:** Im Bearbeitungsmodus können Buttons innerhalb des Boards in Position und Größe verändert werden. Der Weg funktioniert per Touch auf iPhone/iPad und per Maus im Web. Direkte Gesten oder sichtbare Positions-/Größensteuerungen sind zulässig; Drag-and-drop ist keine zwingende Vorgabe.
- **AC-LAYOUT-02:** Eine Position/Größe außerhalb gültiger Grenzen wird verhindert oder auf gültige Grenzen begrenzt. Buttons bleiben sichtbar und bedienbar; kein Button kann durch eine Größenänderung verschwinden. Default: begrenztes Raster, keine verdeckenden Überlappungen. Falls eine Verschiebung keinen Platz hat, bleibt die letzte gültige Anordnung erhalten und die Ursache wird erkennbar.
- **AC-LAYOUT-03:** Verschiedene verfügbare Breiten einschließlich schmalem iPhone und breitem iPad/Desktop schneiden keine wichtigen Bedienelemente ab. Gespeicherte Anordnung bleibt sinnvoll rekonstruierbar; Rasterumbrüche bei kleinerem Viewport sind zulässig. Scrollen ist zulässig.
- **AC-LAYOUT-04:** Neue Buttons erhalten eine gültige freie Ausgangsposition/Größe. Nach Speichern und Neustart bleiben Layoutänderungen erhalten. Abspielmodus bietet keine versehentliche Layoutänderung.

### REQ-PERSIST (P0): Lokal und konsistent speichern

- **AC-PERSIST-01:** Importierte Bytes, Soundnamen, Dauer, Ausschnitte, Boards, Beschriftungen, Zuordnungen und Layout bleiben nach Browser-Reload bzw. App-Neustart im selben lokalen Speicher erhalten. Ein vollständiger Import–Zuschnitt–Zuordnung–Layout–Neustart–Abspielen-Durchlauf wird mit realem Speicher geprüft.
- **AC-PERSIST-02:** Nach dem Laden der App benötigt dieser Kernfluss keine Anmeldung oder Cloudverbindung. Native App und bereits geladene Webanwendung können lokale Daten ohne Backend verwenden. Eine offline erstmalig ladbare/installierbare Web-App ist keine zusätzliche MVP-Pflicht.
- **AC-PERSIST-03:** Ungültige gespeicherte Metadaten oder fehlende Audiodaten verursachen keinen Absturz und kein stilles Komplettlöschen. Betroffene Daten/Buttons werden verständlich als nicht verfügbar behandelt; noch gültige Bestände bleiben soweit möglich zugänglich. Fehlgeschlagene Speicherung wird sichtbar gemeldet, ohne Erfolg vorzutäuschen.
- **AC-PERSIST-04:** Keine geräte- oder browserübergreifende Synchronisierung wird versprochen. Hinweise zu lokalem Speicher machen verständlich, dass Löschen der App/Website-Daten die lokalen Sounds entfernen kann. Fremde Audiodaten werden weder hochgeladen noch an einen Dienst gesendet.

### REQ-USABILITY (P1): Minimalistisch und zugänglich bedienen

- **AC-USABILITY-01:** Soundboard, aktives Board und Bearbeitungs-/Abspielzustand sind erkennbar. Import, Zuordnung, Ausschnitt, Anordnung und Abspielen ergeben einen durchführbaren Ablauf ohne Entwicklungswissen. Leere, ladende und fehlerhafte Zustände enthalten klare deutsche Texte (Default: Deutsch).
- **AC-USABILITY-02:** Zentrale Aktionen sind beschriftet bzw. haben zugängliche Namen, besitzen gut treffbare Touchflächen (Ziel mindestens 44 × 44 logische Pixel), sichtbaren Tastaturfokus und verständliche Eingabefehler. Im Web sind Kernaktionen per Tastatur erreichbar; Layout darf hierfür alternative Steuerungen anbieten. Information wird nicht ausschließlich durch Farbe vermittelt.
- **AC-USABILITY-03:** Ein reales Board mit mindestens 12 Buttons ist auf schmaler mobiler und großer Ansicht bedienbar. Audioladen/-fehler blockiert die übrige Oberfläche nicht dauerhaft. Kein ungetestetes numerisches Latenzversprechen; Wiedergabe soll nach Nutzeraktivierung ohne zusätzliche Bestätigungsdialoge beginnen.

## Plattform- und Qualitätsgrenzen

- **REQ-PLATFORM (P0):** Gemeinsamer TypeScript-Quellbestand mit start-/buildbarer Web- und iOS-Zielkonfiguration. Abnahme umfasst die tatsächlichen Datei-, Speicher- und Audioadapter beider Plattformen; reine Domain-Mocks belegen diese Verträge nicht.
- **AC-PLATFORM-01:** README nennt reproduzierbare Entwicklungs-, Typprüf-, Test-, Web-Build- und iOS-Start-/Buildwege samt Voraussetzungen. Das Projekt darf nicht als ausschließliches Webprojekt geliefert werden.
- **AC-PLATFORM-02:** Web-Kernfluss wird in einem tatsächlich verfügbaren Browser geprüft; Browser/Version und verwendetes Dateiformat werden berichtet. Safari/iOS-Kompatibilität und native iOS-Ausführung werden mit konkreter Laufzeit angegeben. iPhone/iPad-Ansicht im Desktop-Browser zählt als Layoutprüfung, nicht als native Audio-/Dateisystemprüfung.
- **AC-PLATFORM-03:** Wenn Xcode/Simulator/Gerät oder Browserziel fehlen, werden konkrete nicht ausführbare Prüfungen und verbleibende Risiken im Handoff genannt; ein vorhandener iOS-Buildpfad allein ist kein Nachweis erfolgreicher iOS-Ausführung. iOS-Simulator/-Gerät soll den Kernfluss inklusive Import und Neustart bestätigen, sobald verfügbar.
- Architektur, Paketversionen, Speichermedium, Fehler-/Validierungsgrenzen und Testharness werden aus den Anforderungen abgeleitet; diese Datei legt keine Schichten oder Bibliotheken fest. Keine externen öffentlichen Kompatibilitätsverträge bestehen. Ein nachvollziehbares lokales Datenformat muss zukünftige Entwicklung erlauben; Migration alter Produktivdaten ist derzeit nicht erforderlich.
- Bedeutungsvolle Tests prüfen Validierung, Ausschnitt und Wiedergabeende/-wechsel, Zuordnungen, Layoutgrenzen und Persistenz-/Fehlerfälle an geeigneten Grenzen. Beobachtbare Red–Green-Evidenz gemäß `quality.md`; reale Audio-/Datei-Integration zusätzlich prüfen. Dokumentation oder Sichtprüfung ersetzt keine unbelegte funktionale Aussage.

## Gefundene Prüfkommandos und Ausführung

Keine Projekt-Build-/Test-/CI-Befehle gefunden; keine Tests oder Builds ausgeführt. Der Bestand wurde mit `rg --files` und `ls -la` geprüft. Node-Pfad laut Host: `/Users/marv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`; konkrete spätere npm-Skripte sind noch festzulegen und anschließend auszuführen. Laut späterem Host-Handoff ist Xcode nicht lizenziert und ein physisches Gerät nicht vorhanden. Web-E2E, iOS-Export und Typecheck sind als erreichbare Prüfwege vorgesehen, jedoch bisher nicht ausgeführt; native Laufzeitprüfungen bleiben eine ausdrücklich zu berichtende Verifikationslücke. Auch der Systemaufruf `python3` scheiterte bei einem Artefakt-Update an dieser Xcode-Lizenz; das Update wurde anschließend mit dem Dateieditierwerkzeug erledigt.

## Annahmen, reversible Defaults und offene Entscheidungen

1. Nicht destruktiver Schnitt ist vom Host bereits kommuniziert. Ausschnitt gehört zum Bibliothekssound; mehrere Buttons teilen ihn. Unterschiedliche Ausschnitte können vorerst über mehrfachen Import realisiert werden. Kein Mehrspur-/Effekteditor.
2. Einzelwiedergabe mit Neustart, globalem Stopp und Stopp beim Boardwechsel; gleichzeitiges Mischen/Looping gehört nicht zum geforderten Umfang. Das ist ein reversibler Produktdefault, keine abgewartete Nutzerfreigabe.
3. Einfache Board-/Buttonnamen, deutsche Oberfläche, Rasterlayout mit sichtbaren Bearbeitungsaktionen, automatisches lokales Speichern und keine Cloud sind reversible Defaults. Konkrete Rastermaße und Steuerung wählt Architektur/Implementierung unter den ACs.
4. Dauerhafte Speicherung bedeutet Wiederherstellung im selben App-/Browserprofil unter normalen Speicherbedingungen; vom Betriebssystem/Browser entfernte Daten oder vom Nutzer gelöschte Website-Daten sind nicht rekonstruierbar. Backup/Export ist nicht beauftragt.
5. Keine notwendigen offenen Nutzerentscheidungen. Konkrete Plattformlaufzeit, Versionswahl, Speicherquoten und Codec-Verhalten sind durch technische Verifikation zu klären, nicht durch eine vorsorgliche Rückfrage. Nicht prüfbare Plattformverträge bleiben explizite Verifikationslücken und werden nicht als bestanden ausgegeben.
