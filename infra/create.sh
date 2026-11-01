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
  echo "  AWS_REGION=eu-west-1 AWS_ACCOUNT_ID=123456789012 APP=demo ENV=dev VER=1.0.0 MODE=eks ./create.sh"
  exit 1
fi

if [[ "$MODE" != "serverless" && "$MODE" != "docker" && "$MODE" != "eks" ]]; then
  echo "ERROR: MODE must be 'serverless', 'docker' or 'eks' (got: $MODE)" >&2
  exit 1
fi

# S3 backend bucket for remote state
BACKEND_BUCKET="aws-s3-bucket-state-$APP"
# Per-mode state key: docker and serverless stacks must not share state
BACKEND_KEY="${MODE}/terraform.tfstate"
BACKEND_REGION="$AWS_REGION"

# Terraform root by mode
INFRA_ROOT="infra/${MODE}"

if [[ ! -d "$INFRA_ROOT" ]]; then
  echo "ERROR: Terraform root '$INFRA_ROOT' not found. Create infra/${MODE}/ with your .tf files." >&2
  exit 1
fi

# -------------------------
# Build Lambda zip artifacts (serverless only)
# -------------------------
if [[ "$MODE" == "serverless" ]]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  bash "$REPO_ROOT/scripts/build-lambda-zips.sh"
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
# backend.hcl carries bucket/key/region; no -var flags (those vars are not declared in the stacks)
terraform init -force-copy -backend-config=backend.hcl

# Workspace = environment (dev/stage/prod, etc.)
if ! terraform workspace select "$ENV" 2>/dev/null; then
  terraform workspace new "$ENV"
fi
terraform workspace select "$ENV"

terraform fmt -recursive
terraform validate

# -------------------------
# (Optional) Docker image build & push to ECR
#
# Set SERVICES (space-separated, service names WITHOUT the APP- prefix):
#   SERVICES="java-service node-service python-service" ...
# Service directories are named like the ECR repo (demo-java-service when
# APP=demo) — the loop resolves both spellings.
# -------------------------
build_and_push_images() {
  if [[ -z "${SERVICES:-}" ]]; then
    echo "SERVICES not set — skipping image build/push."
    echo "Hint: SERVICES=\"eureka-server gateway-service java-service node-service python-service go-service dotnet-service\""
    return 0
  fi

  echo "Building & pushing ECR images for: $SERVICES"
  aws ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

  for SVC in $SERVICES; do
    REPO="${APP}-${SVC}"
    ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO}"

    # Ensure repo (eks mode: terraform created them already — this is a no-op)
    if ! aws ecr describe-repositories --repository-names "$REPO" --region "$AWS_REGION" >/dev/null 2>&1; then
      aws ecr create-repository --repository-name "$REPO" --region "$AWS_REGION" >/dev/null
    fi

    # Build context path: prefer the ECR-repo spelling (demo-<svc>),
    # fall back to the bare service name.
    CONTEXT="../../${REPO}"
    if [[ ! -d "$CONTEXT" ]]; then
      CONTEXT="../../${SVC}"
    fi
    if [[ ! -d "$CONTEXT" ]]; then
      echo "WARNING: ../../${REPO} (or ../../${SVC}) not found; skipping $SVC"
      continue
    fi

    echo "Building ${ECR_URI}:${VER} from ${CONTEXT}"
    docker build -t "${ECR_URI}:${VER}" "$CONTEXT"
    docker push "${ECR_URI}:${VER}"

    # Optionally write per-service vars for Terraform to consume (map of images)
    echo "${SVC}=${ECR_URI}:${VER}" >> image_tags.env
  done

  echo "Note: Wire image_tags.env into your Terraform as needed (e.g., a map variable)."
}

# docker mode keeps its historical order: images first, then apply.
if [[ "$MODE" == "docker" ]]; then
  echo "Docker mode selected."
  build_and_push_images
fi

# -------------------------
# Terraform apply
# -------------------------
echo "Planning Terraform..."
terraform plan -var-file="$TFVARS_FILE" -out out.terraform
echo "Applying Terraform..."
terraform apply -auto-approve out.terraform

# eks mode: the ECR repos are created BY the apply above (ecr.tf for_each),
# so images can only be built/pushed afterwards.
if [[ "$MODE" == "eks" ]]; then
  echo "EKS mode selected."
  build_and_push_images
fi

popd >/dev/null

echo "✅ Done. Mode: $MODE | Env: $ENV | State: s3://$BACKEND_BUCKET/$BACKEND_KEY"

if [[ "$MODE" == "eks" ]]; then
  cat <<EOF

Next steps (EKS):
  1. aws eks update-kubeconfig --region $AWS_REGION --name $APP-$ENV-cluster
  2. Push images (or re-run with SERVICES=... to build & push them):
     AWS_ACCOUNT_ID=... AWS_REGION=$AWS_REGION TAG=$VER ./scripts/render-k8s.sh | kubectl apply -f -
  3. Or just push to main — .github/workflows/deploy.yml does steps 1-2 for you.
  Entry point: kubectl -n demo-microservices get svc gateway-service
EOF
fi
