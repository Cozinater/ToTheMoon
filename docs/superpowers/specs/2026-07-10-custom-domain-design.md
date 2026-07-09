# ToTheMoon — Custom Domain (networth.cozinater.com) Design

Put the deployed app on `https://networth.cozinater.com` instead of the
default `https://d4w6cwywknuay.cloudfront.net`. DNS hosting is centralised into
the app AWS account; domain registration stays at Namecheap.

Delta against the deployed stack (main design:
`docs/superpowers/specs/2026-07-07-tothemoon-design.md`; login:
`docs/superpowers/specs/2026-07-08-login-a1-design.md`).

## Context / findings (why this shape)

- The domain had **expired** and was parked (live NS were a registrar
  lander service; a wildcard sent every subdomain to one parking IP). It has
  now been **renewed**. Registrar is **Namecheap** (not GoDaddy, despite the
  initial assumption). There are **no records worth preserving** — no MX/email,
  no TXT — so this is a clean setup, not a migration.
- CloudFront + Lambda + the rest already live in app account **536857670023**,
  region `ap-southeast-1`.

## Model

- **Registration stays at Namecheap** (annual renewal there).
- **DNS hosting moves to a Route 53 public hosted zone for `cozinater.com` in
  the app account.** You point Namecheap's nameservers at that zone once; from
  then on all DNS for the domain is managed in Terraform in this account.
- Only `networth.cozinater.com` is configured. The apex and all other
  subdomains are out of scope.

## Decisions log

| Decision | Choice |
|---|---|
| Registrar | Stays Namecheap; only nameservers change |
| DNS host | New Route 53 public hosted zone `cozinater.com` in app account 536857670023 |
| Subdomain | `networth.cozinater.com` (apex left unconfigured) |
| TLS cert | ACM public cert, **us-east-1** (CloudFront requirement), DNS-validated via the Route 53 zone |
| CloudFront SSL | SNI-only, `minimum_protocol_version = TLSv1.2_2021` (never dedicated-IP) |
| App DNS record | Route 53 **alias** A record → CloudFront distribution (free alias queries) |
| Rollout | Two-phase apply (zone first → NS cutover → cert + alias) |
| Cost | +~$0.50/month (one hosted zone); cert free, alias queries free |

## Architecture (all Terraform, in `infra/`)

```
Namecheap (registrar)
  └─ nameservers → Route 53 hosted zone  cozinater.com   (app account)
        ├─ networth.cozinater.com  A ALIAS → CloudFront distribution
        └─ _<validation>.networth… CNAME   → ACM DNS validation
CloudFront distribution (existing)
  ├─ aliases += networth.cozinater.com
  └─ viewer_certificate → ACM cert (us-east-1, SNI, TLS1.2_2021)
ACM certificate  networth.cozinater.com   (us-east-1)
```

### New/changed files

- `infra/providers.tf` — add a second AWS provider aliased to `us-east-1`
  (`provider "aws" { alias = "us_east_1"  region = "us-east-1" }`). ACM certs
  for CloudFront must live in us-east-1; the rest of the stack stays
  ap-southeast-1.
- `infra/variables.tf` — add `app_domain` (default `"networth.cozinater.com"`)
  and `root_domain` (default `"cozinater.com"`).
- `infra/dns.tf` (new) — `aws_route53_zone.main` (`cozinater.com`) and the
  `aws_route53_record.app` alias A record to the CloudFront distribution.
- `infra/acm.tf` (new) — `aws_acm_certificate.app` (provider `aws.us_east_1`,
  `validation_method = "DNS"`), `aws_route53_record.cert_validation`
  (for_each over `domain_validation_options`), and
  `aws_acm_certificate_validation.app` (provider `aws.us_east_1`) that blocks
  until the cert is issued.
