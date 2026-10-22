# Architektur und Umsetzungsplan

Status: **ready**. Grundlage: request.md, requirements.md, state.md, tatsächlicher Code und bestehende Tests. Keine fachliche Lücke oder notwendige Nutzerentscheidung gefunden. Eigentum dieser Phase: nur dieses Dokument. Keine Produktionsänderung, keine Testausführung in dieser Phase. Keine AGENTS.md in Projektdateiliste oder geprüfter Elternkette gefunden.

## Kleinste tragfähige Lösung

Die vorhandene `Playback`-Instanz bleibt Eigentümerin genau einer Session. `BoardSession` löst Boardbutton und aktuellen Sound auf; Audioadapter liefern Engine-Zeit; `SoundEditor` stellt den Zustand dar. Keine Persistenzänderung, keine neue Bibliothek, kein allgemeines Event-/Animationsframework.

### Position: Handle-Abfrage statt zusätzlicher Fortschrittsereignisse

`PlaybackHandle` in `src/platform/contracts.ts` erhält die erforderliche Methode `getPositionSeconds(): number` zusätzlich zu `stop()`. Sie liefert absolute Dateisekunden, keine Ausschnittdauer. Alle echten Adapter und Testdoubles werden angepasst. `PlaybackEvent` bleibt für terminale Ereignisse reserviert. Das vermeidet einen zweiten Ereignis-Lifecycle und insbesondere Positionsereignisse vor Auflösung von `begin()`.

- Web (`LocalAudio.begin`): Beim tatsächlichen `source.start` den AudioContext-Zeitursprung erfassen. Rückgabe ist `range.start + (context.currentTime - origin)`, begrenzt auf den gestarteten Bereich. Quelle weiterhin mit Offset und Dauer in der Engine starten; kein JS-Timer für das Web-Audioende. Stop/Unterbrechung geben anschließend einen eingefrorenen letzten Wert zurück und bereinigen wie bisher. Kein `Date.now()` und keine Fortschrittsanimation als Zeitquelle.
- Native (`beginNativePlayback`): Eine lokale letzte gültige absolute Position aus `playbackStatusUpdate.currentTime` führen, initial `range.start`. Erst ab bestätigtem Start verwenden; Seeking-/Loading-Meldungen erzeugen keinen Fortschritt. Nur endliche Werte übernehmen und auf den Bereich begrenzen. Während Buffering den zuletzt bestätigten Wert halten; kein Wandzeit-Extrapolieren. Handle liest diesen Cache, auch nach Cleanup ohne Zugriff auf einen entfernten Player. Bestehenden Listener wiederverwenden. Endtimer, Starttimeout, Pause/Remove und Abort bleiben unabhängig davon erhalten. `audio.native.ts` behält sein 50-ms-Statusintervall.
- Service (`Playback`): `PlaybackState.positionSeconds?: number` nur in einer aktiven `playing`-Session veröffentlichen. Direkt nach erfolgreichem `begin` erste Position lesen; anschließend alle etwa 50–100 ms abfragen. Ein kleiner optional injizierter Scheduler mit `set(callback, milliseconds)`/`clear(token)` und Default auf `setTimeout` genügt für deterministische Tests. Service-eigener Typ; nicht von der Native-Implementierung importieren. Genau ein rekursiver Timeout pro Session, keine UI-eigene Uhr. Gleiche Position nicht erneut publizieren.
- Jede Abfrage prüft die vorhandene `generation` und die aktuelle Handle-Zugehörigkeit. Nach Subscriber-Benachrichtigung erneut prüfen, bevor ein Timeout angelegt wird: Ein Subscriber könnte synchron stoppen/ersetzen. `stop()` invalidiert zuerst die Generation, löscht den Timeout, abortiert Laden und stoppt das Handle. Terminale Adapterereignisse und Fehler nutzen denselben Pfad. Ein bereits in der Queue befindlicher alter Callback darf weder publizieren noch neu planen.
- Service prüft endliche Werte und begrenzt auf den validierten gestarteten Bereich; ungültiger Messwert behält die letzte gültige Position, initial den Start. Wenn die Handle-Abfrage unerwartet wirft, aktuellen Durchlauf sauber beenden und vorhandene verständliche Playback-Fehlerdarstellung nutzen, keine unbehandelte Timer-Exception. Kein aktiver Timer während Laden. Eine sehr kurze Session darf enden, bevor das Handle übernommen wird; vorhandener Generationstest stoppt dann das verspätete Handle und erzeugt keinen Positions-Timer.

