# Soundboard

Lokales Soundboard mit gemeinsamem TypeScript-Quellbestand für Web, iPhone und iPad, gebaut mit Expo SDK 58, React Native und React Native Web. Eigene Sounds importieren, einen nicht destruktiven Ausschnitt festlegen, Boards und Soundbuttons anlegen und deren Position und Größe bearbeiten.

## Starten

Voraussetzungen: Node.js 24 (geprüft: 24.19.0), npm und ein aktueller Browser. Abhängigkeiten sind in `package-lock.json` festgehalten.

```sh
npm ci
npm run web
```

Expo zeigt die lokale URL an, normalerweise `http://localhost:8081`. Einen anderen Port kannst du mit `npm run web -- --port 8083` wählen. `npm start` öffnet den plattformübergreifenden Expo-Entwicklungsserver.

## Bedienung

1. Über **Sound importieren** eine MP3- oder PCM-WAV-Datei auswählen. Die App übernimmt die Datei in ihren lokalen Speicher.
2. In der Bibliothek **Ausschnitt** öffnen, Start und Ende in Sekunden eingeben und die Vorschau prüfen. Während der Wiedergabe zeigen eine kontrastierende Positionslinie und die Wiedergabeposition in Sekunden die aktuelle Stelle in der gesamten Datei. Punkt und Dezimalkomma sind möglich. **Speichern** übernimmt die Auswahl; **Abbrechen** verwirft den Entwurf. Die Originaldatei bleibt unverändert.
3. Ein benanntes Board erstellen. Im **Bearbeitungsmodus** einen Button mit Beschriftung und Sound hinzufügen.
4. Einen Button im Bearbeitungsmodus öffnen. Mit den Richtungstasten Position und mit **Kompakt / Breit / Hoch / Groß** seine Größe ändern. Ungültige Schritte und Überlappungen werden erklärt; die letzte gültige Auswahl bleibt bestehen. Anschließend speichern.
5. Zu **Abspielen** wechseln und einen Button aktivieren. Er startet den gespeicherten Ausschnitt. Erneute Aktivierung desselben Buttons stoppt auch während des Ladens; der nächste Druck startet wieder am gespeicherten Anfang. Ein anderer Button (auch mit demselben Sound), **Wiedergabe stoppen** oder ein Boardwechsel beendet die vorherige Wiedergabe. Bibliotheks- und Vorschaustarts beginnen bei erneuter Aktivierung neu.

Das Raster hat zwei Spalten und wächst nach unten. Auf kleinen Bildschirmen wird gescrollt. Ein Sound kann mehreren Buttons und Boards zugewiesen sein; Änderungen seines Ausschnitts gelten für alle. Das Löschen eines Buttons oder Boards entfernt keine Bibliothekssounds. Boardlöschung erfordert einen eigenen Bestätigungsschritt. Es gibt kein kleines festes Demo-Limit für die Anzahl der Boards oder Buttons; verfügbare Ressourcen begrenzen den tatsächlichen Bestand.

## Lokale Daten

Die App hat kein Backend, Konto oder Synchronisierung. Audiodaten werden nicht hochgeladen. Nach dem Laden der Webanwendung braucht der lokale Kernfluss keine Cloudverbindung; erstmaliges Offline-Laden oder eine installierbare PWA ist nicht enthalten.

