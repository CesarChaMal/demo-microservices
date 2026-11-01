# Infrastructure (Terraform) — status and compute decisions

This directory holds every Terraform stack in the repo. Not all of them are maintained.
**Read this before touching anything under `infra/`.**

## Stack status

| Stack | Path | Status | Notes |
|-------|------|--------|-------|
| **Serverless (Lambda)** | `infra/serverless/` | ✅ **MAINTAINED** | The small-scale AWS compute path. Handler strings match the source files; deployment zips are built by `scripts/build-lambda-zips.sh` into `infra/serverless/artifacts/`. Deployed via `create_stack.sh serverless`. |
| **EKS** | `infra/eks/` | ✅ **MAINTAINED** | The primary AWS compute path: Fargate-only EKS (no nodes to manage), one ECR repo per service, k8s manifests in `infra/eks/k8s/`. Deployed via `create_stack.sh MODE=eks` + `.github/workflows/deploy.yml`. Start at [`eks/README.md`](eks/README.md). |
| **Root stack** | `infra/*.tf` (`env.tf`, `rds.tf`, `s3.tf`, …) | ⛔ **DEPRECATED — BROKEN** | Cannot even `terraform init`: `env.tf` sources `../modules/instances-provisioner`, a module directory that does not exist (the real module lives at `infra/modules/instances/`). Do not invest here; the EKS path replaces it. |
| **ECS (Docker)** | `infra/docker/` | ⛔ **DEPRECATED — BROKEN** | Legacy ECS/Fargate attempt. Multiple attributes are jammed onto single-line HCL blocks (see `ecs_stack.tf` resources and the two-attribute `variable` one-liners in `variables.tf`), which is invalid HCL — `terraform validate` fails. Superseded by the EKS path. |
| **Shared modules** | `infra/modules/` | 📦 Reference only | `instances/` and `vpc/` were consumed by the deprecated root stack. Kept for reference; not wired to any maintained stack. |

## Compute decision table

The repo's AWS story targets **interchangeable compute** — same services, three deployment
targets, chosen per workload:

| Compute | Role | Status in this repo |
|---------|------|---------------------|
| **EKS (Fargate)** | **Primary** — long-running services, autoscaling, the default production answer | `infra/eks/` (maintained) |
| **Lambda** | Small-scale / event-driven / cost-optimal sporadic workloads | `infra/serverless/` (maintained today) |
| **EC2** | Last resort — legacy workloads that cannot run on EKS or Lambda | Legacy root stack only (deprecated); not maintained |

The interchangeable-compute CI/CD pattern (same image pipeline able to target Lambda,
EKS or EC2) is being built first in a sibling project; this repo follows those
conventions as they land.

## CI scope

GitHub Actions (`.github/workflows/ci.yml`) runs `terraform fmt -check` and
`terraform validate -backend=false` on the maintained stacks: `infra/serverless/`
and `infra/eks/` (matrix job). It also renders `infra/eks/k8s/` with dummy values
(`scripts/render-k8s.sh`) and YAML-parses every object. The deprecated root stack
and `infra/docker/` are intentionally excluded — they are quarantined, and CI must
not be extended to validate stacks we do not maintain.

`.github/workflows/deploy.yml` is the EKS deploy pipeline (build + push all 7
images to ECR, apply the rendered manifests). It creates **no infrastructure
itself** — no cluster, no ECR repos, no VPC. It only pushes images and applies
in-cluster manifests to a cluster that already exists (created once, locally,
via `MODE=eks ./create_stack.sh`). The one cloud object it indirectly creates
is the gateway NLB, provisioned by AWS when the gateway's k8s `Service`
(type LoadBalancer) is first applied.

### GitHub Actions deploy identity (OIDC — no long-lived keys)

`deploy.yml` authenticates with temporary credentials obtained by exchanging
a GitHub OIDC token via `sts:AssumeRoleWithWebIdentity`. No AWS access key is
stored in GitHub — the repo's only secret is `AWS_DEPLOY_ROLE_ARN`.

Three account-level pieces make this work. They are **not part of any
Terraform stack** (deliberately: the OIDC provider must exist before CI can
ever run, and it is shared, not per-environment), so they were created once
directly in IAM and must be torn down by hand (commands below):

| Piece | Name | Notes |
|-------|------|-------|
| OIDC provider | `token.actions.githubusercontent.com` (clientID `sts.amazonaws.com`) | Account-level; reusable by any repo in this account |
| IAM role | `github-actions-demo-microservices-deploy` | Trust: `sub = repo:CesarChaMal/demo-microservices:*`, max session 1h |
| Inline policy | `demo-microservices-deploy-scoped` | `sts:GetCallerIdentity` + `eks:DescribeCluster/ListClusters` on `demo-dev-cluster` + `ecr:GetAuthorizationToken` + the ECR push set on `repository/demo-*` |

Inside the cluster, `infra/eks/main.tf` grants that role admin with an
`aws_eks_access_entry` + `AmazonEKSClusterAdminPolicy` association
(cluster scope). This is required: `enable_cluster_creator_admin_permissions`
only admits whoever ran `create_stack.sh` locally — without the access entry,
CI's kubectl gets 403 even though `DescribeCluster` succeeds.

**Tearing the identity down** (when the demo is retired — not needed for the
day-to-day `destroy-aws.sh` teardown, which only stops billing):

```bash
aws iam delete-role-policy --role-name github-actions-demo-microservices-deploy \
  --policy-name demo-microservices-deploy-scoped
aws iam delete-role --role-name github-actions-demo-microservices-deploy
aws iam delete-open-id-connect-provider \
  --open-id-connect-provider-arn "$(aws iam list-open-id-connect-providers \
    --query "OpenIDConnectProviderList[?ends_with(Arn, 'token.actions.githubusercontent.com')].Arn" \
    --output text)"
# then delete the AWS_DEPLOY_ROLE_ARN secret on GitHub (repo Settings → Secrets)
```

(The access entry is deleted with the cluster — it is part of the EKS stack.)

## Teardown / cost safety

Charges start only when you run `create_stack.sh` (EKS control plane ~$0.10/hr
+ pods + NAT + NLB — see `eks/README.md`). To stop them:

```bash
./scripts/destroy-aws.sh             # EKS stack (default) — the panic button
./scripts/destroy-aws.sh --mode all  # EKS + Lambda stacks
```

The wrapper derives the account ID via `aws sts get-caller-identity`, defaults
to `APP=demo ENV=dev`, and delegates to `destroy_stack.sh` → `infra/destroy.sh`
(the tested path: k8s resources deleted first so the NLB is released *inside*
the cluster before terraform destroys the VPC). If the VPC destroy hangs on
leftover ENIs, re-run the script — it is idempotent.

## Security notes (names only — never commit these files)

- `infra/terraform.tfvars` — contains plaintext AWS credentials. Gitignored
  (`**/*.tfvars`). Keep it that way.
- `infra/mykey` — an OpenSSH private key. Gitignored (`**/mykey*`). Never commit,
  never copy into images or artifacts.
- `infra/app.tfvars` — **git-tracked** and contains a real AWS account ID.
  Replacing it with a placeholder is a pending decision for the repo owner.
