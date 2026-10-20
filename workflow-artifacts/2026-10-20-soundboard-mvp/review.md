# Unabhängige Review – Soundboard-MVP

Stand: 20.10.2026. Reviewer `/root/reviewer`, frischer Kontext, nicht an der Implementierung beteiligt. **Verdict: `blocked` – tatsächliche Codeprüfung abgeschlossen; vollständige Plattformabnahme wegen nicht ausgeführter Pflichtchecks offen.** Keine neuen bestätigten Codebefunde ab F-003. **F-001 und F-002 sind reviewer-verifiziert.** Das ist kein Vollpass und keine stillschweigende Annahme der verbleibenden Risiken.

## Geprüfter Bestand und Version

Baseline: leeres Verzeichnis, kein Git-Repository; sämtliche Anwendungsdateien sind neu. Grundlage waren Originalauftrag `request.md`, alle REQ/ACs in `requirements.md`, vollständiger `plan.md` einschließlich F-001-Nachtrag, `implementation.md` einschließlich des ersetzenden letzten F-002-Abschnitts, `audit-analysis.md`, Qualitäts-/Workflow-/Reviewer-Verträge sowie tatsächliche Dateien.

Unabhängig nachgerechnet: **63/63 Manifestdateien stimmen in Größe und SHA256 mit dem Dateisystem überein**, keine Abweichung. Auch der Digest der serialisierten Manifest-Einträge stimmt:

`aa68d0d52eb578780c2dbf5d111497348050cb5c2bc4894a655472c9d723e2d3`

Evidenz: `review-version-evidence.json`. Abschließende erneute Hashkontrolle nach Erstellung dieses Berichts ebenfalls Exit 0, 63/63 unverändert. Diese Version umfasst App, Domain, Services, sämtliche Web-/Native-Adapter und UI-Komponenten, alle Tests/Fixtures, Browser-/Build-/Prüfskripte, Paket-/Lock-/Expo-/TS-Konfiguration, README und Ignore-Regeln. Quellprüfung aller eigenen TS/TSX-/Skriptdateien durchgeführt; Lockfile und installierte Abhängigkeiten hinsichtlich Konfiguration, Plattformauflösung und konkreter Auditpfade beurteilt. Keine Behauptung einer vollständigen Vendor-Codeprüfung.

Generierte Verzeichnisse `.expo`, `dist`, `node_modules`, `test-results` und Workflowberichte sind nachvollziehbar vom Source-Digest ausgeschlossen. Der reale Wurzelbestand enthält keine zusätzliche ausgelassene Anwendungswurzel. Reviewer schrieb ausschließlich diesen Bericht und `review-*`-Evidenz im Run; keine App-, Test- oder Toolingänderung. Andere Rollenberichte blieben unverändert.

Die tatsächlichen finalen Sourcemaps wurden zusätzlich rekursiv ausgewertet und **alle eingebetteten eigenen Quelltexte bytegenau mit den aktuellen Dateien verglichen**: 24 Web- und 26 iOS-Anwendungsquellen, alle identisch. Damit gehören die vorliegenden Exporte zum geprüften Anwendungscode, nicht nur zu gleich benannten Berichten.

| Export | Tatsächliche Datei | SHA256 der Bundledatei |
| --- | --- | --- |
| Web | `dist/web/_expo/static/js/web/index-cc1a9f4e523922f4b55583ccdcfb544f.js`, 468871 Bytes | `60fd8c6567ad8d164ea67bcf0ab4ab40733a026daab67fed4e38bce6f51540e3` |
| iOS | `dist/ios/_expo/static/js/ios/index-fbb1570070aca540068cd461eb8a605c.hbc`, 1501256 Bytes | `a1c0f3fe371c8058a5cf064059bc93dc0f95e42317f8e57c3eba8e4b2fc4565a` |

Evidenz: `review-bundle-evidence.json`. Web enthält 233, iOS 707 eindeutige Sourcemapquellen. Richtige Plattformadapter sind vorhanden; die Webausgabe bindet keine nativen Datei-/SQLite-/Audioadapter ein.

## Findings und Disposition

### F-001 – Veralteter Gesamtsnapshot überschreibt Änderungen anderer Instanzen

**Priorität P1; Status `verified`; ursprünglicher Owner Architektur/TDD; Code-Abnahmeblockade behoben.**

