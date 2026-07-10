output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "nameservers" {
  description = "Set these four as Custom DNS nameservers at Namecheap"
  value       = aws_route53_zone.main.name_servers
}