- **Web:** echte Blob-Bytes in IndexedDB (`local-soundboard`, Stores `assets` und `state`). Metadaten enthalten Asset-IDs, keine flüchtigen Blob-URLs. Speicherung gilt erst nach erfolgreichem Transaktionsabschluss als bestätigt.
- **iOS:** Kopie unter dem App-Dokumentverzeichnis `sounds/<assetKey>`, Metadaten in `soundboard.db` über Expo SQLite. Relative Asset-IDs überstehen wechselnde absolute Sandboxpfade.
- Metadatenformat Version 1: Sounds mit Dauer und Schnittgrenzen; Boards mit beschrifteten Buttons, Soundreferenzen und Rasterwerten. Namen sind keine IDs. Unbekannte Versionen und nicht lesbares Gesamt-JSON werden gegen Überschreiben geschützt. Gültige Teile beschädigter Bestände bleiben möglichst zugänglich, Fehler und fehlende Dateien werden angezeigt.
- Mehrere offene Ansichten: Vor dem Speichern wird der exakt geladene Ausgangsstand atomar mit dem aktuellen Datenbankstand verglichen. Ein veralteter Tab kann neuere Änderungen nicht überschreiben. Bei Konflikt bleiben die gespeicherten Daten erhalten, weitere Änderungen werden gesperrt. **Erneut laden** ist auch im offenen Dialog erreichbar und verwirft bewusst dessen ungespeicherten Entwurf. Danach erneut bearbeiten; es gibt keine automatische Zusammenführung oder Live-Synchronisierung.
- **App-/Website-Daten löschen, App deinstallieren, private Browserprofile oder vom Betriebssystem entfernte Browserdaten können die lokalen Sounds entfernen.** Es gibt derzeit keinen Backup-/Exportweg und keine geräteübergreifende Wiederherstellung. Andere Browserprofile, Geräte, Ports oder Origins haben eigene Bestände.

## Entwicklung und Prüfung

```sh
npm test                    # Domain, Services und Audio-I/O-Verträge
npm run typecheck           # native und Web-Typauflösung getrennt
npx expo install --check    # SDK-kompatible Paketversionen
npm run build:web           # Produktions-Webexport mit Sourcemaps nach dist/web
npm run export:ios          # iOS-JS-/Hermes-Export mit Sourcemaps nach dist/ios
npm run inspect:bundles     # tatsächliche Plattformadapter und Audit-Modulreichweite
```

Produktions-Webexport lokal ansehen:

```sh
npm run preview:web         # http://localhost:8082, nur lokaler HTTP-Server
```

Für die echten Browserchecks muss Google Chrome installiert sein. Playwright ist als Projekt-Dev-Abhängigkeit vorhanden. Der Browser- oder Produktionsserver muss separat laufen:

```sh
npm run test:browser
# Alternativ gegen den fertigen Produktions-Webexport:
SOUNDBOARD_URL=http://localhost:8082 npm run test:browser
```

Die Browserchecks verwenden eigene temporäre Browserprofile und synthetische WAV-/MP3-Fixtures aus `tests/fixtures`; persönliche Daten in der offenen Vorschau werden dadurch nicht verändert. Sie prüfen echte Dateiauswahl, IndexedDB, Audiosignal und -ende, Schnitt/Neustart/Stop, Boards/Layouts/Reload und Tastatur-/Touch-Bedienung. Ergebnisse und Bildschirmfotos liegen unter `workflow-artifacts/2026-10-20-soundboard-mvp/`. Die Fixtures sind eigene Zweiton-Signale und lassen sich mit `node scripts/generate-fixtures.mjs` neu erzeugen.

`dist/`, `.expo/`, `node_modules/`, `test-results/` und lokal erzeugte native Projektordner sind generierte Ausgaben und werden ignoriert. Die Build-/Audit- und Browser-Evidenz ist separat im Workflow-Verzeichnis dokumentiert. Es erfolgt keine Veröffentlichung oder App-Store-Auslieferung.

## iPhone und iPad

Für einen nativen Entwicklungsbuild werden macOS, eingerichtetes und lizenziertes Xcode, iOS-Simulator beziehungsweise ein verbundenes Gerät, CocoaPods und gegebenenfalls Gerätesignierung benötigt. `ios.supportsTablet` ist aktiviert.

```sh
npm run ios
# Direkt auf einem verbundenen Gerät:
npm run ios -- --device
```

`expo run:ios` erzeugt das lokale native Projekt und startet einen Development Build. Ein erfolgreicher `export:ios` prüft lediglich JS-/Asset-Bündelung und Modulauflösung; er ist kein nativer Build und kein Nachweis ausgeführter iPhone-/iPad-Datei- oder Audiofunktionen.

