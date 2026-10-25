# Chronicler Lowfi Wireframe - layout specs (read from Figma Properties panel)

## Shared tokens

Font: Inter everywhere; line height 100% on every text node read; letter spacing 0% except eyebrow/label caps (8% on "PREFERENCES"/"PERSONALIZE"/"PROFILE"/"PLAYER CHARACTER XP", 6% on empty-state caps).
Colors (hex read): page bg #FAFAFA; card/nav/input fill #FFFFFF; border #8C8C8C (1px, all sides; nav = bottom only); text primary #262626; text secondary #666666; muted text #808080; caption/eyebrow #737373; button dark fill #333333 (text #FFFFFF; secondary button text #333333); active pill/tab fill #D1D1D1; avatar placeholders #BFBFBF (also #D9D9D9 for large avatars); banner fill #E6E6E6; featured banner fill #EBEBEB; preview banner #F2F2F2; list-box fill #F7F7F7; timeline dot #595959; dev-note fill #FFF5C7 (given).
Type scale (Inter): H1 36px Bold (page titles); hero title 40px Bold; 28px Bold (banner title/handle/MORTAL BARD); 32px Bold (Character name, hex heading); 24px Bold (entry title, PCXP); 20px Bold (section headings, stat values); 16px Bold/Regular (card title, subtitle on quest page); 15px Bold (card titles); 14px Regular (body, subtitles, labels) / Bold (buttons); 13px Regular (small body, list items); 12px Regular (meta/captions; Bold for nav pills, chips) ; 11px (eyebrows, chips); 10px (dropdown caption).
Radii: 8 (cards, inputs, small panels), 10 (buttons, pills, chips, search, larger panels), 12 (hero cards, hero banner, quest-page cards), 32/48/44 px full circles (96/88 avatars).
Padding: page content frame T48 R170 B48 L170 (inner width 1100) with gap 28 (variants: T40/B40 gap 20/24 on Quest pages and Chronicle View; T36 gap 20 on Character Page); card padding 16 (list/entry cards), 20 (profile/detail cards), 24 (form/settings cards, Hex details); button padding T9 R16 B9 L16 gap 12; secondary button 9/15-16; nav pill 6/11 gap 12; chip 4/10 (5/12 in settings & quest tabs); input/select 9/12 (9/14 for select) height 36-37.
Gaps: card grids 16; card inner stack 6 (title+meta), 8-12 for richer cards; section stack 12; header title stack 6; button group 8.
Component sizes: page frame 1440x1059; top nav 65 tall (padding 14/24, gap 4); logo box 32x32; search 220x36; header ellipses 28 and 36; primary button 35 tall; secondary button 37 tall (border adds 2); card heights hug content.
Caveat: some 6/8/16/18 readings on 02 Home and 03 Quests were first taken at low zoom; card padding/gaps corrected to 16 on those frames, other small values there may be slightly off (re-check if exact).

## Page frame (all)

- 1440x1059 fixed; vertical; min height 900; fill #FAFAFA (given)

## Top nav (shared; read on 02 Home)

- Top nav: Horizontal; W Fill(1440); H Hug(65); padding T14 R24 B14 L24; gap 4; fill #FFFFFF; border 1px bottom only #8C8C8C inner
- Logo box (first child): Vertical; 32x32 fixed; radius 8; border 1px #8C8C8C all sides; gap 12; no fill
- Nav pill active ("Home"): Horizontal; Hug (57x27); radius 10; padding T6 R11 B6 L11; gap 12; fill #D1D1D1; no border read
- Nav pill inactive ("Quests"): Hug (64x29); radius 10; padding 6/11/6/11; gap 12; border 1px #8C8C8C all sides; no fill. (Pills = Home, Quests, Chronicles, Codex, Rules, Community, Verification, Admin, Onboarding, Map)
- Pill text: Inter Bold 700, 12px, line height 100%, letter spacing 0%, color #262626 (read on "Home" text)
- Spacer frame: Horizontal; W Fill; H Fixed 1px; gap 12 (pushes search/avatar right)
- Search box: Horizontal; W Fixed 220; H Fixed 36; radius 10; padding T8 R14 B8 L14; gap 8; border 1px #8C8C8C; no fill
- Search placeholder text "⌕ Search the chronicle": Inter Regular 400, 13px, line height 100%, color #8C8C8C
- Ellipse 1 (white circle): 28x28; fill #FFFFFF; border 1px #8C8C8C all sides
- Ellipse 2 (avatar): 36x36; fill #BFBFBF; no border
- Nav differences: 01 Sign in nav has pills Home, Quests, Chronicles, Codex, Rules, Community, Onboarding, Map (no Verification, no Admin) and a "Log in" button instead of ellipses; all other frames show Home..Map including Verification and Admin

## 02 Home

