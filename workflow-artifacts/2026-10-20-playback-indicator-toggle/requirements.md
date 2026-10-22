# Anforderungen: Wiedergabeindikator und Soundbutton-Stopp

Status: **ready**. Sprache/Bedienung: Deutsch. Basis: `request.md` dieses Runs; keine zusätzlichen Nutzerantworten. Keine implementierungsabhängige Nutzerentscheidung offen. Alle unten genannten Ausführungsprüfungen sind in dieser Anforderungsphase **nicht ausgeführt**.

## Ziel, Akteure und Umfang

Nutzer wollen beim Probehören im Dialog **Ausschnitt bearbeiten** die aktuelle Position erkennen, um Start und Ende leichter festzulegen. Im Abspielmodus soll ein zweiter Druck auf denselben laufenden Soundbutton dessen Wiedergabe abbrechen.

In Scope: laufender visueller Positionsindikator samt verständlicher Zeitangabe im Ausschnittdialog; Positionsermittlung über vorhandene Web-/Native-Audioadapter; Toggle eines konkreten Boardbuttons während Laden und Spielen; zugehörige Zustands-, Fehler-, Nebenläufigkeits- und UI-Prüfung; Aktualisierung widersprüchlicher Bedienhinweise.

Außerhalb: Wellenform, Scrubbing/Seek-Geste, Ziehgriffe, Pause/Fortsetzen, Mehrspurwiedergabe, neues Datenformat, Audiobearbeitung/Export, Importformate, Deployment, umfassende Plattform-Neuabnahme und Behebung älterer Auditbefunde.

## Tatsächlicher Ausgangszustand und Grenzen

- Expo SDK 58, React 19, React Native 0.88 und TypeScript; `.web.ts`/`.native.ts` trennen Plattform-I/O (`package.json`, `tsconfig.json`, `tsconfig.web.json`). Kein `AGENTS.md` in Projektdateiliste oder geprüfter Elternkette; `request.md` bestätigt ebenfalls keine anwendbaren Anweisungen. Keine `.github`-CI-Konfiguration vorhanden.
- `App.tsx` erzeugt eine gemeinsame `Playback`-Instanz für Bibliothek, Board und Ausschnittvorschau und übergibt deren Zustand an `SoundEditor`. Bibliothek und Vorschau rufen `Playback.play` ausdrücklich auf. Öffnen des Ausschnittdialogs stoppt vorherige Wiedergabe.
- `src/ui/SoundEditor.tsx` / `SoundEditor`: Gesamtdauer-Leiste markiert nur die Draft-Auswahl; Status ist Text, keine aktuelle Zeit. Änderung der Schnittfelder, Reset, Speichern und Schließen stoppen bereits. Vorschau verwendet den ungespeicherten validierten Draft; Originaldatei bleibt erhalten.
- `src/services/playback.ts` / `Playback.play`: jeder Aufruf stoppt vorherige Wiedergabe, lädt neu und veröffentlicht `loading`/`playing`. `generation` plus `AbortController` verhindern veraltete Starts/Ereignisse. `stop` beendet Laden und Handle. Ende/Unterbrechung/Fehler bereinigen die Session. `PlaybackState` enthält bisher keine Position und keine Button-Herkunft.
- `src/platform/contracts.ts`: `PlaybackHandle` bietet nur `stop`, `PlaybackEvent` nur Ende/Unterbrechung/Fehler. Eine minimale Erweiterung der internen Schnittstelle ist zulässig; bestehende Aufrufer müssen kompatibel angepasst werden.
- `src/platform/audio.web.ts` / `LocalAudio.begin`: WebAudio startet mit Datei-Offset und Dauer; Engine begrenzt Ende. Kontextunterbrechung bereinigt Quelle. `src/platform/native-playback.ts` / `beginNativePlayback` wartet auf Laden, Seek und echten Playing-Status; native `currentTime` ist verfügbar. `audio.native.ts` konfiguriert Statusmeldungen alle 50 ms. Buffering löscht den Endtimer; JS-Timer und Status begrenzen den Ausschnitt, ohne samplegenaue Garantie.
- `src/services/board-session.ts` / `BoardSession.activate`: Editmodus liefert Button zur Bearbeitung, Playmodus ruft derzeit immer `play(sound)` auf. Board-/Moduswechsel stoppen. `BoardScreen` routet Touch/Maus/Tastatur über `onActivate`.
- `tests/playback.test.ts`, `tests/board-session.test.ts`, `tests/web-audio.test.ts`, `tests/native-playback.test.ts` enthalten bestehende Lifecycle-/Race-/Adapterprüfungen. Der aktuelle explizite `Playback.play`-Neustarttest und der Bibliotheks-Neustart in `scripts/playback-smoke.mjs` bleiben fachlich gültig. `scripts/board-smoke.mjs` prüft unterschiedliche Buttons desselben Sounds; deren Startverhalten bleibt erhalten.
- README beschreibt derzeit für Boardbuttons „Erneute Aktivierung startet neu“; das muss der Änderung entsprechend korrigiert werden. README dokumentiert bereits fehlende reale iPhone-/iPad- und Safari/iOS-Abnahme sowie Xcode-Lizenz-/Gerätegrenzen. Diese Alt-Abnahmen werden keine neuen Abschlussblocker dieses inkrementellen Runs.

