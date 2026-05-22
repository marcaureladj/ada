# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in ADA, **please do not open a public
issue**. Instead, use GitHub's private advisory mechanism:

<https://github.com/marcaureladj/ada/security/advisories/new>

Include:
- A description of the issue and its impact.
- Steps to reproduce (sanitized — never include real credentials).
- The version of ADA affected.
- Any mitigation you've already attempted.

You should expect an acknowledgement within 5 business days.

## Scope of concern

ADA handles **screenshots, credentials, and LLM context** — three categories
where leaks are particularly damaging. The most sensitive code paths are:

- [`packages/core/src/modules/auth.ts`](./packages/core/src/modules/auth.ts):
  fills login forms via Playwright. The audit log MUST NOT contain plaintext
  passwords. This is covered by a canary test
  (see [`auth.test.ts`](./packages/core/src/modules/auth.test.ts)).
- [`packages/core/src/modules/screenshot-redactor.ts`](./packages/core/src/modules/screenshot-redactor.ts):
  masks `input[type=password]` (and `ADA_MASK_SELECTORS`) before screenshots
  are sent to the vision LLM. Bugs here could leak the value of the masked
  field into the Claude / OpenAI prompt.
- [`packages/core/src/workdir.ts`](./packages/core/src/workdir.ts):
  `auth-state.json` is written next to the run output. The `.gitignore`
  covers `out/`, but users should still treat any run directory as sensitive
  (it may contain cookies for an authenticated session).

If you can demonstrate a leak in any of these, please report it privately.

## Supported versions

Until ADA reaches 1.0, only the latest published `0.x` minor receives
security fixes. After 1.0, the previous minor will be supported for ~6 months
in parallel with the latest.

## Out of scope

- Bugs in upstream dependencies (Playwright, Anthropic SDK, OpenAI SDK,
  HyperFrames) — please report those to their respective maintainers.
- DoS via crafted `ada.yaml` that makes the agent loop forever — `maxIterations`
  is documented as a guardrail, not a security boundary.
