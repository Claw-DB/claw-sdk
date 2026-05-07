# @clawdb/types

Shared TypeScript domain types used across ClawDB SDKs and adapters.

## Install

```bash
npm install @clawdb/types
```

## Exports

Core models:
- `MemoryRecord`
- `MemoryType`
- `SearchResult`
- `BranchInfo`
- `BranchStatus`
- `SyncResult`
- `ReflectJob`
- `ClawDBSession`
- `ClawDBConfig`
- `ClawDBError`
- `ClawDBErrorCode`

## Example

```ts
import type { MemoryRecord, MemoryType } from '@clawdb/types';

const kind: MemoryType = 'task';
const memory: Partial<MemoryRecord> = {
  content: 'Ship release notes',
  memoryType: kind,
};
```

## Notes

- `createdAt`, `updatedAt`, and related temporal fields are represented as `Date` objects in the TypeScript surface.
- Error codes here are the shared wire-level codes; `@clawdb/errors` extends them with client-only variants such as `SESSION_EXPIRED`.
