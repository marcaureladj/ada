---
name: ada
description: ADA — Autonomous Documentation Agent. Génère une vidéo MP4 narrée d'une web app à partir d'une URL et d'identifiants, sans intervention humaine. Pilote un navigateur via Playwright, raisonne sur les écrans via un LLM vision, et assemble la vidéo via HyperFrames.
license: Apache-2.0
---

# ADA — Autonomous Documentation Agent

ADA est un outil en ligne de commande qui produit une vidéo de documentation MP4 narrée à partir d'une URL et de credentials. L'agent IA explore l'application, génère un script narratif, synthétise la voix off et assemble le tout via HyperFrames.

## TRIGGER when:

- L'utilisateur demande de **générer une démo vidéo**, un **walkthrough**, ou de la **documentation vidéo** d'une application web.
- L'utilisateur mentionne **HyperFrames + agent**, ou veut une **démo automatique** sans enregistrement humain.
- L'utilisateur cite explicitement `ada`, `/ada`, ou le projet `marcaureladj/ada`.
- Phrases types : *"génère une vidéo de démo de https://…"*, *"documente cette webapp en vidéo"*, *"crée un walkthrough de 90 secondes"*.

## SKIP when:

- L'utilisateur veut juste un **screenshot statique** (utiliser Playwright ou un outil de capture).
- L'utilisateur veut documenter une **app mobile native** (iOS/Android sans webview) — hors périmètre v1.0.
- L'utilisateur veut **éditer manuellement** une composition HyperFrames existante (utiliser le studio HyperFrames directement).

## Comment invoquer ADA

ADA s'invoque exclusivement via la CLI `ada`. Tu dois exécuter une commande shell, jamais générer du code à la main.

### Commandes principales

```bash
# Pipeline complet : URL → vidéo MP4
ada run --url <URL> --credentials <email>:<password> --output <fichier.mp4>

# Avec un fichier de configuration YAML
ada run --config ada.yaml --output demo.mp4

# Dry-run : ne produit que le plan de scénarios (pas de vidéo, pas de coût)
ada plan --url <URL>

# Génère uniquement la composition HyperFrames (pas le MP4)
ada compose --url <URL> --output ./out/

# Initialise un fichier ada.yaml dans le dossier courant
ada init
```

### Sortie structurée pour agents

Toujours passer `--output-format json` lorsque tu consommes la sortie d'ADA programmatiquement :

```bash
ada plan --url https://example.com --output-format json
```

La sortie JSON contient soit le payload de succès (`scenarios.json`, `RunReport`), soit `{ "ok": false, "code": "...", "message": "..." }` en cas d'erreur.

### Codes de sortie

| Code | Signification | Action recommandée |
|---|---|---|
| `0` | Succès | Continuer |
| `1` | Erreur de configuration | Corriger les args ou le `ada.yaml` |
| `2` | Erreur runtime (échec module, API, timeout) | Examiner les logs, retry si transient |

## Variables d'environnement

ADA lit automatiquement `.env` (ou les variables d'environnement). Les essentielles :

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Clé pour Claude (vision + texte, par défaut) |
| `ELEVENLABS_API_KEY` | Clé pour le TTS ElevenLabs |
| `OPENAI_API_KEY` | Alternative vision/texte/TTS |
| `ADA_LANGUAGE` | Langue par défaut (`fr` ou `en`) |
| `ADA_LOG_LEVEL` | `trace` \| `debug` \| `info` \| `warn` \| `error` |
| `ADA_TTS_PROVIDER` | `elevenlabs` \| `openai-tts` \| `kokoro` |

## Exemples d'usage côté agent

### Exemple 1 — Démo rapide d'un SaaS public

> *"Génère une vidéo de 90 secondes qui montre l'inscription et la création d'un projet sur https://mon-saas.com (email demo@test.com / password 'secret')."*

```bash
ada run \
  --url https://mon-saas.com \
  --credentials demo@test.com:secret \
  --output demo-saas.mp4 \
  --output-format json
```

### Exemple 2 — Documentation versionnée avec scénarios YAML

> *"Régénère la doc vidéo à partir de `ada.yaml`."*

```bash
ada run --config ada.yaml --output-format json
```

### Exemple 3 — Préviewer le plan avant de lancer la vidéo

> *"Dis-moi ce qu'ADA filmera sans rien rendre."*

```bash
ada plan --url https://mon-app.com --output-format json
```

## Bonnes pratiques

1. **Toujours commencer par `ada plan`** sur une nouvelle URL pour valider le plan avant de payer les appels TTS/rendu.
2. **Utiliser un fichier `ada.yaml`** dès qu'il y a plus d'un scénario — c'est versionnable et reproductible.
3. **Ne jamais inclure les credentials en clair** dans le YAML : utiliser `${SECRET_PASSWORD}` interpolé depuis l'environnement.
4. **Vérifier le code de sortie** : `0` = succès, `≠ 0` = échec.
5. **Toujours `--output-format json`** quand tu consommes la sortie depuis un autre agent.

## Limites connues

- v1.0 : pas de support des apps mobiles natives.
- v1.0 : pas de voice cloning (prévu v2).
- Latence indicative : 8–12 min pour une vidéo de 3 min avec Claude + ElevenLabs.

## Installation

```bash
npm install -g ada
# ou
npx ada run --url https://…
```

## Référence complète

Cahier des charges et architecture détaillée : voir `cdc-docuvid-v2.md` dans le repo. Toute la spec produit (5 modules, templates, providers, format YAML) y est documentée.
