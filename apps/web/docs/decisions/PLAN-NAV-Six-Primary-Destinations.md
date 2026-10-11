# Six primary navigation destinations

## Context

The prior product-surface rule described an exact five-item bar: Home, Quests, Characters, Codex, and Map. On 2026-10-10 in Toronto, the human owner chose to keep the current six primary destinations. The previous rule no longer describes the accepted navigation.

## Decision

Keep Home, Quests, Chronicles, Codex, Rules, and Community as the six primary destinations, as listed by `PRIMARY_DESTINATIONS` in [`destinations.ts`](/apps/web/src/chrome/destinations.ts). Verification remains a separate link shown to members with `canVerify`; it is not a primary destination. Other routes, including Characters and Map, remain accessible through their existing route and link flows.

Retain the current responsive composition: `@pi/react-imposition` and `navPatternFor` allocate the navigation pattern, while `PageHost` remains the page composition boundary. This decision records the accepted destinations without changing that architecture.

## Alternatives rejected

- Keep the obsolete five-item list, which contradicts the current accepted destinations.
- Count conditional Verification as a seventh primary destination, which misstates its role-authorized link policy.

## Consequences

The product-surface description follows the six primary destinations. This decision does not remove other routes or alter Verification visibility policy.

## Enforced by

`PRIMARY_DESTINATIONS` and `destinationsForAuth` in [`destinations.ts`](/apps/web/src/chrome/destinations.ts) define the primary list and conditional Verification link. The responsive allocation remains documented in [Web architecture](/apps/web/docs/architecture.md#responsive-layout).

## Reopen triggers

Reopen if the human owner changes the primary destinations or changes the role policy for Verification.
