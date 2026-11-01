provider "aws" {
  # Credentials come from the standard AWS chain (env vars, ~/.aws, SSO, instance profile)
  region = var.AWS_REGION
}