## Anforderungen und prüfbare Abnahme

### REQ-POS-01 — P0: erkennbare aktuelle Dateiposition

- **AC-POS-01a:** Bei gültigem Draft, z. B. 1,0–2,5 s einer 3-s-Datei, beginnt die Vorschau an 1,0 s. Der Dialog zeigt einen von der Auswahl unterscheidbaren Positionsmarker auf der Gesamtdauer-Leiste sowie eine als aktuelle Wiedergabeposition erkennbare Sekundenangabe. Markerposition entspricht `Position / Gesamtdauer`; Zeit zählt ab Datei-Start, nicht ab 0 des Ausschnitts.
- **AC-POS-01b:** Während tatsächlicher Wiedergabe bewegen sich Marker und Zeit vorwärts innerhalb des gestarteten Ausschnitts. Bei einem ausreichend langen Testausschnitt lassen sich mindestens zwei unterschiedliche Positionen während derselben Wiedergabe beobachten; eine statische Animation nur zwischen Start/Ende erfüllt dies nicht.
- **AC-POS-01c:** Die Position folgt der Audioengine-Zeit bzw. nativen Playback-Statuszeit. Laden/Decodieren/Seek vor dem Start darf keine bereits fortschreitende Wiedergabe vortäuschen. Native Buffering-Statusmeldungen führen zu keinem frei weiterlaufenden Wandzeit-Fortschritt.
- **AC-POS-01d:** Angezeigte Positionen sind endlich und liegen im gestarteten Bereich beziehungsweise in `0…Dateidauer`; Rundung darf keinen NaN-/Infinity-Wert oder Marker außerhalb der Leiste erzeugen. Kurze Ausschnitte dürfen enden, bevor eine zweite sichtbare Aktualisierung möglich ist.

### REQ-POS-02 — P0: korrekter Positions-Lifecycle

- **AC-POS-02a:** Stopp, natürliches Ende, Unterbrechung und Fehler beenden Positionsaktualisierungen. Der Dialog zeigt anschließend keinen als laufend dargestellten Marker. Technischer Default: aktive Position ausblenden/zurücksetzen; ein dauerhaftes Festhalten des Endpunkts ist nicht erforderlich.
- **AC-POS-02b:** Änderung der Schnittfelder, Reset, Speichern, Abbrechen/Schließen und Reload stoppen wie bisher und entfernen die aktive Positionsanzeige. Eine neue Vorschau beginnt am aktuellen gültigen Draft-Start. Ein ungültiger Draft verhindert Start und zeigt weiterhin die vorhandene Validierung.
- **AC-POS-02c:** Späte Positions-/End-/Fehlermeldungen einer gestoppten oder ersetzten Session verändern weder Position noch Zustand einer neueren Session. Der Editor zeigt ausschließlich Positionen seines aktuell angehörten Sounds.
- **AC-POS-02d:** Wiederholte Start-/Stopp-/Schließen-Zyklen hinterlassen keine aktiven Positionsintervalle oder Adapter-Subscriptions; nach Stop eintreffende Callbacks sind wirkungslos. Bereits vorhandene Handle-/Audioquellen-Bereinigung bleibt gewährleistet.

