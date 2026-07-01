#!/bin/sh
# Run once after a fresh clone to install the pre-commit hook.
# Usage: sh scripts/install-hooks.sh
set -e

ROOT=$(git rev-parse --show-toplevel)
HOOKS="$ROOT/.git/hooks"

cat > "$HOOKS/pre-commit" << 'HOOK'
#!/bin/sh
# Auto-fix backend ESLint/Prettier before every commit.
# Blocks the commit only if lint:fix exits non-zero (unresolvable errors).
set -e

ROOT=$(git rev-parse --show-toplevel)

cd "$ROOT/backend"
npm run lint:fix

# Re-stage any backend files that lint:fix modified
FIXED=$(git -C "$ROOT" diff --name-only | grep '^backend/' || true)
if [ -n "$FIXED" ]; then
  echo "$FIXED" | xargs git -C "$ROOT" add
fi
HOOK

chmod +x "$HOOKS/pre-commit"
echo "pre-commit hook installed."
