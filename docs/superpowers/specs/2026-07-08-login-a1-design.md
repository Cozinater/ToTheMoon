# ToTheMoon — Login (Option A1) Design

Replace the CloudFront HTTP Basic-auth popup with a themed in-app login page.
Single user, single password. The SPA shell (JS/CSS/index.html) becomes
publicly loadable; every `/api/*` route is gated by a session cookie, so all
financial data stays locked. No user accounts, no Cognito — that remains
Option B territory (out of scope here).

Builds on the merged main app (spec:
`docs/superpowers/specs/2026-07-07-tothemoon-design.md`). Everything below is
a delta against that system.

## Decisions log

| Decision | Choice |
|---|---|
| Variant | A1: public app shell, cookie-gated API (rejected A2: edge-served login page — 10 KB CloudFront Function limit makes it unmaintainable) |
| Session mechanism | Opaque static token in an `HttpOnly` cookie, compared at the CloudFront edge and in the Lambda (defense in depth) |
| Session lifetime | 30 days (`Max-Age=2592000`); no server-side session store |
| Credentials | One app password + one session token, both sensitive Terraform variables → Lambda env; token also templated into the CloudFront Function |
| Error codes | `BAD_PASSWORD` (wrong login attempt) vs `UNAUTHORIZED` (missing/invalid session) — distinct so the frontend can redirect on one and show inline error on the other, avoiding redirect loops |
| Brute force | Constant-time compare + fixed ~500 ms delay on failed login; strength comes from a long password |
| Local dev | Auth entirely off (env vars unset), exactly like today |
| Basic auth | Fully removed: variables, browser popup, `www-authenticate` response |
| Logout scope | Clears the cookie in that browser only; global revocation = rotate `session_token` in tfvars + redeploy |

## Auth flow

1. Browser loads the SPA freely (static assets are public; they contain no
   data and no secrets).
2. Any data fetch hits `/api/*`. The CloudFront Function checks the
   `ttm_session` cookie against the deploy-time token. Missing/wrong →
   `401 {"error":"UNAUTHORIZED","message":"Sign in required"}` (JSON, from
   the edge).
3. The frontend `api()` wrapper sees a 401 `UNAUTHORIZED` and redirects to
   `/login` (unless already there).
4. The login page POSTs `{ password }` to `/api/login` (exempt from the
   gate). The Lambda compares it to `APP_PASSWORD` in constant time. Success →
   `Set-Cookie: ttm_session=<SESSION_TOKEN>; …` and `200 { ok: true }`;
   failure → ~500 ms delay then `401 { error: "BAD_PASSWORD", … }` shown
   inline (no redirect).
5. The browser attaches the cookie automatically from then on; the SPA never
   reads or stores the token (`HttpOnly`).
6. Sign out (button in Settings) POSTs `/api/logout` (also exempt), which
   expires the cookie; the frontend clears the TanStack Query cache (drops
   financial data from memory) and navigates to `/login`.

## Cookie contract

```
Name:   ttm_session
Value:  SESSION_TOKEN — ≥ 32 bytes of randomness, base64url, generated once
        and stored in terraform.tfvars
Attrs:  HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000
Logout: same name, empty value, Max-Age=0
```

`SameSite=Strict` + same-origin-only API (no CORS headers exist) is the CSRF
story; no CSRF tokens needed.

## API additions (server)

### `POST /api/login`
```jsonc
// request
{ "password": "…" }
// 200 → { "ok": true }  + Set-Cookie (contract above)
// 401 → { "error": "BAD_PASSWORD", "message": "Wrong password" }   // after ~500 ms fixed delay
// 400 → { "error": "VALIDATION", … } for a malformed body
```
Comparison: `crypto.timingSafeEqual` over SHA-256 digests of the submitted
and expected passwords (equal-length buffers, constant time).

### `POST /api/logout`
```jsonc
// 200 → { "ok": true }  + expired cookie
```

### All other `/api/*` routes
When auth is configured and the cookie is missing/invalid:
`401 { "error": "UNAUTHORIZED", "message": "Sign in required" }` — same shape
whether the edge or the Lambda rejects it.

**Auth is "configured" when both `APP_PASSWORD` and `SESSION_TOKEN` env vars
are set.** When not configured (local dev): the gate middleware is off, and
`/api/login` returns `200 { ok: true }` without setting a cookie (harmless;
the frontend never lands on /login in dev because no 401s occur).

Middleware order in `createApp`: origin-secret check → session gate (exempts
`/api/login`, `/api/logout`) → routes. `AppDeps` gains
`auth?: { appPassword: string; sessionToken: string }`.

