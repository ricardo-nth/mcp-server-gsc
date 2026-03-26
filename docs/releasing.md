# Releasing Guide

This project uses a manual npm publish flow with automated release and packaging checks.

## Pre-Release Checklist

1. Update `CHANGELOG.md` under `[Unreleased]`.
2. Add migration notes under `docs/migrations/` for any response-shape changes.
3. Sync generated README tool metadata:

```bash
pnpm docs:sync
```

4. Run the full validation gate:

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:mcp-smoke
pnpm docs:check
pnpm release:check
pnpm package:check
```

## Version Bump And Tag

1. Bump version:

```bash
pnpm version <patch|minor|major>
```

2. Move relevant changelog entries from `[Unreleased]` to a version/date section.
3. Commit release metadata:

```bash
git add package.json package-lock.json CHANGELOG.md README.md docs/migrations docs/releasing.md docs/operations.md
git commit -m "release: vX.Y.Z"
```

4. Push commit and tag:

```bash
git push origin main --follow-tags
```

5. Authenticate with npm if needed:

```bash
npm login --auth-type=web
```

6. Publish package from `main`:

```bash
pnpm publish --access public
```

## Required CI Status Checks

For merges to `main`, require these checks from `.github/workflows/ci.yml`:

- `Type check`
- `Test`
- `Build`
- `Docs check`
- `Release check`
- `MCP smoke test`
- `Package dry run`