Tradeoff: Ein kleiner zentraler Polling-Timer läuft auch für Board/Bibliothek. Das hält Adapter und UI einfach und bietet einheitliche Zustandsweitergabe. Keine selektive Subscription-/RAF-Infrastruktur für diese kleine App. 10–20 Aktualisierungen pro Sekunde reichen; bei Bedarf unveränderte Werte unterdrücken, keine spekulative globale State-Optimierung.

### Toggle: konkrete Herkunft in derselben Session

`Playback` erhält `toggleBoardButton(sound, { boardId, buttonId })`. Der öffentliche `play(sound, range?)` behält ausdrücklich seine Neustartsemantik. Beide delegieren an einen kleinen gemeinsamen privaten Startpfad; Gesture-Unlock bleibt synchron vor dem ersten Await.

Die aktive Boardherkunft wird in `Playback` gehalten (privates Feld reicht, kein UI-Vertrag erforderlich). Vergleich beider IDs als getrennte Felder, keine kollisionsanfällige String-Verkettung. Sie wird vor asynchronem Laden zugewiesen. Nur eine aktuelle `loading`-/`playing`-Session mit exakt gleicher Herkunft führt bei Toggle zu `stop()` und sofortiger Rückkehr. Sonst neuer Start mit gespeichertem Bereich. Jeder Stop/Ende/Fehler/Unterbrechung und jeder explizite Bibliotheks-/Vorschaustart entfernt/ersetzt die Herkunft. Kein zweites Merkmal in `BoardSession`, das nach externem Stop veralten könnte.

`BoardSession` benötigt statt `Pick<Playback, 'play' | 'stop'>` den Toggle-/Stop-Vertrag. `activate` übergibt die tatsächlich ausgewählte Board-ID und Button-ID nach bestehender Auflösung/Validierung; Editmodus bleibt unverändert. Gleiches Soundobjekt in zwei Buttons muss zwei verschiedene Starts ergeben. Bestehende Board-/Moduswechsel stoppen weiter. Version 1 und gespeicherte Zuschnitte bleiben unverändert.

### Darstellung

`SoundEditor` zeigt Position nur bei `status === 'playing'`, passender `soundId` und endlicher Position. Marker liegt als schmale kontrastierende Linie über der bestehenden Auswahl auf der Gesamtdauer-Leiste. Relative Position: absolute Sekunden / Dateidauer; Randdarstellung so wählen, dass die Linie auch an 0/100 % sichtbar bleibt. Text etwa „Wiedergabeposition: 1,234 s“ ergänzt den Marker. Keine Seek-Geste. Ein testID für Marker/Leiste/Positionstext ist als UI-Testseam vertretbar.

Der schnell wechselnde Zeittext erhält keine Live-Region; vorhandener Status-Livetext bleibt getrennt. Nach Stop/Ende verschwindet aktive Anzeige. Vorhandene Stop-Aufrufe beim Ändern, Reset, Save, Close und `App.load` bleiben wirksam; Preview-Aufruf bleibt `play(editingSound, range)`. `App.tsx` braucht voraussichtlich keine neue Orchestrierung, sondern lediglich die bereits vorhandene State-Weitergabe. README-Boardanleitung auf erneuten Druck zum Stoppen aktualisieren.

## Abhängige, überprüfbare TDD-Slices

Ausführung aus Repo-Root mit Node-Runtime im PATH:
`export PATH=/Users/marv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`.
Für jedes Slice erwarteten verhaltensbezogenen Red-Ausgang vor Produktionsänderung, Green und Refactor im Run protokollieren. Keine Import-/Typfehler als Red zählen.

### 1. Adapter liefern echte absolute Position

REQ-POS-01 (a–d), REQ-POS-02 (a,d), REQ-COMPAT-01 (c,d).

Dateien: contracts.ts, audio.web.ts, native-playback.ts, betroffene Handle-Doubles in Tests; audio.native.ts nur falls Typanpassung nötig.

Erster Red-Test: Web-FakeContext mit kontrollierbarem `currentTime`; Start bei Contextzeit 8 und Dateioffset 1, anschließend Contextzeit 8,25 → Handle liefert 1,25. Fehlende Methode über optionalen Laufzeitaufruf/Assertion als fehlenden beobachtbaren Wert ausdrücken, keinen TypeError als Beweis. Native analog: erster bestätigter Status 1,0, später 1,4 → 1,4; Buffering und verstrichener Fake-Clock-Takt verändern diesen Wert nicht.

