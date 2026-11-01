# Matches the variables infra/create.sh writes into demo.tfvars — the same
# AWS_REGION/AWS_ACCOUNT_ID/APP/ENV/VER contract as infra/serverless.

variable "AWS_REGION" {
  description = "AWS region for the cluster"
  type        = string
}

variable "AWS_ACCOUNT_ID" {
  description = "AWS account ID (used in ECR image URLs output)"
  type        = string
}

variable "APP" {
  description = "Application name (state bucket + resource naming prefix)"
  type        = string
  default     = "demo"
}

variable "ENV" {
  description = "Environment (terraform workspace name)"
  type        = string
  default     = "dev"
}

variable "VER" {
  description = "Version tag baked into resource tags"
  type        = string
  default     = "1.0.0"
}

# EKS-specific knobs

variable "cluster_version" {
  description = "Kubernetes version for the EKS control plane"
  type        = string
  default     = "1.31"
}

variable "namespace" {
  description = "Kubernetes namespace the app services run in (must match infra/eks/k8s/namespace.yaml and the Fargate profile selector)"
  type        = string
  default     = "demo-microservices"
}
