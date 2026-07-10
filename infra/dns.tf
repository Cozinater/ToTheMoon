# Public hosted zone for the domain, hosted in this app account. Namecheap's
# nameservers are pointed here (see the `nameservers` output). The app record
# and cert-validation record are added in Task 2, once delegation is live.
resource "aws_route53_zone" "main" {
  name = var.root_domain
}

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
