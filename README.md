# web-hammer

Browser-based Source-2-style level editor built as a Bun monorepo.

## Workspaces

- `apps/editor`: Vite + React + TypeScript editor shell
- `packages/shared`: cross-cutting types and primitives
- `packages/editor-core`: scene document, selection, commands, event bus
- `packages/geometry-kernel`: brush and mesh kernel entrypoints
- `packages/render-pipeline`: viewport and derived render mesh contracts
- `packages/tool-system`: tool registry and tool state machines
- `packages/workers`: worker task contracts

## Commands

```bash
bun install
bun run dev
bun run build
bun run typecheck
```
