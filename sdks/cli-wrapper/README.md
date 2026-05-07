# Legacy CLI Wrapper (Deprecated)

This package is retained only as a historical artifact.

The canonical CLI now lives at [packages/cli](../../packages/cli) and publishes as `@clawdb/cli`.

## Migration

1. Install the canonical package:

```bash
npm install -g @clawdb/cli
```

2. Use the same command name:

```bash
clawdb --help
```

3. For package development in this repo, work in [packages/cli](../../packages/cli).

## Compatibility note

To avoid package-name collisions, this legacy wrapper is marked private and no longer uses the `clawdb` bin name.
