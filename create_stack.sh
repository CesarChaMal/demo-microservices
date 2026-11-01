#!/usr/bin/env bash
set -euo pipefail

# Optional: load a .env file from the repo root if present
[[ -f .env ]] && source .env

# Defaults
: "${MODE:=docker}"   # docker | serverless
: "${ENV:=dev}"

usage() {
  cat <<EOF
Usage:
  AWS_REGION=<region> AWS_ACCOUNT_ID=<id> APP=<name> ENV=<env> VER=<ver> MODE=<docker|serverless> ./create_stack.sh

Examples:
  AWS_REGION=eu-west-1 AWS_ACCOUNT_ID=123456789012 APP=demo ENV=dev VER=1.0.0 MODE=serverless ./create_stack.sh
  AWS_REGION=eu-west-1 AWS_ACCOUNT_ID=123456789012 APP=demo ENV=dev VER=1.0.0 MODE=docker     ./create_stack.sh
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

if [[ "$MODE" != "docker" && "$MODE" != "serverless" ]]; then
  echo "ERROR: MODE must be 'docker' or 'serverless' (got: $MODE)"; exit 1
fi

echo ">>> Creating stack"
echo "    APP=$APP ENV=$ENV VER=$VER MODE=$MODE REGION=$AWS_REGION ACCOUNT=$AWS_ACCOUNT_ID"

# Delegate to your infra script
export AWS_REGION AWS_ACCOUNT_ID APP ENV VER MODE
exec ./infra/create.sh
