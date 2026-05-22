# ADA — Autonomous Documentation Agent

[![CI](https://github.com/marcaureladj/ada/actions/workflows/ci.yml/badge.svg)](https://github.com/marcaureladj/ada/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-22+-green.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9-orange.svg)](https://pnpm.io)

> Génération automatique de documentation vidéo par IA agentique.
> Open source, Apache 2.0, basée sur HyperFrames.

ADA est un outil en ligne de commande qui produit une vidéo de documentation MP4 narrée à partir d'une simple URL et d'identifiants. Un agent IA pilote un navigateur, explore l'application comme le ferait un product manager, génère un script narratif, synthétise la voix off et assemble le tout via HyperFrames.

Le cahier des charges complet est dans [`cdc-docuvid-v2.md`](./cdc-docuvid-v2.md).

---

## État du projet

**Pipeline P1 complet et testable hors-ligne.** Les 5 étages (Planner, Navigator, Scripter, Voicer, Composer) sont câblés end-to-end avec :

- Claude Sonnet pour Planner et Scripter
- Claude Computer Use officiel (tool `computer_20250124`) pour le Navigator
- ElevenLabs pour le Voicer
- HyperFrames (`npx hyperframes render`) pour le Composer

Mode `ADA_MOCK=1` disponible : fait tourner le pipeline complet avec des providers en mémoire (sans clé, sans réseau). Tests unitaires et d'intégration via `pnpm test`. Pas encore validé en E2E réel — voir *Quickstart* ci-dessous.

## Architecture

ADA est un pipeline en 5 étages, chacun dans son propre package :

| Étage | Package | Rôle |
|---|---|---|
| 1. Planner | `@ada/core` (`src/modules/planner.ts`) | Décompose la mission en scénarios |
| 2. Navigator | `@ada/core` (`src/modules/navigator.ts`) | Pilote Playwright + agent vision |
| 3. Scripter | `@ada/core` (`src/modules/scripter.ts`) | Génère le script narratif |
| 4. Voicer | `@ada/core` (`src/modules/voicer.ts`) | Synthèse vocale |
| 5. Composer | `@ada/core` (`src/modules/composer.ts`) | Composition HyperFrames + rendu MP4 |

Les fournisseurs externes (vision, text, TTS) sont des adapters pluggables dans `@ada/providers`. Les templates HyperFrames vivent dans `@ada/templates`. Le binaire `ada` est dans `packages/cli`. La skill agentique installable est dans `packages/skill`.

### Providers supportés

| Type | Provider | Statut | Override env |
|---|---|---|---|
| Vision | `claude-computer-use` | ✅ Computer Use officiel | `ADA_VISION_MODEL`, `ADA_COMPUTER_USE_BETA` |
| Vision | `gpt-4-vision` | ✅ GPT-4o + screenshot+JSON+selector | `OPENAI_API_KEY` |
| Vision | `gemini-vision` | ✅ Gemini 2.5 Pro direct (Google AI Studio API) | `GOOGLE_API_KEY` |
| Vision | `vertex-vision` | ✅ Gemini via Vertex OpenAI-compatible | `ADA_VERTEX_API_KEY`, `ADA_VERTEX_API_URL` |
| Vision | `qwen2-vl-local` / `fal-vision` / `replicate-vision` | 🔜 stubs |  |
| Text | `claude` | ✅ Claude Sonnet | `ANTHROPIC_API_KEY` |
| Text | `openai` | ✅ GPT-4o | `OPENAI_API_KEY`, `ADA_OPENAI_MODEL` |
| Text | `vertex` / `fal` / `replicate` / `openai-compat` | ✅ via OpenAI-compatible base URL | `ADA_<NAME>_API_KEY`, `ADA_<NAME>_API_URL` |
| Text | `gemini` / `ollama` | 🔜 stubs |  |
| TTS | `elevenlabs` | ✅ eleven_multilingual_v2 | `ELEVENLABS_API_KEY` |
| TTS | `openai-tts` | ✅ tts-1 | `OPENAI_API_KEY`, `ADA_OPENAI_TTS_MODEL` |
| TTS | `fal-tts` | ✅ Fal hosted (Kokoro par défaut) | `ADA_FAL_API_KEY`, `ADA_FAL_TTS_MODEL` |
| TTS | `vertex-tts` | ✅ Google Cloud Text-to-Speech | `ADA_VERTEX_API_KEY`, `ADA_VERTEX_TTS_MODEL` |
| TTS | `replicate-tts` | ✅ Replicate predictions (xtts-v2 par défaut) | `ADA_REPLICATE_API_KEY`, `ADA_REPLICATE_TTS_MODEL` |
| TTS | `kokoro` | 🔜 stub |  |

## Prérequis

- Node.js 22+
- pnpm 9+
- (à terme) FFmpeg et un navigateur Chromium pour Playwright

## Installation (dev)

```bash
pnpm install
pnpm -r build
```

## Quickstart sans clé (mode mock)

Aucune API key requise. Permet de valider l'installation et l'orchestrateur sans coût.

```bash
ADA_MOCK=1 ada plan --url https://example.com --output-format json
# → renvoie un ScenarioPlan fixture
```

`ADA_MOCK=1 ada run …` exécute le pipeline complet jusqu'à composition, mais Playwright reste réel — il faut Chromium installé (`npx playwright install chromium`).

## Quickstart avec clés (E2E réel)

```bash
# Une fois
npx playwright install chromium
cp .env.example .env  # puis renseigner ANTHROPIC_API_KEY + ELEVENLABS_API_KEY

# Plan court et bon marché (~$0.01)
ada plan --url https://docs.anthropic.com --output-format json

# Pipeline complet (~$1-2, ~10 min)
ada run --url https://docs.anthropic.com --output demo.mp4 --output-format json
```

Le `RunReport` JSON inclut `outputPath`, `subtitlesPath.{srt,vtt}`, `transcriptPath`, et `estimatedCostUsd`.

## Tests

```bash
pnpm test
```

Exerce les utilitaires (mp3-duration, srt, cost, key-translate, schemas Zod) et le pipeline complet avec providers mock. Aucun appel réseau.

## Usage CLI complet

```bash
# Démo rapide (scénarios déduits par l'IA)
ada run --url https://mon-app.com \
  --credentials user@test.com:password \
  --output demo.mp4

# Avec scénarios YAML
ada run --config ada.yaml --output demo.mp4

# Dry-run : planifie sans rendre la vidéo
ada plan --url https://mon-app.com

# Génère la composition HyperFrames sans la rendre
ada compose --url https://mon-app.com --output ./out/

# Initialise un fichier ada.yaml dans le dossier courant
ada init
```

Toutes les sous-commandes supportent `--output-format json` pour une consommation par un agent (Claude Code, Codex, etc.).

## Codes de sortie

| Code | Signification |
|---|---|
| `0` | Succès |
| `1` | Erreur de configuration (args invalides, fichier introuvable, etc.) |
| `2` | Erreur runtime (échec d'un module, timeout, API en erreur) |

## Skill agentique

Une skill installable est fournie pour Claude Code, Cursor, Codex, Gemini CLI :

```bash
npx skills add marcaureladj/ada
```

Voir [`packages/skill/SKILL.md`](./packages/skill/SKILL.md).

## Structure du monorepo

```
packages/
├── core/         @ada/core        Types, schémas Zod, orchestrateur pipeline, modules stubs
├── cli/          ada              Binaire CLI (Commander.js)
├── providers/    @ada/providers   Adapters vision / text / TTS
├── templates/    @ada/templates   Templates HTML HyperFrames (classic, framed, split, social)
└── skill/        marcaureladj/ada   Skill installable pour agents IA
```

## Roadmap

- **P1 — Spike** : pipeline end-to-end minimal sur une page publique
- **P2 — MVP core** : 5 modules fonctionnels, 1 template, 1 provider par étage
- **P3 — Modularité** : config YAML, multi-providers, skill publiée
- **P4 — Templates et UX** : 4 templates, annotations GSAP, sous-titres
- **P5 — Tests et docs** : couverture > 70 %, GitHub Action, doc hébergée
- **P6 — Beta publique** : lancement open source, catalog HyperFrames

## Tests d'intégration

Voir [`tests/integration/README.md`](./tests/integration/README.md) pour la suite E2E sur Cal.com / Plane / Documenso / Twenty / Formbricks (3 modes : `plan-only`, `mock`, `full`). Cible CDC §6.2 : ≥ 80 % de réussite.

```bash
pnpm integration:mock         # $0, ~30 s, CI-able
pnpm integration:plan         # ~$0.05, requiert ANTHROPIC_API_KEY
pnpm integration:full         # ~$5-10, manuel uniquement
pnpm integration:aggregate    # met à jour tests/integration/README-RESULTS.md
```

## Contributing

Voir [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour le workflow de développement (prérequis, structure du repo, tests, conventional commits, changesets). Tous les contributeurs s'engagent à respecter le [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

Si tu découvres une vulnérabilité — surtout sur le périmètre auth / masquage credentials — voir [`SECURITY.md`](./SECURITY.md) pour la divulgation privée.

## Licence

Apache 2.0 — voir [`LICENSE`](./LICENSE).
