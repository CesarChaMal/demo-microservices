output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks.cluster_id
}

output "cluster_endpoint" {
  description = "API server endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_oidc_issuer_url" {
  description = "OIDC issuer URL — needed to set up IRSA when a service needs AWS APIs (none do today)"
  value       = module.eks.cluster_oidc_issuer_url
}

output "region" {
  description = "AWS region the cluster lives in"
  value       = var.AWS_REGION
}

output "namespace" {
  description = "Kubernetes namespace the demo services deploy into"
  value       = var.namespace
}

output "ecr_repository_urls" {
  description = "ECR image URLs keyed by service — the image: values in infra/eks/k8s/*.yaml after rendering"
  value       = { for name, repo in aws_ecr_repository.services : name => repo.repository_url }
}

output "configure_kubectl" {
  description = "Run this to point kubectl at the cluster"
  value       = "aws eks update-kubeconfig --region ${var.AWS_REGION} --name ${module.eks.cluster_name}"
}

output "deploy_manifests" {
  description = "Apply the k8s manifests after building+pushing images (ACCOUNT/REGION/APP/TAG are substituted by scripts/render-k8s.sh)"
  value       = "AWS_ACCOUNT_ID=${var.AWS_ACCOUNT_ID} AWS_REGION=${var.AWS_REGION} APP=${var.APP} TAG=${var.VER} ./scripts/render-k8s.sh | kubectl apply -f -"
}