- Trigger/Impact: Zwei geladene Tabs bearbeiten denselben gespeicherten Ausgangsstand. Der zweite Gesamtsnapshot konnte früher Sounds, Ausschnitte, Boards, Labels, Zuordnung und Layout des ersten Schreibers still zurücksetzen. Architektur-/Red-Bericht beschreibt den konkreten Verlust von 0.25–1.25 auf 0–2 sowie Board-/Layoutänderungen.
- Tatsächlich geprüfte Korrektur: `src/platform/storage.web.ts:47` vergleicht Rohwert und erwartete Basis innerhalb **derselben** IDB-readwrite-Transaktion; `get` und bedingtes `put` sind nicht durch asynchrone Fremdarbeit getrennt. Erst `oncomplete` bestätigt die neue Basis. `src/platform/storage.native.ts:36` verwendet das Callback-Transaktionsobjekt; `native-state.ts` führt bedingtes UPDATE beziehungsweise INSERT-DO-NOTHING mit `changes === 1` aus. Installierter Expo-SQLite-Quellcode bestätigt die getrennte Connection und äußeren Commit/Rollback.
- Service-/UI-Prüfung: `src/services/library.ts:19–57` serialisiert Picker, Commit und Reload, schützt vor erstem Load und während angefordertem Reload, bewahrt bestätigten Zustand/Basis bei Speicherfehlern und sperrt Folgemutationen bei Konflikt. Alle acht Mutationsarten gehen durch den gemeinsamen Commit. `App.tsx` spiegelt den Service auch bei Fehlern; bewusster Reload stoppt Audio und schließt alle vier Dialogarten. In Sound-, Board-, Button- und Boardlöschdialog sind Schreiben/Löschen gesperrt und Reload/Abbrechen erreichbar. Kein automatisches erneutes Anwenden alter Entwürfe.
- Unabhängiger Nachweis: `npm test` bestanden, einschließlich aller acht stale Mutationsfälle, Loadfehler/Erholung, Queue-/Picker-/Commit-/Reloadrennen, unveränderter Basis nach gewöhnlichem Speicherfehler und echtem SQLite-Helfer über zwei Node-SQLite-Verbindungen. Zusätzlich eigener erfolgreicher Chrome-155-Produktionslauf der gelesenen Zwei-Tab-Prüfung: vollständiger erster Snapshot und Originalasset-Hashes erhalten; alle Dialogpfade geschützt; neue bewusste Bearbeitung nach Reload möglich; konkurrierende Erstschreiber und Updates jeweils genau ein Gewinner und ein sichtbarer Konflikt.
- Review-Browsernachweis: `review-browser/concurrency-output-escalated.txt`, `review-browser/concurrency-browser-evidence.json`, `review-browser/conflict-button-chrome.png`. Die Kopie `review-browser/concurrency-smoke.mjs` unterscheidet sich vom manifestierten Harness ausschließlich im Ausgabeordner. Initialer Reviewerstart scheiterte vor Appkontakt mit Chrome-SIGABRT/EPERM; genehmigter Retry endete mit **Exit 0**. Ein zusätzlicher Host-Relaylauf derselben Kopie bestand ebenfalls; er ist ergänzend, nicht der alleinige unabhängige Nachweis.

Die F-001-Logikkorrektur ist verifiziert. Der separate fehlende Expo-/iOS-Laufzeitnachweis bleibt CHECK-001; Node-SQLite wurde nicht als native Appausführung umgedeutet.

### F-002 – Importrollback löscht ein nicht selbst angelegtes Asset

**Priorität P1; Status `verified`; ursprünglicher Owner TDD; Code-Abnahmeblockade behoben.**

- Trigger/Impact: Der erzeugte Assetschlüssel ist schon vorhanden, `put()` lehnt ab, und der alte Catch löschte trotzdem die vorhandenen Originalbytes. Der dokumentierte Red-Fall erwartet den Original-Blob und erhielt `undefined`.
- Tatsächlich geprüfte Korrektur: `src/services/library.ts:67–80` setzt `ownsAsset` ausschließlich nach erfolgreichem eigenen `put`; nur dann darf Rollback entfernen. Web-`put` verwendet IDB-`add`, kein überschreibendes `put`; native Anlage prüft bestehenden Zieldatensatz vor Kopie. Ein fehlgeschlagener Teilkopierversuch kann einen unreferenzierten Rest hinterlassen, er begründet keine Berechtigung zum Löschen fremder Bytes.
- Unabhängiger Nachweis: Regressionsfall in `tests/import.test.ts` mit erzwungenem `known.wav`-Schlüssel, existierendem Original-Blob und abgewiesener Anlage selbst gelesen und im unabhängigen 76/76-Lauf bestanden. Prüft Originalobjektidentität **und keinen remove-Aufruf**. Bestehende Decoder-/Dauer-/Metadatenfehler-Rollbacks nach erfolgreicher Anlage bleiben grün. Der reale Zwei-Tab-Importkonflikt bestätigt ergänzend, dass nur das neue Asset zurückgerollt wird und beide Originalhashes unverändert bleiben.

