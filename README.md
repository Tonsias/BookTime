# BookTime

Visuelle Buchplanung: Personen, Gruppen, Orte, Beziehungen und Events als Netz, das sich entlang der Zeit
(3. Dimension) verändert.

**Live:** https://tonsias.github.io/BookTime/

## Bedienung

- **Raum** – der ganze Raum-Zeit-Würfel, frei drehbar
- **Netz** – Blick entlang der Zeitachse auf den aktuellen Zeitpunkt
- **Zeit** – Seitenansicht, jede Figur als Spur
- Zeitregler unten wechselt zwischen den Zeitpunkten der Geschichte
- Klick auf Person, Ort oder Event-Marker öffnet das Panel; dort ist alles direkt bearbeitbar (Klick ins Feld,
  Enter übernimmt, Esc verwirft) und wird automatisch im Browser gespeichert
- In Raum und Netz: Person auf Ort ziehen = Aufenthalt, auf Person = Beziehung (gerichtet vom Gezogenen zum
  Ziel), auf Event = Teilnahme; Ort am Ring ziehen = neue Lage; Doppelklick ins Leere = neuer Ort
- „Ab hier / Ganze Phase“ in der Zeitleiste legt fest, ob zeitliche Werte ab dem aktuellen Zeitpunkt gelten
- `N` legt Neues an, `Strg+K` sucht und legt Unbekanntes an, `Strg+Z` / `Strg+Y` nimmt zurück, `Entf` löscht
- „Hinweise auflösen“ zeigt Widersprüche mit Lösungen, auch zum Markieren als gewollt
- Das Beispielbuch lässt sich ohne GitHub bearbeiten; im Buch-Panel setzt „Zurücksetzen“ es zurück

In der Szene sind Orte Ringe an ihrer Position in der Welt, Personen Stränge durch die Zeit, Events
Marker am Ort und Beziehungen Linien in der Farbe ihrer Art. Die Dicke einer Linie zeigt die Stärke, ein
Pfeil die Richtung.

## Datenmodell

Alles gilt zu einem Zeitpunkt oder in einer Zeitspanne: Personen, Gruppen und Orte existieren zeitlich
begrenzt, Fakten wie Aufenthalt, Reise, Teilnahme, Mitgliedschaft und Beziehung (mit Phasen) verbinden sie.
Orte können in Orten liegen und ihre Position über die Zeit ändern. Details und Begründungen:
[docs/2026-10-datenmodell.md](docs/2026-10-datenmodell.md).

## Bücher in GitHub

Ein Buch ist ein Ordner aus JSON- und Markdown-Dateien in einem privaten GitHub-Repo, eine Datei pro
Element und Fakt. Das Format zeigt das Beispielbuch in [`beispiel/`](beispiel/). Auf der Seite
**GitHub** (`github.html`) trägt man ein fine-grained Token ein (nur die Buch-Repos, Contents und Pull
requests mit Lesen und Schreiben), fügt Bücher per `owner/repo` hinzu und lädt sie. Die Arbeitskopie liegt
im Browser. Von dort gehen Commits auf einen eigenen Arbeitsbranch und per Pull Request nach `main`.
Details: [docs/2026-10-speicherung-github.md](docs/2026-10-speicherung-github.md).

## Entwicklung

Stack: React, Vite, TypeScript, [Mantine](https://mantine.dev), [React Three Fiber](https://r3f.docs.pmnd.rs).

```sh
npm install
npm run dev      # Dev-Server
npm run build    # Typecheck + Produktions-Build nach dist/
npm test         # Tests (Vitest)
npm run check:e2e  # Ende-zu-Ende-Tests (Playwright); einmalig: npx playwright install chromium
npm run check    # Lint, Typen, Tests, Dead Code, Duplikate, Doku, Beispielbuch, Ende zu Ende – vor jedem Push
```

Bekannte, bewusst akzeptierte Konsolenmeldung: `THREE.Clock: This module has been deprecated` kommt aus
`@react-three/fiber` und verschwindet, sobald fiber auf `THREE.Timer` umstellt.

Die Qualitäts-Checks laufen per GitHub Actions bei jedem Push auf `main` und bei Pull Requests. Erst wenn
sie auf `main` grün sind, wird auf GitHub Pages deployt.
