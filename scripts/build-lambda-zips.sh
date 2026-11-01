#!/usr/bin/env bash
# Build the three Lambda deployment zips that infra/serverless expects
# (variables.tf defaults: artifacts/{java,node,python}-service.zip).
#
# Usage:  bash scripts/build-lambda-zips.sh     (from anywhere; resolves repo root)
#         SKIP_JAVA=1 bash scripts/build-lambda-zips.sh   (node/python zips only)
# Needs:  mvn + JDK 21 for the java zip (fatal if the build fails — Terraform
#         requires all three zips; skip explicitly with SKIP_JAVA=1),
#         zip OR python3 for the node/python zips.
set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/infra/serverless/artifacts"
JAVA_DIR="$ROOT/demo-lambda-java-service"
NODE_DIR="$ROOT/demo-lambda-node-service"
PY_DIR="$ROOT/demo-lambda-python-service"

die() { echo "❌ $*" >&2; exit 1; }

mkdir -p "$OUT"

# zip if available, python3 zipfile fallback (for minimal WSL images without zip)
make_zip() {
  local out="$1" src_dir="$2"; shift 2
  if command -v zip >/dev/null 2>&1; then
    (cd "$src_dir" && zip -q -r "$out" "$@")
  elif command -v python3 >/dev/null 2>&1; then
    (cd "$src_dir" && python3 -m zipfile -c "$out" "$@")
  else
    die "Neither 'zip' nor 'python3' found — cannot create archives"
  fi
}

# --- Java: Spring Boot -> maven-shade produces a single jar; a jar IS a valid Lambda zip ---
if [[ "${SKIP_JAVA:-0}" == "1" ]]; then
  echo "⚠️  SKIP_JAVA=1 — skipping java zip (Terraform deploy will fail until you build it)"
elif command -v mvn >/dev/null 2>&1; then
  echo "📦 java: mvn clean package (shaded jar)..."
  if ! (cd "$JAVA_DIR" && mvn -q clean package -DskipTests); then
    die "java build failed (needs JDK 21; this machine has: $(java -version 2>&1 | head -1)).
     Install JDK 21, or re-run with SKIP_JAVA=1 to build only the node/python zips."
  fi
  jar=""
  for f in "$JAVA_DIR"/target/*.jar; do
    [[ "$f" == */original-* ]] && continue   # shade keeps the pre-shade jar as original-*.jar
    jar="$f"
  done
  [ -n "$jar" ] || die "no shaded jar in $JAVA_DIR/target (got: $(ls "$JAVA_DIR"/target 2>/dev/null | tr '\n' ' '))"
  cp "$jar" "$OUT/java-service.zip"
  echo "✅ java-service.zip"
else
  echo "⚠️  mvn not found — skipping java zip (install Maven + JDK 21 to build it)"
fi

# --- Node: handler.js + package.json, zero runtime deps ---
[ -f "$NODE_DIR/handler.js" ]   || die "missing $NODE_DIR/handler.js"
[ -f "$NODE_DIR/package.json" ] || die "missing $NODE_DIR/package.json"
make_zip "$OUT/node-service.zip" "$NODE_DIR" handler.js package.json
echo "✅ node-service.zip"

# --- Python: stdlib only ---
[ -f "$PY_DIR/lambda_function.py" ] || die "missing $PY_DIR/lambda_function.py"
make_zip "$OUT/python-service.zip" "$PY_DIR" lambda_function.py
echo "✅ python-service.zip"

echo "Done: $OUT"
ls -lh "$OUT"
