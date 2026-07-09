variable "app_password" {
  description = "The single password the login page accepts"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.app_password) >= 12
    error_message = "app_password must be at least 12 characters."
  }
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

variable "budget_alert_email" {
  description = "Email that receives AWS spend alerts for this app"
  type        = string

  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+\\.[^@ ]+$", var.budget_alert_email))
    error_message = "budget_alert_email must be a valid email address."
  }
}
