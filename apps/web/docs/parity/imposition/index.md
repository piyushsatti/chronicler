# Imposition declaration index

Per-route `PageDeclaration` docs live beside features as ports complete. Wave 5+ tasks add `docs/parity/imposition/<route-segment>.md` entries here.

## Registered product pages (partial)

| Route | Declaration doc | Status |
| --- | --- | --- |
| `/` | _(inline HomePage)_ | partial |
| `/quests/:code` | _(inline QuestDetailPage)_ | partial |
| `/characters/:code` | _(inline CharacterPage)_ | partial |
| `/chronicles` | _(inline ChroniclesListPage)_ | partial |
| `/chronicles/:id` | _(inline ChronicleDetailPage)_ | partial |
| `/codex` | _(inline CodexPage)_ | partial |
| `/rules` | _(inline RulesPage)_ | partial |

## Exceptions (no PageHost required)

| Surface | Layout mode | Owner |
| --- | --- | --- |
| Editor workspace | `editor-workspace` | T510-editor-core |
| Gallery | `gallery` | T619-admin-gallery |
| Admin workspace shell | custom chrome | T610-admin-shell |
