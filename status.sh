#!/usr/bin/env bash
# status.sh — report deployed Terraform resources per environment/stack in this
# repo (AWS and non-AWS), so you can see at a glance what already exists.
# Read-only: runs `terraform state list` (and `terraform workspace list`) only.
# Usage:
#   ./status.sh            # all stacks
#   ./status.sh dev eks    # only stacks whose label contains "dev" or "eks"
set -uo pipefail   # no -e: one broken stack must not kill the whole report
cd "$(dirname "$0")"
# Maintained stacks only: infra/eks = primary EKS/Fargate stack, infra/serverless
# = Lambda stack. infra/docker and the infra/ root are deprecated/quarantined and
# are intentionally NOT listed here.
# Remote state: S3 bucket aws-s3-bucket-state-demo (region eu-central-1),
# keys eks/terraform.tfstate and serverless/terraform.tfstate.
STACKS=(
  "dev/eks|infra/eks"
  "dev/lambda|infra/serverless"
)
say()  { printf '%s\n' "$*"; }
hdr()  { say ""; say "== $1 $(printf '%*s' $(( 58 - ${#1} )) '' | tr ' ' '=')"; }
tf() { local dir="$1"; shift; ( cd "$dir" && timeout -k 15 120 terraform "$@" ); }
summarize_stack() {
  local label="$1" dir="$2"
  hdr "$label ($dir)"
  if ! command -v terraform >/dev/null 2>&1; then say "  SKIP: terraform binary not found"; return; fi
  if [[ ! -d "$dir" ]]; then say "  SKIP: directory not found"; return; fi
  if [[ ! -d "$dir/.terraform" ]]; then
    say "  NOT INITIALIZED (no .terraform/) — run terraform init in $dir to read remote state"
  fi
  local ws; ws="$(tf "$dir" workspace show 2>/dev/null)" || ws="?"
  say "  workspace: $ws"
  local out
  if ! out="$(tf "$dir" state list 2>&1)"; then
    say "  UNAVAILABLE: state list failed:"; say "$out" | sed 's/^/    /' | head -5; return
  fi
  local total aws nonaws
  total="$(say "$out" | grep -c . || true)"
  if [[ "$total" -eq 0 ]]; then say "  VERDICT: NOT DEPLOYED (state is empty)"; return; fi
  aws="$(say "$out" | sed -E ':a;s/^module\.[^.]+\.//;ta; s/\[[^]]*\]$//' | cut -d. -f1 | grep -c '^aws_' || true)"
  nonaws=$(( total - aws ))
  say "  VERDICT: DEPLOYED — $total resource(s) in state ($aws AWS, $nonaws non-AWS)"
  say "  by type:"
  say "$out" \
    | sed -E ':a;s/^module\.[^.]+\.//;ta; s/\[[^]]*\]$//' \
    | cut -d. -f1 | sort | uniq -c | sort -rn \
    | awk -v aws_re='^aws_' '
        $2 ~ aws_re { printf "    %-42s %4d  (AWS)\n",     $2, $1; next }
                           { printf "    %-42s %4d  (non-AWS)\n", $2, $1 }'
}
FILTER=("$@")
for entry in "${STACKS[@]}"; do
  label="${entry%%|*}"; dir="${entry#*|}"
  if (( ${#FILTER[@]} )); then
    match=0
    for f in "${FILTER[@]}"; do [[ "$label" == *"$f"* ]] && match=1; done
    (( match )) || continue
  fi
  summarize_stack "$label" "$dir"
done
say ""; say "Done. (read-only report — nothing was changed)"
