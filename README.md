# BookTime

Visuelle Buchplanung: Personen, Orte, Beziehungen und Ereignisse als Netz, das sich entlang der Zeit (3. Dimension) verändert.

- **Raum** – der ganze Raum-Zeit-Würfel, frei drehbar
- **Netz** – Blick entlang der Zeitachse auf den aktuellen Zeitpunkt
- **Zeit** – Seitenansicht, jede Figur als Spur
- Klick auf Figur/Ort/Ereignis öffnet das Fokus-Panel mit Querverweisen, `Strg+K` sucht

Stack: React, Vite, TypeScript, [Mantine](https://mantine.dev), [React Three Fiber](https://r3f.docs.pmnd.rs).

```sh
npm install
npm run dev      # Dev-Server
npm run build    # Produktions-Build nach dist/
```

Deployment auf GitHub Pages läuft automatisch per GitHub Actions bei jedem Push auf `main`.
