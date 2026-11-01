#!/usr/bin/env bash
set -euo pipefail

# ---------
# Required env vars:
#   AWS_REGION, AWS_ACCOUNT_ID, APP, ENV, VER
# Optional:
#   MODE = serverless | docker | eks   (default: docker)
# ---------

MODE="${MODE:-docker}"

echo "Checking required environment variables..."
for VAR in AWS_REGION AWS_ACCOUNT_ID APP ENV VER; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "ERROR: $VAR environment variable is not set"
    exit 1
  fi
done

BUCKET_STATE="aws-s3-bucket-state-$APP"
# Per-mode state key — must match infra/create.sh
KEY="${MODE}/terraform.tfstate"

echo "==> Using:"
echo "    MODE=$MODE"
echo "    APP=$APP ENV=$ENV VER=$VER"
echo "    AWS_REGION=$AWS_REGION AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
echo "    STATE BUCKET=$BUCKET_STATE KEY=$KEY"

# Ensure state bucket exists (idempotent)
if ! aws s3 ls --region "$AWS_REGION" "s3://$BUCKET_STATE" >/dev/null 2>&1; then
  echo "State bucket not found. Creating s3://$BUCKET_STATE in $AWS_REGION ..."
  aws s3 mb "s3://$BUCKET_STATE" --region "$AWS_REGION"
fi

# Pick the subfolder by MODE
case "$MODE" in
  serverless) TF_DIR="infra/serverless" ;;
  docker)     TF_DIR="infra/docker" ;;
  eks)        TF_DIR="infra/eks" ;;
  *)
    echo "ERROR: Unknown MODE='$MODE' (expected 'serverless', 'docker' or 'eks')"
    exit 1
    ;;
esac

# Clean local TF metadata in the stack dir (safe; remote state lives in S3)
rm -rf "$TF_DIR/.terraform" "$TF_DIR/.terraform.lock.hcl" || true

# eks: delete the k8s resources FIRST so the Service-created NLB is released
# inside the cluster before terraform destroys the VPC — otherwise the subnet
# delete fails on the dangling load balancer and the destroy hangs.
# Best-effort: missing kubectl/kubeconfig only warns, never blocks.
if [[ "$MODE" == "eks" ]]; then
  if command -v kubectl >/dev/null 2>&1; then
    echo "Deleting k8s resources (releases the NLB before the VPC goes)..."
    if TAG=latest ./scripts/render-k8s.sh | kubectl delete -f - --ignore-not-found; then
      echo "k8s resources deleted. Giving the NLB a moment to drain before terraform touches the VPC..."
      sleep 15
    else
      echo "WARN: kubectl delete failed (cluster already gone? wrong kubeconfig?) — continuing with terraform destroy."
    fi
  else
    echo "WARN: kubectl not found — skipping k8s cleanup. If the cluster still"
    echo "      exists, delete its resources first or the VPC destroy may hang:"
    echo "  AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID AWS_REGION=$AWS_REGION TAG=latest ./scripts/render-k8s.sh | kubectl delete -f -"
  fi
fi

pushd "$TF_DIR" >/dev/null

# Backend config for this stack
cat > backend.hcl <<EOF
bucket = "${BUCKET_STATE}"
key    = "${KEY}"
region = "${AWS_REGION}"
EOF

# Per-app var-file (kept consistent with your vars.tf)
TFVARS_FILE="${APP}.tfvars"
cat > "${TFVARS_FILE}" <<EOF
AWS_REGION   = "${AWS_REGION}"
AWS_ACCOUNT_ID = "${AWS_ACCOUNT_ID}"
APP         = "${APP}"
ENV         = "${ENV}"
VER         = "${VER}"
EOF

echo "Initializing Terraform backend..."
terraform init -force-copy -backend-config=backend.hcl

echo "Selecting workspace: ${ENV}"
if ! terraform workspace select "${ENV}" >/dev/null 2>&1; then
  terraform workspace new "${ENV}"
fi

echo "Formatting & validating..."
terraform fmt -recursive
terraform validate

echo "Destroying ${MODE} stack for ${APP}-${ENV}..."
terraform destroy -auto-approve -var-file="${TFVARS_FILE}"

popd >/dev/null
echo "Done."
