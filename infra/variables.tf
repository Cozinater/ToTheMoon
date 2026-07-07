variable "app_password" {
  description = "The single password the login page accepts"
  type        = string
  sensitive   = true
}

variable "session_token" {
  description = "Opaque session-cookie value; generate with: openssl rand -base64 32 | tr '+/' '-_'"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[A-Za-z0-9=_-]+$", var.session_token))
    error_message = "session_token must contain only A-Z, a-z, 0-9, '-', '_' or '=' (no quotes/backslashes — they would break the CloudFront Function template)."
  }
}

variable "origin_secret" {
  description = "Shared secret CloudFront injects so the Lambda URL can't be hit directly"
  type        = string
  sensitive   = true
}

variable "twelve_data_api_key" {
  type      = string
  sensitive = true
}
