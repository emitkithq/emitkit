#!/bin/zsh
# Worktree setup for Conductor (conductor.json) and Paseo (paseo.json): link
# the gitignored local files from the main checkout, install dependencies,
# migrate local D1. Runs from the new worktree.
set -e
cd "${0:A:h}/.."

ROOT="${CONDUCTOR_ROOT_PATH:-$PASEO_SOURCE_CHECKOUT_PATH}"
if [ -z "$ROOT" ]; then
  echo "Neither CONDUCTOR_ROOT_PATH nor PASEO_SOURCE_CHECKOUT_PATH is set" >&2
  exit 1
fi

link_from_root() {
  local file="$1"
  if [ -e "$file" ] && [ ! -L "$file" ]; then
    echo "  keep: $file (workspace has its own copy)"
  elif [ -f "$ROOT/$file" ]; then
    ln -sf "$ROOT/$file" "$file"
    echo "  link: $file -> $ROOT/$file"
  else
    echo "  skip: $ROOT/$file not found"
  fi
}

echo "==> Linking local config from $ROOT"
link_from_root .dev.vars   # local Worker secrets (docs/content/self-hosting/development.md)
link_from_root .env.local  # deploy credentials (docs/content/self-hosting/deployment.md)

echo "==> Installing dependencies"
pnpm install

echo "==> Applying local D1 migrations"
pnpm db:migrate:local
