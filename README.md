<p align="center">
  <img src="./logo-ada.png" alt="ADA — Autonomous Documentation Agent" width="180" />
</p>

<h1 align="center">ADA</h1>

<p align="center">
  <strong>Autonomous Documentation Agent</strong><br/>
  Génère automatiquement une vidéo de documentation narrée d'une web app, sans intervention humaine.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache_2.0-D22128?logo=apache&logoColor=white" alt="Apache 2.0" />
  <img src="https://img.shields.io/badge/node-22+-5FA04E?logo=nodedotjs&logoColor=white" alt="Node 22+" />
  <img src="https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white" alt="pnpm 9" />
  <img src="https://img.shields.io/badge/typescript-5.6-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.6" />
  <img src="https://img.shields.io/badge/tests-146_passing-22c55e" alt="146 tests" />
  <img src="https://img.shields.io/badge/CI-multi--OS-2088FF?logo=githubactions&logoColor=white" alt="CI multi-OS" />
</p>

<p align="center">
  <em>Une URL + des identifiants → un MP4 avec narration, sous-titres, annotations GSAP. ~10 minutes.</em>
</p>

---

## 🎬 Ce que fait ADA

```bash
ada run --url https://app.cal.com --credentials demo@test.com:secret --output demo.mp4
```

→ ADA ouvre Chrome, se connecte, **explore l'application comme un product manager**, génère un script narratif, synthétise une voix off, assemble le tout en un MP4 prêt à diffuser.

**100 % agentique.** Aucune capture humaine préalable, contrairement à Arcade / Supademo / Tango.

## ✨ Pourquoi ADA

- 🤖 **Pilotage par agent IA** — Claude Computer Use (officiel) ou GPT-4o / Gemini en pattern screenshot+selector
- 🎙️ **Voix naturelle multi-langue** — ElevenLabs, OpenAI TTS, Google Cloud TTS, Fal (Kokoro), Replicate (XTTS)
- 🎞️ **Rendu HTML-native** — HyperFrames produit des MP4 déterministes depuis du HTML/CSS/GSAP
- ✨ **Annotations automatiques** — flèches, zooms, callouts animés sur chaque clic via GSAP
- 🛡️ **Auth + masquage credentials** — passwords jamais transmis aux LLM, masqués dans les screenshots
- 🧪 **Mode mock complet** — pipeline entier exécutable sans aucune clé API (`ADA_MOCK=1`)
- 📊 **Observabilité native** — retry exponential backoff, events.ndjson, RunReport avec timings et coût
- 📜 **Open source, Apache 2.0** — aucune redevance, redistribution autorisée

---

## 🚀 Quickstart

### Sans clé API (mode mock)

```bash
git clone https://github.com/marcaureladj/ada.git && cd ada
pnpm install && pnpm -r build
ADA_MOCK=1 node packages/cli/dist/cli.js plan --url https://example.com --output-format json
```

### Avec tes clés (E2E réel, ~$1-2 par vidéo)

```bash
# 1. Une fois
pnpm playwright:install
cp .env.example .env   # remplir ANTHROPIC_API_KEY + ELEVENLABS_API_KEY

# 2. Plan court (~$0.01)
ada plan --url https://docs.anthropic.com --output-format json

# 3. Pipeline complet (~$1-2, ~10 min)
ada run --url https://docs.anthropic.com --output demo.mp4 --output-format json
```

---

## 🧠 Comment ça marche

```
┌──────────┐    ┌────────────┐    ┌──────────┐    ┌────────┐    ┌──────────┐
│ Planner  │ ─→ │ Navigator  │ ─→ │ Scripter │ ─→ │ Voicer │ ─→ │ Composer │
└──────────┘    └────────────┘    └──────────┘    └────────┘    └──────────┘
   ↑                ↑                  ↑              ↑              ↑
   Claude/         Computer Use       Claude/        ElevenLabs/   HyperFrames
   GPT-4o          + Playwright       GPT-4o         OpenAI/etc.   (HTML→MP4)
```

