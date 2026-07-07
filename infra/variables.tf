variable "basic_auth_user" {
  type      = string
  sensitive = true
}

variable "basic_auth_password" {
  type      = string
  sensitive = true
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
