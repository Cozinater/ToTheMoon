# GitHub Actions CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run build, Lambda bundle, and tests automatically on every push/PR via one GitHub Actions workflow, with a status badge in the README.

**Architecture:** A single workflow file (`.github/workflows/ci.yml`) that mirrors the build phase of `scripts/deploy.sh` plus the test suite. Node version is pinned once in `.nvmrc` and read by the workflow. No secrets, no deploy automation — deploys remain manual by design.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`), npm, Vite, esbuild, vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-ci-github-actions-design.md`

## Global Constraints

- `npm`/`node`/`npx` are NOT on PATH in non-interactive shells. Prefix every shell session with:
  `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"`
- Run all commands from the repo root.
- No secrets of any kind in the workflow or repo; `scripts/deploy.sh` and everything under `infra/` must be untouched.
- No new npm dependencies (workflow-linting tools included — verification happens against the real service).
- Workflow YAML must be exactly as specified in Task 1 (it was designed against the spec; do not add steps, matrix builds, or extra triggers).
- Commit messages: `feat: …`/`docs: …` lowercase, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `gh` CLI is NOT installed on this machine; the aws CLI is at `/usr/local/bin/aws` (irrelevant here). Live verification uses the GitHub web UI or unauthenticated REST API.

---

### Task 1: Workflow file, `.nvmrc`, and README badge

Everything ships together: the workflow is the deliverable, `.nvmrc` is its Node-version source, and the badge is its visible surface. There is no way to execute workflow YAML locally without adding tooling (spec: out of scope), so local verification = running the workflow's exact commands and confirming they're green at this commit; the live run is Task 2.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.nvmrc`
- Modify: `README.md:1-3` (badge under the title)

**Interfaces:**
- Consumes: `package.json` scripts `build`, `build:lambda`, `test` (already exist; do not modify them).
- Produces: workflow named `CI` with one job `ci` — Task 2 watches this exact workflow's first run; the badge URL references `ci.yml` by filename.

- [ ] **Step 1: Verify the three commands are green at this commit**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH"
npm run build && npm run build:lambda && npm test
```
Expected: build completes (`✓ built` / `Done`), `dist-server/lambda.zip ready`, and vitest reports all tests passed (79 at plan time; any higher count is fine — zero failures is the requirement). If anything fails, STOP and report BLOCKED — the workflow must not be introduced red.

- [ ] **Step 2: Create `.nvmrc`**

Create `.nvmrc` at the repo root containing exactly:

```
22
```

(One line. Matches the Lambda `nodejs22.x` runtime; `actions/setup-node` and local `nvm use` both read it.)

- [ ] **Step 3: Create the workflow**

Create `.github/workflows/ci.yml` with exactly:

```yaml
name: CI

on:
  push:
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run build:lambda
      - run: npm test
```

Notes for the implementer (do not add these as comments in the YAML):
- `on: push` with no branch filter = every branch; plus `pull_request`. A push to a branch with an open PR runs twice — accepted in the spec for simplicity.
- `concurrency` cancels a superseded run when the same ref is pushed again quickly.
- `cache: npm` caches `~/.npm` keyed on `package-lock.json` — safe with `npm ci`.

- [ ] **Step 4: Sanity-check the YAML parses**

Run (macOS system Ruby ships a YAML parser — no new dependency; verified present on this machine):
```bash
/usr/bin/ruby -ryaml -e 'doc = YAML.load_file(".github/workflows/ci.yml"); steps = doc.dig("jobs", "ci", "steps"); raise "unexpected shape" unless steps&.length == 6; puts "YAML OK — #{steps.length} steps"'
```
Expected: `YAML OK — 6 steps`. On any parse error or shape mismatch, fix the YAML against Step 3 — do NOT npm-install anything.

- [ ] **Step 5: Add the README badge**

In `README.md`, change the top from:

```markdown
# ToTheMoon

A React + TypeScript + Vite app.
```

to:

```markdown
# ToTheMoon

![CI](https://github.com/Cozinater/ToTheMoon/actions/workflows/ci.yml/badge.svg)

A React + TypeScript + Vite app.
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml .nvmrc README.md
git commit -m "feat: github actions ci — build, lambda bundle, tests on every push

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: First live run on GitHub

CI executes only on GitHub's side, so this task pushes `main` and confirms the first run is green. Pushing to `origin/main` is an outward-facing action: get Raymond's go-ahead (he may prefer to run `git push` himself — that's his stated pattern for deploys; pushing code is lighter, so asking once is enough).

**Files:** none (verification only).

**Interfaces:**
- Consumes: the `CI` workflow from Task 1, merged to `main`.
- Produces: a green first run; the README badge renders "passing".

- [ ] **Step 1: Ensure Task 1's commit is on `main`**

Run: `git log --oneline main -3`
Expected: the `feat: github actions ci …` commit is at or near the tip. If work happened on a branch/worktree, merge to `main` first (fast-forward preferred, matching this repo's linear history).

- [ ] **Step 2: Ask Raymond to push (or get his OK to push)**

Say: "CI workflow is on main. Push it with `git push`, or tell me to push for you." Do not push without that go-ahead.

- [ ] **Step 3: Watch the run**

`gh` is not installed. Options, in order:
1. Ask Raymond to open https://github.com/Cozinater/ToTheMoon/actions — the `CI` run for the pushed commit appears within seconds.
2. If the repo is public, poll without auth:
```bash
curl -s "https://api.github.com/repos/Cozinater/ToTheMoon/actions/runs?per_page=1" | head -40
```
Look for `"name": "CI"`, `"status"`, and `"conclusion"`. `"status": "completed"` + `"conclusion": "success"` = green. (A `404`/`Not Found` means the repo is private — rely on option 1.)

Expected: run completes green in ~2–3 minutes (first run has no npm cache; later runs are faster).

- [ ] **Step 4: Confirm the badge**

After the green run, the README badge on the repo home page shows "passing". (Badge images are cached by GitHub's camo proxy for a few minutes — a stale "no status" shortly after the first run is normal.)

- [ ] **Step 5: If the run is red**

Read the failing step's log in the Actions UI (Raymond can paste it). The three commands are green locally at the same commit (Task 1 Step 1), so a red run means an environment difference — most likely: `package-lock.json` out of sync with `package.json` (`npm ci` fails loudly; fix by running `npm install` locally and committing the lockfile), or a test that depends on local state (fix the test). Fix on `main`, push again, re-watch. Do NOT delete or disable the workflow to get to green.

---

## Acceptance check (maps to spec)

1. Push to any branch triggers exactly one CI run (npm ci on Node 22, build, build:lambda, test) — Task 1 YAML (`on: push` + setup-node with `.nvmrc`), observed in Task 2.
2. First `main` run green — Task 2 Step 3.
3. Red X on failure — behavior guaranteed by any failing step; no deliberate red push (spec AC 3).
4. No secrets — Task 1 YAML has none; nothing added anywhere.
5. `deploy.sh` / `infra/` untouched — no task modifies them.
6. README badge + `.nvmrc` — Task 1 Steps 2 and 5.
