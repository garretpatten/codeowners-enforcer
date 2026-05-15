# Agent instructions

This repository is a GitHub Action (TypeScript → `ncc` bundle in `dist/`). Treat **[CONTRIBUTING.md](./CONTRIBUTING.md)** as the source of truth for releases and when to rebuild `dist/`.

## Before you finish a change

Do **not** consider work complete until local checks pass with **no errors**. Run everything below from the repository root (after `npm ci` if dependencies may be stale).

### Linters (required)

These mirror [.github/workflows/quality-checks.yaml](./.github/workflows/quality-checks.yaml) (`markdownlint`, Prettier, `yamllint`):

| Command                 | Purpose                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run lint:prettier` | Prettier (`prettier --check .`)                                                                                    |
| `npm run lint:md`       | Markdown ([markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2), config: `.markdownlint-cli2.yaml`) |
| `npm run lint:yaml`     | YAML ([yamllint](https://yamllint.readthedocs.io/), config: `.yamllint.yaml`)                                      |

If **`lint:yaml`** fails because `yamllint` is missing, install it for your environment (for example `pip install yamllint` or your OS package manager), then re-run.

**Fix failures instead of ignoring them** when practical:

- Prettier: `npx prettier --write .` (or fix only touched paths), then re-run `npm run lint:prettier`.
- Markdown/YAML: correct the files per rule messages; re-run until clean.

### TypeScript

| Command             | When                                                |
| ------------------- | --------------------------------------------------- |
| `npm run typecheck` | Whenever `src/`, `tsconfig.json`, or typings change |

### Tests

| Command    | When                                           |
| ---------- | ---------------------------------------------- |
| `npm test` | Whenever behavior under `src/` or tests change |

### Build artifact

| Command         | When                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run build` | Whenever TypeScript under `src/` changes—updates `dist/index.js`; commit the bundle per [CONTRIBUTING.md](./CONTRIBUTING.md). |

## Quick verification checklist

1. `npm run lint:prettier && npm run lint:md && npm run lint:yaml`
2. `npm run typecheck`
3. `npm test`
4. If `src/` changed: `npm run build` and include `dist/` updates if required by contributing guidelines

Resolve every failure before handing off or summarizing the task as done.
