# Interface: Media is linked, not hosted

**Status:** accepted  
**Provider:** `apps/api` / product policy  
**Consumers:** `apps/web` authoring UX

## Rule

Chronicler links to media; it does not host object storage for campaign assets as a product feature. Document and map references use URLs/links consistent with this policy.

## Enforcement

| Mechanism                                | Location | Status           |
| ---------------------------------------- | -------- | ---------------- |
| Lint / absence of hosting upload surface | API/web  | **not enforced** |

## Provider

API and schema omit first-party hosting. Local notes under `apps/api/docs/` when present.

## Consumers

Web authoring treats media as external links.

## Related decisions

- [D24](/docs/decisions/D24-Media-Is-Linked-Not-Hosted.md)

## Reopen

Object storage hosting is accepted as an in-product feature with a new ADR.
