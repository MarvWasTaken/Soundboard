# Abhängigkeitsprüfung durch Host

Stand 20.10.2026, während Slice 2. Keine Paket- oder Codeänderungen vorgenommen. Vorläufige Einordnung; endgültige Bundle-Reichweite in Slice 4 und unabhängigem Review prüfen.

`PATH=/Users/marv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm audit --json --fetch-retries=0 --fetch-timeout=10000` scheiterte zuerst an Sandbox-DNS (Exit 1); freigegebene Wiederholung lieferte Exit 0 und einen Bericht mit **22 Meldungen: 15 high, 7 moderate, 0 critical**. Diese Zahl enthält transitive Metameldungen, nicht 22 verschiedene Schwachstellen. Drei konkrete Advisories sind die Wurzeln.

| Wurzel | Installiert / Pfad | Konkrete Reichweite und vorläufige Einordnung |
| --- | --- | --- |
| [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 → micromatch 4.0.8 → metro-file-map 0.87.1 → Metro/Expo CLI | Verschachtelte Glob-Muster können den Node-Prozess durch Stacküberlauf beenden. Advisory nennt keine gepatchte Version. Aufgerufene Muster in `metro-file-map/src/watchers/common.js:25`/`:27` stammen aus Datei-Watcher-/Buildkonfiguration; App importiert keine Glob-Muster von Nutzern. Entwicklungs-/Buildpfad, kein nachgewiesener Audiolaufzeitpfad. |
| [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | node-forge 1.4.0 → @expo/code-signing-certificates und @expo/cli | Fehlerhafte RSA-PKCS#1-v1.5-Signaturprüfung. Advisory nennt keine gepatchte Version. Lokale Quellen `@expo/code-signing-certificates/build/main.js` verwenden Forge für Zertifikate/Signaturen. Das MVP enthält weder Update-Signaturprüfung noch Konten/Cloud. Entwicklungs-/Signaturwerkzeug, bisher kein nachgewiesener App-Audiopfad. |
| [uuid GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | uuid 7.0.3 → xcode 3.0.1 → Expo Config Plugins | Fehlende Buffergrenzen in v3/v5/v6; gepatchte Releases u.a. 11.1.1. `xcode/lib/pbxProject.js:90` ruft `uuid.v4()` ohne externe Buffer auf, also nicht die betroffene API. App-IDs verwenden expo-crypto. Eine Major-Override wäre unnötig und könnte Tooling brechen. |

Versionsnachweis: paketweise `node_modules/<name>/package.json` mit Node gelesen. `npm explain braces node-forge uuid` wurde erfolgreich ausgeführt, erzeugt wegen Expo-Peerzyklen eine sehr umfangreiche Ausgabe; obige kompakte Pfade anhand der lokalen Dateien bestätigt. Offizielle GitHub-Advisory-Einträge wurden am selben Tag geöffnet; keine Behauptung eines erfolgreich behobenen Audits.

`npm audit` schlägt als pauschale Lösungen Expo 44.0.6 bzw. React Native 0.72.17 vor. Das wären große Rückstufungen der abgestimmten SDK-Matrix und keine geeigneten MVP-Korrekturen. Kein `npm audit fix --force` ausführen. Die Paketklassifizierung „prod“ umfasst auch mitgeliefertes Expo-CLI-Tooling und beweist keine Auslieferung in JS-Bundles.

## Ergebnis der anschließenden Produktionsprüfung

Der TDD-Abschluss nach F-002 dokumentiert erfolgreiche frische Web-/iOS-Exporte und `npm run inspect:bundles` (Exit 0). Der Host hat die erzeugte `bundle-audit-evidence.json` gelesen: 233 Web- und 707 iOS-Sourcemapquellen, jeweils erwartete Plattformadapter; keine Quellen aus `braces`, `node-forge`, `uuid`, `xcode` oder `@expo/code-signing-certificates`. Geprüfte Bundledateien: Web `index-cc1a9f4e523922f4b55583ccdcfb544f.js`, iOS `index-fbb1570070aca540068cd461eb8a605c.hbc`.

Eine wichtige Präzisierung: **Enthalten** ist in beiden Bundles `@expo/cli/build/metro-require/require.js`, der Metro-Runtimelader. Er enthält keine Verweise auf die genannten betroffenen Pakete. Die Aussage lautet daher ausdrücklich nicht, das gesamte Paket `@expo/cli` fehle im Laufzeitcode. Die Quellenprüfung grenzt die konkreten gemeldeten Advisorypfade ein; sie beweist keine allgemeine Fehler- oder Sicherheitsfreiheit.

Die 22 Meldungen im installierten Abhängigkeitsbaum bleiben bestehen und werden nicht als repariert ausgegeben. Verbleibende Entwicklungs-/Buildwerkzeugrisiken und die Materialität dieser Einordnung sind Teil der unabhängigen Review. Vertrauenswürdiger lokaler Buildkontext bleibt eine Einsatzannahme, kein genereller Sicherheitsfreibrief. Einzelheiten und reproduzierbare Evidenz: `bundle-audit-evidence.json` und letzter Slice-4-Abschnitt in `implementation.md`.
