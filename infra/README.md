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
images to ECR, apply the rendered manifests).

## Security notes (names only — never commit these files)

- `infra/terraform.tfvars` — contains plaintext AWS credentials. Gitignored
  (`**/*.tfvars`). Keep it that way.
- `infra/mykey` — an OpenSSH private key. Gitignored (`**/mykey*`). Never commit,
  never copy into images or artifacts.
- `infra/app.tfvars` — **git-tracked** and contains a real AWS account ID.
  Replacing it with a placeholder is a pending decision for the repo owner.