### REQ-TOGGLE-01 — P0: zweiter Druck stoppt denselben Boardbutton

- **AC-TOGGLE-01a:** Im Playmodus startet ein inaktiver verfügbarer Boardbutton seinen aktuell gespeicherten Ausschnitt. Erneute Aktivierung desselben Buttons während `playing` stoppt die Quelle, wechselt in inaktiv und erzeugt keinen Neustart. Eine dritte Aktivierung startet wieder am gespeicherten Anfang.
- **AC-TOGGLE-01b:** Zweite Aktivierung während `loading` bricht den ausstehenden Start ab. Später abgeschlossene Datei-/Decoder-/Seek-Operationen dürfen keinen Sound starten und keine aktive Session wiederherstellen.
- **AC-TOGGLE-01c:** Toggle-Identität ist der konkrete Button seines Boards. Aktivierung eines anderen Buttons ersetzt die bisherige Wiedergabe und startet dessen Ausschnitt, auch wenn beide denselben Bibliothekssound referenzieren. Ein bloßer Vergleich von `soundId` genügt nicht.
- **AC-TOGGLE-01d:** Nach natürlichem Ende, explizitem globalem Stopp, Fehler oder Unterbrechung startet derselbe Button beim nächsten Druck wieder regulär; kein veraltetes Toggle-Merkmal verschluckt den Druck. Wenn zwischenzeitlich Bibliothek/Vorschau die Wiedergabe ersetzt hat, startet der Boardbutton regulär und wird nicht irrtümlich als sein eigener laufender Sound behandelt.
- **AC-TOGGLE-01e:** Schnelle Folgen A–A, A–B und A–A–A während asynchronem Laden ergeben jeweils gestoppt, nur B beziehungsweise nur den letzten A-Start. Veraltete Handles werden gestoppt; ihre Events können den letzten Zustand nicht überschreiben. Es gibt weiterhin höchstens eine aktive Audioquelle.

### REQ-COMPAT-01 — P0: bestehende Verträge und Fehlerbehandlung erhalten

- **AC-COMPAT-01a:** Editmodus öffnet weiter die Buttonbearbeitung ohne Ton. Board-/Moduswechsel und globale Stopptaste beenden auch ausstehendes Laden; vorhandene Unterbrechungsbehandlung bleibt erhalten.
- **AC-COMPAT-01b:** Explizite Bibliotheks-/Vorschaustarts behalten ihre Neustartsemantik. Vorschau spielt den Draft, speichert ihn nicht automatisch und verändert keine Audiodatei. Persistierte Version 1 und gemeinsam genutzte Sound-Zuschnitte bleiben unverändert.
- **AC-COMPAT-01c:** Fehlende Dateien, gesperrte Audioausgabe, ungültige Bereiche und Decoder-/Startfehler bleiben sichtbar. Kein Fehler hinterlässt laufenden Fortschritt oder verhindert einen späteren gültigen Start. Unverfügbare Sounds bleiben im Playmodus gesperrt.
- **AC-COMPAT-01d:** Web-Gesture-Unlock wird weiterhin synchron aus dem bewussten Start ausgelöst; Positionsanzeige startet kein Audio selbstständig. Web-Endbegrenzung bleibt in der Engine; native bestehende End-/Buffering-/Cleanup-Verträge bleiben erhalten.

### REQ-UX-01 — P1: verständliche und zugängliche Rückmeldung

