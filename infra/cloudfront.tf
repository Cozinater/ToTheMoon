resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "tothemoon-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "gate" {
  name    = "tothemoon-gate"
  runtime = "cloudfront-js-2.0"
  publish = true
  code = templatefile("${path.module}/gate.js.tftpl", {
    session_token = var.session_token
  })
}

locals {
  s3_origin_id  = "s3-site"
  api_origin_id = "lambda-api"
  # Function URL → bare domain (strip protocol and trailing slash)
  lambda_origin_domain = replace(replace(aws_lambda_function_url.api.function_url, "https://", ""), "/", "")

  # AWS managed policy IDs
  cache_optimized       = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  cache_disabled        = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  all_viewer_no_host    = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # includes Singapore

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.lambda_origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "x-origin-secret"
      value = var.origin_secret
    }
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.cache_optimized
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.gate.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_disabled
    origin_request_policy_id = local.all_viewer_no_host
    compress                 = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.gate.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