| Étage | Rôle | Sortie |
|---|---|---|
| **1. Planner** | Décompose la mission en scènes (depuis URL + README) | `scenarios.json` |
| **2. Navigator** | Pilote Playwright via Computer Use ou screenshot+selector | `traces/*.json` + capture WebM + screenshots |
| **3. Scripter** | Transforme les traces en script narratif découpé en segments | `script.json` |
| **4. Voicer** | Synthèse vocale segment par segment, avec cache | `audio/*.mp3` |
| **5. Composer** | Génère la composition HTML HyperFrames + lance le rendu MP4 | `demo.mp4` + sous-titres `.srt` `.vtt` + transcript `.md` |

Le pipeline complet est orchestré dans [`packages/core/src/pipeline.ts`](./packages/core/src/pipeline.ts) avec **retry exponential backoff**, **abort signal** (Ctrl+C propre), et **log structuré NDJSON** dans `events.ndjson`.

---

## 🔌 Providers supportés

### 🧠 Vision (qui pilote le navigateur)

<p>
  <img src="https://img.shields.io/badge/Claude-Computer_Use-D97757?logo=anthropic&logoColor=white" alt="Claude" />
  <img src="https://img.shields.io/badge/GPT--4o-Vision-412991?logo=openai&logoColor=white" alt="GPT-4o" />
  <img src="https://img.shields.io/badge/Gemini-2.5_Pro-1A73E8?logo=googlegemini&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/Vertex_AI-OpenAI--compat-4285F4?logo=googlecloud&logoColor=white" alt="Vertex" />
</p>

| Provider | Backend | Pattern | Env |
|---|---|---|---|
| `claude-computer-use` | Anthropic Messages API + tool `computer_20250124` | Computer Use officiel (mouse/keyboard) | `ANTHROPIC_API_KEY` |
| `gpt-4-vision` | OpenAI Chat Completions + image input | screenshot + JSON + selector | `OPENAI_API_KEY` |
| `gemini-vision` | Google AI Studio (direct, sans GCP setup) | screenshot + JSON + selector | `GOOGLE_API_KEY` |
| `vertex-vision` | Vertex AI OpenAI-compatible endpoint | screenshot + JSON + selector | `ADA_VERTEX_API_KEY` + `ADA_VERTEX_API_URL` |

### 💬 Text (Planner / Scripter)

<p>
  <img src="https://img.shields.io/badge/Claude-Sonnet_4.6-D97757?logo=anthropic&logoColor=white" alt="Claude" />
  <img src="https://img.shields.io/badge/GPT--4o-Text-412991?logo=openai&logoColor=white" alt="GPT-4o" />
  <img src="https://img.shields.io/badge/Vertex-Gemini-4285F4?logo=googlecloud&logoColor=white" alt="Vertex" />
  <img src="https://img.shields.io/badge/Fal-Hosted_LLMs-9333EA" alt="Fal" />
  <img src="https://img.shields.io/badge/Replicate-OpenAI--proxy-000000?logo=replicate&logoColor=white" alt="Replicate" />
</p>

