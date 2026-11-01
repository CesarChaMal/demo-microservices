#!/usr/bin/env bash
set -euo pipefail

# One-command teardown of everything this repo can create in AWS — the
# "stop the charges" button. Thin wrapper over destroy_stack.sh that fills
# in every value it can derive itself:
#   - AWS_ACCOUNT_ID  via `aws sts get-caller-identity` (no copy-paste)
#   - AWS_REGION      default eu-central-1 (matches infra/*.tfvars);
#                     override with --region or an exported AWS_REGION
#   - APP=demo ENV=dev VER=1.0.0 (the values create_stack.sh is documented with)
#
# Usage:
#   ./scripts/destroy-aws.sh                 # EKS stack (the maintained primary)
#   ./scripts/destroy-aws.sh --mode all      # EKS + Lambda stacks
#   ./scripts/destroy-aws.sh --mode serverless
#   ./scripts/destroy-aws.sh --region eu-west-1 --yes
#
# Notes:
#   - Requires AWS credentials with destroy permissions (same profile you
#     created the stack with).
#   - For EKS, infra/destroy.sh deletes the in-cluster k8s resources FIRST
#     (releasing the NLB) before terraform destroys the VPC. If the VPC
#     destroy still hangs on leftover ENIs, just re-run this script.

MODE="eks"
REGION="${AWS_REGION:-eu-central-1}"
ASSUME_YES=0

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)          MODE="${2:-}"; shift 2 ;;
    --region)        REGION="${2:-}"; shift 2 ;;
    -y|--yes)        ASSUME_YES=1; shift ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

if [[ "$MODE" != "eks" && "$MODE" != "serverless" && "$MODE" != "all" ]]; then
  echo "ERROR: --mode must be eks, serverless or all (got: $MODE)"; exit 1
fi

command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI not found in PATH"; exit 1; }

AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "Identity: $(aws sts get-caller-identity --query Arn --output text)"

cd "$(dirname "$0")/.."

MODES_TO_DESTROY=("$MODE")
[[ "$MODE" == "all" ]] && MODES_TO_DESTROY=(eks serverless)

for M in "${MODES_TO_DESTROY[@]}"; do
  echo
  echo "==> About to destroy: APP=demo ENV=dev MODE=$M REGION=$REGION ACCOUNT=$AWS_ACCOUNT_ID"
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "    Proceed? [y/N] " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "    Skipped $M."; continue; }
  fi
  AWS_REGION="$REGION" AWS_ACCOUNT_ID="$AWS_ACCOUNT_ID" \
    APP=demo ENV=dev VER=1.0.0 MODE="$M" ./destroy_stack.sh
done

echo
echo "Done. If any terraform destroy hung on leftover ENIs/NLB, re-run this script."
