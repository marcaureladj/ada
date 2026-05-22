# ADA Integration Suite

End-to-end tests on the 5 reference open-source apps from CDC §6.2 :
Cal.com, Plane, Documenso, Twenty, Formbricks.

The goal is to measure the **pass rate** of `ada run` on real authenticated
SaaS — the v1.0 target is ≥ 80 %.

## Trois modes

| Mode | Coût | Network | Description |
|---|---|---|---|
| `plan-only` | ~$0.05 | LLM only | Lance seulement `ada plan` pour vérifier que chaque scénario est planifiable. CI-able. |
| `mock` | $0 | none | Lance le pipeline complet avec `ADA_MOCK=1`. Aucun appel réseau, aucune clé. CI-able. |
| `full` | $5-10 | LLM + Playwright + apps | Vraie exécution. Génère 5 MP4. À déclencher manuellement. |

## Lancer la suite

```bash
# Plan-only (CI-able, ~5 s, ~$0.05)
ANTHROPIC_API_KEY=sk-ant-... pnpm integration:plan

# Mock (CI-able, ~30 s, $0)
pnpm integration:mock

# Full (manuel uniquement)
# Requiert toutes les clés API + comptes de test sur les 5 apps :
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
ELEVENLABS_API_KEY=...
ADA_CALCOM_EMAIL=...
ADA_CALCOM_PASSWORD=...
ADA_PLANE_EMAIL=...
ADA_PLANE_PASSWORD=...
ADA_DOCUMENSO_EMAIL=...
ADA_DOCUMENSO_PASSWORD=...
ADA_TWENTY_EMAIL=...
ADA_TWENTY_PASSWORD=...
ADA_FORMBRICKS_EMAIL=...
ADA_FORMBRICKS_PASSWORD=...

pnpm integration:full
```

## Lecture du rapport

```bash
pnpm integration:aggregate
```

Génère `tests/integration/README-RESULTS.md` avec :
- Statut + durée + coût par app et par mode
- Historique des 10 derniers runs
- Indicateur "cible CDC ≥ 80 % atteinte"

## Options

| Variable / flag | Effet |
|---|---|
| `ADA_FAIL_FAST=1` | Stoppe la suite au premier échec |
| `ADA_RUN_DELAY_MS=5000` | Cooldown entre apps (défaut 2000ms) |
| `--mode=plan-only/mock/full` | Choisit le mode |
| `--delay=<ms>` | Idem que la variable d'env |

## Quand les fixtures cassent

Les UIs des 5 apps évoluent ; les fixtures doivent être révisées
**trimestriellement**. Symptômes :

- `auth: champ password introuvable` → le formulaire de login a changé. Ajoute
  `ADA_AUTH_PASSWORD_SELECTOR` à l'env ou édite la fixture.
- `navigator: timeout scène` → l'app a renommé un bouton. Vérifier le scénario
  dans la fixture YAML et reformuler la description.
- `CAPTCHA détecté` → l'app a ajouté reCAPTCHA. Hors scope v1 ; documenter et
  basculer sur instance self-hosted Docker pour ce test.

## Self-host alternatives

Pour stabiliser les tests, les 5 apps sont aussi disponibles en Docker. Voir
leur doc respective. Override l'URL dans la fixture YAML quand tu pointes vers
une instance locale (`http://localhost:3000` typiquement).
