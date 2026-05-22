# marcaureladj/ada — Skill

Skill installable pour Claude Code, Cursor, Codex et Gemini CLI. Apprend à l'agent à invoquer la CLI `ada` pour générer des vidéos de documentation.

## Installation

```bash
npx skills add marcaureladj/ada
```

L'agent charge alors [`SKILL.md`](./SKILL.md) qui décrit :

- Les **triggers** (quand activer la skill).
- Les **commandes** à exécuter (`ada run`, `ada plan`, `ada compose`, `ada init`).
- Les **codes de sortie** et le format `--output-format json`.
- Les **variables d'environnement** requises (`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, …).

## Prérequis côté machine

L'agent doit avoir accès à la commande `ada` dans son `PATH`. Soit via :

- `npm install -g ada`
- ou un lancement local : `npx ada …` depuis un repo contenant `ada` dans ses deps.

## Manifeste

Voir [`manifest.json`](./manifest.json) pour le contrat formel (entrypoint, triggers, tags).
