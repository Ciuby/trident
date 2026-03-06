# WEB HAMMER ROADMAP

## Status

Last updated: 2026-03-06

## Completed

- Initialized the `web-hammer` Bun workspace monorepo.
- Added the architecture source of truth in `ARCHITECTURE.md`.
- Scaffolded the Vite + React + TypeScript editor app in `apps/editor`.
- Created initial workspace packages for the editor core, geometry kernel, render pipeline, tool system, shared types, and workers.
- Wired a minimal editor shell that respects the architecture rule that React is UI-only and geometry lives outside React state.
- Declared and installed the initial dependency set from the architecture spec.
- Implemented the Phase 1 viewport baseline with a render-pipeline-derived scene, perspective editor camera rig, construction grid, and entity markers.
- Expanded `editor-core` with scene revision tracking, mutation helpers, selection actions, redoable commands, and richer editor events.

## Next

- Phase 3: implement convex brush reconstruction from half-space plane definitions.
- Phase 4: introduce editable mesh topology with half-edge structures and triangulation utilities.
- Phase 5: build hit testing, raycasting, and marquee selection on top of BVH-backed render data.
- Phase 6: implement transform tools, snapping, duplication, and mirror workflows.
- Phase 7: add brush editing operations such as clip, split, hollow, merge, and face extrusion.
- Phase 8: add mesh editing tools such as extrude, bevel, split edge, loop cut, and merge vertices.
- Phase 9: add materials, assets, entity authoring, and worker-backed async jobs.
- Phase 10: implement `.whmap` persistence plus GLTF and engine export flows.

## Notes

- Keep geometry authoritative inside workspace packages, not React components.
- Prefer worker-backed incremental rebuilds for heavy geometry and export tasks.
- Treat `ARCHITECTURE.md` as the source of truth when the roadmap and implementation diverge.