### Neue Codebefunde

**Keine neuen bestätigten, substantiellen Defekte.** Keine optionalen Stilwünsche als Abnahmeblocker erfunden. Dies ist eine abgeschlossene Prüfung der oben bezeichneten Version innerhalb der genannten Inspektionsgrenzen, keine Garantie vollständiger Fehlerfreiheit.

## Anforderungen, Architektur und tatsächliche Evidenz

| Bereich | Geprüfte Umsetzung und Nachweise | Abnahmegrenze |
| --- | --- | --- |
| IMPORT-01–04 | Plattformpicker, dauerhafte IDB-Blob-/native Dokumentkopie, eindeutige IDs, Decoder-/Dauerprüfung, Abbruch/Fehler/Rollback. Importtests und echter Filechooser-/SHA256-/Reloadpfad im Browserharness; F-002 geprüft. | Chrome belegt; native MP3-/PCM-WAV-Auswahl und Wiedergabe offen. |
| TRIM-01–04 | Nicht destruktive Start-/Endmetadaten, Komma/Punkt, endliche Grenzen, volle interne Endpräzision, lokale Entwürfe, Vorschau/Save/Cancel. Gemeinsame Soundreferenz für mehrere Buttons. | Unit-/Browserbelege geeignet; native Endpunkt-/Touch-/Hörprüfung offen. |
| BUTTON-01–03 | Benannte Buttons, Soundwechsel, mehrfacher Soundbezug, getrennte Boardzuordnung, Entfernen bis zum letzten Element, fehlende Referenzen/Bytes als nicht verfügbar. | Domain-, Session-, Persistenz- und tatsächlicher 12-Pad-Browserablauf decken den Webvertrag. |
| PLAYBACK-01–04 | Gemeinsamer Einzelplayback-Controller; synchrone Webfreigabe, Generation/Abort, Neustart/Wechsel/Stop, alte Handles/Ereignisse verworfen. Web Audio-Uhr begrenzt Segment; native Seek/Status/Timer/Cleanup/Startup-Timeout. | Web-Analysersignal und echte Endereignisse vorhanden; native tatsächliche Endpunktgüte/Unterbrechungen sowie Hören offen. |
| BOARD-01–03 | Erstellen/Wählen/Umbenennen/Löschen, unabhängige IDs bei gleichen Namen, bewusster Löschdialog, keine Soundlöschung. Boardwechsel stoppt Wiedergabe. | Unit-/Browserbelege geeignet; letztes Board und leere Zustände geprüft. |
| LAYOUT-01–04 | Zwei responsive Spalten, wachsende Zeilen, vier Größen, freie Ausgangsposition, sichtbare Pfeilsteuerung, Validierung gegen Grenzen/Kollisionen, Entwurf erst bei Commit übernommen. | 40-Button-Domaintest, 12 echte Pads bei 390/1024, Boxmessungen, Reload und Touchevent; native Touchbedienung offen. |
| PERSIST-01–04 | Transaktionsbestätigung vor UI-Erfolg, Rohtext-CAS, Recovery/Warnungen, Schutz kaputter Gesamtzustände/unerwarteter Speichertypen, fehlende Bytes einzeln markiert, lokale Datenschutzhinweise. Keine Netzwerk-/Backendabhängigkeit im Kern. | Reale IDB-Abbrüche nach Request-success, Offlinebetrieb, Reload und F-001 belegt; native Datei-/SQLite-Neustart offen. |
| USABILITY-01–03 | Deutsche Leer-/Fehler-/Ladezustände; Board als Hauptfläche, sekundäre Bibliothek, sichtbarer Modus und Fokus, große Actions, Namen/checked/pressed-Semantik, scrollbare Dialoge. | Quellen, Browserassertions und PNGs plausibel. Desktop-Chrome-Touch zählt nicht als reales iPhone/iPad oder VoiceOver. |
| PLATFORM-01–03 | Gemeinsamer Expo58/TS/RN-Quellbestand, Tablet-Konfiguration, README mit reproduzierbaren Befehlen/Voraussetzungen, getrennte Typechecks, echte Web-/Hermes-Exportartefakte. | Konfiguration/Export vorhanden; native Laufzeit und Safari/iOS-Web nicht abgenommen. |

