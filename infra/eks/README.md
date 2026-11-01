# infra/eks — EKS on Fargate (MAINTAINED)

The maintained AWS compute path for the demo: an EKS cluster with **Fargate**
(serverless pods — no nodes to manage or patch), one ECR repository per
container service, and plain-YAML k8s manifests in [`k8s/`](k8s/README.md).

See [`../README.md`](../README.md) for the compute decision table
(EKS Fargate primary / Lambda small-scale / EC2 last resort) and the
deprecated stacks.

## What's here

| File | What it does |
|------|--------------|
| `main.tf` | VPC module (`~> 6.0`: 2 AZ, single NAT) + EKS module (`~> 21.0`, Fargate-only: `core` profile for kube-system, `apps` for the demo namespace) |
| `ecr.tf` | 7 ECR repos (`demo-*-service`), IMMUTABLE tags, scan-on-push, lifecycle keep-last-10 |
| `variables.tf` | `AWS_REGION`/`AWS_ACCOUNT_ID`/`APP`/`ENV`/`VER` (same contract as `infra/serverless`) + `cluster_version`, `namespace` |
| `outputs.tf` | cluster name/endpoint, ECR URLs, the `aws eks update-kubeconfig` command, the render+apply one-liner |
| `k8s/` | Namespace + ConfigMap/Secret + one Deployment/Service per service (NLB on the gateway, HPAs on the 5 API services). See [`k8s/README.md`](k8s/README.md) |

**Cloud resources only.** This stack deliberately has no
`kubernetes`/`helm` Terraform providers: manifests are applied by
`.github/workflows/deploy.yml` (or `kubectl` by hand via
`scripts/render-k8s.sh`). That keeps `terraform init -backend=false &&
terraform validate` working in CI without cluster credentials — the same
property that made `infra/serverless` CI-friendly.

## Deploy

The same front door as every other stack:

```bash
# 1. Cluster + ECR (Terraform; ~15 min mostly waiting on the control plane)
AWS_REGION=eu-west-1 AWS_ACCOUNT_ID=123456789012 APP=demo ENV=dev VER=1.0.0 \
  MODE=eks ./create_stack.sh

# 2. Point kubectl at the cluster
aws eks update-kubeconfig --region eu-west-1 --name demo-dev-cluster

# 3. Images + manifests — either the CI way (push to main / manual dispatch):
#     .github/workflows/deploy.yml
#    or by hand:
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.eu-west-1.amazonaws.com
for SVC in eureka-server gateway-service java-service node-service python-service go-service dotnet-service; do
  docker build -t 123456789012.dkr.ecr.eu-west-1.amazonaws.com/demo-$SVC:latest demo-$SVC
  docker push 123456789012.dkr.ecr.eu-west-1.amazonaws.com/demo-$SVC:latest
done
AWS_ACCOUNT_ID=123456789012 AWS_REGION=eu-west-1 TAG=latest ./scripts/render-k8s.sh | kubectl apply -f -

# 4. Entry point (the NLB address — wait for it to leave PENDING):
kubectl -n demo-microservices get svc gateway-service
```

`create_stack.sh MODE=eks` also honors `SERVICES="java-service ..."` to
build+push images at create time (same block the docker mode uses).

## Cost warning ⚠️

An idle Fargate cluster is **not free**: the control plane bills **$0.50/hour**
(the repo pins Kubernetes 1.31, past standard support since 2025-11-26 — the
extended-support rate; $0.10/hour again once `cluster_version` is bumped) and
every running pod bills vCPU+memory (7 pods ≈ $0.22/hour more; itemized idle
total ≈ $19/day in [`docs/PRICING.md`](../../docs/PRICING.md)). A day of
demoing is real money; a forgotten week is $100+. Teardown:

```bash
# Delete k8s resources first so the NLB is released inside the cluster
./scripts/render-k8s.sh | kubectl delete -f -   # (with the same env vars)
AWS_REGION=eu-west-1 AWS_ACCOUNT_ID=123456789012 APP=demo ENV=dev VER=1.0.0 \
  MODE=eks ./infra/destroy.sh
```

If destroy fails on the VPC (leftover ENIs from the NLB/Fargate), re-run it
after the load balancer finishes deleting — a known Terraform+LB race, not a
broken stack.

## Security notes (demo posture — harden before reuse)

- `endpoint_public_access = true` and
  `enable_cluster_creator_admin_permissions = true` keep the demo friction-free.
  For real use: private endpoint + explicit admin IAM roles.
- The JWT secret in `k8s/config.yaml` is a committed placeholder — replace
  with an out-of-band Secret mechanism.
- **IRSA** (IAM Roles for Service Accounts): not configured because no
  service calls AWS APIs today. When one does:
  `module.eks.oidc_provider` + an `aws_iam_role` trusting the provider, then
  annotate the pod's ServiceAccount. `cluster_oidc_issuer_url` is already an
  output for exactly that.
