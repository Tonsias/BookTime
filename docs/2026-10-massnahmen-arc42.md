# Maßnahmen aus der arc42-Bewertung

Status: **akzeptiert (2026-10-25)**. Grundlage ist die arc42-Bewertung vom 2026-10-25 (Reifegrad 2 von 5).
Die Entscheidungen wurden einzeln per Rückfrage getroffen.

## Festlegungen

| # | Festlegung | Begründung |
|---|---|---|
| 1 | Ein leeres Repo wird beim Einrichten mit `booktime.json` **und einem ersten Zeitpunkt „Anfang“** angelegt. Bücher ohne Zeitpunkt zeigen statt der Szene einen Hinweis mit dem Knopf „Ersten Zeitpunkt anlegen“ | Ohne Zeitpunkt ist ein Buch nicht auswertbar, die Ansicht stürzte ab |
| 2 | Fehler zeigen **was schiefgeht und passende Sofort-Ausbesserungen**: neuere Formatversion → „Neue Version laden“, fehlerhafte Datei → „Datei auf GitHub öffnen“, kein Zeitpunkt → „Ersten Zeitpunkt anlegen“, sonst „Seite neu laden“. Eine Fehlergrenze fängt Unerwartetes ab | Keine weiße Seite mehr |
| 3 | CI: **Lint, Typecheck und Tests** als eigene Jobs in „Code-Qualität“, das **Deployment wartet** auf einen grünen Lauf auf `main` | `npm run check` und CI prüfen dasselbe, ungeprüfter Code geht nicht live |
| 4 | GitHub Actions auf **feste Commit-SHAs** | Eine veränderte Action-Version läuft nicht unbemerkt im Deployment |
| 5 | TypeScript mit **`strict` und `noUncheckedIndexedAccess`** | Fängt Fehler wie den Absturz bei leerem Buch beim Übersetzen |
| 6 | **Vitest** für Modell und Zeitlogik, Prüfungen, Dateiformat, Beispielbuch und GitHub-Abläufe gegen eine nachgebaute API; Teil von `npm run check` und CI, ohne Abdeckungsgrenze | Die Checks prüften bisher nur die Form des Codes |
| 7 | Die Verbote aus Festlegung 14 des Datenmodells (Zeit rückwärts, überlappende Phasen, Ort in sich selbst) sind **Ladefehler**, ebenso doppelte IDs auch in Phasen, Bildern und Hintergründen sowie **unbekannte Dateien in Buch-Ordnern und `images/`**. Übliche Repo-Dateien im Hauptordner bleiben erlaubt | Änderungen kommen heute von außen, Fehler sollen gemeldet statt still falsch angezeigt werden |
| 8 | Die erlaubten Widersprüche aus Festlegung 14 erscheinen als **Hinweise im Fokus-Panel** und als **Zähler mit Liste in der Werkzeugleiste** | Man sieht sie, ohne dass sie etwas sperren |
| 9 | Arbeitskopie: **dauerhafter Browser-Speicher** und **Neu laden/Entfernen nur ohne Verlust** (Dialog mit „Erst pushen“, „Verwerfen“, „Abbrechen“) | Nicht gepushte Arbeit geht nicht versehentlich verloren |
| 10 | GitHub-Seite prüft nur bei geänderter Arbeitskopie neu, das Modell hält **Indizes pro Buch** | Kein Neuberechnen bei jedem Tastendruck, schnelles Nachschlagen |
| 11 | Das Token bleibt **dauerhaft** im Speicher von `tonsias.github.io` | Alle Pages-Seiten unter dieser Adresse sind eigene Seiten des Nutzers. Technisch könnte jede von ihnen den Speicher lesen, das Risiko ist bewusst akzeptiert |

## Nicht umgesetzt

| Empfehlung | Stand |
|---|---|
| Mehrere offene Tabs gegeneinander abgleichen | nicht gewählt |
| Export nicht gepushter Änderungen als Datei | nicht gewählt |
| Eigener Origin (Organisation oder Domain) | abgelehnt, siehe Festlegung 11 |
| Szenen-Vorschlag (Gruppen und Events ohne Ort sichtbar, große Bücher) | nicht gewählt |
| Hinweise auf der GitHub-Seite | nicht gewählt |
| Echte GitHub-Tests gegen `booktime-test` in der Testsuite | nicht gewählt |
| Abdeckungsgrenze für Tests | nicht gewählt |