## Stand der Plattformprüfung

Web wurde mit Google Chrome 155.0.8059.85 und echten PCM16-WAV-/MP3-Dateien geprüft. Desktopansicht und 390px-Ansicht mit Touch sowie Tastatur sind geprüft. WebAudio-Analyser und Source-Endereignisse belegen ein tatsächliches Signal und die Ausschnittbegrenzung; die automatisierten Headless-Läufe sind stumm und ersetzen keine menschliche Hörkontrolle. Zusätzliche Bedienprüfungen im in-app browser haben Import, Zuschnitt, Board und Layout nach Reload bestätigt; dessen Engine ist nicht gesichert.

**Offen und für die vollständige Plattformabnahme erforderlich:** native Ausführung auf iPhone und iPad sowie Safari/iOS-Web. In dieser Umgebung blockiert die nicht akzeptierte Xcode-Lizenz den Simulator, ein Testgerät ist nicht vorhanden. Insbesondere native MP3-/WAV-Auswahl, Datei-/SQLite-Neustart, hörbare Endpunktgüte, Stopp/Neustart, Hintergrundwechsel und Audio-Unterbrechung sind noch tatsächlich zu prüfen. Desktop-Chrome mit kleinem Viewport ersetzt diese Prüfung nicht.

Native Ausschnittenden werden mit Expo-Statusmeldungen und einem aus der tatsächlichen Wiedergabeposition berechneten JS-Timer begrenzt. Das ist keine samplegenaue Schnittgarantie; deutlich hörbare Überschreitungen unter Last müssen auf iOS behoben und erneut geprüft werden. Weitere Formate werden nicht pauschal zugesagt; Decoder- und Speicherfehler werden sichtbar gemeldet.

Die vollständige Anforderungs-/Prüfzuordnung, beobachtete Red–Green-Zyklen und verbleibende Grenzen stehen in [implementation.md](workflow-artifacts/2026-10-20-soundboard-mvp/implementation.md). Die getrennte Abhängigkeitsanalyse ist in [audit-analysis.md](workflow-artifacts/2026-10-20-soundboard-mvp/audit-analysis.md) festgehalten; ein SDK-fremdes Force-Upgrade ist kein Bestandteil dieses Projekts.

Die finale Browserabnahme lief gegen den neu exportierten Produktionsstand auf Port 8082. `npm audit` meldet weiterhin 22 transitive Meldungen (7 moderate, 15 high) aus drei Advisory-Wurzeln. Die betroffenen Pakete `braces`, `node-forge` und `uuid` sowie deren Xcode-/Signaturwerkzeuge sind in den geprüften tatsächlichen Web-/iOS-Sourcemapquellen nicht enthalten. Der Metro-Modullader `@expo/cli/build/metro-require/require.js` ist enthalten; er ist von den betroffenen Werkzeugpfaden zu unterscheiden. Die Befunde im installierten Entwicklungs-/Buildwerkzeugbaum wurden dadurch nicht repariert. Details und die verbleibende Werkzeugrelevanz sind in der Analyse und `bundle-audit-evidence.json` dokumentiert.

Die inkrementelle Prüfung von Wiedergabeposition und Button-Stopp liegt unter `workflow-artifacts/2026-10-20-playback-indicator-toggle/`: `SOUNDBOARD_URL=http://localhost:8082 node scripts/playback-indicator-smoke.mjs` prüft den tatsächlichen Webexport mit Engine-Zeitvergleich, Desktop/390px, Tastatur und Touch. Die Vorschau muss separat mit `npm run preview:web` laufen. `SOUNDBOARD_EVIDENCE_DIR` ändert bei diesem sowie den Playback-/Board-Smokes das Ausgabeverzeichnis. Native Vertragsprüfungen und iOS-Export ersetzen weiterhin keine Geräte- oder Safari-Abnahme.
