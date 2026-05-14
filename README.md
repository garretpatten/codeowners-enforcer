<!-- markdownlint-disable-file MD033 MD041 -->
<div align="center">

<img src="assets/logo.svg" width="88" height="88" alt="Codeowner Verifier logo"/>

# Codeowner Verifier

**Verify that every changed file has an effective owner before merge.**

<sub>GitHub Action · <code>.github/CODEOWNERS</code> · pull requests &amp; pushes</sub>

<br/>

[![GitHub Actions](https://img.shields.io/badge/GitHub-Action-2088FF?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/garretpatten/codeowner-verifier)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Codeowner_Verifier-6f42c1?style=flat-square&logo=github)](https://github.com/marketplace/actions/codeowner-verifier)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![Issues](https://img.shields.io/github/issues/garretpatten/codeowner-verifier?style=flat-square)](https://github.com/garretpatten/codeowner-verifier/issues)
[![License MIT](https://img.shields.io/github/license/garretpatten/codeowner-verifier?style=flat-square)](https://github.com/garretpatten/codeowner-verifier/blob/main/LICENSE)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/garretpatten/codeowner-verifier/badge)](https://api.securityscorecards.dev/viewer/?uri=github.com/garretpatten/codeowner-verifier)
[![Release](https://img.shields.io/github/v/release/garretpatten/codeowner-verifier?style=flat-square)](https://github.com/garretpatten/codeowner-verifier/releases)

</div>

---

A GitHub Action that checks whether every **changed** file in a pull request or push has an effective owner according to `.github/CODEOWNERS`. Matching follows [GitHub’s CODEOWNERS rules](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) (gitignore-style patterns, root-anchored paths with a leading `/`, and **last matching pattern wins**—including lines that list a path with no owners).

The runtime entrypoint is the bundled `dist/index.js`, built with [`ncc`](https://github.com/vercel/ncc) from TypeScript sources under `src/`.

## Why this action

GitHub can require reviews from code owners, but that is separate from proving—inside your own workflow—that every path in a diff resolves to an owner line under the same rules GitHub documents. This action runs that check using only the file lists you pass in, so the **verifier step** does not call the GitHub API and does not need `GITHUB_TOKEN` in its `with:` mapping—handy for **containers and minimal runners** once another step has produced the path lists.

## GitHub Marketplace

**[Codeowner Verifier on the GitHub Marketplace](https://github.com/marketplace/actions/codeowner-verifier)** — the listing uses this repository’s root **README** and **`action.yml`**. To publish or update a public action, follow [Publishing actions in the GitHub Marketplace](https://docs.github.com/en/actions/creating-actions/publishing-actions-in-github-marketplace) and keep [release tags](./CONTRIBUTING.md#releases-and-the-github-marketplace) in sync with the `dist/` bundle when `src/` changes.

## Table of Contents

- [Why this action](#why-this-action)
- [GitHub Marketplace](#github-marketplace)
- [Usage](#usage)
  - [Pinning versions](#pinning-versions)
  - [Minimal workflow example](#minimal-workflow-example)
  - [Limits](#limits)
- [Action inputs](#action-inputs)
  - [changedFiles](#changedfiles)
  - [deletedFiles](#deletedfiles)
- [Action outputs](#action-outputs)
- [Supporting files](#supporting-files)
  - [.codeownersignore](#codeownersignore)
- [Development](#development)
- [Maintainers](#maintainers)
- [Code of Conduct](#code-of-conduct)
- [Contributing](#contributing)
- [License](#license)

## Usage

This action is intended for public and private repositories. Add a workflow under `.github/workflows/`. This repository ships a full PR workflow in [`.github/workflows/codeowner-verifier.yaml`](.github/workflows/codeowner-verifier.yaml) (Alpine container, diff-based file lists, PR comments on failure, and safe handling of oversized inputs).

### Pinning versions

Prefer a **release tag** (for example `@v2`) or a **full commit SHA** for supply-chain stability. Branch pins such as `@main` are convenient for trying the latest commit but can change without notice. The example workflow in this repo pins **`@v2`**.

### Minimal workflow example

```yaml
jobs:
  codeowners:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Lists for this action
        id: lists
        run: |
          echo "changed=$(git diff --name-only HEAD^ HEAD | tr '\n' ' ')" >> "$GITHUB_OUTPUT"
          echo "deleted=$(git diff --name-only --diff-filter=D HEAD^ HEAD | tr '\n' ' ')" >> "$GITHUB_OUTPUT"
      - uses: garretpatten/codeowner-verifier@v2
        with:
          changedFiles: ${{ steps.lists.outputs.changed }}
          deletedFiles: ${{ steps.lists.outputs.deleted }}
```

Adjust how you compute `changedFiles` and `deletedFiles` for your trigger (for example `pull_request` against the merge base); the in-repo example uses `origin/$GITHUB_BASE_REF` for pull requests.

### Limits

`changedFiles` and `deletedFiles` are passed through the runner as **environment variables**. If the combined UTF-8 size of both inputs is very large (default cap **100,000 bytes** in this action), verification is **skipped** with a warning and optional outputs `skipped` / `skipReason`, because oversized env payloads can exceed OS limits on environment or argument size (`ARG_MAX` / `execve`) and cause errors such as **Argument list too long** when starting Docker or the action process.

The example workflow measures list size first: if it would exceed the cap, it **does not** invoke the action with that payload, posts an explanatory PR comment, and the job **succeeds** (so CI is not blocked by runner limits). Split very large PRs or run CODEOWNERS checks locally when needed.

### Action inputs

#### changedFiles

Required. A **space-delimited** list of repository-relative paths for added or modified files. The example workflow builds this list with `git diff`.

#### deletedFiles

Required. A **space-delimited** list of repository-relative paths for deleted or moved files (for example from `git diff --diff-filter=D`). Paths listed here are not reported as missing ownership.

This action does **not** call the GitHub API and does not require `secrets.GITHUB_TOKEN` or any other token in `with:`—only the path lists above.

## Action outputs

| Output         | When it is set                                                           | Meaning                                                                                                                    |
| -------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `unownedFiles` | Same as `errorMessage`                                                   | Newline-separated paths with no effective owner—stable for workflow comments and scripting. Empty when the check passes.   |
| `errorMessage` | Step **failed** because at least one changed file has no effective owner | Human-readable list of paths to fix in `.github/CODEOWNERS` (or `.github/.codeownersignore`). Empty when the check passes. |
| `skipped`      | Inputs exceeded the [size limit](#limits)                                | Set to the string `true`; the step succeeds without verifying.                                                             |
| `skipReason`   | Same as `skipped`                                                        | Explains why verification was skipped.                                                                                     |

Downstream steps can branch on `steps.<id>.outputs.skipped` or inspect `unownedFiles` / `errorMessage` when using `continue-on-error: true` (as in the bundled example workflow).

## Supporting files

### .codeownersignore

Optional. Patterns use the same gitignore-style semantics as CODEOWNERS (via the [`ignore`](https://www.npmjs.com/package/ignore) package). Put the file at **`.github/.codeownersignore`** (preferred) or **`.codeownersignore`** at the repository root (legacy). One pattern per line; `#` starts a comment; inline comments after a space and `#` are stripped.

## Development

- **Requirements:** Node.js and npm (npm **11+** recommended so `.npmrc` [`min-release-age`](https://docs.npmjs.com/cli/v11/using-npm/config#min-release-age) applies during installs).
- Install: `npm ci`
- Check types: `npm run typecheck`
- Test: `npm test`
- Bundle for the action: `npm run build` (writes `dist/index.js`)
- **CI:** Pull requests run [Security Checks](https://github.com/garretpatten/security-checks) (Semgrep, TruffleHog, etc.) and [Quality Checks](https://github.com/garretpatten/quality-checks) (Prettier, Markdownlint, Yamllint) via `.github/workflows/security-checks.yaml` and `.github/workflows/quality-checks.yaml`. Local parity: `.prettierignore` excludes `dist/` and `node_modules/`; run `npm run lint:prettier`, `npm run lint:md`, and `npm run lint:yaml` (requires [`yamllint`](https://github.com/adrienverge/yamllint) on your PATH).

## Maintainers

[@garretpatten](https://www.github.com/garretpatten)

_For questions, bug reports, or feature requests, please open an issue on this repository or contact the maintainer directly._

## Code of Conduct

Short community rules and how to report problems: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Everyone who participates is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

This project is licensed under the [MIT License](./LICENSE).
