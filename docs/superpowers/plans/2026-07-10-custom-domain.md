# Custom Domain (networth.cozinater.com) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the deployed app on `https://networth.cozinater.com` — DNS hosted in a Route 53 zone in the app account, registration staying at Namecheap.

**Architecture:** Two Terraform tasks matching a mandatory two-phase rollout: (1) create the Route 53 hosted zone so Namecheap can be delegated to it; (2) after delegation is live, add the ACM cert (us-east-1, DNS-validated) and point CloudFront at the domain. Spec: `docs/superpowers/specs/2026-07-10-custom-domain-design.md`.

**Tech Stack:** Terraform (aws provider, existing `infra/`), Route 53, ACM, CloudFront. No app code changes.

## Global Constraints

- Registrar stays **Namecheap**; only nameservers change. DNS host is a new Route 53 public hosted zone for `cozinater.com` in app account **536857670023**.
- App hostname: **`networth.cozinater.com`**. Root domain: **`cozinater.com`**. Apex and all other subdomains are OUT of scope.
- ACM cert MUST be in **us-east-1** (CloudFront requirement) — needs a second aws provider aliased to that region.
- CloudFront viewer cert: `ssl_support_method = "sni-only"`, `minimum_protocol_version = "TLSv1.2_2021"`. Never dedicated-IP SSL.
- App record is a Route 53 **alias A** record → the CloudFront distribution (free alias queries).
- **Two-phase ordering is mandatory:** the ACM DNS validation only succeeds once Route 53 is authoritative (Namecheap delegated). Task 2's `apply` must not run until Task 1's delegation is confirmed via `dig`.
- **Raymond runs all `terraform apply` commands and the Namecheap change himself.** The implementer writes config and runs read-only `terraform validate` only; `apply` steps are marked "RAYMOND RUNS THIS".
- Environment for any terraform/dig commands: prefix with `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"`.
- Existing deployment must keep working throughout: the default `*.cloudfront.net` URL stays functional; adding an alias does not remove it.
- Commit after each task with the message given.

---

## File structure (end state)

```
infra/providers.tf   MOD  — add aws provider alias "us_east_1" (us-east-1)
infra/variables.tf   MOD  — add root_domain, app_domain
infra/dns.tf         NEW  — aws_route53_zone.main (Task 1) + aws_route53_record.app alias (Task 2)
infra/acm.tf         NEW  — cert (us-east-1) + validation records + validation waiter (Task 2)
infra/cloudfront.tf  MOD  — aliases + ACM viewer_certificate (Task 2)
infra/outputs.tf     MOD  — nameservers (Task 1) + app_url (Task 2)
```

---

### Task 1: Route 53 hosted zone + nameserver output (Phase 1)

**Files:**
- Create: `infra/dns.tf`
- Modify: `infra/variables.tf`, `infra/outputs.tf`

**Interfaces:**
- Produces (used by Task 2): `aws_route53_zone.main` (attrs `.zone_id`, `.name_servers`), `var.root_domain`, `var.app_domain`, and the `nameservers` output.

- [ ] **Step 1: Add the domain variables**

Append to `infra/variables.tf`:

```hcl
variable "root_domain" {
  description = "Registered domain whose DNS is hosted in Route 53"
  type        = string
  default     = "cozinater.com"
}

variable "app_domain" {
  description = "Fully-qualified hostname the app is served on"
  type        = string
  default     = "networth.cozinater.com"
}
```

- [ ] **Step 2: Create the hosted zone**

Create `infra/dns.tf`:

```hcl
# Public hosted zone for the domain, hosted in this app account. Namecheap's
# nameservers are pointed here (see the `nameservers` output). The app record
# and cert-validation record are added in Task 2, once delegation is live.
resource "aws_route53_zone" "main" {
  name = var.root_domain
}
```

- [ ] **Step 3: Output the nameservers**

Append to `infra/outputs.tf`:

```hcl
output "nameservers" {
  description = "Set these four as Custom DNS nameservers at Namecheap"
  value       = aws_route53_zone.main.name_servers
}
```

- [ ] **Step 4: Validate + commit**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH" && terraform -chdir=infra fmt && terraform -chdir=infra validate`
Expected: `Success! The configuration is valid.`

```bash
git add infra/dns.tf infra/variables.tf infra/outputs.tf
git commit -m "feat: route53 hosted zone for cozinater.com"
```

