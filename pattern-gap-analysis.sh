#!/usr/bin/env bash
#
# pattern-gap-analysis.sh — verify every full service implements the canonical
# 32 microservices patterns.
#
# Source of truth: the four pattern catalogs in docs/ (JAVA/NODE/PYTHON/GO-PATTERNS.md),
# each of which must contain exactly 32 `## N. Name Pattern` headings, identical
# across languages. For each language we then check that a pattern
# implementation file exists under its patterns/ directory.
#
# Matching rules (per canonical pattern, in order):
#   1. direct:   file basename normalized (lowercase, alnum only) equals the
#                pattern name, optionally plus a service/controller/pattern
#                suffix (java idiom: CircuitBreakerService, CanaryDeploymentController).
#   2. alias:    explicit table for patterns deliberately colocated in another
#                file (e.g. node's token bucket lives in rateLimiting.js) or
#                renamed (java RedisDistributedLock).
#   3. platform: java Health Check / Metrics Collection are provided by Spring
#                Boot Actuator endpoints, not dedicated classes.
#
# Extras (files that match no canonical pattern) are reported as INFO —
# supporting classes are fine, they are just not part of the 32.
#
# Exit codes: 0 = all four languages cover all 32; 1 = catalog drift or a gap.
# Writes no temp files.

set -euo pipefail
cd "$(dirname "$0")"

FAILED=0

normalize() { # lowercase, keep alphanumerics only
    tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]'
}

parse_catalog() { # parse_catalog <file> — emit canonical pattern names
    grep '^## ' "$1" 2>/dev/null | sed -E 's/^## [0-9]+\. //; s/ Pattern$//' || true
}

# --------------------------------------------------------------------------
# 1. Catalogs: each must have 32 headings; names must agree across languages.
# --------------------------------------------------------------------------
declare -A CANON=()   # normalized key -> canonical display name
for catalog in docs/JAVA-PATTERNS.md docs/NODE-PATTERNS.md docs/PYTHON-PATTERNS.md docs/GO-PATTERNS.md; do
    if [[ ! -f "$catalog" ]]; then
        echo "FAIL  missing catalog: $catalog"
        FAILED=1
        continue
    fi
    count=$(grep -c '^## ' "$catalog" || true)
    if [[ "$count" -ne 32 ]]; then
        echo "FAIL  $catalog has $count '## N. ... Pattern' headings (expected 32)"
        FAILED=1
    fi
    while IFS= read -r name; do
        [[ -z "$name" ]] && continue
        key=$(normalize <<<"$name")
        existing="${CANON[$key]:-}"
        if [[ -n "$existing" && "$existing" != "$name" ]]; then
            echo "FAIL  catalog drift: '$name' vs '$existing' (same key: $key)"
            FAILED=1
        fi
        CANON[$key]="$name"
    done < <(parse_catalog "$catalog")
done

# --------------------------------------------------------------------------
# 2. Collect implementation files per language (normalized basenames).
# --------------------------------------------------------------------------
declare -A FILES_KEYS=() FILES_COUNT=()
collect() { # collect <lang> <dir> <ext>
    local lang="$1" dir="$2" ext="$3" f base keys=""
    while IFS= read -r f; do
        base=$(basename "$f")
        base="${base%.*}"
        keys+="$(normalize <<<"$base") "
    done < <(find "$dir" -type f -name "*.$ext" 2>/dev/null | sort)
    FILES_KEYS[$lang]="${keys% }"
    FILES_COUNT[$lang]=$(wc -w <<<"${keys% }")
}

collect java   demo-java-service/src/main/java/com/example/java_service/patterns java
collect node   demo-node-service/patterns js
collect python demo-python-service/patterns py
collect go     demo-go-service/patterns go

# --------------------------------------------------------------------------
# 3. Coverage check.
# --------------------------------------------------------------------------
declare -A MATCHED=()  # lang:filekey -> 1 (for extras reporting)

match_key() { # match_key <pattern-key> <file-key> — 0 if file implements pattern
    local pat="$1" file="$2"
    if [[ "$file" == "$pat" || "$file" == "${pat}service" || "$file" == "${pat}controller" || "$file" == "${pat}pattern" ]]; then
        return 0
    fi
    return 1
}

