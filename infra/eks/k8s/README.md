# k8s/ — manifests for the EKS demo

Plain YAML applied by [`../../../.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml)
or by hand:

```bash
AWS_ACCOUNT_ID=… AWS_REGION=… TAG=latest ../../../scripts/render-k8s.sh | kubectl apply -f -
```

`scripts/render-k8s.sh` envsubst-substitutes exactly three placeholders in
the `image:` lines — `${AWS_ACCOUNT_ID}`, `${AWS_REGION}`, `${TAG}` — and
nothing else.

## Files

| File | Contents |
|------|----------|
| `namespace.yaml` | `demo-microservices` namespace — must match `var.namespace` (the Fargate `apps` profile selects on it) |
| `config.yaml` | ConfigMap `demo-config` (Eureka URL, metrics/rate-limit knobs) + Secret `demo-secrets` (JWT — **committed placeholder, demo only**) |
| `eureka-server.yaml` | Deployment + ClusterIP :8761 (single replica) |
| `gateway-service.yaml` | Deployment + **Service type LoadBalancer (NLB, in-tree annotation)** :8081 — the single public entry |
| `{java,node,python,go,dotnet}-service.yaml` | Deployment + ClusterIP + HPA (CPU 70%, 1–4 replicas) each |

## Design decisions

- **Service names == compose service names.** The services register with
  Eureka using in-code defaults like `http://eureka-server:8761/eureka/`,
  which resolve via cluster DNS for the same reason they resolve via the
  compose network. No env diff between compose and k8s beyond what's below.
- **Gateway is the only LoadBalancer** (NLB via the in-tree
  `service.beta.kubernetes.io/aws-load-balancer-type: "nlb"` annotation, IP
  targets — the only option on Fargate). No AWS Load Balancer Controller, no
  ingress controller: one less dependency for a demo. Everything else is
  ClusterIP and reached through the gateway's `lb://` routes.
- **HPA on the 5 API services** (java/node/python/go/dotnet), not on eureka
  (single instance) or the gateway (keep the demo cheap). CPU 70%, min 1,
  max 4. Fargate supports HPA but bills per pod — scaling has a direct cost.
- **metrics-server is NOT in this directory.** It's applied by the deploy
  workflow with the Fargate-required flag:
  `--set kubelet-preferred-address-types=InternalIP` (without it metrics-server
  can't scrape Fargate kubelets and every HPA sits at `<unknown>`).
  One-time manual equivalent:
  ```bash
  helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
  helm install metrics-server metrics-server/metrics-server \
    --namespace kube-system --set kubelet-preferred-address-types=InternalIP
  ```
- **Requests == limits** everywhere: Fargate provisions pods by their
  requests, and equal requests/limits is its recommended posture.

## Honest degradation (what does NOT run on k8s yet)

mysql, redis and rabbitmq have no manifests. The services handle their
absence the same way they do outside compose:

| Service | Falls back to |
|---------|---------------|
| java | H2 in-memory DB (`SPRING_DATASOURCE_URL` unset → the `application.yml` default); cache patterns report degraded |
| node / python | cache-dependent patterns degrade (`REDIS_URL` unset) |
| go | messaging patterns use the in-process buffer (`RABBITMQ_URL` unset — same switch `.env.example` documents) |

The contract (`/info`, `/process`), health/metrics and the in-process pattern
routes all work. Adding real backing services later = a StatefulSet/deployment
+ service each (or managed AWS equivalents) plus the env vars in the
Deployments — the pattern is already established in `config.yaml`.

## Adding a new service (guide cross-reference)

`docs/ADDING_A_MICROSERVICE.md` Step 9 (optional AWS) covers this: copy the
`dotnet-service.yaml` shape, add the ECR repo to `local.service_repos` in
`infra/eks/main.tf`, and add the image build to the deploy workflow matrix.
