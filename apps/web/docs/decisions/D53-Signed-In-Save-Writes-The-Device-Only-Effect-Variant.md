# D53: Signed-In Save Writes The Device-Only Effect Variant

**Status:** ruled-provisional 2026-11-14
**Kind:** local
**Owner:** `apps/web/docs/decisions/`
**Interface:** n/a

## Context

Issue #110 gives account settings one owner: the server for signed-in members, the device for signed-out visitors. Its Done-when says the settings form writes device preferences only for signed-out visitors. The background effect variant is stored only on the device (the server stores on or off), so a signed-in Save that follows that rule loses the chosen variant.

## Decision

A signed-in Save writes the background effect variant to the device, once, after the server save succeeds and only if the session is still the one that started the save. This is the single exception to "signed-in settings live on the server". Time zone and notification flags are never copied from the server to the device by the sync step.

On reload, dates use the device's cached time zone until the settings query answers. This is accepted.

Decided by the lead agent under the owner's 2026-11-14 delegation; provisional until the owner confirms.

## Alternatives rejected

| Alternative                           | Why not                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| Store the variant on the server       | Needs a schema and contract change for a cosmetic device choice |
| Write the variant on every form change | Brings back writes before Save, which #110 removes             |
| Follow Done-when literally            | The chosen variant is lost on a signed-in Save                 |

## Consequences

The variant does not follow a member to another device. The settings form has exactly one device write for signed-in members.

## Enforced by

Settings form and sync tests that land with issue #110. Until then: **not enforced**.

## Reopen triggers

- The variant must follow a member across devices.
- A second device-only setting appears; then name the group instead of adding exceptions.