- 02 Home frame: 1440x1059 vertical (given). Children: Top nav (1440 Fill x 65 Hug), Frame (content)
- Content Frame: Vertical; W Fill(1440); H Hug(930); padding T48 R170 B48 L170; gap 28; no fill (=> inner width 1100)
- Header row: Horizontal; W Fill(1100); H Hug(67); justify space-between
- Header text stack: Vertical; Hug 510x67; gap 6
- Greeting "Good afternoon, Mortal bard.": Inter Bold 700, 36px, LH 100%, LS 0%, color #262626 (510x44)
- Subtitle "New · 0 quests · 0 active characters": Inter Regular 400, 14px, LH 100%, color #808080 (238x17)
- Banner (featured event): Vertical; W Fill(1100); H Hug(191); min height 180; radius 12; padding 32 all; gap 8; fill #EBEBEB; border 1px #8C8C8C all sides
- Banner eyebrow "Featured event · banner links to a recent event": Inter Regular 12px LH100%, color #737373
- Banner title "Event title goes here": Inter Bold 700, 28px, LH 100%, color #262626
- Banner teaser "One-line teaser for the event.": Inter Regular 14px LH100%, color #666666
- Banner button "View event": Horizontal; Hug 109x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333; no border. Text Inter Bold 700 14px LH100% color #FFFFFF
- Section (e.g. "Now — recruiting"): Vertical; W Fill(1100); H Hug(109); gap 12
- Section heading: Inter Bold 700, 20px, LH 100%, color #262626 (169x24)
- Card row: Vertical wrapper Fill(1100) H Hug(73); inner row Horizontal; Fill(1100) x Hug 73; gap 16 (3 cards per row)
- Card: Vertical; W Fill (356px each); H Hug(73); radius 8; padding 16 all (re-read at high res); gap 6; fill #FFFFFF; border 1px #8C8C8C all sides
- Card title "The Lantern at Lowmere": Inter Bold 700, 15px, LH 100%, color #262626 (322x18)
- Card meta "Open · One-shot · Sat 7pm · 3/4 seats": Inter Regular 400, 12px, LH 100%, color #808080 (322x15)
- Sections on page: Now — recruiting, Happening today, Upcoming weeks, Recently happened (same structure)

## 01 Sign in

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA
- Top nav: same as shared, but right side has "Log in" button instead of search + 2 ellipses (Home pill active)
- Log in button: Horizontal; Hug 74x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333
- Content Frame: Vertical; W Fill(1440); H Hug(417); padding T170 R170 B48 L170; gap 28 (children centered visually; alignment field not shown in panel)
- Title "Sign in": Inter Bold 700, 40px, LH 100%, color #262626 (133x48)
- Description "Connect your Discord account to see your dashboard, characters and quest history.": Inter Regular 400, 14px, LH 100%, color #262626 (555x17)
- Note "Anonymous browsing works without signing in.": Inter Regular 12px LH100% color #808080 (266x15)
- Button "Sign in with Discord": Horizontal; Hug 168x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333. Text Inter Bold 700 14px LH100% color #FFFFFF

