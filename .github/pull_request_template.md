## Summary

Describe the change and why it is needed.

## Validation

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`

## API / Output Compatibility Checklist

- [ ] I reviewed tool input/output schema impacts.
- [ ] I added/updated contract tests for response-shape changes.
- [ ] I updated README tool docs/examples when behavior changed.
- [ ] I added a migration note in `docs/migrations/` if output shape changed.

## Breaking Change Checklist

- [ ] This PR introduces no breaking tool input/output changes.
- [ ] If breaking, I documented exact before/after payload differences.
- [ ] If breaking, I included explicit upgrade guidance for agent callers.
- [ ] If breaking, I called it out in `CHANGELOG.md`.
