# @ada/core

## 0.1.0

### Minor Changes

- 988fee3: Initial public release (v0.1.0).
  - 5-stage pipeline: Planner → Navigator → Scripter → Voicer → Composer.
  - Claude Computer Use officiel (`computer_20250124`) for the Navigator.
  - 2 text providers (Claude Sonnet, OpenAI GPT-4o) and 2 TTS providers (ElevenLabs, OpenAI TTS).
  - 4 HyperFrames templates: classic, framed, split, social, with automatic GSAP annotations.
  - Authentication module with credentials/signup heuristics and a screenshot redactor that masks `input[type=password]` before screenshots reach the vision LLM.
  - `ADA_MOCK=1` mode runs the whole pipeline without API keys.
  - 110 tests (unit + integration) via `node --test` + tsx.
