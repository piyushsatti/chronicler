# Waves 3–4 report — primitives / domain / utils

**Status:** DONE_WITH_CONCERNS  
**Date:** 2026-10-10  
**Note:** Uncommitted (no git writes).

## Delivered

- Scaffolded ~74 missing component files under `primitives/`, `interactive/`, `foundation/`, `data/`, `domain/`
- Real APIs for Button, Card, Modal, Chip(+Row), Tabs, Skeleton, EmptyState, ErrorState, `cx`
- Utils: `permissions`, `errorCopy`, `url`/`isSafeInternalPath`, `lazyWithReload` re-export
- Motion/effects: `useMotionCollapse`, `EFFECT_CATALOG`, `useAmbientEffect`
- Tests: Button/EmptyState, permissions

## Concerns / gaps

- Most scaffolds are thin wrappers — visual + behavioral parity for ~80 Vitest ports still open
- Domain audienceBlocks + interactive DateTimePicker etc. still scaffold-level
- Did not touch `src/styles/**` (T020 ownership)
