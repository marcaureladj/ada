**CAHIER DES CHARGES**

**DocuVid**

_Génération automatique de documentation vidéo par IA agentique_

Projet open source — basé sur HyperFrames

Version 2.0 — Mai 2026

|     |     |
| --- | --- |
| **Maître d'ouvrage** | Marc-Aurel |
| **Type de projet** | Outil CLI open source (licence Apache 2.0) |
| **Stack principale** | Node.js / TypeScript, HyperFrames, Playwright, Claude Computer Use |
| **Moteur vidéo** | HyperFrames (HeyGen) — HTML-native, Apache 2.0 |
| **Livrable** | Binaire CLI + bibliothèque NPM + plugin HyperFrames |
| **Public cible** | Développeurs, startups, équipes produit, créateurs de SaaS |

# **1\. Contexte et vision**

## **1.1 Problématique**

La documentation produit reste un point de friction majeur pour les équipes de développement. Les docs textuelles sont longues à rédiger, vite obsolètes, et peu adaptées aux utilisateurs visuels. Les solutions de démo vidéo existantes (Arcade, Supademo, Tango, Guidde) exigent qu'un humain joue la démo manuellement avant que l'outil ne la rejoue — ce qui ne résout que partiellement le problème.

## **1.2 Vision**

DocuVid est un outil en ligne de commande qui génère automatiquement une vidéo de documentation à partir d'une URL et de credentials. Un agent IA pilote un navigateur, explore l'application comme le ferait un product manager, génère un script narratif, synthétise une voix off, et assemble le tout via HyperFrames en un fichier MP4 prêt à diffuser.

_DocuVid n'est pas un nouveau moteur vidéo. C'est une couche agentique au-dessus d'HyperFrames qui transforme "une URL et un compte utilisateur" en "vidéo de démo narrée", sans intervention humaine._

## **1.3 Différenciation**

- **100 % agentique :** aucune intervention humaine pour produire la démo — l'IA décide quoi montrer et l'exécute.
- **Open source Apache 2.0 :** héritée du choix d'HyperFrames. Aucune redevance, usage commercial libre, redistribution autorisée.
- **HTML-native pour l'IA :** les LLM produisent du HTML/CSS avec un taux d'erreur bien plus faible que du JSX/React. HyperFrames est conçu dès le départ pour des compositions générées par agents.
- **Skills agentiques intégrées :** HyperFrames fournit déjà des skills (hyperframes, hyperframes-media, website-to-hyperframes) pour Claude Code, Cursor, Codex, Gemini CLI. DocuVid s'y greffe naturellement.
- **Multi-modèles :** Claude (Computer Use) par défaut, GPT-4 Vision, Gemini, Qwen2-VL local.

## **1.4 Pourquoi HyperFrames plutôt que Remotion**

Ce choix est structurant pour le projet. Les deux outils pilotent un navigateur headless et sont déterministes, mais ils diffèrent sur une décision clé : ce que l'auteur principal écrit. Remotion mise sur des composants React (TSX), HyperFrames mise sur du HTML brut.

| **Critère** | **HyperFrames** | **Remotion** |
| --- | --- | --- |
| Auteur principal | HTML + CSS + GSAP | Composants React (TSX) |
| Build step | Aucun (HTML joué tel quel) | Requis (bundler) |
| Adoption par les LLM | Excellente (HTML natif) | Variable (hooks, props complexes) |
| Animations bibliothèque (GSAP, Anime.js) | Seekable, frame-accurate | Wall-clock pendant rendu |
| Passthrough HTML/CSS arbitraire | Coller-animer | Réécrire en JSX |
| Licence | Apache 2.0 (OSI) | Source-available payante |
| Skills agentiques officielles | Oui (Claude Code, Cursor, etc.) | Non |

Pour DocuVid, dont la composition vidéo est entièrement générée par une IA, le choix de HyperFrames est évident : moins d'erreurs de génération, pas de build à orchestrer, licence libre, et un écosystème de skills déjà pensé pour les agents.

## **1.5 Objectifs**

