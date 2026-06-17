#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${CODEX_HOME:-$HOME/.codex}/skills/xhs-browser-research"

mkdir -p "$(dirname "$target")"
rm -rf "$target"
cp -R "$repo_root/xhs-browser-research" "$target"

mkdir -p "${CODEX_HOME:-$HOME/.codex}/browser-mcp/xhs-profile" "${CODEX_HOME:-$HOME/.codex}/browser-mcp/output"

echo "Installed xhs-browser-research to $target"
echo "If Playwright MCP is not configured yet, copy config.example.toml into ~/.codex/config.toml."
