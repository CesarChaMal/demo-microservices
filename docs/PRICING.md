# Pricing — demo-microservices on AWS

What this demo costs to keep running, per scenario and per lever. Companion to
[docs/DEPLOYMENT.md](DEPLOYMENT.md) (how it gets created / destroyed).

Conventions: region **eu-central-1** (the `deploy.yml` default), USD, **730 h = 1 month**,
prices re-verified against the AWS Price List API on **2026-10-31**, account
placeholders shown as `123456789012`. Line items are unit × hours; where a row
shows a rounded number the unrounded sum is used in totals.

## TL;DR

| State | Cost | Notes |
|---|---|---|
| **Repo + CI only** — nothing deployed, CI on every push | **$0.00** | No cloud resources exist. CI builds in GitHub-hosted runners. |
| **Deployed, idle** — EKS + 7 pods, zero traffic | **≈ $590/mo** (≈ $19.40/day, ≈ $0.81/h) | 7 pods, 1 NAT gateway, 1 NLB, control plane on the **extended-support** rate — see §3 and the version alert in §2. |
| **In use** — same + realistic dev traffic | ≈ $590–640/mo | HPAs (5 services, 1–4 replicas) add pods under load; they scale back to 1 when it stops. |
| **Lambda stack only** | ≈ $0–1/mo idle | Scales to zero between requests. The cheap always-on option. |
| **Destroyed** — `./scripts/destroy-aws.sh` | ≈ $0.02/mo | Only the S3 state bucket remains (~$0.02). |

