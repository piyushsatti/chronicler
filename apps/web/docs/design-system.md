# Frontend Design System Hierarchy

Last updated: 2026-06-27

## Layer stack

```
tokens.css → atlas.css primitives → foundation React → domain components → feature pages
```

| Layer             | Location                                                 | Examples                                           |
| ----------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Tokens            | `app/styles/tokens.css`, `atlas-vendor/atlas-tokens.css` | `--ink`, `--sp-4`, `--accent`                      |
| CSS primitives    | `app/styles/atlas.css`, `contexts.css`                   | `.card`, `.btn`, `.chip`, `.tabs`                  |
| Foundation React  | `app/components/foundation/`                             | `Box`, `StatusBadge`, `PageShell`, `Markdown`      |
| Domain components | `app/components/domain/`, `data/`                        | `OpenQuestCard`, `CastSection`, `ReliabilityBadge` |
| Feature UI        | `app/features/*/components/`                             | `CastTab`, `MyCharCardContainer`, atlas map panels |

## Rules

1. **No page-injected `<style>` blocks** — use scoped CSS modules (`*.module.css`) or Atlas classes.
2. **No hardcoded semantic hex in components** — use CSS variables (`var(--good)`, `var(--live)`).
3. **Reusable components receive view props only** — no `api/generated` or `api/types` imports.
4. **Feature pages wire hooks → adapters → view models → components.**

## High-use primitive conversion order

1. Card/panel (`.card`, `Box`)
2. Button (`.btn`)
3. Chip/status (`.chip`, `StatusBadge`)
4. Form fields (inputs in edit panels)

Personalize page styles live in `features/personalize/injectPersonalizeStyles.ts` (migration target: `personalize.module.css`).