Minimum: beschriebener Handle-Vertrag. Ergänzend Clamp/NaN/Infinity, keine Fortschrittsableitung aus Loading/Seek, eingefrorene Werte nach Stop und späte Statuscallbacks ohne Wirkung. Bestehende Offset-/Endbegrenzungs-/Cleanup-/Aborttests bleiben grün. Test-Harnesses weiterverwenden, keine zweite native Subscription einführen.

Abschluss: `node --experimental-strip-types --test tests/web-audio.test.ts tests/native-playback.test.ts`; `npm run typecheck` nach Anpassung aller Doubles. Refactor: Berechnungen lokal und sauber, keine Uhr im UI.

### 2. Service verwaltet Positions-Lifecycle

REQ-POS-01 (a–d), REQ-POS-02 (a,c,d), REQ-COMPAT-01 (c,d).

Dateien/Symbole: playback.ts / PlaybackState, Playback.play/start/stop; tests/playback.test.ts.

Erster Red-Test: Fake-Handle liefert 1,25; nach bestätigtem `play` und kontrolliertem Scheduler-Tick muss veröffentlichter Zustand diese absolute Position enthalten (vor Änderung fehlt sie). Weiterer Tick mit 1,6 ändert Zustand; während verzögertem Resolve/Begin keine Position/Timer.

Minimum: zentraler Scheduler und generational geschützte Abfragen. Tests für Stop, natürliches Ende, Unterbrechung und Fehler → Position entfernt, Timerzahl null; gespeicherte alte Timerfunktion nach Sessionwechsel wirkungslos. Wiederholte Start/Stop-Zyklen, delayed Handle und terminales Event vor Begin-Auflösung, ungültige/werfende Messung, synchroner Stop aus Subscriber. Tests prüfen Zustand und verbleibende Ressourcen, nicht private Methodenanordnung.

Abschluss: `node --experimental-strip-types --test tests/playback.test.ts`; `npm test`. Refactor: gemeinsamer Cleanup-Pfad, kein zweiter Lifecycle neben `generation`.

### 3. Boardbutton-Toggle einschließlich Rennen

REQ-TOGGLE-01 (a–e), REQ-COMPAT-01 (a–d).

Dateien/Symbole: Playback.toggleBoardButton/start; BoardSession.activate/Abhängigkeit; tests/playback.test.ts, tests/board-session.test.ts.

Erster Red-Test mit echtem Playback plus BoardSession und Fake-Audio: zwei Aktivierungen desselben Buttons nach gestartetem Audio ergeben idle, genau einen Begin und gestopptes erstes Handle. Vor Änderung erfolgt ein zweiter Begin. Dritte Aktivierung startet erneut am gespeicherten Anfang.

Minimum: Herkunft im Playback, Weiterleitung beider IDs in BoardSession. Integrationsfälle: zwei Buttons desselben Sounds starten separat; gleiche Button-ID auf anderen Boards ist andere Herkunft; globaler Stop/Ende/Fehler/Unterbrechung und explizites `play` lösen Herkunft ab. Bestehender expliziter Same-Sound-Restarttest bleibt unverändert fachlich gültig. Deferred Resolves/Handles für A–A, A–B, A–A–A während Loading; finale Zustände und Quellenzahl prüfen, veraltete Handles stoppen und deren Events ignorieren. Board-/Modewechsel, Editmodus, fehlender Sound und aktualisierter Shared-Trim weiter prüfen.

Abschluss: `node --experimental-strip-types --test tests/playback.test.ts tests/board-session.test.ts`; `npm test`; `npm run typecheck`. Refactor: ein Startpfad für explizites Play und Toggle, keine Herkunfts-Synchronisation zwischen zwei Klassen.

### 4. Sichtbarer Editor und Browser-Abnahme

REQ-POS-01 (a–d), REQ-POS-02 (a–d), REQ-UX-01 (a,b), REQ-TOGGLE-01 (a,c,d), REQ-COMPAT-01 (a–d).

Dateien: SoundEditor.tsx, README.md, neues fokussiertes `scripts/playback-indicator-smoke.mjs`, gegebenenfalls package.json/Browser-Runner für reproduzierbaren Aufruf. App.tsx nur bei konkret nötiger Integration. Keine React-Testbibliothek installieren: vorhandenes Playwright prüft echte DOM-/WebAudio-Integration.