alias_for() { # alias_for <lang> <pattern-key> — echo explicit alternative file keys
    local lang="$1" pkey="$2"
    case "$lang:$pkey" in
        # java: renamed classes + CQRS/saga implemented via handler/orchestrator classes
        java:cqrs)                    echo "commandhandler queryhandler command query" ;;
        java:saga)                    echo "sagaorchestrator" ;;
        java:reactiveprogramming)     echo "reactivecontroller" ;;
        java:reactivestreams)         echo "reactivecontroller" ;;
        java:distributedlock)         echo "redisdistributedlock" ;;
        java:stranglerfig)            echo "stranglerfigpattern stranglerfigservice" ;;
        # node: camelCase short filenames + colocated patterns
        node:bluegreendeployment)     echo "bluegreen" ;;
        node:canarydeployment)        echo "canary" ;;
        node:writebehindcache)        echo "writebehind" ;;
        node:tokenbucketratelimiter)  echo "ratelimiting" ;;
        node:reactiveprogramming)     echo "async advanced" ;;
        node:reactivestreams)         echo "advanced" ;;
        node:asyncprocessing)         echo "async" ;;
        node:eventstreamprocessor)    echo "eventstreaming" ;;
        node:anticorruptionlayer)     echo "apigateway" ;;
        node:stranglerfig)            echo "apigateway strangler" ;;
        # python: snake_case short filenames + colocated patterns
        python:bluegreendeployment)   echo "bluegreen" ;;
        python:canarydeployment)      echo "canary" ;;
        python:writebehindcache)      echo "writebehind" ;;
        python:tokenbucketratelimiter) echo "ratelimiting" ;;
        python:reactiveprogramming)   echo "reactivestreams" ;;
        python:eventstreamprocessor)  echo "eventstreaming" ;;
        # go: camelCase short filenames
        go:bluegreendeployment)       echo "bluegreen" ;;
        go:canarydeployment)          echo "canary" ;;
        go:writebehindcache)          echo "writebehind" ;;
        go:tokenbucketratelimiter)    echo "tokenbucket" ;;
        go:reactiveprogramming)       echo "reactivestreams" ;;
        *) echo "" ;;
    esac
}

cover() { # cover <lang> <name> <pattern-key> — 0 if covered
    local lang="$1" name="$2" pkey="$3" fk aliases=() hit=""

    # platform-provided (no dedicated file by design)
    if [[ "$lang" == java && ( "$pkey" == healthcheck || "$pkey" == metricscollection ) ]]; then
        echo "INFO  java '$name' — provided by Spring Boot Actuator (/actuator/health, /actuator/metrics)"
        return 0
    fi

    # implemented inline in the app entrypoint rather than patterns/
    if [[ "$lang" == python && "$pkey" == eventsourcing ]]; then
        echo "INFO  python '$name' — implemented inline in app.py (class EventStore + /event-sourcing route)"
        return 0
    fi

    # pass 1: direct / suffix match
    for fk in ${FILES_KEYS[$lang]}; do
        if match_key "$pkey" "$fk"; then
            MATCHED[$lang:$fk]=1
            if [[ "$fk" != "$pkey" ]]; then
                echo "INFO  $lang '$name' — implemented as '$fk'"
            fi
            return 0
        fi
    done

    # pass 2: explicit alias / colocation table
    read -r -a aliases <<<"$(alias_for "$lang" "$pkey")"
    for fk in ${FILES_KEYS[$lang]}; do
        for hit in "${aliases[@]}"; do
            if [[ "$fk" == "$hit" ]]; then
                MATCHED[$lang:$fk]=1
                echo "INFO  $lang '$name' — colocated in '$fk'"
                return 0
            fi
        done
    done

    echo "GAP   $lang '$name' — no implementation file found"
    return 1
}

echo "=== Pattern coverage vs canonical 32 (from *-PATTERNS.md catalogs) ==="
echo
for lang in java node python go; do
    echo "--- $lang (${FILES_COUNT[$lang]} files under patterns/) ---"
    missing=0
    while IFS= read -r key; do
        if ! cover "$lang" "${CANON[$key]}" "$key"; then
            missing=1
        fi
    done < <(printf '%s\n' "${!CANON[@]}" | sort)

    # extras: files not claimed by any canonical pattern (INFO only)
    extras=""
    for fk in ${FILES_KEYS[$lang]}; do
        if [[ -z "${MATCHED[$lang:$fk]:-}" ]]; then
            extras+="$fk "
        fi
    done
    if [[ -n "$extras" ]]; then
        echo "INFO  $lang extras (supporting classes / beyond the canonical 32): ${extras% }"
    fi

    if [[ "$missing" -eq 1 ]]; then
        echo ">>> $lang: GAPS FOUND"
        FAILED=1
    else
        echo "OK    $lang covers all 32 canonical patterns"
    fi
    echo
done

if [[ "$FAILED" -ne 0 ]]; then
    echo "RESULT: FAIL — resolve the GAP lines (and catalog drift) above"
    exit 1
fi
echo "RESULT: PASS — all 4 languages cover all 32 canonical patterns"
exit 0
