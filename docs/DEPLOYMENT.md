# Deployment — demo-microservices

How to get this repo running on AWS (EKS is the primary path), use it day to day,
and tear it down without surprise charges. Region is **eu-central-1** everywhere
(the `deploy.yml` default).

Costs start the moment `create_stack.sh` succeeds — see [docs/PRICING.md](PRICING.md)
for what each piece costs and [Destroy](#destroy) for the stop button.

## Deployment models

| Model | Command | What it is | Where it lives |
|---|---|---|---|
| **local** | `./run.sh local` | Bare-metal on the dev machine: sets up Java (SDKMAN), Node (NVM), Python (pyenv), starts MySQL in Docker, then runs Eureka + Java + Node + Python in the background. Accepts `--java-version/--node-version/--python-version`. Does not start Go/.NET. | `run.sh` |
| **docker** | `./run.sh docker` | `docker-compose up --build -d` (the legacy hyphenated binary `run.sh` invokes) on the dev machine: all 7 services plus MySQL, Redis, RabbitMQ. | `run.sh`, `docker-compose.yml` |
| **eks** — PRIMARY AWS path | `MODE=eks ./create_stack.sh` once, then `.github/workflows/deploy.yml` on every code push to `main` (doc-only and deploy.yml-only pushes are skipped by `paths-ignore`) | Fargate-only EKS cluster, one ECR repo per service, manifests applied by CI. | `infra/eks/` |
| **serverless** | `MODE=serverless ./create_stack.sh` | Lambda + API Gateway — the small / sporadic-traffic option (see [Lambda path](#the-lambda-path-optional)). | `infra/serverless/` |
| ECS (legacy) | `MODE=docker ./create_stack.sh` | **Legacy — broken.** The `infra/docker` ECS stack has invalid HCL and is excluded from CI. EKS is the maintained AWS container path. | `infra/docker/` |

`run.sh` also has an `aws` mode: it prints a deprecation notice and exits 1.
The stack-status table for every path is in `infra/README.md`.

## Step 0 — Prerequisites

| Tool | Why you need it | Declared / used in |
|---|---|---|
| terraform >= 1.3.9 | Creates the stack. Pulls AWS provider >= 6.0.0 (required by EKS module 21.x and the `user_name` spelling of `aws_eks_access_entry`). | `infra/eks/versions.tf` |
| AWS CLI v2 + credentials | Every wrapper script calls `aws` (STS, S3 state bucket, ECR, EKS). | `infra/create.sh`, `infra/destroy.sh` |
| docker | Only for manual image builds via `SERVICES=...` (CI builds on its own runners). | `infra/create.sh` |
| **kubectl** | **Strongly recommended.** The destroy path deletes in-cluster resources first — but only when `kubectl` is on `PATH`. Without it the gateway NLB is never deleted and the VPC destroy can hang. See [Destroy](#destroy). | `infra/destroy.sh` |
| gh CLI | For manual workflow dispatch (`gh workflow run deploy.yml`). | Step 2 |

### One-time GitHub setup

Configured in repo Settings → Secrets/Variables (documented in the
`.github/workflows/deploy.yml` header):

| Setting | Type | Purpose |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | secret | GitHub OIDC role — **preferred**, no long-lived keys in GitHub. |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | secrets | Static-key fallback, used only when the role ARN is absent. |
| `AWS_REGION` | variable (optional) | Defaults to `eu-central-1` inside the workflow. |
| `EKS_CLUSTER_NAME` | variable (optional) | Defaults to `demo-dev-cluster` inside the workflow. |

**The OIDC identity is 3 account-level IAM pieces that live OUTSIDE any
terraform stack**: the `token.actions.githubusercontent.com` OIDC provider, the
role `github-actions-demo-microservices-deploy` (trust restricted to
`repo:CesarChaMal/demo-microservices:*`, 1h max session), and its scoped inline
policy. They were created once directly in IAM — no creation commands live in
this repo. Only their **hand-teardown** commands are documented (in
[`infra/README.md`](../infra/README.md)) and are not duplicated here.

**Cluster access for CI:** `aws_eks_access_entry.github_actions_deploy` in
`infra/eks/main.tf` admits that role with `AmazonEKSClusterAdminPolicy`
(cluster scope). Without it, kubectl from CI gets 403 even though
`DescribeCluster` succeeds — the cluster-creator permission only covers whoever
ran `create_stack.sh` locally.

## Step 1 — Create the stack (once, locally)

```bash
AWS_REGION=eu-central-1 AWS_ACCOUNT_ID=<AWS_ACCOUNT_ID> APP=demo ENV=dev VER=1.0.0 MODE=eks ./create_stack.sh
```

`create_stack.sh` is a thin wrapper over `infra/create.sh`. **All six env vars
are required** — the script fails listing any missing one — and `MODE` must be
exactly `serverless`, `docker`, or `eks`.

What the wrapper does, in order (`infra/create.sh`):

1. Ensures the S3 state bucket `aws-s3-bucket-state-<APP>` exists (created with
   versioning + AES256 if missing).
2. Writes `backend.hcl` and `<APP>.tfvars` inside `infra/eks/` at runtime, then
   `terraform init -force-copy -backend-config=backend.hcl`.
3. Creates/selects terraform workspace `<ENV>` (here `dev`).
4. `terraform fmt -recursive` + `validate`, then `plan` + `apply -auto-approve`.
5. In eks mode, optionally builds images — see the callout below.

**State routing:** bucket `aws-s3-bucket-state-demo`, key `eks/terraform.tfstate`,
workspace `dev`. The per-mode key is deliberate isolation — eks and serverless
never share state. `infra/eks/versions.tf` declares `backend "s3" {}` empty on
purpose (the config is injected at runtime), which is also why CI can validate
with `terraform init -backend=false`.

### What apply creates

| Resource | Value | Pointer |
|---|---|---|
| VPC | `10.0.0.0/16`, 2 AZs, private + public subnets, **single NAT gateway** | `infra/eks/main.tf` |
| EKS cluster | `demo-dev-cluster` (`<APP>-<ENV>-cluster`), Kubernetes **1.31** (`cluster_version` default — see the version alert in [docs/PRICING.md](PRICING.md)) | `infra/eks/main.tf`, `infra/eks/variables.tf` |
| Fargate profiles | `core` (kube-system) and `apps` (namespace `demo-microservices`) | `infra/eks/main.tf` |
| Cluster endpoint | **Public** — demo convenience; harden for anything real | `infra/eks/main.tf` |
| Add-ons | `vpc-cni`, `coredns`, `kube-proxy` | `infra/eks/main.tf` |
| CI access entry | role above + `AmazonEKSClusterAdminPolicy` | `infra/eks/main.tf` |
| ECR repos (7) | `demo-eureka-server`, `demo-gateway-service`, `demo-java-service`, `demo-node-service`, `demo-python-service`, `demo-go-service`, `demo-dotnet-service` — IMMUTABLE tags, scan-on-push, lifecycle keep-last-10 tagged (`v`/`sha-`/`latest`) | `infra/eks/ecr.tf` |

> **Why a single NAT gateway:** a deliberate demo-cost tradeoff — no cross-AZ
> egress HA. Also why the endpoint is public: kubectl works from anywhere.
> Both are the wrong choices for production and are commented as such in
> `infra/eks/main.tf`.

> **IMPORTANT — no images are built in this step.** In eks mode `infra/create.sh`
> does **not** build or push images unless `SERVICES` is set (it prints a hint
> and skips otherwise). The ECR repos are created *by* the apply, so images can
> only come after it. Image builds are the deploy.yml job (Step 2). Manual
> alternative — re-run with:
> ```bash
> AWS_REGION=eu-central-1 AWS_ACCOUNT_ID=<AWS_ACCOUNT_ID> APP=demo ENV=dev VER=1.0.0 MODE=eks \
>   SERVICES="eureka-server gateway-service java-service node-service python-service go-service dotnet-service" \
>   ./create_stack.sh
> ```

**Duration:** ~10-15 min. On WSL `/mnt/*` (9p) disks, `terraform init`
re-downloads ~832 MB of providers and can time out under load — just **re-run
the same command** (it is idempotent). Never destroy to fix a timeout.

## Step 2 — Deploy the services (CI, every change)

| Setting | Value |
|---|---|
| Trigger | push to `main` — **except** doc-only and deploy.yml-only pushes (`paths-ignore`: `docs/**`, `**.md`, `.github/workflows/deploy.yml`; use manual dispatch for those) — or `gh workflow run deploy.yml --ref main` |
| Concurrency | group `deploy-eks`, `cancel-in-progress: false` — deploys queue, never cancel each other mid-run |
| Timeout | 45 minutes per job |
| Permissions | `id-token: write` (OIDC) |

Pipeline steps in order (names exactly as in `.github/workflows/deploy.yml`):

| # | Step | What it does |
|---|---|---|
| 1 | `Configure AWS credentials (OIDC — preferred)` / `(static keys — fallback)` | Assumes `AWS_DEPLOY_ROLE_ARN` if set, else static keys. The choice is routed through a job-level `HAS_DEPLOY_ROLE` env var because `secrets` are not readable in step-level `if:` conditions. |
| 2 | `Resolve account + registry` | `aws sts get-caller-identity`; writes `AWS_ACCOUNT_ID`, `REGISTRY`, `TAG=sha-<first 7 of commit sha>` to `GITHUB_ENV`. The account id is captured in a local shell var first because `GITHUB_ENV` writes only land in later steps. |
| 3 | `Point kubectl at the cluster` | `aws eks update-kubeconfig` for `demo-dev-cluster`. |
| 4 | `Ensure namespace exists and is Active` | Creates `demo-microservices`, then polls `status.phase=Active` up to 30 x 2s. |
| 5 | `Login to ECR` | `aws ecr get-login-password` piped to `docker login`. |
| 6 | `Build and push the 7 service images` | Builds each `demo-<svc>` dir, tags `<registry>/demo-<svc>:sha-<sha7>` and `:latest`, pushes both. |
| 7 | `metrics-server (required for the HPAs on Fargate)` | Applies upstream `components.yaml`, then patches the deployment with `--kubelet-preferred-address-types=InternalIP` and `--kubelet-insecure-tls` (idempotent guard). |
| 8 | `Render manifests and apply` | `AWS_ACCOUNT_ID=... AWS_REGION=... TAG=... ./scripts/render-k8s.sh \| kubectl apply -f -` |
| 9 | `Rollout status + entry point` | `kubectl rollout status` per deployment (300s each, non-fatal `\|\| true`), then `kubectl get service gateway-service` (the NLB address). |

> **Why step 4 polls:** EKS fronts several API-server replicas, each with its
> own cache. A single `kubectl apply` stream that creates the namespace and its
> objects can race a replica that has not observed the namespace yet
> (`namespaces "..." not found`). Waiting for `Active` — set by the namespace
> controller only after every replica's watch has delivered it — races nothing.

> **Why step 7 patches:** Fargate kubelets are only reachable via `InternalIP`,
> and their certs do not match metrics-server's default verification. Without
> the patch the HPAs never get metrics and never scale.

> **Why push failures are tolerated (`\|\| echo skip`) in step 6:** ECR tags are
> IMMUTABLE — `latest` collides on every run after the first, and the `sha` tag
> collides on re-runs of the same commit. The `sha` tag is what the manifests
> pin, so a bounced `latest` is not fatal. **Build failures ARE fatal.**

`scripts/render-k8s.sh` envsubst-renders `infra/eks/k8s/*.yaml` (namespace,
ConfigMap `demo-config`, Secret `demo-secrets`, one Deployment + Service per
service, HPA on five of them) substituting only `${AWS_ACCOUNT_ID}`,
`${AWS_REGION}`, `${TAG}`.

**deploy.yml creates NO cloud infrastructure.** No cluster, no ECR repos, no
VPC — it only pushes images and applies in-cluster manifests to a cluster that
already exists. The one cloud object it causes indirectly is the gateway NLB,
provisioned by AWS when the gateway's `Service` (type `LoadBalancer`) is first
applied.

## Step 3 — Verify

The gateway URL is printed by the run's last step, or:

```bash
kubectl -n demo-microservices get service gateway-service
```

That NLB hostname on port 8081 is the single public entry point. Note:
**eu-central-1 NLB hostnames do NOT start with `k8s-`** (that is us-east-1
style naming) — do not grep for `k8s-`; the printed `<id>-<hash>.elb.eu-central-1.amazonaws.com` address is the right one.

## What runs on the cluster

Namespace `demo-microservices`. 7 Deployments, min 1 replica each, requests =
limits on every container (Fargate bills by pod size). HPA facts below are read
from `infra/eks/k8s/*.yaml` — the files are authoritative.

| Deployment | ECR image | Requests = limits | HPA | Container port / probe path | Service type |
|---|---|---|---|---|---|
| `eureka-server` | `demo-eureka-server` | 1 CPU / 2Gi | — (single replica, a demo needs one) | 8761 / `/actuator/health` | ClusterIP |
| `gateway-service` | `demo-gateway-service` | 500m / 1Gi | — | 8081 / `/actuator/health` | **LoadBalancer (NLB)** |
| `java-service` | `demo-java-service` | 1 CPU / 2Gi | 1–4 @ CPU 70% | 8080 / `/actuator/health` | ClusterIP |
| `node-service` | `demo-node-service` | 250m / 512Mi | 1–4 @ CPU 70% | 3000 / `/health` | ClusterIP |
| `python-service` | `demo-python-service` | 250m / 512Mi | 1–4 @ CPU 70% | 5001 / `/health` | ClusterIP |
| `go-service` | `demo-go-service` | 250m / 512Mi | 1–4 @ CPU 70% | 5002 / `/health` | ClusterIP |
| `dotnet-service` | `demo-dotnet-service` | 500m / 1Gi | 1–4 @ CPU 70% | 5003 / `/health` | ClusterIP |

- **HPAs ship on the 5 API services** (java, node, python, go, dotnet):
  `minReplicas: 1`, `maxReplicas: 4`, CPU `averageUtilization: 70`. Eureka and
  the gateway have none. The gateway NLB uses in-tree annotations (`nlb`,
  internet-facing, `ip` target type — the only option on Fargate) so no AWS Load
  Balancer Controller is needed.
- **Probes:** every manifest ships startup/readiness/liveness. The startup probe
  allows 24 periods — 4 min for the JVM services (10s period), 2 min for the
  rest (5s) — because Spring Boot cold-boots slowly on Fargate.
- **Env:** ConfigMap `demo-config` (`EUREKA_SERVER_URL=http://eureka-server:8761/eureka/`,
  `METRICS_ENABLED`, `RATE_LIMIT_REQUESTS_PER_MINUTE`) + Secret `demo-secrets`
  (`JWT_SECRET` — placeholder value, demo only; see the warning in
  `infra/eks/k8s/config.yaml`).
- **MySQL / Redis / RabbitMQ are NOT deployed to k8s** — services degrade
  honestly instead: java falls back to in-memory H2 (`SPRING_DATASOURCE_URL`
  unset), node/python degrade caching in-process, go falls back to an in-process
  buffer (`RABBITMQ_URL` unset), dotnet is contract-only. See the headers of
  each manifest in `infra/eks/k8s/`.

## Daily operations

| Task | Command |
|---|---|
| Update a service | Commit + push to `main`. Each commit gets its own immutable `sha-` tag; re-running the same commit reuses the existing tags. |
| Rollback (code) | Revert the commit on `main` — deploys the older code under a new `sha` tag. |
| Rollback (pin image) | `kubectl -n demo-microservices set image deployment/<svc> <container>=123456789012.dkr.ecr.eu-central-1.amazonaws.com/demo-<svc>:sha-<older>` |
| Manual apply (no CI) | `aws eks update-kubeconfig --region eu-central-1 --name demo-dev-cluster`, then `AWS_ACCOUNT_ID=<AWS_ACCOUNT_ID> AWS_REGION=eu-central-1 TAG=<tag> ./scripts/render-k8s.sh \| kubectl apply -f -` (`TAG` defaults to `latest`) |
| Logs | `kubectl -n demo-microservices logs deploy/<svc>` |
| Scale | `kubectl -n demo-microservices scale deployment/<svc> --replicas=N` — note the HPA will fight a manual scale-down on the 5 HPA-managed services. |

## The Lambda path (optional)

The small / sporadic-traffic option (cost comparison in [docs/PRICING.md](PRICING.md)):

```bash
AWS_REGION=eu-central-1 AWS_ACCOUNT_ID=<AWS_ACCOUNT_ID> APP=demo ENV=dev VER=1.0.0 MODE=serverless ./create_stack.sh
```

This runs `scripts/build-lambda-zips.sh` first (builds
`infra/serverless/artifacts/*.zip` — needs mvn + JDK 21 for the java zip;
`SKIP_JAVA=1` builds only node/python), then applies `infra/serverless/` with
state key `serverless/terraform.tfstate`. Tear down with
`./scripts/destroy-aws.sh --mode serverless`.

> `./run.sh lambda` also builds the zips and applies `infra/serverless/`
> directly, but WITHOUT `create_stack.sh`'s `backend.hcl`/workspace routing —
> its state does not land in the documented S3 backend. `MODE=serverless
> ./create_stack.sh` is the documented path.

## Destroy

The reason these docs exist: **charges continue until you run this.**

```bash
./scripts/destroy-aws.sh              # interactive confirm, EKS stack (default)
./scripts/destroy-aws.sh -y           # non-interactive (also accepts --yes)
./scripts/destroy-aws.sh --mode all   # EKS + Lambda stacks
./scripts/destroy-aws.sh --mode serverless
```

| Flag | Values | Default |
|---|---|---|
| `--mode` | `eks` \| `serverless` \| `all` (docker is not accepted here) | `eks` |
| `--region` | any region | `$AWS_REGION` or `eu-central-1` |
| `-y` / `--yes` | skip the per-mode `[y/N]` prompt | off |

`APP=demo ENV=dev VER=1.0.0` are filled in by the wrapper; the account id is
derived via `aws sts get-caller-identity` (it prints the identity ARN before
anything runs). The wrapper delegates to `destroy_stack.sh` (the per-mode
wrapper that requires the same six env vars as create — **the workspace/ENV
must match the one used at create**, since APP/ENV select the workspace and the
state key) which delegates to `infra/destroy.sh`.

What `infra/destroy.sh` does, in order:

1. Ensures the state bucket exists (idempotent).
2. Wipes `.terraform` + `.terraform.lock.hcl` in the stack dir — deliberately,
   so every destroy starts from a clean `init` (see the re-download note below).
3. **eks only, and only if `kubectl` is on `PATH`:** deletes the rendered k8s
   resources first (`TAG=latest ./scripts/render-k8s.sh | kubectl delete -f - --ignore-not-found`)
   and sleeps 15s so the NLB is released *inside the cluster* before terraform
   touches the VPC.
4. `terraform init -force-copy` (re-fetches modules + providers), then
   creates/selects the workspace (`<ENV>`).
5. `terraform fmt -recursive` + `validate`.
6. `terraform destroy -auto-approve -var-file`.

> **kubectl prerequisite:** if `kubectl` is not on `PATH`, destroy prints a WARN
> and skips k8s cleanup — the gateway NLB then still exists when the VPC destroy
> starts, and the destroy can hang on NLB ENIs. Fix: install kubectl and re-run.
> **Re-running destroy is ALWAYS safe — it is idempotent.** Never manually
> delete state to unstick it.

> **Every destroy re-downloads the world:** step 2 wipes `.terraform`, so each
> run re-fetches modules and ~832 MB of providers (several minutes; on WSL
> `/mnt/*` the `rm -rf .terraform` alone takes minutes and downloads may time
> out — just re-run the same command).

| What dies with the stack | What survives destroy |
|---|---|
| Every stack resource: VPC, NAT, EKS cluster + Fargate profiles, add-ons, access entry | S3 state bucket `aws-s3-bucket-state-demo` — kept intentionally (~$0.02/mo) |
| **ECR repos AND their images** — `force_delete = true` in `infra/eks/ecr.tf` deletes non-empty repos with the stack (without it terraform destroy fails with `repository not empty`). Real difference from sibling projects that keep ECR on purpose. | The 3 account-level OIDC/IAM pieces — hand teardown commands in [`infra/README.md`](../infra/README.md) |

Typical runtime **~20-25 min**. A hang is almost always NLB ENIs or 9p slowness
— re-run the same command.

`destroy_stack.sh` (repo root) is the older per-mode wrapper; it still works and
remains the only route to a `MODE=docker` destroy or non-default `APP`/`ENV`,
but for the documented stacks `scripts/destroy-aws.sh` (which calls it
internally) is the one-command path.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deploy run goes red at `update-kubeconfig` | The cluster was destroyed after the last deploy | Expected after a teardown. Recreate with `create_stack.sh`, or ignore/disable the workflow. |
| `namespaces "demo-microservices" not found` during apply | Multi-replica API-server cache race | deploy.yml already handles it — that is what the create-and-poll loop in step 4 is for. |
| `docker push` fails with `tag already exists` | IMMUTABLE ECR tags; `latest` collides on every later run | Tolerated by design (`\|\| echo skip`) — not an error. The `sha` tag is what matters. |
| `terraform init`/`apply` times out on WSL `/mnt` | 9p disk — provider downloads are slow under load | Re-run the same command; it is idempotent. Never destroy to fix a timeout. |
| kubectl 403 from CI | `aws_eks_access_entry.github_actions_deploy` missing (cluster recreated, stack not applied) | Re-apply `infra/eks` (re-run `create_stack.sh`). `DescribeCluster` succeeding does not prove cluster access. |
| Gateway URL does not start with `k8s-` | eu-central-1 NLB naming — no `k8s-` prefix there | Nothing. It is still the right address. |

## Command quick reference

| Command | Env / flags |
|---|---|
| `./create_stack.sh` | `AWS_REGION` (eu-central-1), `AWS_ACCOUNT_ID`, `APP=demo`, `ENV=dev`, `VER=1.0.0`, `MODE=eks\|serverless\|docker` — all six required; optional `SERVICES="..."` for manual image builds (eks mode, after apply) |
| `./run.sh <mode>` | `docker` \| `local` \| `lambda` (applies `infra/serverless` directly, without `create_stack.sh`'s backend routing — prefer `MODE=serverless ./create_stack.sh`) \| `aws` (deprecated, exits 1); `local` also takes `--java-version/--node-version/--python-version` |
| `./destroy_stack.sh` | Same six env vars as create (+ `--mode`/`--env` flags); per-mode wrapper under `scripts/destroy-aws.sh` |
| `./scripts/destroy-aws.sh` | `[-y\|--yes] [--mode eks\|serverless\|all] [--region <region>]` |
| `./scripts/render-k8s.sh` | `AWS_ACCOUNT_ID` (required), `AWS_REGION` (required), `TAG` (default `latest`) — pipe into `kubectl apply -f -` |
| `./scripts/build-lambda-zips.sh` | optional `SKIP_JAVA=1`; needs mvn + JDK 21 for the java zip |
| `gh workflow run deploy.yml --ref main` | Manual dispatch of the EKS deploy pipeline |

## See also

- [docs/PRICING.md](PRICING.md) — what it costs, per scenario
- [`infra/README.md`](../infra/README.md) — stack internals, status table, OIDC identity teardown
- [`infra/eks/README.md`](../infra/eks/README.md) — EKS stack details
- [ADDING_A_MICROSERVICE.md](../ADDING_A_MICROSERVICE.md) — adding an 8th service
