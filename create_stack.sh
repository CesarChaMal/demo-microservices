#!/usr/bin/env bash
set -euo pipefail

# Optional: load a .env file from the repo root if present
if [[ -f .env ]]; then source .env; fi

# Defaults: explicit env vars win over .env entries, .env wins over these.
: "${APP:=demo}"
: "${ENV:=dev}"
: "${VER:=1.0.0}"
: "${MODE:=eks}"          # docker | serverless | eks
: "${AWS_REGION:=eu-central-1}"
if [[ -z "${AWS_ACCOUNT_ID:-}" ]]; then
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)" \
    || { echo "ERROR: AWS_ACCOUNT_ID is not set and could not be derived via STS"; exit 1; }
fi

usage() {
  cat <<EOF
Usage:
  ./create_stack.sh                 # bare: uses .env entries / built-in defaults
  MODE=<mode> ENV=<env> ... ./create_stack.sh   # any var may be overridden inline

Precedence: explicit env var > .env entry > default.
Defaults: APP=demo ENV=dev VER=1.0.0 MODE=eks AWS_REGION=eu-central-1
AWS_ACCOUNT_ID: derived via `aws sts get-caller-identity` when unset.

Examples:
  ./create_stack.sh                                  # EKS dev stack (defaults)
  MODE=serverless ./create_stack.sh                  # Lambda stack
  ENV=prod AWS_REGION=eu-west-1 ./create_stack.sh    # other env / region

Teardown: ./destroy_stack.sh (same defaults) or ./scripts/destroy-aws.sh --yes
EOF
}

# Allow simple flags too (optional)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --env)  ENV="${2:-}";  shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

# Required envs
REQ=(AWS_REGION AWS_ACCOUNT_ID APP ENV VER MODE)
for v in "${REQ[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "ERROR: $v is not set"; usage; exit 1
  fi
done

if [[ "$MODE" != "docker" && "$MODE" != "serverless" && "$MODE" != "eks" ]]; then
  echo "ERROR: MODE must be 'docker', 'serverless' or 'eks' (got: $MODE)"; exit 1
fi

echo ">>> Creating stack"
echo "    APP=$APP ENV=$ENV VER=$VER MODE=$MODE REGION=$AWS_REGION ACCOUNT=$AWS_ACCOUNT_ID"

# Delegate to your infra script
export AWS_REGION AWS_ACCOUNT_ID APP ENV VER MODE
exec ./infra/create.sh
