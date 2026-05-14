# Contributing Guide

Everyone who participates in this project—issues, pull requests, discussions, or reviews—is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Creating a GitHub Issue

Use GitHub Issues to report bugs and request features.

1. Open **Issues → New issue** and choose **Bug Report** or **Feature Request** (forms under `.github/ISSUE_TEMPLATE/`).
2. If the problem appeared in CI, link the workflow run URL and note how you pinned the action (for example `@v2` or a full commit SHA).
3. Include sample paths or CODEOWNERS snippets only if they are safe to share (redact secrets and private repo details).
4. Submit the issue.

## Resolving a GitHub Issue

1. Assign the GitHub Issue to yourself.
2. Clone the `codeowner-verifier` repository and create a new branch named `issueX` where X is the Issue number.
3. Resolve the Issue in your local branch.
4. Once the intended changes have been made locally, ensure that the `node_modules` are up to date and run `npm test` and `npm run build` when TypeScript sources under `src/` change (`npm run build` bundles `src/action.ts` with `ncc` into `dist/index.js`).
5. Push the local changes (including any updates to `dist/index.js` when the bundle changed) up to a remote branch by the same name and open a Pull Request against the `main` branch (please explain the changes in the Pull Request template and follow the Checklist items); relevant code owners will be requested for review.

## Releases and the GitHub Marketplace

This action is consumed from the repository (and the Marketplace listing, if enabled). When you cut a release:

- Tag a [semantic version](https://semver.org/) (for example `v2.1.0`) and move a floating major tag (`v2`) if you follow that convention, so workflows pinned to `@v2` pick up compatible fixes.
- If you change TypeScript under `src/`, run `npm run build` and commit the updated `dist/index.js` before tagging.
- Confirm `action.yml` metadata (name, description, inputs, outputs, branding) still matches the README for anyone browsing the Marketplace.
