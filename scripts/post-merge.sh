#!/usr/bin/env bash
set -euo pipefail

# Always run from the project root, including when invoked outside the workspace.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Use the committed lockfile and never prompt or enable a hosted service.
npm ci --no-audit --no-fund --prefer-offline
npm run build:account
