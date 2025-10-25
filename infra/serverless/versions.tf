terraform {
  required_version = ">= 1.3.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"        # or pin to "~> 5.50" if you want stricter control
    }
  }
}