## Edge changes (infra)

`infra/basic-auth.js.tftpl` → renamed `infra/gate.js.tftpl`, still one
CloudFront Function attached to both behaviors:

- URI starts `/api/` and is not `/api/login` or `/api/logout`: require
  cookie `ttm_session === "${session_token}"`, else return the 401 JSON
  response above (`content-type: application/json`).
- Any other URI: SPA rewrite exactly as today (non-asset paths →
  `/index.html`). **No auth on the default behavior** — the shell is public.

The Basic-auth logic and `www-authenticate` header are deleted.

## Terraform changes

- `variables.tf`: remove `basic_auth_user`, `basic_auth_password`; add
  `app_password` and `session_token` (both `sensitive`).
- `terraform.tfvars.example`: updated to match, with a comment showing how to
  generate the token (`openssl rand -base64 32 | tr '+/' '-_'`).
- `lambda.tf`: env adds `APP_PASSWORD`, `SESSION_TOKEN`.
- `cloudfront.tf`: the templatefile call reads `gate.js.tftpl` and passes
  `session_token` instead of the basic-auth credential. The
  `aws_cloudfront_function` resource (already named `tothemoon-gate`) and its
  two behavior associations are otherwise unchanged.

## Frontend changes

- **New route `/login`** (`src/routes/login.tsx` + `features/auth/`): a
  centered dark card matching the app theme — rocket mark, "ToTheMoon"
  wordmark, single password field, submit with pending state ("Signing
  in…"), inline error on `BAD_PASSWORD`, Enter submits. On success:
  `router.navigate({ to: "/" })`.
- **Shell chrome hidden on /login**: `RootLayout` renders the bare
  `<Outlet/>` (inside `MotionConfig`) when the current path is `/login`;
  sidebar/bottom nav appear only for the five app routes.
- **`src/lib/api.ts`**: after an error response is parsed, if status is 401
  and code is `UNAUTHORIZED` and `location.pathname !== "/login"`, redirect
  to `/login`. `BAD_PASSWORD` is never redirected — it throws to the form.
- **Settings**: new "Session" card with a **Sign out** button → POST
  `/api/logout`, `queryClient.clear()`, navigate `/login`.

Data model, all existing screens, hooks, stores, market clients: untouched.

## Security properties & accepted limitations

- Token and password exist only server-side (Lambda env / CF Function config
  / tfvars). The cookie is `HttpOnly` — page JS can never read it.
- The app shell is publicly visible (component structure, no data). Accepted
  A1 trade-off.
- One static shared session: no per-device revocation, no server-side
  expiry, no idle timeout. Log-out-everywhere = rotate `session_token` +
  `./scripts/deploy.sh`. Password change = edit tfvars + redeploy.
- Direct-to-Lambda requests still require the origin secret AND (new) the
  session cookie for data routes.

## Testing

- `server/app.test.ts` additions: login success sets the exact cookie
  attributes; wrong password → 401 `BAD_PASSWORD` (and takes ≥ the delay);
  data routes without cookie → 401 `UNAUTHORIZED` when auth configured;
  exemptions work (login/logout callable without cookie); auth off when not
  configured (existing tests keep passing unchanged).
- CF Function logic is mirrored by the Lambda middleware, so the same tests
  cover the contract; the function itself is verified in the post-deploy
  checklist.
- Manual: full flow in browser post-deploy (see acceptance criteria).

## Acceptance criteria

1. Visiting the deployed URL shows the themed login page — no browser
   Basic-auth popup anywhere, on any route.
2. Wrong password → inline "Wrong password" on the form; no redirect loop.
3. Correct password → Dashboard loads with data; cookie present with
   `HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`.
4. Without the cookie, every `/api/*` route except login/logout returns
   401 `UNAUTHORIZED` — both through CloudFront and direct to the Function
   URL (with origin secret).
5. Sign out returns to `/login`; subsequent API calls 401; cached data is
   gone from memory.
6. Session survives a browser restart (up to 30 days).
7. `npm run dev` locally requires no login and shows no login page.
8. No password/token appears in the built frontend bundle (grep-verified).
9. Deep links still work: an authenticated user opening `/history` directly
   gets the History screen; an unauthenticated one lands on `/login`.

## Out of scope (Option B territory)

Multiple users, per-user data, password reset/change UI, MFA, session
expiry/refresh, per-device revocation, login rate-limit persistence.

## Deploy note

This replaces the edge gate in one `terraform apply`: the moment it lands,
Basic-auth credentials stop working and the app password is the only way in.
Rollback = revert the commit and re-apply.
