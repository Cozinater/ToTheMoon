terraform {
  required_version = ">= 1.9"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = "ap-southeast-1"
}

# CloudFront can only use ACM certs from us-east-1, regardless of the app region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
