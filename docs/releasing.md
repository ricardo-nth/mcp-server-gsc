# Releasing Guide

This project uses a simple release flow with explicit quality gates and changelog updates.

## Pre-Release Checklist

1. Update `CHANGELOG.md` under `[Unreleased]`.
2. Add migration notes under `docs/migrations/` for any response-shape changes.
3. Run the full validation gate:

```bash
pnpm lint && pnpm test && pnpm build
```

## Version Bump And Tag

1. Bump version:

```bash
pnpm version <patch|minor|major>
```

2. Move relevant changelog entries from `[Unreleased]` to a version/date section.
3. Commit release metadata:

```bash
git add package.json pnpm-lock.yaml CHANGELOG.md docs/migrations
git commit -m "release: vX.Y.Z"
```

4. Push commit and tag:

```bash
git push origin main --follow-tags
```

5. Publish package:

```bash
pnpm publish --access public
```

## Required CI Status Checks

For merges to `main`, require these checks from `.github/workflows/ci.yml`:

- `Type check`
- `Test`
- `Build`
