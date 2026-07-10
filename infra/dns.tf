# Public hosted zone for the domain, hosted in this app account. Namecheap's
# nameservers are pointed here (see the `nameservers` output). The app record
# and cert-validation record are added in Task 2, once delegation is live.
resource "aws_route53_zone" "main" {
  name = var.root_domain
}