The headline is **not** the classic "EKS costs $73/mo" number: this repo pins
Kubernetes **1.31**, which left standard support on **2025-11-26**, so the
control plane bills the extended-support rate **today**. §2 and §3 break it
down; the fix is a one-line version bump (see [Ways to pay less](#ways-to-pay-less) #7).
**An idle demo still bills ≈ $590/mo — destroying it is the only $0.**
Recreating later takes ~10-15 min (`MODE=eks ./create_stack.sh` + one CI run).

## 1. What AWS bills for, in this repo

Three groups — the third is the sneaky one:

| Group | Resources | Billing shape |
|---|---|---|
| **Compute (Fargate)** | 7 pods (one per service Deployment) | **Per pod, per second**, priced by requested vCPU + memory (requests = limits in every manifest, and Fargate bills by the bigger of request/usage — here they are equal by design). Scales with HPA replica count. |
| **Networking** | 1 NAT gateway + 1 NLB + data transfer out | NAT: per-hour + per-GB **processed**. NLB: per-hour + LCU (a request/traffic unit). Both exist the moment the stack is up, traffic or not. |
| **Cluster + state** | EKS control plane, ECR storage, S3 state bucket | Control plane: per-hour (rate depends on the Kubernetes version — see below). ECR: per-GB-month stored. S3: negligible. |

deploy.yml itself creates no billable infrastructure (runners are GitHub-hosted;
the OIDC role is free) — the only cloud object it causes is the gateway NLB.

## 2. Unit prices

**Fargate (eu-central-1, Linux):**

| Resource | $/hour | $/month @ 730 h | Verified |
|---|---|---|---|
| vCPU | $0.04656 | $33.99 | Price List API 2026-10 |
| GB memory | $0.00511 | $3.73 | Price List API 2026-10 |

Pod price is simply `(vCPU × 0.04656) + (GiB × 0.00511)` per hour — Fargate has
no instance types, no free tier, no savings plans. A pod runs 730 h/mo if
nobody deletes it.

**Rest of the stack:**

| Resource | $/hour | $/month @ 730 h | Verified |
|---|---|---|---|
| EKS control plane — versions **in standard support** | $0.10 | $73.00 | Price List API 2026-10 |
| **EKS control plane — THIS cluster (k8s 1.31, extended support since 2025-11-26)** | **$0.50** | **$365.00** | Price List API `EUC1-AmazonEKS-Hours:extendedSupport`, effective 2026-10-01 |
| NAT gateway | $0.056 | $40.88 | Price List API 2026-10 |
| Network Load Balancer | $0.027 | $19.71 | Price List API 2026-10 |
| ECR storage | — | $0.10/GB-mo | public rate |
| S3 (state bucket) | — | ~$0.023/GB-mo | public rate |
| Data transfer out | — | $0.0924/GB after 100 GB free/mo | public rate |

Standard support = 14 months from a version's EKS release. After that the
control plane automatically moves to the $0.10/h → $0.50/h extended-support
rate until you upgrade.

> **Version alert.** `cluster_version` in `infra/eks/variables.tf` pins
> **1.31**, whose standard support ended **2025-11-26** — a year ago. The
> $0.50/h rate above is **already the live rate for this cluster**, not a
> future risk; it is why the idle total in §3 is ≈ $590 instead of ≈ $300.
> 1.31's hard lifecycle end is **2026-11-26**: after that AWS **automatically
> upgrades the control plane to 1.32** — outside your control, possibly at an
> inconvenient moment. Bump `cluster_version` deliberately (see
> [Ways to pay less](#ways-to-pay-less) #7): it saves ≈ $292/mo AND makes the
> eventual 1.32 upgrade a chosen event instead of a surprise.

## 3. The idle month, itemized

Every service runs `replicas: 1`, requests = limits, HPAs parked at min 1. These
are the **7 pods × 730 h** costs:

| Pod | Requested | $/h | $/mo |
|---|---|---|---|
| `java-service` | 1 vCPU / 2 GiB | $0.05678 | $41.45 |
| `eureka-server` | 1 vCPU / 2 GiB | $0.05678 | $41.45 |
| `gateway-service` | 0.5 vCPU / 1 GiB | $0.02839 | $20.72 |
| `dotnet-service` | 0.5 vCPU / 1 GiB | $0.02839 | $20.72 |
| `node-service` | 0.25 vCPU / 0.5 GiB | $0.01419 | $10.36 |
| `python-service` | 0.25 vCPU / 0.5 GiB | $0.01419 | $10.36 |
| `go-service` | 0.25 vCPU / 0.5 GiB | $0.01419 | $10.36 |
| **Pods subtotal** | 3.75 vCPU / 7.5 GiB | $0.22491 | **$155.44** ($127.46 CPU + $27.98 memory) |

Plus everything that bills whether or not a pod is doing anything:

| Item | $/mo | Notes |
|---|---|---|
| Fargate pods (above) | $155.44 | |
| **EKS control plane (k8s 1.31 — extended support, already in effect)** | **$365.00** | $0.50/h. Returns to $73.00 once `cluster_version` is on a standard-support version. |
| NAT gateway | $37.96 | $0.052/h averaged (NAT bills 730 h but the effective rate lands here; ~30 GB processed adds ~$13 — included in the ≈ totals below, not double-counted in this row) |
| NLB (gateway) | $19.71 | idle LCU ≈ 0 |
| ECR (7 repos, ~10 images each) | ~$1 | lifecycle policy keeps it bounded |
| S3 state bucket | ~$0.02 | |
| **Total, deployed and idle** | **≈ $591/mo — call it ≈ $590 (≈ $19.40/day, ≈ $0.81/h)** | After a `cluster_version` bump (lever #7) the total returns to ≈ $299/mo. |

Rows are rounded to cents for display; totals use the unrounded sums.

**Fine print, because someone always asks:**

- Destroyed state is **≈ $0.02/mo**, not $0 — the S3 state bucket survives
  teardown on purpose (so the next `create` is fast). Empty it + delete it if
  you want a hard zero (`aws s3 rm s3://aws-s3-bucket-state-demo --recursive`,
  then `aws s3 rb s3://aws-s3-bucket-state-demo`).
- ECR is per-account shared across repos but the repos here belong to this
  stack and die with it (`force_delete = true`), so the ~$1 is stack-scoped.
- A scaled-out java-service pod (4/4 HPA replicas under load) costs another
  $41.45/mo each — HPAs go to 4, not ∞, so worst-case compute is bounded at
  roughly 4× the 5 HPA'd pods.

## Ways to pay less

| # | Lever | Saves | Effort | Where |
|---|---|---|---|---|
| 1 | Delete the NAT gateway (`single_nat_gateway = false` → rebuild, or remove + apply) | $37.96/mo + ~$13 data processing | medium — requires public subnets for pods or another egress story | `infra/eks/main.tf` |
| 2 | Shrink pod requests (e.g. JVM services 1 vCPU → 500m during idle periods) | up to ~$60/mo | low — edit + `kubectl apply` | `infra/eks/k8s/*.yaml` |
| 3 | `minReplicas: 0` via KEDA (scale-to-zero) — kills the $155 pods line | $155.44/mo | high — KEDA install + per-service triggers | new infra |
| 4 | Replace EKS path with the **Lambda stack** for idle periods | ≈ $590/mo → ≈ $0–1 | medium — different stack, different contract surface | `infra/serverless/` |
| 5 | **THE REAL LEVER — `./scripts/destroy-aws.sh` when not demoing** | **≈ $590 → ≈ $0** | one command, ~20-25 min | [docs/DEPLOYMENT.md § Destroy](DEPLOYMENT.md#destroy) |
| 6 | ECR lifecycle policy (already in place — keep-last-10) | keeps ECR ≈ $1 | done | `infra/eks/ecr.tf` |
| 7 | **Bump `cluster_version` off 1.31** — standard support ended 2025-11-26, so the $0.50/h extended rate is already in effect; 1.31 hard lifecycle ends **2026-11-26**, after which AWS auto-upgrades to 1.32 anyway | **≈ $292/mo** ($365 → $73) | one-line change + a cluster upgrade | `infra/eks/variables.tf` (`cluster_version`) |

The intended demo lifecycle is cheap by design:

```bash
# create (bills start) — ~10-15 min
AWS_REGION=eu-central-1 AWS_ACCOUNT_ID=123456789012 APP=demo ENV=dev VER=1.0.0 MODE=eks ./create_stack.sh
# demo, poke the gateway NLB, show Eureka / HPA / NLB behavior
./scripts/destroy-aws.sh -y    # bills stop — ~20-25 min
```

## Where to change each cost lever

| Lever | File | Change |
|---|---|---|
| Pod size | `infra/eks/k8s/<service>.yaml` | `resources.requests` (keep requests = limits) |
| HPA bounds | `infra/eks/k8s/<service>.yaml` | `minReplicas` / `maxReplicas` / target CPU |
| Cluster version | `infra/eks/variables.tf` | `cluster_version` (see lever #7 — overdue) |
| NAT gateway | `infra/eks/main.tf` | `single_nat_gateway` |
| ECR retention | `infra/eks/ecr.tf` | lifecycle rule `keepLastN`-style block |
| Number of deployed services | `infra/eks/k8s/` | delete a manifest (each has a fixed floor cost) |
| Everything at once | — | `./scripts/destroy-aws.sh` |

## Troubleshooting surprise bills

| Symptom | Likely cause | Fix |
|---|---|---|
| Bill above the ≈ $590 baseline with no traffic | HPAs scaled out under load and pods did not scale back (stuck metric, or `averageUtilization: 70` met by a busy JVM) | `kubectl -n demo-microservices get hpa` — if replicas sit at max with no traffic, restart the Deployment / check metrics-server |
| Control-plane line reads $365, not $73 | Kubernetes 1.31 is past standard support (since 2025-11-26) — the $0.50/h extended rate is in effect | Expected today. Bump `cluster_version` + upgrade the cluster (lever #7) to get back to $73 |
| NAT charges higher than $37.96 | NAT per-GB processing — something is downloading (image pulls go through NAT; repeated CI deploys re-pull) | Expected with frequent deploys; bounded by image size |
| Still billed after destroy | State bucket ($0.02) — or destroy hung on NLB ENIs and did not finish | Check for leftover ENIs/cluster; re-run `./scripts/destroy-aws.sh` (idempotent) |
| Bill exists but `kubectl` works against nothing | CI deployed after a destroy recreated the NLB (a push to `main` re-applies manifests) | Disable the workflow or recreate the cluster; see [docs/DEPLOYMENT.md § Troubleshooting](DEPLOYMENT.md#troubleshooting) |
| Lambda stack billed despite "serverless = cheap" | API Gateway always-on routes / provisioned concurrency | This stack uses none by default — check for manually added provisioned concurrency |

## Related docs

- [docs/DEPLOYMENT.md](DEPLOYMENT.md) — the deploy / destroy walkthrough these prices attach to
- [`infra/README.md`](../infra/README.md) — stack status, OIDC identity teardown
- [`infra/eks/README.md`](../infra/eks/README.md) — EKS stack internals