- **Objectif principal :** produire une vidéo MP4 narrée à partir d'une simple commande CLI en moins de 10 minutes pour une application standard.
- Permettre une intégration CI/CD : régénérer la doc vidéo à chaque release.
- Supporter le français et l'anglais en sortie (voix off + sous-titres) dès la v1.0.
- Fournir un plugin HyperFrames officiel (skill docuvid) pour Claude Code, Cursor, Codex, Gemini CLI.
- Atteindre une qualité de rendu comparable à une démo produit humaine pour des parcours simples.

# **2\. Périmètre fonctionnel**

## **2.1 Cas d'usage cibles**

| **Cas d'usage** | **Description** | **Priorité** |
| --- | --- | --- |
| Onboarding utilisateur | Démo du parcours d'inscription et de première utilisation | P0  |
| Documentation feature | Démo d'une fonctionnalité spécifique sur scénario YAML | P0  |
| Walkthrough complet | Tour complet de l'application page par page | P1  |
| Release notes vidéo | Démo des nouveautés à partir d'un changelog | P2  |
| Documentation API/Admin | Démo d'un back-office ou panneau d'administration | P1  |
| Pitch produit | Vidéo courte (60-90s) format social pour landing pages | P1  |

## **2.2 Fonctionnalités attendues**

### **2.2.1 Entrées (inputs)**

- URL cible de l'application (web app, site, SaaS).
- Credentials optionnels : login/mot de passe, clé API, ou instruction de création de compte automatique.
- Fichier de scénarios YAML (optionnel) décrivant les parcours à documenter.
- Contexte projet : README, lien GitHub, description courte du produit (optionnel mais recommandé).
- Configuration : langue de sortie, voix, durée cible, format vidéo (16:9, 9:16, 1:1).

### **2.2.2 Sorties (outputs)**

- Vidéo MP4 (H.264, 1080p par défaut), produite via HyperFrames.
- Composition HyperFrames (HTML + assets) éditable manuellement après génération.
- Fichier de sous-titres SRT et VTT.
- Transcript Markdown du script narratif.
- Rapport JSON d'exécution : étapes parcourues, durée, modèle utilisé, coût API.

### **2.2.3 Fonctionnalités cœur (MVP — v1.0)**

- CLI npx docuvid run avec arguments documentés.
- Agent navigateur autonome avec Playwright + IA vision.
- Génération de script narratif scène par scène.
- Synthèse vocale via providers configurables (ElevenLabs, OpenAI TTS, Kokoro local via skill hyperframes-media).
- Génération de la composition HyperFrames HTML.
- Rendu vidéo via @hyperframes/producer.
- Mode dry-run pour prévisualiser le scénario sans coût IA/vidéo.

### **2.2.4 Fonctionnalités v1.1 et au-delà**

- Mode interactif : l'utilisateur valide chaque étape avant rendu.
- Détection automatique de scénarios (l'IA propose les parcours dignes d'être documentés).
- Annotations visuelles automatiques (flèches, zooms, encadrés sur les éléments cliqués) via les blocks du catalog HyperFrames.
- Mode multi-langue : générer N versions linguistiques en une seule passe.
- Intégration CI : GitHub Action officielle, hook Vercel/Netlify.
- Mode capture mobile : émulation d'appareils via Playwright.
- Templates DocuVid publiés sur le catalog HyperFrames.

## **2.3 Hors périmètre v1.0**