Die Domain hängt nicht von React/Expo ab. Library ist der eine bestätigte Mutationseigentümer; Playback besitzt Audiolebenszyklus, BoardSession Auswahl/Modus, UI besitzt nur Entwürfe und Darstellung. Die Adaptergrenzen schützen tatsächliche Unterschiede in Speicher, Datei und Audio. Kein unnötiger Backend-/Router-/Container-/Stateframework-Aufbau. Die zusätzlichen `native-state`, `state-record` und `native-playback`-Helfer machen echte Produktionslogik prüfbar und entsprechen der Planabsicht.

Tests prüfen Verhalten und Fehlerfälle statt bloßer privater Aufrufreihenfolgen. Fakes werden klar von realem IDB/SQL/Audio getrennt. Die dokumentierten Red–Green-Phasen enthalten konkrete fachliche Erwartungsabweichungen; Harness-/Toolingfehler sind korrekt separat eingeordnet. Historische Red-Läufe konnte dieser frische Reviewer nicht zeitlich selbst beobachten; sie sind Implementierungsprotokoll, keine von mir nachträglich erfundene Ausführung. Aktuelle Green-Assertions und Codepfade wurden tatsächlich geprüft und relevant erneut ausgeführt.

Visuell selbst gelesen: `board-desktop-1024.png`, `board-mobile-390.png`, `trim-editor-chrome.png` und eigener Konfliktdialog-Screenshot. Minimalistischer Stil, klare Hierarchie, lesbare Hauptaktionen und erreichbarer Reload sind erkennbar. Die oberen PNGs zeigen jeweils nur den sichtbaren Scrollbereich; die 12-Pad-Aussage stützt sich zusätzlich auf DOM-/Box-/Scrollassertions und JSON, nicht auf ein angeblich vollständiges Bild.

## Prüfungen und Reichweite

Alle eigenen Node-Befehle mit `PATH=/Users/marv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`.

| Check | Ergebnis / Herkunft |
| --- | --- |
| Manifestbytes/-hashes und Manifestdigest unabhängig nachgerechnet | Exit 0, 63/63 identisch, `review-version-evidence.json`. |
| `npm test` | Eigene Ausführung Exit 0, **76/76**, keine Skips; `review-node-tests.txt`. |
| `npm run typecheck` | Eigene Ausführung Exit 0, beide Konfigurationen; `review-typecheck.txt`. |
| `SOUNDBOARD_URL=http://localhost:8082 node workflow-artifacts/2026-10-20-soundboard-mvp/review-browser/concurrency-smoke.mjs` | Eigene genehmigte Wiederholung Exit 0, Chrome155.0.8059.85, nur temporärer eigener Kontext. Initiales SIGABRT/EPERM bleibt im ersten Log sichtbar. |
| Unabhängiger rekursiver Map-/Quelltext-/Bundlehashvergleich per Node | Exit 0; 233/707 Quellen, alle eigenen eingebetteten Sources stimmen; `review-bundle-evidence.json`. |
| Fünf finale Produktionsbrowserflows | Entwickler-Exit0 aus letztem Implementierungsabschnitt; sämtliche Harnesses tatsächlich gelesen, JSON und ausgewählte PNGs selbst geprüft. Nur Konkurrenz zusätzlich selbst erneut ausgeführt. |
| Web-/iOS-Export und Expo-Dependencycheck | Dokumentierte Entwickler-Exit0. Exporte materiell vorhanden und gegen aktuelle Sources verifiziert. Kein unnötiger erneuter Export durch Reviewer; kein nativer Build daraus abgeleitet. |

Audioevidenz aus geprüftem finalen Browserbericht: WAV-Vorschau 1.1–1.7 s, RMS etwa 0.12966, ca. 877.48 Hz aus dem synthetischen 880-Hz-Teil, echtes Ende nach 0.5979138322 Audiosekunden; MP3-RMS etwa 0.12320. Der Harness hängt einen echten Analyser an die Source und beobachtet tatsächliche Endereignisse. Das ist technische Engine-Evidenz, kein Hörbeleg.

