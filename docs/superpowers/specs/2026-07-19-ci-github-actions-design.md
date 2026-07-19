# ToTheMoon — CI with GitHub Actions Design

Run the project's checks automatically on every push so `main` always carries
a trustworthy green/red signal. Deployment is intentionally untouched: it
remains the manual `./scripts/deploy.sh`, run by Raymond from a green `main`.
The README's "CI/CD pipeline" mermaid diagram (committed 2026-07-19) is the
visual companion to this spec.

## Decisions log

| Decision | Choice |
|---|---|
| CI platform | GitHub Actions (repo already on GitHub; PR/commit checks native; free tier ~2,000 min/mo vs ~2 min/run here) |
| Alternatives rejected | AWS CodePipeline/CodeBuild (needs CodeConnections + IAM + extra wiring for PR checks, ~$1/mo; no benefit at this scale); third-party CI (another account for nothing) |
| Triggers | `on: [push, pull_request]` — every branch push, plus PRs |
| Checks | `npm run build` (tsc typecheck + vite build), `npm run build:lambda`, `npm test` — mirrors the build steps `deploy.sh` runs, so green CI ⇒ deploy's build phase can't fail |
| Lint | Excluded — `npm run lint` currently fails with ~36 pre-existing errors; becomes a gate in a future cleanup project |
| Deploy automation | None. Terraform state is local; Raymond deploys manually by preference |
| Node version | 22, pinned via a new `.nvmrc` (matches Lambda `nodejs22.x`); workflow reads it with `node-version-file` |
| Secrets | None required |
| Badge | CI status badge added at the top of `README.md` |

## Workflow

One new file, `.github/workflows/ci.yml`:

- **Trigger:** `push` (all branches) and `pull_request`. Duplicate runs only
  occur in the rare push-to-an-open-PR case; accepted for simplicity.
- **Concurrency:** group per ref with `cancel-in-progress: true`, so rapid
  successive pushes don't queue stale runs.
- **Job `ci`** on `ubuntu-latest`, `timeout-minutes: 10`:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` with `node-version-file: .nvmrc` and
     `cache: npm` (caches `~/.npm` keyed on `package-lock.json`)
  3. `npm ci`
  4. `npm run build` — `tsc -b` typecheck + Vite production build of the SPA
  5. `npm run build:lambda` — esbuild bundle of the Lambda API
  6. `npm test` — vitest (covers `shared/**`, `server/**`, and `src/**`)

Any failing step fails the run: red X on the commit/PR and a notification
email from GitHub. All steps green: green check.

## Supporting changes

- `.nvmrc` (new) containing `22` — single source of truth for the Node
  version in CI, and `nvm use` picks it up locally.
- `README.md` — status badge (`![CI](https://github.com/Cozinater/ToTheMoon/actions/workflows/ci.yml/badge.svg)`)
  under the title. (The CI/CD section already documents the workflow — no
  other README change.)

## Failure and edge behavior

- **Fork/no-secrets:** the workflow uses no secrets, so it runs identically
  anywhere the repo lands.
- **Flaky network during `npm ci`:** fails the run; re-run from the GitHub UI
  ("Re-run failed jobs"). No retry logic — YAGNI at this scale.
- **Free-tier exhaustion:** not realistic (~2 min/run vs 2,000 min/mo), so no
  minute-budget guard is added.

## Testing / verification

Workflow YAML can't be executed locally without extra tooling (act etc. — not
worth adding). Verification is against the real service:

1. Local: the three commands (`npm run build`, `npm run build:lambda`,
   `npm test`) pass at the commit that adds the workflow — proving the
   workflow's steps are green at introduction.
2. Push `main` to GitHub; confirm the run appears and completes green
   (`gh run watch` or the Actions tab).
3. The README badge renders "passing" once the first `main` run is green.

## Acceptance criteria

1. A push to any branch triggers exactly one CI run that installs with
   `npm ci` on Node 22 and runs build, build:lambda, and tests.
2. The first run on `main` is green.
3. A failing test or type error produces a red X on the commit (verified any
   time one naturally occurs; no deliberate red push required).
4. No AWS credentials or other secrets exist in the repo or the workflow.
5. `deploy.sh` and everything under `infra/` are unchanged.
6. README shows the CI badge; `.nvmrc` pins Node 22.

## Out of scope

Lint gate (blocked on the ~36-error cleanup), auto-deploy / CD (needs S3
terraform state + OIDC role — separate project), branch protection rules,
scheduled runs, dependabot, caching of Playwright or other browser tooling.
