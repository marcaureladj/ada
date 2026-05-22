# Contributing to ADA

Thanks for your interest in ADA! This document explains how to set up your
environment, how the project is organized, and how to propose changes.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Chromium for Playwright (only needed for end-to-end runs; not required for tests):

  ```bash
  pnpm playwright:install
  ```

- Optional API keys (only needed for non-mock runs):
  - `ANTHROPIC_API_KEY` — Claude (vision + text)
  - `OPENAI_API_KEY` — GPT-4o text / OpenAI TTS
  - `ELEVENLABS_API_KEY` — ElevenLabs TTS

## Project layout

```
packages/
├── core/        @ada/core      — types, schemas, pipeline, modules
├── providers/   @ada/providers — vision / text / TTS adapters
├── templates/   @ada/templates — HyperFrames templates (classic/framed/split/social)
├── cli/         ada            — CLI (Commander.js)
└── skill/       @ada/skill     — agent skill (SKILL.md + manifest)
```

The cahier des charges lives in [`cdc-docuvid-v2.md`](./cdc-docuvid-v2.md).

## Local workflow

```bash
pnpm install                # install + activate git hooks
pnpm -r build               # compile all packages
pnpm typecheck              # tsc -b --noEmit
pnpm lint                   # oxlint
pnpm test                   # node --test, all packages
ADA_MOCK=1 pnpm cli plan --url https://example.com  # no API keys needed
```

## Mock-first development

`ADA_MOCK=1` forces all providers (vision, text, TTS) to in-memory mocks.
The whole pipeline runs end-to-end without network or API costs. Most tests
use the inline mocks directly. **Please add tests before touching the agent
loop.**

## Proposing changes

1. Open an issue first for any non-trivial change, especially anything that
   changes the public surface (`ada` CLI flags, `RunReport` shape, provider
   interfaces).
2. Fork → branch (`feat/your-feature`, `fix/your-bug`).
3. Make your change, add tests, run the full local workflow above.
4. Add a changeset:

   ```bash
   pnpm changeset
   ```

   Pick the affected packages and the bump level (`patch` / `minor` / `major`).
5. Open a PR. CI runs build/typecheck/lint/test on Linux, macOS, Windows.

## Conventional commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(navigator): support drag actions
fix(voicer): handle empty MP3 buffer
docs(readme): clarify ADA_MOCK usage
chore(deps): bump openai to 4.74
```

This isn't enforced by a hook (yet), but it makes the changelog cleaner.

## Security

If you find a vulnerability — especially anything related to credentials
leaking into LLM context — please see [SECURITY.md](./SECURITY.md). Do not
open a public issue.

## Code of conduct

We follow the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). Be kind.

## License

By contributing, you agree that your contributions are licensed under the
Apache License 2.0 (see [`LICENSE`](./LICENSE)).
