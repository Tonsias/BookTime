# BookTime

Visuelle Buchplanung als GitHub Page: Lore, Orte, Personen, Story, Gefühle, Gespräche und die Timeline mit
ihren Änderungen. Kernidee: ein 2D-Netz (Personen, Orte, Beziehungen), das sich entlang der Zeit als
3. Dimension verändert oder gleich bleibt. Alles hängt über Referenzen zusammen, und man soll so leicht
wie möglich zwischen Orten, Personen, Zeit usw. wechseln können.

## Stack

- React 19, Vite, TypeScript
- UI: Mantine (`@mantine/core`, `@mantine/hooks`, `@mantine/spotlight`)
- 3D: three.js über `@react-three/fiber` und `@react-three/drei`
- Lint: oxlint
- Deployment: GitHub Actions (`.github/workflows/deploy.yml`) → https://tonsias.github.io/BookTime/
  (`base: '/BookTime/'` in `vite.config.ts`)

## Befehle

```sh
npm run dev      # Dev-Server
npm run build    # Typecheck + Produktions-Build
npm run lint     # oxlint
npm run check    # Lint + alle Qualitäts-Checks (siehe unten)
```

## Qualitäts-Checks – Pflicht vor jedem Push

**Vor jedem `git push` muss `npm run check` lokal fehlerfrei durchlaufen.** Schlägt ein Check fehl, wird
nicht gepusht: erst beheben (bzw. bei einer Entscheidung nachfragen), dann erneut prüfen. Dieselben
Checks laufen auf GitHub im Workflow `.github/workflows/quality.yml` (Push auf `main`, Pull Requests,
manuell).

| Check | Befehl | Regel |
|---|---|---|
| Dead Code | `npm run check:dead` (knip) | keine ungenutzten Dateien, Exporte, Typen oder Abhängigkeiten |
| Duplikate | `npm run check:dup` (jscpd, `.jscpd.json`) | höchstens 3 % duplizierter Code in `src/` |
| Doku | `npm run check:docs` (`scripts/check-docs.mjs`) | jeder Export hat JSDoc (100 %); alle Kommentare inkl. JSDoc höchstens 5 % der Zeilen |

Dokumentation bewusst minimal halten: JSDoc möglichst einzeilig und nur das Warum/Was, das der Name
nicht schon sagt; Inline-Kommentare nur, wo der Code allein nicht verständlich ist.

Grenzwerte oder Regeln dieser Checks werden nicht eigenmächtig geändert oder umgangen (z. B. durch
Ignore-Einträge) – das ist eine Entscheidung, die nachgefragt werden muss.

## Struktur

- `src/model.ts` – Datentypen (Entity, StoryEvent, Change) und Zustandsberechnung pro Ereignis
- `src/sampleBook.ts` – Beispieldaten
- `src/scene/` – 3D-Szene und Layout (Zeit = x-Achse, Netz = y/z-Ebene)
- `src/ui/` – Mantine-Oberfläche (Fokus-Panel, Suche)

## Entscheidungen: immer nachfragen

**Architektur- und UI-Entscheidungen triffst du nicht selbst.** Bevor du etwas umsetzt, das eine solche
Entscheidung enthält, legst du einen Vorschlag vor und wartest auf die Zustimmung.

Dazu gehören zum Beispiel:

- Architektur: Datenmodell, neue Typen oder Beziehungen, State-Management, Speicherung/Persistenz,
  Ordnerstruktur, neue Abhängigkeiten oder Libraries, Routing, Build/Deployment
- UI: Layout, neue Ansichten oder Panels, Interaktionen und Bedienkonzepte, Tastenkürzel, Farben,
  Darstellung in der 3D-Szene, Texte und Benennungen in der Oberfläche

Keine Rückfrage brauchen: Bugfixes, die das gewünschte Verhalten wiederherstellen, ohne es zu ändern,
Refactorings ohne sichtbare Auswirkung und Umsetzungen exakt nach einem bereits freigegebenen Vorschlag.
Im Zweifel nachfragen.

### Vorschläge visualisieren

Vorschläge werden nicht nur in Textform gemacht, sondern sichtbar:

- **Architektur / Datenmodell:** eine `.md`-Datei mit Mermaid-Diagrammen (`classDiagram` für Klassen und
  Typen, bei Bedarf `sequenceDiagram` oder `flowchart` für Abläufe)
- **UI / Interaktion:** ein eigenständiger HTML-Prototyp, der im Browser geöffnet werden kann und zeigt,
  wie es aussehen und sich anfühlen soll

Vorschläge liegen in `docs/proposals/` (z. B. `docs/proposals/2026-10-datenmodell.md`,
`docs/proposals/2026-10-editor.html`). Jeder Vorschlag nennt, was entschieden werden muss, deine
Empfehlung mit Begründung und die verworfenen Alternativen. Erst nach Freigabe wird umgesetzt.

## Sprache

Kommunikation, Kommentare und UI-Texte auf Deutsch, Code-Bezeichner auf Englisch.