Erster Red-Nachweis vor UI-Änderung: neuer fokussierter Browsercheck importiert Fixture, öffnet Editor, setzt Nichtnull-Draft und startet Preview; Assertion auf sichtbare aktuelle Position schlägt am fehlenden Element fehl. Kein Timeout durch fehlenden Server/Browser als Red. Danach Marker/Text implementieren und denselben Check bestehen lassen.

Browsercheck gegen tatsächlich exportierten Stand, frischer Browserkontext. Existierende WebAudio-Instrumentierung aus playback-smoke als Muster nutzen; originale Methoden aufrufen, Engine nicht ersetzen. Dokumentierte Ausgabe ausschließlich in diesen Run. Mindestens:

1. Ausreichend lange Fixture bzw. vorhandene WAV-Gesamtdauer verwenden; Draft z. B. 1,0–2,5 s sofern Datei lang genug. `source.start`-Offset/Dauer bestätigen. Während derselben Session zwei sichtbare verschiedene Sekundenwerte und Markerpositionen erfassen. Markeranteil zur Gesamtdauer und Engine `offset + currentTime - startClock` vergleichen, etwa 0,2 s Scheduler-Toleranz explizit dokumentieren. Keine Annahme, dass erster Screenshot exakt Startzeit trifft.
2. Screenshot bei aktiver Wiedergabe sowie JSON mit beobachteten Zeiten/Geometrie/Enginezeit. Stop und natürliches Ende entfernen Marker/Text; anschließend verspätet erneut prüfen, kein Wiederauftauchen. Änderungen/Reset/Abbrechen/Save/Reload stoppen; ungültiger Draft sperrt Start. Preview verändert gespeicherten Trim/Asset nicht (bestehenden Smoke ergänzend nutzen).
3. Zwei Boardbuttons mit demselben Sound: A startet, A stoppt ohne zweiten Source-Start, A startet erneut, B ersetzt. Maximale aktive Quellenzahl ≤ 1. Keyboard Enter/Space und Touch mit `hasTouch` laufen durch dieselbe Aktivierung; wenigstens erneuten Druck zum Stoppen tatsächlich über diese Eingaben prüfen. Globale Stop-/Mode-/Boardwechsel regressionsprüfen. Deterministische Loading-Races bleiben primär Servicetests.
4. 390 px breite Ansicht: Marker und Sekunden lesbar, Leiste/Felder/Buttons innerhalb Viewport, kein horizontaler Overflow, aktive Screenshot-Evidenz. Screenshot wirklich ansehen; reine Pixeldatei-Erzeugung ist keine visuelle Prüfung. Desktop ebenfalls prüfen. Keine hochfrequente Live-Region um Zeittext.

Abschluss: `npm test`; `npm run typecheck`; `npm run build:web`; `npm run export:ios`. Separat `npm run preview:web` starten, dann `SOUNDBOARD_URL=http://localhost:8082 node scripts/playback-indicator-smoke.mjs`. Relevante vorhandene `playback-smoke.mjs` und `board-smoke.mjs` gegen denselben Export ausführen; deren alten Ausgabeort beachten und neue Evidenz nicht als historische MVP-Evidenz ausgeben (Output-Pfad für diese Ausführung parametrisierbar machen, falls nötig). Nicht ohne Anlass sämtliche alten Plattform-/Audit-Abnahmen wiederholen.

## Abschluss und Risiken

Red/Green-Evidenz, Kommandos/Exitcodes, Browser-JSON und betrachtete Screenshots an Orchestrator/Reviewer übergeben. Alle ursprünglichen Anforderungen bleiben maßgeblich. Keine Tests wurden von der Architekturphase ausgeführt.

Keine Datenmigration oder Abhängigkeitsänderung. Interner Handle-Vertrag ist absichtlich erforderlich, damit TypeScript übersehene Adapter/Doubles findet. Native Statusprüfung und iOS-Export prüfen Vertrag und Bündelbarkeit; sie beweisen keine reale Geräteausführung. Bestehende iPhone/iPad-/Safari-/Xcode-Grenzen transparent behalten, keine neue Vollplattform-Abnahme verlangen. Native Endgrenze bleibt wie bisher timer-/statusbasiert, keine Samplegenauigkeit versprechen. Stummer Chrome beweist sichtbares Verhalten und Engineaktivität, keine menschliche Hörprüfung.
