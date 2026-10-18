# BookTime

Visuelle Buchplanung: Personen, Gruppen, Orte, Beziehungen und Events als Netz, das sich entlang der Zeit
(3. Dimension) verändert.

**Live:** https://tonsias.github.io/BookTime/

## Bedienung

- **Raum** – der ganze Raum-Zeit-Würfel, frei drehbar
- **Netz** – Blick entlang der Zeitachse auf den aktuellen Zeitpunkt
- **Zeit** – Seitenansicht, jede Figur als Spur
- Zeitregler unten wechselt zwischen den Zeitpunkten der Geschichte
- Klick auf Person, Ort oder Event-Marker öffnet das Fokus-Panel mit Stand, Verlauf und Querverweisen
- `Strg+K` sucht nach Personen, Gruppen, Orten, Events und Zeitpunkten

In der Szene sind Orte Ringe an ihrer Position in der Welt, Personen Stränge durch die Zeit, Events
Marker am Ort und Beziehungen Linien in der Farbe ihrer Art. Die Dicke einer Linie zeigt die Stärke, ein
Pfeil die Richtung.

## Datenmodell

Alles gilt zu einem Zeitpunkt oder in einer Zeitspanne: Personen, Gruppen und Orte existieren zeitlich
begrenzt, Fakten wie Aufenthalt, Reise, Teilnahme, Mitgliedschaft und Beziehung (mit Phasen) verbinden sie.
Orte können in Orten liegen und ihre Position über die Zeit ändern. Details und Begründungen:
[docs/2026-10-datenmodell.md](docs/2026-10-datenmodell.md).

## Entwicklung

Stack: React, Vite, TypeScript, [Mantine](https://mantine.dev), [React Three Fiber](https://r3f.docs.pmnd.rs).

```sh
npm install
npm run dev      # Dev-Server
npm run build    # Typecheck + Produktions-Build nach dist/
npm run check    # Lint, Dead Code, Duplikate, Doku – muss vor jedem Push fehlerfrei laufen
```

Bekannte, bewusst akzeptierte Konsolenmeldung: `THREE.Clock: This module has been deprecated` kommt aus
`@react-three/fiber` und verschwindet, sobald fiber auf `THREE.Timer` umstellt.

Deployment auf GitHub Pages läuft automatisch per GitHub Actions bei jedem Push auf `main`, die
Qualitäts-Checks laufen zusätzlich bei Pull Requests.
