#!/usr/bin/env bash
set -euo pipefail

# Renders the k8s manifests in infra/eks/k8s/ to stdout, substituting the
# image placeholders with real ECR coordinates. Pipe into kubectl apply:
#
#   AWS_ACCOUNT_ID=... AWS_REGION=... TAG=latest ./scripts/render-k8s.sh | kubectl apply -f -
#
# Placeholders substituted (envsubst, nothing else is touched):
#   ${AWS_ACCOUNT_ID}  12-digit account that owns the ECR repos
#   ${AWS_REGION}      region of the ECR repos / cluster
#   ${TAG}             image tag (default: latest)

: "${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID (the account that owns the ECR repos)}"
: "${AWS_REGION:?set AWS_REGION (the region of the EKS cluster)}"
: "${TAG:=latest}"

K8S_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../infra/eks/k8s" && pwd)"

first=1
for f in "$K8S_DIR"/*.yaml; do
  # Separate documents between files
  [[ $first -eq 1 ]] || echo "---"
  first=0
  envsubst '${AWS_ACCOUNT_ID} ${AWS_REGION} ${TAG}' < "$f"
done
