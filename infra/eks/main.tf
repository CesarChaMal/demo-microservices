# EKS on Fargate — the maintained AWS compute path for the demo.
#
# Design notes (see infra/README.md for the compute decision table):
#   - Fargate only: no node groups to manage, pay per pod. EC2 managed nodes
#     are the documented last-resort switch, not the default.
#   - This stack manages CLOUD resources only. No kubernetes/helm providers —
#     k8s manifests are plain YAML in infra/eks/k8s/ applied by
#     .github/workflows/deploy.yml (or kubectl by hand). That keeps
#     `terraform init -backend=false && terraform validate` working in CI
#     without cluster credentials.
#   - vpc-cni / coredns / kube-proxy are the only addons needed on Fargate.
#     coredns needs compute_type = "Fargate" because there are no EC2 nodes.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.APP}-${var.ENV}"

  # The 7 services that ship container images (dirs with a Dockerfile).
  # Keep in sync with infra/eks/k8s/*.yaml and the CI docker-build matrix.
  service_repos = [
    "demo-eureka-server",
    "demo-gateway-service",
    "demo-java-service",
    "demo-node-service",
    "demo-python-service",
    "demo-go-service",
    "demo-dotnet-service",
  ]

  tags = {
    App     = var.APP
    Env     = var.ENV
    Ver     = var.VER
    Managed = "terraform"
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = "${local.name_prefix}-vpc"
  cidr = "10.0.0.0/16"

  # 2 AZs is enough for a demo and keeps the NAT bill down.
  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  # Single NAT gateway: demo-cost tradeoff (no cross-AZ HA on egress).
  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true

  tags = local.tags
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  # v21 of the module dropped the `cluster_` argument prefix:
  # name / kubernetes_version / endpoint_public_access / addons.
  name               = "${local.name_prefix}-cluster"
  kubernetes_version = var.cluster_version

  # Fargate pods (and the control plane ENIs) live in the private subnets.
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # DEMO convenience — kubectl works from anywhere. For anything real:
  # set endpoint_public_access = false and add authenticated admin CIDRs.
  endpoint_public_access                   = true
  enable_cluster_creator_admin_permissions = true

  addons = {
    vpc-cni = {
      most_recent = true
    }
    coredns = {
      most_recent = true
      # No EC2 nodes in this cluster — coredns must schedule on Fargate.
      # configuration_values is the raw AWS API JSON string.
      configuration_values = jsonencode({ compute_type = "Fargate" })
    }
    kube-proxy = {
      most_recent = true
    }
  }

  # Fargate profiles:
  #   core — kube-system (so coredns + metrics-server can run)
  #   apps — the namespace the demo services live in (var.namespace)
  fargate_profiles = {
    core = {
      name = "core"
      selectors = [
        { namespace = "kube-system" }
      ]
    }
    apps = {
      name = "apps"
      selectors = [
        { namespace = var.namespace }
      ]
    }
  }

  tags = local.tags
}

# CI access: .github/workflows/deploy.yml authenticates as the
# github-actions-demo-microservices-deploy IAM role (GitHub OIDC; the role,
# its trust policy and its ECR/EKS inline policy live in IAM, outside this
# stack — see infra/README.md). enable_cluster_creator_admin_permissions only
# admits whoever ran create_stack.sh locally, so without the entry below
# kubectl from CI gets 403 even though DescribeCluster succeeds.
data "aws_caller_identity" "current" {}

resource "aws_eks_access_entry" "github_actions_deploy" {
  cluster_name  = module.eks.cluster_name
  principal_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/github-actions-demo-microservices-deploy"
  username      = "github-actions"

  tags = local.tags
}

resource "aws_eks_access_policy_association" "github_actions_deploy" {
  cluster_name  = module.eks.cluster_name
  principal_arn = aws_eks_access_entry.github_actions_deploy.principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }
}