- [ ] **Step 5: RAYMOND RUNS THIS — apply, delegate at Namecheap, verify**

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
terraform -chdir=infra apply          # Plan: 1 to add (the zone). Type yes.
terraform -chdir=infra output nameservers
```
Then in **Namecheap**: Domain List → Manage `cozinater.com` → Nameservers → choose **Custom DNS** → paste the four Route 53 nameservers (strip any trailing `.`) → save.

Verify delegation has propagated (re-run until it returns the `awsdns-*` servers, not the old parking NS — can take minutes to a couple of hours):
```bash
dig +short NS cozinater.com @8.8.8.8
```
Do NOT start Task 2's apply until this shows the AWS nameservers.

---

### Task 2: ACM certificate + CloudFront alias + app record (Phase 2)

**Files:**
- Create: `infra/acm.tf`
- Modify: `infra/providers.tf`, `infra/dns.tf`, `infra/cloudfront.tf`, `infra/outputs.tf`

**Interfaces:**
- Consumes: `aws_route53_zone.main`, `var.app_domain` (Task 1); existing `aws_cloudfront_distribution.main`.
- Produces: `aws_acm_certificate_validation.app.certificate_arn` (used in the CloudFront viewer cert), `aws_route53_record.app` (the live hostname), `app_url` output.

- [ ] **Step 1: Add the us-east-1 provider alias**

Append to `infra/providers.tf`:

```hcl
# CloudFront can only use ACM certs from us-east-1, regardless of the app region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
```

- [ ] **Step 2: Create the certificate + DNS validation**

Create `infra/acm.tf`:

```hcl
resource "aws_acm_certificate" "app" {
  provider          = aws.us_east_1
  domain_name       = var.app_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# One validation record per domain on the cert (just app_domain here).
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.app.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 300
}

# Blocks apply until ACM confirms the cert via the record above. This only
# succeeds once Namecheap is delegated to the zone (Task 1 verified via dig).
resource "aws_acm_certificate_validation" "app" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
```

- [ ] **Step 3: Add the app alias record**

Append to `infra/dns.tf`:

```hcl
# networth.cozinater.com → the CloudFront distribution (alias = free queries).
resource "aws_route53_record" "app" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.app_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
```

- [ ] **Step 4: Point CloudFront at the domain**

In `infra/cloudfront.tf`, add an `aliases` line inside `resource "aws_cloudfront_distribution" "main"` — right after `price_class`:

```hcl
  price_class         = "PriceClass_200" # includes Singapore
  aliases             = [var.app_domain]
```

Then replace the `viewer_certificate` block (currently the default-cert one) with:

```hcl
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.app.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
```

- [ ] **Step 5: Output the app URL**

Append to `infra/outputs.tf`:

```hcl
output "app_url" {
  value = "https://${var.app_domain}"
}
```

- [ ] **Step 6: Validate + commit**

Run: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:$PATH" && terraform -chdir=infra fmt && terraform -chdir=infra validate`
Expected: `Success! The configuration is valid.`

```bash
git add infra/acm.tf infra/providers.tf infra/dns.tf infra/cloudfront.tf infra/outputs.tf
git commit -m "feat: acm cert and cloudfront alias for networth.cozinater.com"
```

- [ ] **Step 7: RAYMOND RUNS THIS — apply (only after Task 1 delegation is live)**

Precondition: `dig +short NS cozinater.com @8.8.8.8` returns the AWS `awsdns-*` nameservers.

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
terraform -chdir=infra apply
```
Expect: cert + validation records created, the validation waiter completes (usually under a minute once delegation is live), the CloudFront distribution updates (a few minutes to redeploy), and the alias record is created. Type `yes`.

- [ ] **Step 8: Verify (controller runs these read-only checks)**

```bash
dig +short networth.cozinater.com @8.8.8.8      # → resolves to CloudFront
curl -sI https://networth.cozinater.com/         # → HTTP/2 200, valid TLS, no cert warning
curl -s https://networth.cozinater.com/api/draft -w ' [%{http_code}]'   # → 401 UNAUTHORIZED (gate works on new host)
```
Then a browser check: `https://networth.cozinater.com` shows a valid padlock, login with the app password works, dashboard loads.

---

## Plan self-review notes

- **Spec coverage:** Route 53 zone + Namecheap delegation (T1); ACM us-east-1 cert + DNS validation, CloudFront alias/SNI/TLS1.2_2021, alias A record, outputs (T2). Two-phase ordering enforced by the T1-delegation precondition on T2 Step 7. Cost (one hosted zone) and "no dedicated-IP SSL" honored. All 7 acceptance criteria map to T1 (crit 1) and T2 (crit 2–7).
- **Deliberate choices:** no automated tests — this is DNS/TLS infra, verified by `terraform validate` + the post-apply `dig`/`curl`/browser checks (unit tests would only test the mock). `apply` and the Namecheap edit are Raymond's per his stated preference; the implementer only writes config and validates.
- **Type/name consistency:** `aws_route53_zone.main`, `var.app_domain`/`var.root_domain`, `aws_acm_certificate_validation.app.certificate_arn`, `aws_route53_record.app`, and the `aws.us_east_1` provider alias are used identically across both tasks.
- **Idempotency:** after Task 2's apply, a re-apply should show no changes (criterion 6) — the cert validation and alias are stable once created.