- Édition vidéo interactive en interface graphique web (le @hyperframes/studio existant peut servir d'éditeur post-génération).
- Hébergement de vidéos générées.
- Documentation d'applications mobiles natives (iOS/Android sans webview).
- Documentation de logiciels desktop natifs (Electron supporté en P2).
- Voice cloning de la voix du fondateur (envisagé en v2).

# **3\. Architecture technique**

## **3.1 Vue d'ensemble**

DocuVid suit une architecture en pipeline avec cinq étages distincts. Cette séparation permet le débogage, la reprise sur erreur, et le branchement de providers alternatifs. Le cinquième étage délègue intégralement à HyperFrames, ce qui réduit drastiquement la surface de code à maintenir.

| **Étage** | **Responsabilité** | **Technologie** |
| --- | --- | --- |
| 1\. Planner | Décomposer la mission en scénarios et étapes | Claude API / GPT-4 / Gemini |
| 2\. Navigator | Pilote le navigateur, capture les écrans | Playwright + Computer Use |
| 3\. Scripter | Génère le script narratif scène par scène | LLM (texte uniquement) |
| 4\. Voicer | Synthèse vocale du script | ElevenLabs / OpenAI / Kokoro |
| 5\. Composer | Génère la composition HTML + lance le rendu | @hyperframes/core + @hyperframes/producer |

## **3.2 Stack technique imposée**

### **3.2.1 Langage et runtime**

- Node.js 22+ (requis par HyperFrames).
- TypeScript 5+ en mode strict.
- Bun supporté en alternative (HyperFrames est testé sous Bun).

### **3.2.2 Composants imposés**

- **HyperFrames :** moteur de rendu vidéo. L'IA produit du HTML déclaratif avec data-attributes (data-start, data-duration, data-track-index). Pas de build. Rendu déterministe via Puppeteer + FFmpeg.
- **Playwright :** automatisation navigateur pour la phase de capture (Navigator). Choisi pour son API plus moderne que Puppeteer côté agent.
- **Anthropic Claude (Computer Use) :** agent par défaut. Raisonne sur des captures d'écran et émet des actions.
- **GSAP :** animation des éléments dans la composition (zooms, transitions, annotations). Adapter natif d'HyperFrames.
- **Commander.js :** framework CLI.
- **Zod :** validation des configurations YAML et outputs LLM structurés.

### **3.2.3 Packages HyperFrames consommés**

| **Package** | **Usage par DocuVid** |
| --- | --- |
| hyperframes (CLI) | Délégation pour init, lint, render des compositions générées |
| @hyperframes/core | Types HTML composition, parsers, linter, frame adapters |
| @hyperframes/engine | Capture page → vidéo (Puppeteer + FFmpeg) |
| @hyperframes/producer | Pipeline complet capture + encode + audio mix |
| @hyperframes/shader-transitions | Transitions WebGL entre scènes (optionnel) |
| Skill hyperframes-media | TTS (Kokoro), transcription (Whisper), background removal (u2net) |

### **3.2.4 Providers pluggables**

Un système d'adapters permet de brancher différents fournisseurs. L'utilisateur configure via variables d'environnement ou fichier docuvid.config.ts.

| **Type** | **Adapter par défaut** | **Alternatives supportées** |
| --- | --- | --- |
| Vision LLM (agent) | Claude Computer Use | GPT-4 Vision, Gemini 2.5 Pro, Qwen2-VL local |
| Text LLM (script) | Claude Sonnet 4.6 | GPT-4, Gemini, Llama local via Ollama |
| TTS | ElevenLabs | OpenAI TTS, Azure, Kokoro (offline), Coqui |
| Navigateur | Playwright Chromium | Firefox, WebKit, Chrome headed |
| Rendu | @hyperframes/producer local | Conteneur Docker (HyperFrames fournit Dockerfile.test) |

## **3.3 Schéma de flux**

┌─────────────┐ ┌──────────────┐ ┌────────────┐

│ Inputs │───▶│ PLANNER │───▶│ scenarios. │

│ url/creds/ │ │ (LLM) │ │ json │

│ scenarios │ └──────────────┘ └────────────┘

└─────────────┘ │

▼

┌──────────────────────────────┐

│ NAVIGATOR (Playwright + IA) │

│ → screenshots/, actions.log │

└──────────────────────────────┘

│

▼

┌──────────────────────────────┐

│ SCRIPTER (LLM) │

│ → script.json (scènes) │

└──────────────────────────────┘

│

┌────────────────┴────────┐

▼ ▼

┌──────────────────┐ ┌───────────────────────┐

│ VOICER (TTS) │ │ COMPOSER (LLM + HF) │

│ → audio/\*.mp3 │ │ → composition.html │

└──────────────────┘ └───────────────────────┘

│ │

└────────────┬────────────┘

▼

┌──────────────────────┐

│ @hyperframes/ │

│ producer → MP4 │

└──────────────────────┘

## **3.4 Exemple de composition HyperFrames générée**

Le Composer produit un fichier HTML conforme au schéma HyperFrames. Exemple simplifié pour une scène "signup" :

<div id="stage"

data-composition-id="docuvid-signup"

data-start="0"

data-width="1920"

data-height="1080">

&lt;!-- Capture vidéo de la session navigateur --&gt;

<video id="screen-recording"

data-start="0" data-duration="45"

data-track-index="0"

src="./assets/signup-capture.webm" muted />

&lt;!-- Voix off synchronisée --&gt;

<audio id="vo-signup"

data-start="0" data-duration="45"

data-track-index="1"

src="./assets/vo-signup.mp3" />

&lt;!-- Annotation sur le bouton S'inscrire --&gt;

<div id="arrow-signup-btn" class="annotation"

data-start="3.2" data-duration="2.5"

data-track-index="2"

style="left:42%;top:38%">

&lt;span class="label"&gt;S'inscrire ici&lt;/span&gt;

&lt;/div&gt;

&lt;!-- Sous-titre --&gt;

<div class="caption"

data-start="0" data-duration="4"

data-track-index="3">

Pour commencer, créons un compte.

&lt;/div&gt;

&lt;/div&gt;

# **4\. Spécifications détaillées par module**

## **4.1 Module Planner**

Responsabilité : à partir des inputs (URL, contexte projet, scénarios optionnels), produire un plan d'exécution structuré.

### **Entrées**

- URL cible, README/description du produit, langue, durée cible.
- Scénarios YAML optionnels (si absents, le Planner les déduit en visitant brièvement la page d'accueil).

### **Sorties**

- scenarios.json : liste ordonnée de scènes avec objectif, prérequis, durée estimée, critère de succès.

## **4.2 Module Navigator**

Responsabilité : exécuter chaque scène en pilotant un navigateur Playwright. À chaque étape, le module capture un screenshot, l'envoie au LLM vision avec le contexte de la scène, et reçoit une action (click, type, scroll, wait, done). Boucle jusqu'à atteindre le successCriteria.

### **Contrats critiques**

- Le navigateur tourne en mode headed par défaut pour permettre le débogage.
- Chaque action est loggée avec timestamp, screenshot avant/après, et raisonnement de l'IA.
- Capture vidéo continue de la session en .webm (utilisable directement par HyperFrames via balise &lt;video&gt;).
- Mécanisme de retry : 3 tentatives par action avant échec scène.
- Timeout global par scène : 5 minutes par défaut, configurable.
- Mode session : les cookies/auth persistent entre scènes via storageState Playwright.

## **4.3 Module Scripter**

Responsabilité : transformer le journal d'actions en script narratif. Le LLM reçoit la séquence d'écrans + actions et produit un script découpé en scènes/segments, avec timing estimé en fonction de la durée TTS.

### **Règles de génération du script**

- Ton pédagogique, naturel, sans jargon excessif.
- Un segment audio correspond à une action visuelle significative.
- Pas de mention du fait que c'est une IA qui parle (sauf si configuré explicitement).
- Vocabulaire adapté à la langue cible (fr/en) avec terminologie produit cohérente.

## **4.4 Module Voicer**

Responsabilité : synthétiser chaque segment textuel en fichier audio. Le module renvoie la durée réelle de chaque segment pour permettre au Composer d'ajuster les data-duration.

- Cache local des segments générés (clé : hash texte + voix + provider).
- Gestion des SSML pour ElevenLabs/Azure quand pertinent (pauses, emphases).
- Mode offline avec Kokoro (via le skill hyperframes-media).
- Validation : durée audio cohérente avec la durée estimée par le Scripter (tolérance ±20 %).

## **4.5 Module Composer**

Responsabilité : générer la composition HyperFrames HTML conforme au schéma officiel, puis déclencher le rendu via @hyperframes/producer.

### **Génération du HTML**

- Le Composer utilise un LLM (Claude Sonnet par défaut) avec le skill hyperframes officiel comme contexte.
- Le HTML produit utilise les data-attributes standards : data-start, data-duration, data-track-index, data-composition-id.
- Les animations GSAP sont injectées via la skill gsap pour rester seekable et frame-accurate.
- Validation systématique via npx hyperframes lint avant rendu.

### **Templates DocuVid**

- classic : screen recording plein écran + voix off + sous-titres minimalistes.
- framed : la capture est insérée dans un cadre browser stylisé, avec annotations GSAP.
- split : capture + bandeau narratif latéral avec puces de scène.
- social : format 9:16 ou 1:1, transitions shader, captions animées.

### **Annotations automatiques**

Quand le journal d'actions identifie un clic sur un sélecteur DOM, le template framed ajoute automatiquement une div d'annotation positionnée à partir des coordonnées du screenshot (boundingBox Playwright). L'animation est gérée par GSAP via le frame adapter HyperFrames.

### **Rendu**

- Appel à npx hyperframes render ou utilisation directe de @hyperframes/producer en mode programmatique.
- Output : MP4 H.264, résolution configurable, 30 fps par défaut.
- Génération parallèle de SRT/VTT depuis le script.json.

# **5\. Spécifications CLI**

## **5.1 Commandes principales**

\# Installation

npm install -g docuvid

\# Démo rapide (scénarios déduits par l'IA)

docuvid run --url https://mon-app.com \\

\--credentials user@test.com:password \\

\--output demo.mp4

\# Avec scénarios YAML

docuvid run --config docuvid.yaml --output demo.mp4

\# Dry-run (planifie sans générer la vidéo)

docuvid plan --url https://mon-app.com

\# Génère la composition HyperFrames sans la rendre

docuvid compose --url https://mon-app.com --output ./out/

\# → puis : npx hyperframes preview ./out ou npx hyperframes render ./out

\# Initialisation d'un fichier de config

docuvid init

## **5.2 Skill DocuVid pour agents IA**

DocuVid publie sa propre skill installable sur le même modèle qu'HyperFrames :

npx skills add marc-aurel/docuvid

Cette skill enseigne aux agents (Claude Code, Cursor, Codex, Gemini CLI) à invoquer DocuVid via /docuvid pour générer une démo vidéo à partir d'une simple description. Exemple de prompt utilisateur :

\> Using /docuvid, generate a 90-second product demo of

https://mon-saas.com showing signup and dashboard creation.

## **5.3 Format docuvid.yaml**

project:

name: MyApp

url: https://mon-app.com

language: fr

auth:

type: credentials # ou api_key, signup, none

email: demo@test.com

password: ${SECRET_PASSWORD}

scenarios:

\- id: signup

description: Création d'un nouveau compte

\- id: create-project

description: Création d'un projet depuis le dashboard

preconditions: \[signup\]

output:

format: mp4

resolution: 1080p

ratio: 16:9

template: framed # classic | framed | split | social

providers:

vision: claude-computer-use

tts: elevenlabs

voice: french-pro-male

hyperframes:

catalog: \[data-chart, instagram-follow\] # blocks optionnels

shaderTransitions: true

# **6\. Exigences non fonctionnelles**

## **6.1 Performance**

- Génération complète sous 10 minutes pour une vidéo de 3 minutes (application standard, 5 scènes).
- Rendu HyperFrames local : aligné sur les benchmarks HyperFrames standards (1-2 fps sur Apple Silicon M1).
- Empreinte mémoire CLI < 1 Go hors processus navigateur.

## **6.2 Fiabilité**

- Reprise sur erreur : si une scène échoue, les précédentes sont préservées et le pipeline peut reprendre.
- Tests d'intégration sur 5 applications open source de référence (Cal.com, Plane, Documenso, Twenty, Formbricks).
- Taux de réussite cible : 80 % des scénarios standards aboutissent à une vidéo exploitable sans intervention humaine.
- Validation HyperFrames (npx hyperframes lint) sur chaque composition générée.

## **6.3 Sécurité**

- Les credentials ne sont jamais loggés ni transmis aux LLM en clair (masquage dans les screenshots envoyés).
- Support des variables d'environnement et .env pour les secrets.
- Mode air-gapped possible avec stack 100 % locale (Ollama + Kokoro + Playwright + HyperFrames local).
- Avertissement clair quand un screenshot contenant potentiellement des données sensibles est envoyé à un provider externe.

## **6.4 Maintenabilité et qualité**

- Couverture de tests > 70 % sur les modules cœur (hors agent).
- TypeScript strict, oxlint (cohérence avec l'écosystème HyperFrames), Prettier.
- Architecture en monorepo (pnpm workspaces ou Bun workspaces) avec packages séparés : core, cli, templates, providers, skill.
- Conventional commits + changelog automatique.

## **6.5 Accessibilité du livrable**

- Sous-titres SRT/VTT générés systématiquement.
- Description audio adaptée pour utilisateurs malvoyants (option).

## **6.6 Coûts**

Le coût d'une génération dépend des providers utilisés. Le rendu HyperFrames lui-même est gratuit (CPU local). Estimation indicative pour une vidéo de 3 minutes :

| **Configuration** | **Coût estimé par vidéo** | **Latence** |
| --- | --- | --- |
| Claude Computer Use + ElevenLabs + HF local | 0,80 – 2,00 USD | 8 – 12 min |
| GPT-4o Vision + OpenAI TTS + HF local | 0,50 – 1,50 USD | 7 – 10 min |
| Qwen2-VL local + Kokoro + HF local | 0 USD (compute local) | 20 – 40 min |

# **7\. Planning et livrables**

## **7.1 Phasage proposé**

| **Phase** | **Contenu** | **Durée** |
| --- | --- | --- |
| P1 — Spike technique | POC end-to-end : Playwright + Claude + composition HF en dur + rendu | 1 semaine |
| P2 — MVP core | Pipeline complet 5 modules, 1 template HF, 1 provider par étage | 3 semaines |
| P3 — Modularité | Système d'adapters pour providers multiples, config YAML, skill DocuVid | 2 semaines |
| P4 — Templates et UX | Templates classic/framed/split/social, annotations GSAP, sous-titres | 2 semaines |
| P5 — Tests et docs | Tests d'intégration, documentation, exemples, GitHub Action | 2 semaines |
| P6 — Beta publique | Lancement open source, soumission catalog HyperFrames, communication | ongoing |

Total estimé pour atteindre la v1.0 publique : 10 semaines en équivalent temps plein, ou 4 à 5 mois en mode side-project soutenu. Le choix de HyperFrames fait gagner environ 3 semaines par rapport à un développement maison de la couche rendu vidéo.

## **7.2 Livrables**

- Code source sur GitHub avec licence Apache 2.0 (cohérence avec HyperFrames).
- Packages NPM publiés : docuvid (CLI), @docuvid/core, @docuvid/providers.
- Skill publiée : npx skills add marc-aurel/docuvid.
- Documentation hébergée (docs.docuvid.dev) avec quickstart, guide config, référence API.
- Trois vidéos de démonstration sur trois applications open source réelles.
- GitHub Action officielle pour intégration CI.
- Page d'accueil produit (landing page) avec démos vidéo générées par l'outil lui-même (méta-démo).
- Soumission d'au moins 2 templates au catalog HyperFrames officiel.

## **7.3 Critères d'acceptation v1.0**

- La commande docuvid run sur Cal.com produit une vidéo de 2 à 4 minutes exploitable sans retouche.
- Le pipeline supporte au moins 2 providers vision, 2 providers TTS, 4 templates.
- La documentation permet à un dev tiers de démarrer en moins de 15 minutes.
- La skill DocuVid est installable et fonctionnelle sur Claude Code et Cursor.
- Les tests CI passent sur Linux, macOS et Windows (WSL2).

# **8\. Risques et points d'attention**

| **Risque** | **Impact** | **Mitigation** |
| --- | --- | --- |
| L'agent IA échoue sur des UI complexes (modals, étapes cachées) | Élevé | Mode scénarios YAML guidés en fallback, retry intelligent |
| Coût API trop élevé pour adoption open source large | Moyen | Support providers locaux (Qwen2-VL, Kokoro), cache agressif |
| Synchronisation voix/vidéo imparfaite | Moyen | HyperFrames est déterministe : on aligne le HTML sur les durées audio réelles après TTS |
| Captures contenant des données sensibles envoyées à un LLM | Élevé | Masquage automatique, mode air-gapped, alertes UX |
| HyperFrames évolue rapidement (v0.6 actuellement) | Moyen | Lock version, tests de régression, suivi des releases |
| Qualité TTS variable selon la langue | Moyen | Multi-providers, recommandation voice par langue dans docs |
| Différenciation vs Arcade/Supademo/Tango | Moyen | Insister sur l'angle agentique et open source dans la com |
| Dépendance forte à un projet tiers (HyperFrames) | Moyen | Apache 2.0 garantit la pérennité ; fork possible si nécessaire |

## **8.1 Décisions structurantes à prendre tôt**

- Monorepo vs multi-repos : recommandation monorepo (pnpm ou bun workspaces).
- TypeScript strict ou progressif : recommandation strict dès le départ.
- Stratégie de gouvernance open source : single maintainer au début, ouverture progressive.
- Nom et identité visuelle : à valider avant publication GitHub.
- Rapprochement éventuel avec l'équipe HyperFrames pour positionnement officiel comme "outil compagnon".

# **9\. Annexes**

## **9.1 Glossaire**

- **Agent IA :** système où un LLM prend des décisions et exécute des actions de manière autonome, en boucle observation/action.
- **Computer Use :** capacité d'un LLM (notamment Claude) à interagir directement avec une interface graphique via captures d'écran et actions souris/clavier.
- **HyperFrames :** framework open source (Apache 2.0) de HeyGen permettant de définir des vidéos en HTML/CSS/GSAP et de les rendre en MP4 via Puppeteer + FFmpeg.
- **Composition HyperFrames :** fichier HTML avec data-attributes définissant la timeline, les pistes et les durées d'une vidéo.
- **Frame Adapter :** pattern HyperFrames permettant d'intégrer différents runtimes d'animation (GSAP, Lottie, CSS, Three.js, WAAPI) tout en restant seekable.
- **Skill (Vercel Labs) :** module installable qui enseigne à un agent IA les patterns spécifiques d'un framework.
- **Playwright :** framework Microsoft d'automatisation navigateur multi-plateformes.
- **TTS :** Text-to-Speech, synthèse vocale.

## **9.2 Références**

- HyperFrames — https://github.com/heygen-com/hyperframes
- Documentation HyperFrames — https://hyperframes.heygen.com/introduction
- Catalog HyperFrames — https://hyperframes.heygen.com/catalog
- Playwright — https://playwright.dev
- Anthropic Computer Use — https://docs.anthropic.com/en/docs/agents-and-tools/computer-use
- GSAP — https://gsap.com
- Browser Use (inspiration agentique) — https://github.com/browser-use/browser-use
- Kokoro TTS — https://github.com/hexgrad/kokoro

## **9.3 Concurrents et inspirations**

- **Arcade.software :** démos interactives, mais nécessite enregistrement humain.
- **Supademo :** similaire à Arcade, ajoute du AI voiceover sur démo humaine.
- **Guidde :** extension Chrome, capture humaine + AI voice.
- **Tango :** documentation pas-à-pas, pas de vidéo agentique.
- **Skill website-to-hyperframes :** fourni par HyperFrames, capture une URL et la transforme en vidéo, mais sans navigation authentifiée ni scénarios. DocuVid étend cette approche en y ajoutant la couche agentique de parcours utilisateur.

Aucun concurrent identifié ne propose à ce jour une démo entièrement générée par un agent IA autonome avec authentification et exploration de l'application, ce qui constitue le positionnement unique de DocuVid.