- **AC-UX-01a:** Neue Positionsanzeige bleibt auf Desktop und schmaler 390px-Ansicht lesbar, ohne die Schnittfelder oder Bedienelemente zu verdecken. Sekundenangabe ergänzt den visuellen Marker; Aktualisierungen lösen keine hochfrequenten Screenreader-Liveansagen aus.
- **AC-UX-01b:** Maus, Touch und vorhandene Tastaturaktivierung lösen denselben Toggle aus. Bedienhinweise/README widersprechen dem neuen Boardbutton-Stopp nicht. Neue Board-Animationen oder ausgewählte Button-Stile sind keine Pflicht.

## Verifikation und Projektbefehle

Aus `package.json`/README, hier jeweils **nicht ausgeführt**:

- `npm test`: Node `--experimental-strip-types --test tests/*.test.ts`; relevante bestehende und ergänzte Service-/Adaptertests. Vor Produktionsänderung beobachtbare Red-Evidenz für neuen Toggle und Positionsweitergabe, danach Green/Refactor gemäß `quality.md`.
- `npm run typecheck`: native und Web-TypeScript-Auflösung; erforderlich für interne Schnittstellenänderungen.
- `npm run build:web`: tatsächlicher Webexport; `npm run export:ios`: JS-/Hermes-Bündelung, kein Nachweis nativer Ausführung. Beide sind sinnvolle Prüfungen der gemeinsam geänderten Typ-/Adapterpfade.
- `npm run preview:web`: lokaler Produktionsserver Port 8082. `SOUNDBOARD_URL=http://localhost:8082 npm run test:browser` oder gezielter Chrome-Check mit Playwright. Bestehender Runner erwartet separat gestarteten Server und installiertes Chrome; Skripte schreiben überwiegend in den alten MVP-Run. Neue gezielte Evidenz gehört in diesen Run.
- `npm run inspect:bundles` und `npx expo install --check` existieren; ohne Abhängigkeits-/Auflösungsänderung keine erneute umfassende Audit-Abnahme gefordert.

Erforderliche sinnvolle Evidenz für diesen Run: Service-/Adaptertests für Position/Lifecycle/Races und Toggle inklusive identischem Sound in zwei Buttons; beide Typechecks; tatsächlicher Browsernachweis für fortschreitenden Marker/Text mit Nichtnull-Start, Stop/Ende und Board-Toggle ohne zweite Quelle, einschließlich schmaler Ansicht und Tastatur/Touch soweit lokal verfügbar. Ein WebAudio-Clock-Vergleich im Browser darf eine begründete Scheduler-Toleranz verwenden; diese Anforderung behauptet keine samplegenaue UI. Mocks allein belegen nicht die sichtbare UI. Native Vertragsprüfungen müssen Native-Statusposition/Buffering/Stop berücksichtigen. Reale iPhone-/iPad-/Safari-Tests sind bei Verfügbarkeit nützlich; fehlende Umgebung wird als verbleibende Plattformgrenze dokumentiert und nicht als durchgeführt dargestellt. Keine menschliche Hörkontrolle oder universelle Plattformfreigabe aus einem stummen Chrome-Lauf ableiten.

## Annahmen und offene Entscheidungen

Reversible Defaults: „Button“ meint Board-Soundbutton; Toggle gilt konkreter Board-/Button-ID, nicht jeder Stelle, die denselben Sound abspielt. Bibliothek und Vorschau starten ausdrücklich neu. Absolute Dateizeit passt zu vorhandenen Start-/Endfeldern und der bestehenden Gesamtdauer-Leiste. Kein Seek oder automatisches Übernehmen der aktuellen Zeit verlangt. Aktive Position wird nach Wiedergabeende/Stop entfernt. Genaues Markerdesign, Anzeigepräzision und Updateintervall bleiben kleine Implementierungsentscheidungen, solange die AC erfüllt werden.

Notwendige Nutzerentscheidungen: **keine**. Bei späterer Scope-Antwort zur Toggle-Identität wären REQ-TOGGLE-01/REQ-COMPAT-01 und entsprechende UI-/Serviceprüfungen betroffen.
