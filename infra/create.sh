#!/usr/bin/env bash
set -euo pipefail

# -------------------------
# Config & sanity checks
# -------------------------
REQ_VARS=(AWS_REGION AWS_ACCOUNT_ID APP ENV VER MODE)
for VAR in "${REQ_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "ERROR: $VAR environment variable is not set" >&2
    MISSING=1
  fi
done
if [[ "${MISSING:-0}" -eq 1 ]]; then
  echo "Usage example:"
  echo "  AWS_REGION=eu-west-1 AWS_ACCOUNT_ID=123456789012 APP=demo ENV=dev VER=1.0.0 MODE=serverless ./create.sh"
  echo "  AWS_REGION=eu-west-1 AWS_ACCOUNT_ID=123456789012 APP=demo ENV=dev VER=1.0.0 MODE=docker ./create.sh"
  exit 1
fi

if [[ "$MODE" != "serverless" && "$MODE" != "docker" ]]; then
  echo "ERROR: MODE must be 'serverless' or 'docker' (got: $MODE)" >&2
  exit 1
fi

# S3 backend bucket for remote state
BACKEND_BUCKET="aws-s3-bucket-state-$APP"
BACKEND_KEY="terraform.tfstate"
BACKEND_REGION="$AWS_REGION"

# Terraform root by mode
INFRA_ROOT="infra/${MODE}"

if [[ ! -d "$INFRA_ROOT" ]]; then
  echo "ERROR: Terraform root '$INFRA_ROOT' not found. Create infra/${MODE}/ with your .tf files." >&2
  exit 1
fi

# -------------------------
# Ensure state bucket
# -------------------------
echo "Ensuring S3 bucket for Terraform state: s3://$BACKEND_BUCKET"
if ! aws s3api head-bucket --bucket "$BACKEND_BUCKET" --region "$BACKEND_REGION" 2>/dev/null; then
  echo "Creating bucket $BACKEND_BUCKET in $BACKEND_REGION..."
  aws s3api create-bucket \
    --bucket "$BACKEND_BUCKET" \
    --region "$BACKEND_REGION" \
    --create-bucket-configuration LocationConstraint="$BACKEND_REGION"
  # Optional but recommended:
  aws s3api put-bucket-versioning --bucket "$BACKEND_BUCKET" --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$BACKEND_BUCKET" --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
fi

# -------------------------
# (Optional) App build steps
# -------------------------
# Keep your app build here if needed (Node/React/etc).
# If you don’t have a front-end build, you can remove this block safely.
if [[ -f package.json ]]; then
  echo "Detected package.json – running npm build steps"
  npm ci || npm install
  if npm run | grep -qE "^  export"; then
    rm -rf dist/ || true
    npm run export
  fi
fi

# -------------------------
# Terraform prepare
# -------------------------
pushd "$INFRA_ROOT" >/dev/null

# Backend config file
cat > backend.hcl <<EOF
bucket = "$BACKEND_BUCKET"
key    = "$BACKEND_KEY"
region = "$BACKEND_REGION"
EOF

# tfvars per run (kept out of VCS noise)
TFVARS_FILE="${APP}.tfvars"
cat > "$TFVARS_FILE" <<EOF
AWS_REGION     = "$AWS_REGION"
AWS_ACCOUNT_ID = "$AWS_ACCOUNT_ID"
APP            = "$APP"
ENV            = "$ENV"
VER            = "$VER"
EOF

# Extra variables for docker mode (optional image tag, etc.)
if [[ "$MODE" == "docker" ]]; then
  # You can add more here as your docker/ECS module requires
  cat >> "$TFVARS_FILE" <<EOF
IMAGE_TAG = "$VER"
EOF
fi

echo "Initializing Terraform backend..."
terraform init -force-copy -backend-config=backend.hcl \
  -var backend_bucket_name="$BACKEND_BUCKET" \
  -var backend_bucket_key="$BACKEND_KEY" \
  -var backend_bucket_region="$BACKEND_REGION"

# Workspace = environment (dev/stage/prod, etc.)
if ! terraform workspace select "$ENV" 2>/dev/null; then
  terraform workspace new "$ENV"
fi
terraform workspace select "$ENV"

terraform fmt -recursive
terraform validate

# -------------------------
# (Optional) Docker image build & push to ECR (docker mode)
# -------------------------
if [[ "$MODE" == "docker" ]]; then
  echo "Docker mode selected. If you want to build & push images to ECR, set SERVICES (space-separated) and DOCKERFILE paths."

  # Example (customize!): SERVICES="java-service node-service python-service"
  # Each service expected at ../<service-dir> relative to repo root.
  if [[ -n "${SERVICES:-}" ]]; then
    echo "Building & pushing ECR images for: $SERVICES"
    aws ecr get-login-password --region "$AWS_REGION" \
      | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

    for SVC in $SERVICES; do
      REPO="${APP}-${SVC}"
      ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO}"

      # Ensure repo
      if ! aws ecr describe-repositories --repository-names "$REPO" --region "$AWS_REGION" >/dev/null 2>&1; then
        aws ecr create-repository --repository-name "$REPO" --region "$AWS_REGION" >/dev/null
      fi

      # Build context path (adjust to your layout)
      CONTEXT="../../${SVC}"
      if [[ ! -d "$CONTEXT" ]]; then
        echo "WARNING: $CONTEXT not found; skipping $SVC"
        continue
      fi

      echo "Building ${ECR_URI}:${VER} from ${CONTEXT}"
      docker build -t "${ECR_URI}:${VER}" "$CONTEXT"
      docker push "${ECR_URI}:${VER}"

      # Optionally write per-service vars for Terraform to consume (map of images)
      echo "${SVC}=${ECR_URI}:${VER}" >> image_tags.env
    done

    echo "Note: Wire image_tags.env into your Terraform as needed (e.g., a map variable)."
  fi
fi

# -------------------------
# Terraform apply
# -------------------------
echo "Planning Terraform..."
terraform plan -var-file="$TFVARS_FILE" -out out.terraform
echo "Applying Terraform..."
terraform apply -auto-approve out.terraform

popd >/dev/null

echo "✅ Done. Mode: $MODE | Env: $ENV | State: s3://$BACKEND_BUCKET/$BACKEND_KEY"