- `infra/cloudfront.tf` — add `aliases = [var.app_domain]`; replace the
  `viewer_certificate` block (currently `cloudfront_default_certificate = true`)
  with `acm_certificate_arn = aws_acm_certificate_validation.app.certificate_arn`,
  `ssl_support_method = "sni-only"`, `minimum_protocol_version = "TLSv1.2_2021"`.
- `infra/outputs.tf` — add `nameservers = aws_route53_zone.main.name_servers`
  and `app_url = "https://${var.app_domain}"`.

## Rollout — two-phase (ordering is mandatory)

The ACM cert validates by DNS, which only works once Route 53 is the
authoritative nameserver for the domain. So the zone must exist and Namecheap
must be delegated to it **before** the cert can validate.

**Phase 1 — create the zone, delegate at Namecheap.**
- Apply only the Route 53 hosted zone (the plan will scope this so the first
  apply creates just the zone).
- Read the 4 nameservers from the `nameservers` output.
- In Namecheap: Domain List → Manage → Nameservers → **Custom DNS** → paste the
  4 Route 53 nameservers (drop any trailing dots) → save.
- Wait for delegation to propagate; verify with
  `dig +short NS cozinater.com @8.8.8.8` returning the `awsdns` nameservers.

**Phase 2 — cert, CloudFront alias, app record.**
- Apply the ACM cert + validation records + `aws_acm_certificate_validation`
  (blocks until issued — succeeds once delegation is live), then the CloudFront
  alias/cert change and the Route 53 alias A record.
- `https://networth.cozinater.com` now serves the app; the login flow works
  identically to the CloudFront URL (same origin, same cookie — see note).

## Interaction with existing auth

- The session cookie is host-only and set by the server on whatever host the
  request arrives at, so it works unchanged on the new domain. No app code or
  cookie-domain changes are needed.
- The origin-secret and CloudFront-gate behaviour are unchanged; only the
  viewer-facing hostname and cert change.
- The default `*.cloudfront.net` URL keeps working after the alias is added
  (CloudFront serves both), so there is no hard cutover for the app itself.

## Cost

+~$0.50/month for the Route 53 hosted zone. ACM cert free; alias-record DNS
queries to CloudFront are free; SNI custom SSL is free. No change to the
existing ~$0 app footprint otherwise. (Namecheap registration renewal is a
separate, pre-existing cost.)

## Testing / verification (post-apply, manual — DNS + TLS can't be unit-tested)

1. `dig +short NS cozinater.com @8.8.8.8` → the four `awsdns-*` nameservers
   (confirms Phase 1 delegation).
2. `dig +short networth.cozinater.com @8.8.8.8` → resolves to CloudFront.
3. `curl -sI https://networth.cozinater.com/` → HTTP 200, valid TLS (no cert
   warning), served by CloudFront.
4. Auth ladder on the new host: `GET /api/draft` without cookie → 401
   `UNAUTHORIZED`; login with the password → 200 + cookie; `GET /api/draft`
   with cookie → 200.
5. Browser: open `https://networth.cozinater.com`, padlock valid, login works,
   dashboard loads.

## Acceptance criteria

1. `cozinater.com` is served by a Route 53 hosted zone in app account
   536857670023, delegated from Namecheap.
2. `https://networth.cozinater.com` loads the app over valid TLS with no
   certificate warning.
3. The ACM certificate is in us-east-1, covers `networth.cozinater.com`, and is
   DNS-validated (auto-renewing).
4. The full auth flow (gate, login, cookie, logout) works on the new host,
   unchanged.
5. The default `*.cloudfront.net` URL continues to work.
6. `terraform apply` is idempotent (a second apply shows no changes).
7. Added AWS cost is a single Route 53 hosted zone (~$0.50/mo); no dedicated-IP
   SSL.

## Out of scope

Apex `cozinater.com` content, `www`, email/MX, other subdomains, moving the
registration off Namecheap, IPv6/AAAA (distribution has IPv6 disabled),
redirecting the old CloudFront URL.
