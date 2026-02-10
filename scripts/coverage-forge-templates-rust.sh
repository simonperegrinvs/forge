#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="${ROOT_DIR}/src-tauri"
COVERAGE_DIR="${TAURI_DIR}/target/coverage-forge-templates"

LLVM_PROFDATA=""
LLVM_COV=""

if command -v xcrun >/dev/null 2>&1; then
  LLVM_PROFDATA="$(xcrun --find llvm-profdata || true)"
  LLVM_COV="$(xcrun --find llvm-cov || true)"
else
  LLVM_PROFDATA="$(command -v llvm-profdata || true)"
  LLVM_COV="$(command -v llvm-cov || true)"
fi

if [[ -z "${LLVM_PROFDATA}" || -z "${LLVM_COV}" ]]; then
  echo "llvm-profdata/llvm-cov not found. Install LLVM (or Xcode Command Line Tools on macOS)." >&2
  exit 1
fi

rm -rf "${COVERAGE_DIR}"
mkdir -p "${COVERAGE_DIR}"

pushd "${TAURI_DIR}" >/dev/null

export CARGO_INCREMENTAL=0
export RUSTFLAGS="-C instrument-coverage"
export LLVM_PROFILE_FILE="${COVERAGE_DIR}/%p-%m.profraw"

TMP_ERR="$(mktemp)"
set +e
cargo test --lib shared::forge_templates_core 2> "${TMP_ERR}"
CARGO_STATUS="$?"
set -e

# Cargo build scripts from instrumented dependencies sometimes try to write
# profiles to a default relative path; drop those noisy messages but keep all
# other stderr intact.
grep -v 'LLVM Profile Error: Failed to write file "target/coverage/' "${TMP_ERR}" >&2 || true
rm -f "${TMP_ERR}"

if [[ "${CARGO_STATUS}" -ne 0 ]]; then
  exit "${CARGO_STATUS}"
fi

"${LLVM_PROFDATA}" merge -sparse "${COVERAGE_DIR}"/*.profraw -o "${COVERAGE_DIR}/merged.profdata"

TEST_BIN="$(ls -t target/debug/deps/codex_monitor_lib-* 2>/dev/null | grep -Ev '\\.(d|rlib|rmeta)$' | head -n 1 || true)"
if [[ -z "${TEST_BIN}" ]]; then
  echo "Could not locate lib test binary under src-tauri/target/debug/deps/." >&2
  exit 1
fi

# Rust's LLVM source coverage reports "region coverage" (basic-block-ish), which is
# the closest practical proxy for "branch coverage" without external tooling.
REPORT_LINE="$("${LLVM_COV}" report --instr-profile "${COVERAGE_DIR}/merged.profdata" --show-region-summary "${TEST_BIN}" | grep -m 1 "forge_templates_core.rs" || true)"
if [[ -z "${REPORT_LINE}" ]]; then
  echo "Could not find forge_templates_core.rs in llvm-cov report output." >&2
  exit 1
fi

REGION_COVER="$(echo "${REPORT_LINE}" | awk '{print $4}' | sed 's/%$//')"
THRESHOLD="${1:-80}"

echo "forge_templates_core.rs region coverage: ${REGION_COVER}% (threshold: ${THRESHOLD}%)"
echo "${REPORT_LINE}"

awk -v cover="${REGION_COVER}" -v threshold="${THRESHOLD}" 'BEGIN { exit !(cover+0 >= threshold+0) }' || {
  echo "FAIL: region coverage below threshold." >&2
  exit 1
}

popd >/dev/null