| Provider | Modèle par défaut | Env |
|---|---|---|
| `claude` | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY`, `ADA_CLAUDE_MODEL` |
| `openai` | `gpt-4o` | `OPENAI_API_KEY`, `ADA_OPENAI_MODEL` |
| `vertex` | `google/gemini-2.5-pro` | `ADA_VERTEX_API_KEY`, `ADA_VERTEX_API_URL`, `ADA_VERTEX_MODEL` |
| `fal` | `meta-llama/Llama-3.1-70B-Instruct` | `ADA_FAL_API_KEY`, `ADA_FAL_API_URL`, `ADA_FAL_MODEL` |
| `replicate` | `meta/llama-3.1-405b-instruct` | `ADA_REPLICATE_API_KEY`, `ADA_REPLICATE_API_URL` |
| `openai-compat` | générique (LM Studio, vLLM, OpenRouter, Ollama) | `ADA_GENERIC_API_KEY`, `ADA_GENERIC_API_URL` |

### 🎙️ TTS (Voicer)

<p>
  <img src="https://img.shields.io/badge/ElevenLabs-Multilingual_v2-000000" alt="ElevenLabs" />
  <img src="https://img.shields.io/badge/OpenAI_TTS-tts--1-412991?logo=openai&logoColor=white" alt="OpenAI TTS" />
  <img src="https://img.shields.io/badge/Google_Cloud-TTS-4285F4?logo=googlecloud&logoColor=white" alt="Vertex TTS" />
  <img src="https://img.shields.io/badge/Fal-Kokoro-9333EA" alt="Fal" />
  <img src="https://img.shields.io/badge/Replicate-xtts--v2-000000?logo=replicate&logoColor=white" alt="Replicate" />
</p>

| Provider | Modèle par défaut | Env |
|---|---|---|
| `elevenlabs` | `eleven_multilingual_v2` | `ELEVENLABS_API_KEY` |
| `openai-tts` | `tts-1` | `OPENAI_API_KEY`, `ADA_OPENAI_TTS_MODEL` |
| `vertex-tts` | `fr-FR-Neural2-A` (fr) / `en-US-Neural2-A` (en) | `ADA_VERTEX_API_KEY`, `ADA_VERTEX_TTS_MODEL` |
| `fal-tts` | `fal-ai/kokoro` | `ADA_FAL_API_KEY`, `ADA_FAL_TTS_MODEL` |
| `replicate-tts` | `lucataco/xtts-v2` | `ADA_REPLICATE_API_KEY`, `ADA_REPLICATE_TTS_MODEL` |

### 🌐 Stack technique

<p>
  <img src="https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright&logoColor=white" alt="Playwright" />
  <img src="https://img.shields.io/badge/HyperFrames-v0.6+-FF6B35" alt="HyperFrames" />
  <img src="https://img.shields.io/badge/GSAP-3.12-88CE02?logo=greensock&logoColor=white" alt="GSAP" />
  <img src="https://img.shields.io/badge/Zod-schema_validation-3068B7" alt="Zod" />
  <img src="https://img.shields.io/badge/Commander-CLI-AF6024" alt="Commander.js" />
  <img src="https://img.shields.io/badge/Pino-structured_logs-738ADB" alt="Pino" />
</p>

---

## 🎨 Templates HyperFrames

4 templates de rendu visuels, sélectionnables via `--template <name>` ou `output.template` dans `ada.yaml` :

| Template | Format | Annotations | Description |
|---|---|---|---|
| `classic` | 16:9 | sans | Plein écran capture + voix off + sous-titres minimalistes |
| `framed` | 16:9 | flèches GSAP + callouts | Cadre browser stylé macOS, annotations animées sur clics |
| `split` | 16:9 | callouts panneau droit | Grille 60/40 vidéo + scénario narratif latéral |
| `social` | **9:16** | zoom-pulses | Format vertical pour Reels / TikTok, captions XXL animées |

Les annotations sont **automatiquement générées** depuis les coordonnées Computer Use des clics, animées via GSAP timeline seekable par HyperFrames (cf. [`packages/templates/src/annotations.ts`](./packages/templates/src/annotations.ts) et [`gsap-script.ts`](./packages/templates/src/gsap-script.ts)).

---

## 🛡️ Sécurité

ADA gère trois catégories sensibles : **screenshots**, **credentials**, **LLM context**. Les garanties :

1. **Authentification déterministe via Playwright** — passwords remplis via `page.fill()`, jamais transmis à un LLM.
2. **Masquage automatique des screenshots** avant envoi à Claude/GPT-4o : `<input type="password">` + sélecteurs custom (`ADA_MASK_SELECTORS=".user-email,#api-key"`) sont écrasés par un rectangle noir.
3. **Audit log** (`audit.log` dans le workdir) — chaque masque appliqué est tracé sans jamais loguer la valeur masquée.
4. **Test canary** dédié : un test unitaire vérifie qu'un mot de passe fictif n'apparaît jamais dans l'auditLog ni sur disque.
5. **Fail-fast** : credentials manquants → exit code 1 avec message clair AVANT lancement Playwright/Anthropic.

Voir [`SECURITY.md`](./SECURITY.md) pour la divulgation responsable de vulnérabilités.

---

## 📊 Observabilité

Chaque run produit un dossier `./out/<run-id>/` :

```
out/abc123/
├── scenarios.json     # plan généré par le Planner
├── traces/            # actions de l'agent + capture WebM
├── screenshots/       # avant/après pour chaque action
├── script.json        # texte narratif segmenté
├── audio/             # MP3 par segment
├── composition/
│   └── composition.html  # HTML HyperFrames + GSAP
├── subtitles.srt
├── subtitles.vtt
├── transcript.md
├── audit.log          # masques credentials appliqués
├── events.ndjson      # log structuré (1 ligne JSON par event)
└── report.json        # RunReport complet
```

Le `RunReport` JSON contient :

```jsonc
{
  "status": "success",
  "durationMs": 612000,
  "outputPath": "./demo.mp4",
  "stageTimings": { "planner": 4521, "navigator": 480192, "scripter": 8731 },
  "successRate": { "scenes": {"ok": 3, "failed": 0}, "actions": {"ok": 27, "failed": 1} },
  "retries": { "total": 2, "byProvider": { "anthropic": 2 } },
  "usage": { "textInputTokens": 89421, "ttsCharacters": 1840 },
  "estimatedCostUsd": 1.42,
  "eventLogPath": "./out/abc123/events.ndjson",
  "providersUsed": { "vision": "claude-computer-use", "text": "claude", "tts": "elevenlabs" },
  "errors": []
}
```

Retry exponential backoff (3 tentatives, jitter, `Retry-After` honoré) sur **tous** les appels API. Voir [`packages/core/src/utils/retry.ts`](./packages/core/src/utils/retry.ts).

---

## 🧪 Tests d'intégration (CDC §6.2)

Suite E2E sur 5 apps open source de référence : **Cal.com**, **Plane**, **Documenso**, **Twenty**, **Formbricks**.

```bash
pnpm integration:mock         # $0,   ~30 s, CI-able
pnpm integration:plan         # ~$0.05, requiert ANTHROPIC_API_KEY
pnpm integration:full         # ~$5-10, manuel uniquement (5 MP4 générés)
pnpm integration:aggregate    # met à jour tests/integration/README-RESULTS.md
```

**Cible CDC §6.2** : ≥ 80 % de réussite. La suite mock passe **5/5 ✓** localement. Voir [`tests/integration/README.md`](./tests/integration/README.md).

Workflow GitHub Actions : [`.github/workflows/integration.yml`](./.github/workflows/integration.yml) — `plan-only` + `mock` au tag `v*`, `full` en `workflow_dispatch` manuel.

---

## ⚙️ Configuration

### Via CLI

```bash
ada run --url https://app.cal.com \
  --credentials demo@test.com:secret \
  --output demo.mp4 \
  --template framed \
  --language fr \
  --output-format json