## 03 Quests

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA
- Top nav: shared (Quests pill active/filled #D1D1D1; pills Home..Map incl. Verification, Admin)
- Content Frame: Vertical; Fill(1440) x Hug(353); padding T48 R170 B48 L170; gap 28
- Header row: Horizontal; Fill(1100) x Hug(67); justify space-between
- Title stack: Vertical; Hug 309x67; gap 6 (corrected from 03b high-res read; 8 was low-res)
- Title "The Tavern Board": Inter Bold 700, 36px, LH 100%, LS 0% (309x44); color unread (same #262626 as other H1s on Home)
- Subtitle "0 quests open": Inter Regular 400, 14px, LH 100%, color #808080
- Button group: Horizontal; Hug 392x37; gap 8
- Secondary button ("Filter Quests", "Request Quest"): Horizontal; Hug 122x37; radius 10; border 1px #8C8C8C all sides; padding T9 R15 B9 L15; gap 12; no fill. Text Inter Bold 700 14px LH100% color #333333
- Primary button ("+ New quest"): Horizontal; Hug 118x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333 (text colour unread; presumably white)
- Card grid: Vertical; Fill(1100) x Hug(162); gap 16; contains 2 rows
- Card row: Horizontal; Fill(1100) x Hug(73); gap 16; 3 cards/row
- Card: Vertical; Fill (356px); Hug 73; radius 8; padding 16 all (re-read at high res); gap 6; fill #FFFFFF; border 1px #8C8C8C all sides
- Card title: Inter Bold 700 15px LH100% color #262626 (322x18)
- Card meta: Inter Regular 400 12px LH100% color #808080 (322x15)

NOTE: on 02 Home and 03 Quests, values 6/8/16/18 were first read at low zoom; card padding and grid/row gaps were re-verified at high zoom (=16). Other small values on those two frames (gap 6/8, padding 9/15/16) may carry the same digit ambiguity.

## 03b Quest Request Form

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared (Quests pill active)
- Content Frame: Vertical; Fill(1440) x Fixed(926); padding T48 R170 B48 L170; gap 28
- Header row: Horizontal; Fill(1100) x Hug(67); justify space-between
- Title stack: Vertical; Hug 358x67; gap 6
- Title "Quest Request Form": Inter Bold 700, 36px (358x44); subtitle "Request a quest from the DMs": Inter Regular 400 14px (202x17)
- Button group: Horizontal; Hug 228x37; gap 8
- "Cancel": secondary button (like Quests: border 1px #8C8C8C, radius 10, no fill); "Submit request": Horizontal; Hug 138x35; radius 10; padding T9 R16 B9 L16; gap 12; dark fill (as primary #333333; fill colour unread here)
- Form card: Vertical; Fill(1100) x Hug(317); radius 8; border 1px (all sides); padding 24 all; gap 14; fill #FFFFFF
- Field row (label + control): Horizontal; Fill(1050) x Hug(120) (textarea row) or Hug 37 (single-line rows); gap 24
- Label (e.g. "Description", "Related links", "Previous DMs (if any)"): Inter Regular 400, 14px, LH 100%, LS 0%, color #666666; text width 160
- Textarea: Horizontal; Fill(866) x Hug(120); min height 120; radius 8; border 1px #8C8C8C all sides; padding T9 R12 B9 L12; gap 12; fill #FFFFFF
- Placeholder text: Inter Regular 400, 14px, LH 100%, color #8C8C8C
- Single-line input (links / DM select): Horizontal; Fill(866) x Hug(37); radius 8; border 1px; padding T9 R12 B9 L12; gap 12; fill #FFFFFF
- Related-links control stack: Vertical; Fill(866) x Hug(82); gap 8 (input + "+ Add link" button)
- "+ Add link" button: Horizontal; Hug 103x37; radius 10; border 1px; padding T9 R16 B9 L16; gap 12

## Settings

- Frame: Vertical; Fixed(1440) x Hug(1671) (not 1059); min height 900; fill #FAFAFA. Top nav assumed shared (not re-read)
- Content Frame: Vertical; Fill(1440) x Hug(1606); padding T48 R170 B48 L170; gap 24
- Header stack: Vertical; Fill(1100) x Hug(88); gap 6
- Eyebrow "PREFERENCES": Inter Regular 400, 12px, LH 100%, letter spacing 8%, color #808080 (94x15)
- Title "Settings": Inter Bold 700, 36px, LH 100%, color #262626 (149x44)
- Subtitle "Customize your Chronicler experience.": Inter Regular 400, 14px, LH 100%, color #808080
- Columns (layer "Columns"): Horizontal; Fill(1100) x Hug(1398); gap 24
- Left column / Right column: Vertical; Fill(538) each; gap 24 (left Hug 1398, right Hug 988)
- Card (layers "Personalize", "Time zone", etc.): Vertical; Fill(538); radius 8; border 1px #8C8C8C all sides; padding 24 all; fill #FFFFFF; gap 16 (Personalize) / gap 12 (Time zone card, Hug 155)
- Card section label ("PERSONALIZE", "TIME ZONE"): Inter Regular 400, 12px, LH 100%, letter spacing 8%, color #808080
- Chip row: Horizontal; Fill(488); Hug 27; gap 8
- Chip (e.g. "Member for 0 months", "Dark"): Horizontal; Hug (149x27 / 53x27); radius 10; border 1px; padding T5 R12 B5 L12; gap 6; text Inter Regular 12px LH100% color #262626
- "Next unlock" box: Vertical; Fill(488) x Hug(85); radius 8; border 1px; padding T14 R16 B14 L16; gap 8
- Time zone select: Horizontal; Fill(488) x Hug(36); radius 10; border 1px; padding T9 R14 B9 L14; justify space-between
- Accessibility option row ("Option"): Horizontal; Fill(488) x Hug(47); gap 10; text stack Vertical Fill(462) x Hug 47 gap 2
- Option label ("Colorblind-safe palette"): Inter Bold 700 12px LH100% color #262626
- Option description: Inter Regular 400 12px LH100% color #808080
- Not read (unread): theme list rows, live-preview block, badge pills, plate/flair rows, notification rows (same Option pattern visible), nav bar

## Character Page

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared (no pill active)
- Content Frame: Vertical; Fill(1440) x Fixed(926); padding T36 R170 B48 L170; gap 20
- Character header (layer "Character header"): Horizontal; Fill(1100) x Hug(131); justify space-between
- Left group: Horizontal; Hug 330x110; gap 20
- Avatar: Horizontal; Fixed 96x96; radius 48; fill #D9D9D9; letter "M" Inter Bold 700 32px LH100% color #262626
- Name stack: Vertical; Hug 214x110; gap 8
- Chip row: Horizontal; Hug 214x25; gap 8
- Chip ("Active", "Verified", "Lightfall"): Horizontal; Hug (58x25 / 67x25); radius 10; border 1px all sides; padding T4 R10 B4 L10; text Inter Regular 12px LH100% color #262626
- ID text "pc-74ebd2fa": Inter Regular 12px LH100% color #808080
- Name "Mercy": Inter Bold 700, 36px, LH 100%, color #262626 (111x44)
- Right stack: Vertical; Hug 145x131; gap 8
- Buttons ("D&D Beyond" Hug 119x37; "Retire character"): Horizontal; radius 10; border 1px; padding T9 R16 B9 L16; no fill
- Stat (e.g. "0" over "Quests"): Vertical; Hug 40x41; gap 2. Value: Inter Bold 700 20px LH100% color #262626; label: Inter Regular 12px LH100% color #808080
- Profile card (layer "Profile"): Vertical; Fill(1100) x Hug(228); radius 8; border 1px #8C8C8C (all sides); padding 20 all; gap 10; fill #FFFFFF
- Profile header row: Horizontal; Fill(1058) x Hug(37); justify space-between ("PROFILE" label + "Edit profile" button)
- Card eyebrow ("PROFILE", "PLAYER CHARACTER XP"): Inter Regular 12px LH100% letter spacing 8% color #808080
- Field label ("Description", "Backstory"): Inter Regular 12px LH100% color #808080
- Field body ("Tall, Bubbly and Divine."): Inter Regular 14px LH100% color #262626
- Tab buttons ("Progression" active, "Quest history", "Connections", "Summaries"): Horizontal; Hug (117x37 for Progression); radius 10; border 1px; padding T9 R16 B9 L16; active fill #D1D1D1; text Inter Bold 700 14px LH100%
- Progression card (layer "Progression"): Vertical; Fill(1100) x Hug(186); radius 8; border 1px; padding 20 all; gap 12; fill #FFFFFF
- XP value "0 PCXP": Inter Bold 700 24px LH100% color #262626 (88x29)
- Empty-state row: Horizontal; Fill(1058) x Hug(63); padding T24 B24 (no L/R read)
- Empty-state text "NO PROGRESSION ENTRIES YET": Inter Regular 12px LH100% letter spacing 6% color #808080
- Passion projects card (also "Custom items"): Vertical; Fill(1100) x Hug(82); radius 8; border 1px; padding 20 all; gap 8; fill #FFFFFF
- Passion body text "Passion projects are not available yet.": Inter Regular 14px LH100% color #808080

## DM Table

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Community" pill active, fill darker grey)
- Content Frame: Vertical; Fill(1440) x Fixed(926); padding T48 R170 B48 L170; gap 24
- Preview banner (layer "Preview banner"): Horizontal; Fill(1100) x Hug(41); radius 8; border 1px; padding T12 R16 B12 L16; fill #F2F2F2. Text Inter Regular 12px LH100% color #808080
- DM identity (header row): Horizontal; Hug 545x129; gap 20 (Follow button is separate, right-aligned by parent)
- Avatar: Horizontal; Fixed 88x88; radius 44; fill #D9D9D9; initials "MB" Inter Bold 700 29.33px LH100% color #262626
- Identity text stack: Vertical; Hug 437x129; gap 8
- Handle "@mortal.bard": Inter Bold 700, 28px, LH 100%, color #262626 (190x34)
- Tagline: Inter Italic 400, 14px, LH 100%, color #808080
- Bio line "Character first, dice second ...": Inter Bold 700, 14px, LH 100%, color #262626 (437x17)
- Button "Edit DM details & table": Horizontal; Hug 188x37; radius 10; border 1px; padding T9 R16 B9 L16
- Button "Follow": Horizontal; Hug 79x37; radius 10; border 1px; padding T9 R16 B9 L16
- Chip "Headline stats — coming soon": Horizontal; Hug 195x25; radius 10; border 1px; padding T4 R10 B4 L10; text Inter Regular 12px LH100% color #262626
- Section header row ("About this table"): Horizontal; Fill(1100) x Hug(24); justify space-between
- Section heading: Inter Bold 700, 20px, LH 100%, color #262626 (157x24); right note: Inter Regular 12px LH100% color #808080
- Card (layer "Card"): Vertical; Fill(1100) x Hug(142); radius 8; border 1px; padding 20 all; gap 12; fill #FFFFFF
- Card header row: Horizontal; Fill(1058) x Hug(37); justify space-between; right group Horizontal Hug 147x37 gap 8 (chip "Published" + "Edit" button)
- Card title "The Gilded Lantern": Inter Bold 700 15px LH100% color #262626
- Chip "Published": Horizontal; Hug 78x25; radius 10; border 1px; padding T4 R10 B4 L10
- Card body: Inter Regular 400 14px LH100% (width 1058, 4 lines wrapped); colour unread (appears light grey)
- Quest entry (layer "Open quest entry"): Vertical; Fill(1100) x Hug(71); radius 8; border 1px; padding 16 all; gap 4; fill #FFFFFF
- Entry id "Q-417": Inter Regular 12px LH100% color #808080; entry title "The Hound of Culann": Inter Bold 700 15px LH100% color #262626; status "open" right-aligned small grey (unread)
- "Open quests" heading: Inter Bold 700 20px LH100% color #262626 (125x24); direct child of content frame (gap 24)

## Map

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Map" pill active)
- Content Frame: Vertical; Fill(1440) x Fixed(994); padding T48 R170 B48 L170; gap 28
- Header row: Horizontal; Fill(1100) x Hug(67); justify space-between. Title stack Vertical Hug 319x67 gap 6
- Title "Interactive Map": Inter Bold 700, 36px, LH 100%, color #262626 (275x44)
- Subtitle "View the maps of different regions of this world.": Inter Regular 400, 14px, LH 100%, color #808080
- Button "Load Region": Horizontal; Hug 117x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333
- Map content (layer "Map content"): Horizontal; Fill(1100) x Hug(735); gap 24
- Map panel (left): Vertical; Fixed 685x735; radius 8; border 1px; padding 24 all; gap 14; fill #FFFFFF (holds hex map image)
- Hex details panel (right, layer "Hex details"): Vertical; Fixed 391x735; radius 8; border 1px; padding 24; gap 20; fill #FFFFFF
- Hex heading "Hex Number: LFR2001": Inter Bold 700, 32px, LH 100%, color #262626 (349x39)
- Entry card: Vertical; Fill(343) x Fixed(135); radius 10; border 1px; padding 16 all; gap 8; fill #FAFAFA
- Entry title "Entry Number 1": Inter Bold 700, 24px, LH 100%, color #262626 (180x29)
- Entry flavor text: Inter Regular 400, 13px, LH 100%, color #808080
- Button "New Entry": Horizontal; Hug 103x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333

## 13 DM Table Creation Form

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Community" pill active)
- Content Frame: Vertical; Fill(1440) x Fixed(926); padding T48 R170 B48 L170; gap 28
- Title "DM Table Creation Form": Inter Bold 700, 36px, LH 100%, color #262626 (422x44); subtitle "Create your DM profile and table" (14px grey, not read)
- Button group: Horizontal; Hug 194x37; gap 8 ("Cancel" secondary, "Save table" primary)
- "Save table": Horizontal; Hug 104x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333
- Form card: Vertical; Fill(1100) x Hug(412); radius 8; border 1px; padding 24 all; gap 14; fill #FFFFFF (same as 03b)
- Field row: Horizontal; Fill(1050) x Hug(37); gap 24. Label ("DM username"...): Inter Regular 14px LH100% color #666666 (160 wide)
- Textarea ("Table rules"): Horizontal; Fill(866) x Hug(120); min height 120; radius 8; border 1px; padding T9 R12 B9 L12; gap 12
- In-card section heading "About this table": Inter Bold 700, 20px, LH 100%, color #262626 (157x24)

## 07 Rules

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Rules" pill active)
- Content Frame: Vertical; Fill(1440) x Fixed(930); padding T48 R170 B48 L170; gap 28
- Page title "Server Mechanics": Inter Bold 700, 36px, LH 100%, color #262626 (318x44); subtitle "Guides to every system, plus the living log of rulings." Inter Regular 14px grey #808080 (assumed from other pages; not separately read)
- Section (Ruling section / Gameplay guides): Vertical; Fill(1100) x Hug(164); gap 12
- Section header row (layer "Gameplay guides header" etc.): Horizontal; Fill(1100) x Hug(35 or 37); justify space-between
- Section heading: Inter Bold 700, 20px, LH 100%, color #262626 (140x24)
- "View full ruling log →" link: Inter Regular 12px LH100% color #737373
- "+ New ruling" / "+ New guide": Horizontal; Hug 119x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333
- "Filter By" button group: Horizontal; Hug 216x37 (Filter By + New guide); gap 8
- Ruling card row: Horizontal; Fill(1100) x Hug(117); gap 16; 4 cards of Fill(263)
- Ruling card: Vertical; Fill(263) x Hug(117); radius 10; border 1px; padding 16 all; gap 6; fill #FFFFFF
- Ruling chip ("Ruling", "Clarif.", "Guide"): Horizontal; Hug 56x23; radius 10; border 1px; padding T4 R10 B4 L10; gap 12
- Ruling title "Temp HP & Spells": Inter Bold 700 15px LH100% color #262626
- Ruling description: Inter Regular 400 12px LH100% color #808080 (wraps to 2 lines)
- Guide grid: Vertical; Fill(1100) x Hug(162); gap 16; rows Horizontal Fill(1100) x Hug(73); gap 16; 3 per row
- Guide card: Vertical; Fill(356) x Hug(73); radius 8; border 1px; padding 16 all; gap 6; fill #FFFFFF
- Guide title "Gameplay Guide": Inter Bold 700 15px LH100% color #262626; description "Short description": Inter Regular 12px LH100% color #808080

## 06 Codex

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Codex" pill active)
- Content Frame: Vertical; Fill(1440) x Hug(798); padding T48 R170 B48 L170; gap 28
- Header: Title "Codex": Inter Bold 700, 36px, LH 100%, color #262626 (114x44); subtitle "The reference layer of the world": Inter Regular 14px LH100% color #808080 (212x17)
- Header buttons group: Horizontal; Hug 261x37; gap 8 ("Filter By" secondary + "+ New Codex entry")
- "+ New Codex entry": Horizontal; Hug 163x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333
- Category section (NPCs / Factions / Artifacts): Vertical; Fill(1100) x Hug(198 for 4 cards, 2 rows); gap 12
- Category heading: Inter Bold 700, 20px, LH 100%, color #262626 (e.g. "NPCs" 54x24)
- Card row: Horizontal; Fill(1100) x Hug(73); gap 16; 3 cards/row (a 4th card wraps to a second row, left aligned)
- Entry card: Vertical; Fill(356) x Hug(73); radius 8; border 1px; padding 16 all; gap 6; fill #FFFFFF; title Inter Bold 15px #262626, description "Short description" Inter Regular 12px #808080 (same as Rules guide card)

## Chronicle View

- Frame: Vertical; Fixed 1440x1059 (no min height listed); fill #FAFAFA. Top nav shared ("Chronicles" pill active)
- Content Frame: Vertical; Fill(1440) x Hug(569); padding T40 R170 B40 L170; gap 20
- Back link "← All Chronicles": Inter Regular 400, 13px, LH 100%, color #666666 (104x16)
- Meta row: chip "DM RECAP": Horizontal; Hug 81x23; radius 10; border 1px; padding T4 R10 B4 L10; gap 12; text Inter Bold 700 11px LH100% color #262626. Row gap 10 (Hug 203x23)
- Meta text "Pw 102 · Oktavros 1": Inter Regular 12px LH100% color #808080
- "Edit" button: Horizontal; Hug 59x35; radius 10; padding T9 R16 B9 L16; gap 12; fill #333333
- Title "The Lantern at Lowmere": Inter Bold 700, 40px, LH 100%, color #262626 (474x48)
- Author row: Horizontal; Hug 104x24; gap 8; avatar Ellipse 24x24 fill #BFBFBF; name "mortal.bard" Inter Regular 13px LH100% color #666666
- Quest Details bar: Horizontal; Fill(1100) x Hug(49); radius 10; border 1px; padding T12 R16 B12 L16; gap 10; label "Quest Details" Inter Bold 700 13px LH100% color #262626
- Detail chips ("Quests summarized · Q-14", "Region · Lightfall", "DM · Mortal bard"): Horizontal; Hug (165x23 for first); radius 10; border 1px; padding T4 R10 B4 L10; gap 12
- Body paragraphs: Inter Regular 400, 14px, LH 100%, width 1100 (wraps; colour not read); a 1px divider sits between the Quest Details bar and body (divider spec unread)

## Filter By dropdown (open) x3

- Panel (all 3): Vertical; Fixed 320px wide; Hug height (278 "Filter by cluster", 374 "Filter by category", 538 "Filter chronicles"); radius 10; border 1px #8C8C8C all sides; padding 16 all; gap 10; fill #FFFFFF
- Caption "DROPDOWN · opens from Filter By": Inter Regular 400, 10px, LH 100%, color #737373 (163x12)
- Heading ("Filter by cluster"): Inter Bold 700, 15px, LH 100%, color #262626 (115x18)
- Option list box (cluster/category variants): Vertical; Fill(286) x Hug(194 for 6 rows); radius 8; border 1px #8C8C8C; fill #F7F7F7; no padding/gap shown
- Option row: Horizontal; Fill(284) x Hug(32); padding T8 R12 B8 L12; gap 10; radio glyph "○" Inter Regular 13px (12x16); label Inter Regular 400 13px LH100% color #262626 (selected row "All" is bold with filled dot)
- Form-style variant "Filter chronicles": select input Horizontal; Fill(286) x Hug(37); radius 8; border 1px #8C8C8C; padding T9 R12 B9 L12; gap 12; fill #FFFFFF; sub-list boxes (All regions, Lightfall...) like the option list box

## Quest Page · Quest Details

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Quests" pill active)
- Content Frame: Vertical; Fill(1440) x Hug(873); padding T40 R170 B40 L170; gap 24
- Top row: Horizontal; Fill(1100) x Hug(37); justify space-between. Breadcrumb "QUESTS › Q-14": Inter Regular 12px LH100% color #808080 (94x15). Button group ("Edit quest", "Cancel quest"): Horizontal; Hug 237x37; gap 8
- Hero card: Horizontal; Fill(1100) x Hug(245); radius 12; border 1px #8C8C8C; padding 24 all; gap 24; fill #FFFFFF
- Hero left stack: Vertical; Fill(706) x Hug(153); gap 12
- Chip row (status chip "Open" + id chip "Q-14"): Horizontal; Hug 110x25; gap 6
- Status chip "Open": Horizontal; Hug 54x25; radius 10; border 1px; padding T4 R10 B4 L10; gap 12; fill #D9D9D9
- Title "The Lantern at Lowmere": Inter Bold 700, 40px, LH 100%, color #262626 (474x48)
- Subtitle "Find the missing keeper before the tide turns.": Inter Regular 400, 16px, LH 100%, color #666666 (345x19, wraps)
- "● posted 2 hours ago": Inter Regular 12px LH100% color #808080 (128x15)
- Sign-up card (right side of hero): Vertical; Fixed 320 x Hug(195); radius 10; border 1px; padding 16 all; gap 10; fill #FFFFFF
- Sign-up eyebrow "YOUR SIGN-UP": Inter Regular 400, 11px, LH 100%, color #737373 (81x13)
- Sign-up heading "SHEET PENDING": Inter Bold 700, 13px, LH 100%, color #262626 (105x16)
- Full-width button "PENDING REVIEWER ↗": Horizontal; Fill(286) x Hug(37); radius 10; border 1px; padding T9 R16 B9 L16; gap 12
- Host card: Horizontal; Fill(1100) x Hug(78); radius 12; border 1px; padding 16 all; gap 12; fill #FFFFFF
- Host avatar: Ellipse 44x44 fill #BFBFBF. Host name stack Vertical Hug 227x43 gap 2; name row Horizontal Hug 227x25 gap 8
- Host name "mortal.bard": Inter Bold 700, 16px, LH 100%, color #262626 (92x19)
- Tab group (Cast / Table Rules / Quest Details): Horizontal; Hug 270x37; radius 10; border 1px #8C8C8C; padding 4 all; gap 6
- Tab: Horizontal; Hug (53x27 "Cast"; 104x25 "Quest Details" as read); radius 10; padding T5 R12 B5 L12; gap 12; active fill #D1D1D1, text Inter Bold 700 12px LH100% color #262626
- Details card: Vertical; Fill(1100) x Hug(160); radius 12; border 1px; padding 20 all; gap 14; fill #FFFFFF
- Details header row: Horizontal; Fill(1058) x Hug(37); justify space-between; eyebrow "QUEST DETAILS": Inter Bold 700 11px LH100% color #262626 (87x13); button "View event ↗" secondary (37 tall)
- Details key/value row: Horizontal; Fill(517) x Hug(17); gap 16 (two columns side by side); key (e.g. "Quest type"): Inter Regular 14px LH100% color #666666 (110 wide); value ("One-shot"): Inter Regular 14px LH100% color #262626 (391 wide)
- Info cards row (Quest description / Additional information): Horizontal; Fill(1100) x Hug(116); gap 16; card: Vertical; Fill(542) x Hug(116); radius 12; border 1px; padding 20 all; gap 8; fill #FFFFFF
- Info card heading "Quest description": Inter Bold 700 15px LH100% color #262626 (500x18); body: Inter Regular 400 13px LH100% color #666666 (500 wide, wraps)

## Quest Page · Table Rules

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Same top row, hero card, sign-up card, host card and tab group as "Quest Page · Quest Details" (content frame not re-read) with "Table Rules" tab active
- Top row extra: "Updating..." status text before the buttons: Inter Regular 12px LH100% color #808080 (62x15)
- Table rules card: Vertical; Fill(1100) x Hug(246); radius 12; border 1px; padding 20 all; gap 10; fill #FFFFFF
- Card header row: Horizontal; Fill(1058) x Hug(15); justify space-between; eyebrow "TABLE RULES": Inter Bold 700 11px LH100% color #262626 (73x13); right note "From @mortal.bard's DM profile" grey 12px
- Rule item row: Horizontal; Fill(1058) x Hug(17); gap 12; number (bold) + text; text Inter Regular 400 14px LH100% color #262626 (1026 wide)

## Quest Page

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top section identical to "Quest Page · Table Rules" (breadcrumb, "Updating..." text, Edit/Cancel buttons, hero card, sign-up card, host card, tab group) with "Cast" tab active
- Cast row: Horizontal; Fill(1100) x Hug(209); gap 16; two cards side by side
- Cast card ("WHO'S SIGNED UP · 3 OF 4", "WAITLIST · 0 WAITING"): Vertical; Fill(542) x Hug(209); radius 12; border 1px; padding 16 all; gap 12; fill #FFFFFF
- Card header row: Horizontal; Fill(508) x Hug(15); justify space-between; eyebrow Inter Bold 700 11px LH100% color #262626 (143x13 for first)
- Sign-up row: Horizontal; Hug 238x28; gap 10; avatar Ellipse 28x28 fill #BFBFBF; name Inter Bold (13px-ish, size unread) + handle grey; empty slot = dashed circle

## 05 Chronicles

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Chronicles" pill active)
- Content Frame: Vertical; Fill(1440) x Hug(916); padding T48 R170 B48 L170; gap 28
- Header: title "Chronicles" Inter Bold 36px (like other H1s); subtitle "Session recaps, player journals, arc summaries and world events": Inter Regular 14px LH100% color #808080 (426x17); buttons "Filter By" (secondary) and "+ New entry" (primary #333333)
- Timeline block: Vertical; Fill(1100) x Hug(725); gap 16
- Month header row ("PW 102 · OKTAVROS" ... line ... "4 entries"): Horizontal; Fill(1100) x Hug(13); gap 12; text Inter Regular 11px LH100% color #737373
- Entry row: Horizontal; Fill(1100) x Hug(162); gap 16 (timeline dot/line column + card)
- Timeline dot: Ellipse 14x14 fill #595959
- Entry card: Vertical; Fill(1070) x Hug(162); radius 10; border 1px; padding 16 all; gap 8; fill #FFFFFF
- Card top row: Horizontal; Fill(1036) x Hug(23); justify space-between; chip ("DM RECAP"/"QUEST SUMMARY"): Hug 81x23; radius 10; border 1px; padding T4 R10 B4 L10; gap 12; date "Pw 102 · Oktavros 1": Inter Regular 12px LH100% color #808080 (112x15)
- Entry title "The Lantern at Lowmere": Inter Bold 700, 16px, LH 100%, color #262626 (190x19)
- Entry excerpt: Inter Regular 400, 13px, LH 100%, color #666666 (1036 wide)
- "Read entry →": Inter Regular 12px LH100% color #666666 (77x15), right-aligned
- Author row: avatar Ellipse (small grey circle) + name 11-12px + "Lightfall" chip (values unread)

## Filter dropdown (quests filter popover)

- Panel: Vertical; Fixed 281 x Fixed 384; radius 10; border 1px #8C8C8C all sides; padding 16 all; gap 10; fill #FFFFFF
- Heading "Filter quests": Inter Bold 700, 15px, LH 100%, color #262626 (92x18)
- Field label ("DM", "Date"): Inter Regular 400, 12px, LH 100%, color #737373
- Select ("Select a DM ▾"): bordered input as in 03b (not re-read); options list box like the Filter By dropdown option list (radius 8, border 1px #8C8C8C, fill #F7F7F7)
- Quick-pick chips ("Today", "Specific date" active): Horizontal; Hug (100x27 for Specific date); radius 10; padding T6 R11 B6 L11; gap 12; active fill #D1D1D1
- Date input ("dd / mm / yyyy"): Horizontal; Fill(247) x Hug(37); radius 8; border 1px #8C8C8C; padding T9 R12 B9 L12; gap 12; fill #FFFFFF

## 09 Character

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Community" pill active)
- Content Frame: Vertical; Fill(1440) x Hug(646); padding T48 R170 B48 L170; gap 28
- Breadcrumb "CHRONICLER > CHARACTERS > pc-6eac7ae8": Inter Regular 400, 12px, LH 100%, color #808080 (1100x15)
- Header row: Horizontal; Fill(1100) x Hug(96); gap 20; avatar Ellipse 96x96 fill #BFBFBF
- Name stack: Vertical; Hug 252x74; gap 8; name "Character name": Inter Bold 700, 32px, LH 100%, color #262626 (252x39); status chips (Retired / Verified / Lightfall) above name (values like Character Page chips; not re-read)
- Right side of header: stats text "0 Quests 0 Days active" and "D&D Beyond" secondary button (not re-read)
- Cards (Profile, "Player character XP: 0 PCXP", "Passion projects · downtime"): Vertical; Fill(1100); radius 8; border 1px; padding 16 all; gap 6; fill #FFFFFF; Hug heights 116 (Profile), 73 (XP card)
- Card title ("Profile", "Player character XP: 0 PCXP"): Inter Bold 700, 15px, LH 100%, color #262626 (1066x18)
- Tab group (Progression active, Quest history, Connections, Summaries): not re-read (see Quest Page tab group pattern)

## 10 Verification

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared ("Verification" pill active)
- Content Frame: Vertical; Fill(1440) x Hug(452); padding T48 R170 B48 L170; gap 28
- Header row: Horizontal; Fill(1100) x Hug(67); justify space-between (title stack + tab group)
- Title "Review queue": Inter Bold 700, 36px, LH 100%, color #262626 (247x44)
- Subtitle: Inter Regular 400, 14px, LH 100%, color #808080 (442x17)
- Tab group (Characters active / DM Profiles): bordered pill group as in Quest Page tabs (not re-read)
- Queue card: Vertical; Fill(1100) x Hug(116); radius 8; border 1px; padding 16 all; gap 6; fill #FFFFFF
- Card title "Brannoc Vell · Lightfall": Inter Bold 700, 15px, LH 100%, color #262626 (1066x18)
- Card meta "Submitted by @mortal.bard · D&D Beyond sheet": Inter Regular 400, 12px, LH 100%, color #808080
- Button row: Horizontal; Hug 252x37; gap 8
- "Approve": Horizontal; Hug 91x35; radius 10; padding T9 R16 B9 L16; gap 12; dark fill (primary)
- "Request changes": Horizontal; Hug 153x37; radius 10; border 1px; padding T9 R16 B9 L16; gap 12 (secondary)
- Empty-state card ("No other characters are awaiting verification."): Vertical; Fill(1100) x Hug(52); radius 8; border 1px; padding 16; gap 6; fill #FFFFFF; text Inter Bold 13px-ish (size unread)

## 11 Profile

- Frame: Vertical; Fixed 1440x1059; min height 900; fill #FAFAFA. Top nav shared (no pill active)
- Content Frame: Vertical; Fill(1440) x Hug(925); padding T48 R170 B48 L170; gap 28
- Banner placeholder: Vertical; Fill(1100) x Fixed(140); radius 8; border 1px; gap 12; fill #E6E6E6; label "Banner" Inter Regular 12px LH100% color #808080 (41x15)
- Profile header row: Horizontal; Fill(1100) x Hug(88); gap 20; avatar Ellipse 88x88 fill #BFBFBF
- Name stack: Vertical; Hug 204x69; gap 8; name "MORTAL BARD": Inter Bold 700, 28px, LH 100%, color #262626 (204x34); role chips ("player" filled, "admin") like other chips
- Profile actions (layer "Profile actions"): Horizontal; Hug 673x37; gap 8; buttons Overview (active, Hug 98x35), Characters, Quest History, Summaries, Settings, Sign out: radius 10; padding T9 R16 B9 L16; gap 12; secondary border 1px; active fill grey
- Stat row: Horizontal; Fill(1100) x Hug(73); gap 16; 5 cards each Fill(207.2)
- Stat card: Vertical; Fill(207.2) x Hug(73); radius 8; border 1px; padding 16 all; gap 6; fill #FFFFFF; value ("0m"): Inter Bold 700 15px LH100% color #262626; label ("Voice hours"): Inter Regular 12px LH100% color #808080
- Section headings ("Since You Joined", "Recent Activity"): Inter Bold 700, 20px, LH 100%, color #262626 (168x24); direct children of content frame (gap 28)
- "Since You Joined" row: Horizontal; Fill(1100) x Hug(73); gap 16; 3 stat-style cards
- Recent Activity list (layer "Recent Activity list"): Vertical; Fill(1100) x Hug(239); gap 10
- Recent summary entry: Vertical; Fill(1100) x Hug(73); radius 8; border 1px; padding 16 all; gap 6; fill #FFFFFF; title ("The Hound of Culann — Summary →"): Inter Bold 700 15px LH100% color #262626 (1066x18); meta ("Q-417 · Lightfall · written 2 days ago"): Inter Regular ~12px #808080 (size not read)
