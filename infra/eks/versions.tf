terraform {
  required_version = ">= 1.3.9"

  # S3 backend is injected at runtime by infra/create.sh (backend.hcl with
  # bucket = aws-s3-bucket-state-$APP, key = eks/terraform.tfstate). CI runs
  # `terraform init -backend=false` so this block is inert there.
  backend "s3" {}

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # Raised from the repo baseline (>= 5.0) because the EKS module 21.x
      # requires >= 5.70 — and to the 6.x floor because provider 6.0 renamed
      # aws_eks_access_entry's `username` argument to `user_name`, and this
      # stack uses the 6.x spelling (would fail schema validation on 5.x).
      version = ">= 6.0.0"
    }
  }
}

provider "aws" {
  region = var.AWS_REGION
}
