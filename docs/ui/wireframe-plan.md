# Wireframe plan (branch `ui/wireframe`, no commits yet)

Sources:

- Mortal's Figma "Chronicler Lowfi Wireframe". Specs read from the Properties panel are in [figma-specs.md](/docs/ui/figma-specs.md).
- A code read of `apps/web/src`, plus spot checks.

Values marked "unread" in the specs were not visible on screen. On 02 Home and 03 Quests, small values (6/8, 9/15/16) may be off by a digit.

## Decisions needed before building

1. **Visual style.** The wireframe is greyscale and uses Inter. The site uses its own theme: warm palette, Fraunces headings, Geist body, Lexend titles (`styles/tokens.css:7-15`). Proposal: take layout, spacing, sizes and type scale from the wireframe, and keep the site's colours and fonts.
2. **Verification in the top nav.** The wireframe keeps it. You said it should go (it is the same page as Admin → Review).
3. **Site sections the wireframe does not have.** Keep or drop each:
   - Home: "New here" shelf and "DMs accepting requests" lane.
   - Quests: status segments, "Live now" band, meta chips, text search.
   - Chronicle view: "Related entries".
4. **Work that needs backend changes.** Proposal: later, not in this branch:
   - Quest Request Form (no schema support).
   - Hex map (the site's map is a pointcrawl, not a hex grid).
   - "Recently happened" limited to the last 2 weeks of summaries (the API has no date filter). This one can be done client-side for now.

## Shared layout (all pages)

- **Content column:** 1100px wide. Padding 48 top/bottom and 170 left/right at 1440. The gap between sections is 28. Quest pages and chronicle view use 40 top/bottom with gap 20/24.
- **Type scale:**
  - Page title: 36 bold.
  - Section heading: 20 bold.
  - Card title: 15 bold.
  - Body: 14.
  - Meta: 12.
  - Nav pills: 12 bold.
- **Cards:** radius 8, 1px border. Padding 16 for list cards, 20 for detail cards, 24 for forms. Inner gap 6. Grid gap 16, 3 per row.
- **Buttons:** radius 10, padding 9/16. Primary is filled; secondary is outlined. Button groups have gap 8.
- **Top nav:** 65 tall, padding 14/24. Pill padding 6/11. Search box 220×36. Avatar 36.
  - Nav items in the wireframe: Home, Quests, Chronicles, Codex, Rules, Community, Verification, Admin, Onboarding, Map.
  - Site today: no Onboarding (`/welcome` exists) and no Map (it sits under Codex).

## Pages, in proposed build order

1. **Shell + nav** (`chrome/SiteChrome.tsx`, `chrome/destinations.ts`):
   - Add Onboarding → `/welcome` and Map → `/map`.
   - Settle Verification (decision 2).
   - Add the DM page link (`/dm`) for DMs.
   - Apply the content-column spacing.
2. **Home** (`features/home/pages/HomePage.tsx`):
   - Lanes become Now recruiting, Happening today (new), Upcoming weeks (3 cards, not a week strip), and Recently happened (summaries as cards, not a closed-quests table).
   - Sub-line format "New · N quests · N active characters".
   - The banner stays admin-set.
3. **Quests** (`features/quest/components/QuestBoardView.tsx`):
   - Title "The Tavern Board".
   - Buttons: Filter Quests, Request Quest and + New quest.
   - The filter popover has DM, Today and a specific date. The API already supports `dmId`/`scheduledFrom`/`scheduledTo`.
   - Request Quest waits for backend (decision 4).
4. **Quest page** (`features/quest/pages/QuestDetailPage.tsx`):
   - Tabs Quest Details, Cast and Table Rules.
   - Table Rules comes from the DM profile's `houseRules`, which needs a second query.
   - Also: series picker on create (`?arcId=`), from the earlier issue list.
5. **Profile** (`/me`, `chrome/MeShell.tsx`, `features/member/pages/MePage.tsx`):
   - One button group beside the name: Overview, Characters, Quest History, Summaries, Settings, Sign out.
   - Banner, stats row, "Since you joined", then Recent Activity listing your summaries with links.
6. **Chronicle view** (`features/chronicle/pages/ChronicleDetailPage.tsx`):
   - "← All Chronicles".
   - Game date in the header meta.
   - A Quest Details chip bar (quests, region, DM).
7. **Remaining pages:** Sign in, Chronicles list, Codex, Rules, Characters, Character page, Verification, DM Table, DM Table form, Settings. Align spacing and structure with the specs file, one page at a time.
8. **Editor box fix** (earlier issue 2): one writing surface, with no forced 6rem box and no double outline.

## How we iterate

- Changes live only in `/home/pi/Source/chronicler-ui` (branch `ui/wireframe`). No commits and no PR until you say so.
- The dev server runs on Triton at 127.0.0.1:5174 and uses the local API on 8080. To view it from Mercury, run `ssh -N -L 5174:127.0.0.1:5174 pi@triton`, then open http://localhost:5174.