```

### Via `ada.yaml`

```yaml
project:
  name: MyApp
  url: https://app.cal.com
  language: fr
  description: "Plateforme de prise de rendez-vous open source"

auth:
  type: credentials
  email: ${ADA_DEMO_EMAIL}
  password: ${ADA_DEMO_PASSWORD}

scenarios:
  - id: signup
    description: Création d'un compte
  - id: create-event
    description: Création d'un event-type 30 min
    preconditions: [signup]

output:
  format: mp4
  resolution: 1080p
  ratio: '16:9'
  template: framed
  path: ./demo.mp4

providers:
  vision: claude-computer-use   # ou gpt-4-vision, gemini-vision, vertex-vision
  text: claude                  # ou openai, vertex, fal, replicate, openai-compat
  tts: elevenlabs               # ou openai-tts, vertex-tts, fal-tts, replicate-tts
  voice: french-pro-male
```

### Variables d'environnement

Voir [`.env.example`](./.env.example) — section complète avec toutes les clés API et modèles par défaut.

---

## 🛠️ Architecture (monorepo)

```
packages/
├── core/         @ada/core      Types, schémas Zod, pipeline 5 étages, modules (Planner→Composer)
├── providers/    @ada/providers Adapters vision/text/TTS (Claude, OpenAI, Gemini, Vertex, Fal, Replicate, ElevenLabs)
├── templates/    @ada/templates 4 templates HyperFrames + annotations GSAP automatiques
├── cli/          ada            CLI (Commander.js) — bin `ada`
└── skill/        @ada/skill     SKILL.md installable via `npx skills add marcaureladj/ada`
tests/
└── integration/  Fixtures + orchestrateur + workflow Actions pour les 5 apps OS
```

**Stack** : Node 22+, pnpm 9, TypeScript strict, `node --test` + `tsx`, oxlint, Prettier, Changesets.

---

## 📦 Installation et build

```bash
# Prérequis : Node 22+, pnpm 9+
git clone https://github.com/marcaureladj/ada.git
cd ada
pnpm install                # + active simple-git-hooks
pnpm -r build               # compile tous les packages
pnpm test                   # 146 tests via node:test + tsx
pnpm typecheck              # tsc -b --noEmit
pnpm lint                   # oxlint
```

Pour la première exécution réelle :

```bash
pnpm playwright:install     # télécharge Chromium pour Playwright
cp .env.example .env        # remplir au moins ANTHROPIC_API_KEY + ELEVENLABS_API_KEY
```

---

## 🗺️ Roadmap

### ✅ v1.0 — Fait (sessions 1-11)

- Pipeline 5 étages complet end-to-end
- Computer Use officiel + 3 vision providers alternatifs
- 5 providers TTS, 6 providers text
- Auth + masquage credentials (testé canary)
- 4 templates avec annotations GSAP
- Robustesse : retry, events.ndjson, RunReport enrichi, Ctrl+C propre
- 146 tests (unit + intégration)
- CI multi-OS, Changesets ready
- Suite intégration 5 apps OS

### 🔜 v1.0 — Validation finale

- [ ] Run réel sur docs.anthropic.com avec tes clés (debug runtime)
- [ ] Push GitHub + premier release NPM via Changesets
- [ ] Publication skill `marcaureladj/ada` au catalog Vercel Skills

### 🚧 v1.1+

- [ ] Mode interactif (validation step-by-step de chaque scène)
- [ ] Multi-langue parallèle (N langues en un run)
- [ ] Mode mobile (émulation devices via Playwright)
- [ ] Self-host Docker (Dockerfile + compose)
- [ ] Doc hébergée (`docs.ada.dev`)
- [ ] Landing page produit (méta-démo générée par ADA elle-même)
- [ ] Voice cloning

---

## 🤝 Contributing

Voir [`CONTRIBUTING.md`](./CONTRIBUTING.md) pour le workflow de développement (prérequis, structure du repo, tests, conventional commits, changesets).

Tous les contributeurs s'engagent à respecter le [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

Si tu découvres une vulnérabilité — surtout sur le périmètre auth / masquage credentials — voir [`SECURITY.md`](./SECURITY.md) pour la divulgation privée via GitHub Security Advisories.

---

## 📜 Crédits

- **Spec produit** — [`cdc-docuvid-v2.md`](./cdc-docuvid-v2.md) — par Marc-Aurel.
- **Moteur vidéo** — [HyperFrames](https://github.com/heygen-com/hyperframes) (HeyGen, Apache 2.0).
- **Concurrents et inspirations** — Arcade, Supademo, Guidde, Tango, Browser Use.

---

## 📄 License

<p>
  <img src="https://img.shields.io/badge/license-Apache_2.0-D22128?logo=apache&logoColor=white" alt="Apache 2.0" />
</p>

Apache License 2.0 — voir [`LICENSE`](./LICENSE).

Copyright © 2026 Marc-Aurel.