## Auditbewertung

Die im Hostbericht dokumentierten **22 Meldungen (15 high, 7 moderate) aus drei Advisory-Wurzeln bleiben offen im installierten Werkzeugbaum**. Ich habe die Anzahl nicht durch einen erneuten Online-Auditlauf neu erhoben und behaupte keine Reparatur.

Die konkrete Reichweite wurde unabhängig geprüft: `metro-file-map/src/watchers/common.js` verwendet micromatch für Watcher-Globs; `xcode/lib/pbxProject.js:90` nutzt `uuid.v4()`; `@expo/code-signing-certificates/build/main.js` importiert Forge für Zertifikat-/Signaturwerkzeuge. Das aktuelle Produkt verarbeitet lokale Audiodaten, keine externen Globmuster oder Update-Signaturketten. Tatsächliche finale Web-/Hermes-Sourcemaps enthalten **keine** Quellen aus `braces`, `node-forge`, `uuid`, `xcode`, `@expo/code-signing-certificates`.

**Der Metro-Runtimelader `@expo/cli/build/metro-require/require.js` ist in beiden Bundles enthalten.** Sein tatsächlicher Sourcecontent enthält keine dieser betroffenen Abhängigkeiten. Daher wäre „Expo CLI fehlt vollständig im Bundle“ falsch.

Bewertung: Für dieses lokale MVP ist aus diesen drei konkret abgegrenzten Advisorypfaden kein neuer blockierender App-Laufzeitbefund nachgewiesen. Das ist eine Reichweitenbewertung, keine Nutzerakzeptanz einer Schwachstelle und keine pauschale Sicherheitsfreigabe. Werkzeugrisiken bleiben bei künftigem Arbeiten mit fremden Buildkonfigurationen/Signaturmaterial relevant; vertrauenswürdiger lokaler Buildkontext ist die dokumentierte Einsatzannahme. Keine fachliche Rechtfertigung für ein ungeprüftes Force-Downgrade der abgestimmten Expo-Matrix.

## Nicht erfüllte Pflichtchecks – weiterhin Abnahmeblocker

Diese Prüfungen sind **separat von behobenen Codebefunden** offen; eine ausdrückliche Nutzerakzeptanz liegt nicht vor.

| ID | Offener Check / konkrete Grenze | Owner / nächster Nachweis |
| --- | --- | --- |
| CHECK-001 | Native iPhone-/iPad-Ausführung inklusive MP3/PCM-WAV-Dateiauswahl, Dokumentkopie/SQLite nach vollständigem Neustart, Trim-/Button-/Layoutfluss, Audioende, Stop/Restart, Hintergrundwechsel und Unterbrechung. Kein verfügbarer Simulator wegen Xcode-Lizenz, kein Gerät. Host hat aktuell erneut `/usr/bin/xcrun simctl list devices available --json` mit Exit69/Lizenzmeldung geprüft. | Orchestrator/Plattform-QA in eingerichteter nativer Umgebung. Node-SQLite, Typprüfung und Hermesexport ersetzen dies nicht. |
| CHECK-002 | Safari/iOS-Web: echte Picker-/IndexedDB-/AudioContext-/Touch-/Reloadverträge nicht ausgeführt. Chrome155 und In-app-Browser unbekannter Engine sind kein Safari-Nachweis. | Orchestrator/Plattform-QA mit benannter Safari-/iOS-Laufzeit. |
| CHECK-003 | Menschliche Hörkontrolle des ausgewählten Abschnitts und seiner Endpunktgüte; Headless-Chrome ist stumm, native Timergrenze unter Last ungehört. | Plattform-QA mit tatsächlicher Audioausgabe; insbesondere native Überschreitungen ggf. an TDD/Architektur zurückgeben. |

**Abschlussentscheidung:** Codeprüfung fertig, F-001/F-002 verifiziert, keine neue Codeänderung angefordert. Gesamtstatus bleibt **blocked/incomplete** bis diese notwendigen Plattform-/Hörprüfungen nachgewiesen oder ihre konkreten Einschränkungen ausdrücklich vom Nutzer akzeptiert sind. Keine vorsorgliche Freigabefrage für normale Umsetzungsschritte erforderlich.
