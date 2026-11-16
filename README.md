# Rescue Atlas, l'avancement

Une page pour suivre où en est [Rescue Atlas](https://github.com/dataforgoodfr/mediterranean-rescue) sans lire GitHub : l'objectif du moment, les jalons, le sprint, les grands chantiers, ce qui a bougé dans la semaine, et une carte 3D de toutes les tâches.

En ligne : https://guillaume-flambard.github.io/rescue-atlas-avancement/

Les statuts sont les colonnes du [tableau de l'équipe](https://github.com/orgs/dataforgoodfr/projects/44). Une tâche fermée compte comme faite, une tâche fermée comme « pas prévue » ne compte pas.

## Comment c'est fait

- **Astro** génère une page statique. Les chiffres sont calculés au build, dans `src/lib/model.ts`.
- **`scripts/snapshot.py`** lit le dépôt et le tableau avec `gh` et écrit `src/data/data.json`.
- **La carte 3D** est en Three.js (`src/scripts/scene.ts`), chargée seulement quand on arrive dessus. Sur téléphone, la liste s'affiche d'abord.
- **`.github/workflows/deploy.yml`** refait la photo toutes les heures et publie sur GitHub Pages. Le tableau d'une organisation ne se lit pas avec le `GITHUB_TOKEN` d'une Action ([doc GitHub](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions)) : il faut un secret `PROJECT_TOKEN`. Sans lui, le site publie le `data.json` du dépôt.

## Commandes

```bash
npm install
npm run snapshot   # nouvelle photo de GitHub (gh connecté)
npm run dev        # http://localhost:4321/rescue-atlas-avancement/
npm test           # Vitest
npm run build      # astro check, puis le site dans dist/
```

Lien direct vers la fiche d'une tâche : `#tache-5`.

Document de travail · bénévoles Data for Good · non validé par SOS MEDITERRANEE
