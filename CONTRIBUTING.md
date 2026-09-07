# Contributing to Playground API

## 🛡️ Git Workflow & Branch Protection Rules

### 1. No Direct Push to `main`
- Direct commits and pushes to the `main` branch are strictly prohibited.
- All contributions must go through feature/fix branches and Pull Requests (PR).

### 2. Branch Naming Convention
- `feature/<feature-name>`: For new features
- `fix/<bug-name>`: For bug fixes
- `refactor/<refactor-name>`: For code improvements

### 3. Pull Request (PR) Requirements
- All PRs must have a clear description of the changes.
- All PRs must pass lint and build checks (`yarn test`).
- Requires at least 1 code review approval before merging into `main`.

### 4. Setting up GitHub Branch Protection (Repository Admin)
To enforce this rule on GitHub:
1. Go to repository **Settings** -> **Branches** (or **Rulesets**).
2. Add branch protection rule for `main`.
3. Check **Require a pull request before merging** (Require approvals).
4. Check **Do not allow bypassing the above settings**.
