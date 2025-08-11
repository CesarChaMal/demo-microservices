#!/usr/bin/env bash
set -euo pipefail

# ---------
# Required env vars:
#   AWS_REGION, AWS_ACCOUNT_ID, APP, ENV, VER
# Optional:
#   MODE = serverless | docker   (default: docker)
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
KEY="terraform.tfstate"

echo "==> Using:"
echo "    MODE=$MODE"
echo "    APP=$APP ENV=$ENV VER=$VER"
echo "    AWS_REGION=$AWS_REGION AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
echo "    STATE BUCKET=$BUCKET_STATE KEY=$KEY"

# Clean local TF metadata (safe; remote state is in S3)
rm -rf .terraform .terraform.lock.hcl || true

# Ensure state bucket exists (idempotent)
if ! aws s3 ls --region "$AWS_REGION" "s3://$BUCKET_STATE" >/dev/null 2>&1; then
  echo "State bucket not found. Creating s3://$BUCKET_STATE in $AWS_REGION ..."
  aws s3 mb "s3://$BUCKET_STATE" --region "$AWS_REGION"
fi

# Pick the subfolder by MODE
case "$MODE" in
  serverless) TF_DIR="infra/serverless" ;;
  docker)     TF_DIR="infra/docker" ;;
  *)
    echo "ERROR: Unknown MODE='$MODE' (expected 'serverless' or 'docker')"
    exit 1
    ;;
esac

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
