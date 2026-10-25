# Weeping archive digest

Source: `Weeping.rar` (76,932 bytes, sha256 `9e41d08c…f3c0`), handed off at
`/home/pi/chronicler-handoff/Weeping.rar`. It was extracted into a scratch folder
with `node-unrar-js@2.0.2` (installed with `--ignore-scripts`), and every entry
path was checked to stay inside the output folder. No archive content was executed.

The archive is the "Weeping" campaign world of the Living Chronicles Discord
community: setting lore (the Codex), community guides, and DM rulings. It holds
Markdown only, with no images; 11 images are linked inline from `i.ibb.co` and
Discord CDN URLs.

## Inventory

| Folder     |  Files |       Bytes |
| ---------- | -----: | ----------: |
| `Codex/`   |     18 |      71,755 |
| `Guides/`  |     18 |     130,603 |
| `Rulings/` |      4 |       5,674 |
| **Total**  | **40** | **208,032** |

Each Codex file has YAML frontmatter (`title`, `category`, `region`, `locked`,
`summary`, plus type-specific keys such as `factionType`). Guides have
frontmatter with a `cluster` (Getting started, Character, Systems, Groups &
places, Conflict & others) and a `description`. Rulings have a `topic`.

### `Codex/Untitled.md` is not lore

This file is a UI and map brief for Chronicler itself, written to an AI
developer. It contains a Figma link and 161 hex tile image URLs. It is left
out of the seeded documents. Its tile list is the only source for the hex
codes used by the hex map seed (see below).

## The world in one paragraph

For over a century a cursed magical rain, the weeping, has drowned the world
and turned exposed people and beasts into monsters. Lightfall is the only
known shelter: a city beneath a divine Tree of Light, ruled by a line of
Lightkeepers (Katsík I, Aetós II, Távros III, Leander IV) under a theocratic
Hierocracy. The Solarii are people given a second life to serve the divine
purpose; player characters are Solarii. A chosen few go out on divine quests
beyond the light, and the community's current story arc is exploration of
the hex map outward from Lightfall.

## Entities by type

Counts in the "Seeded" column come from the generated seed files and were
checked by loading them into a disposable database. Counts in the "Named in
notes" column come from Haiku-model reading notes after merging duplicate
names by hand; they are a guide, not an exact census.

| Type               | Seeded | Named in notes | Notes                                                                                                                                                                                                                                                                                                                             |
| ------------------ | -----: | -------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NPC (Lightkeepers) |      4 |            ~10 | Seeded: Katsík I, Aetós II, Távros III, Leander IV. Also named: Headpriest Porthila of the Light, Sailas, the Oracle, the apostle of sight. "Ashwin" is the real community manager, not an NPC.                                                                                                                                   |
| Faction            |      4 |            ~20 | Seeded: Hierocracy of Lightfall, High Council, Emberwatch, The Metron. Also named: Council of the Light, Inquisition of the Light, Temple of Apollo, Noble Houses, Guilds of the Crafters, Frostmarch, Sol Invictus, Solarii, Rhapsodes, Pallor House, citywatch, oracular college, pilgrim's guild, the southern Band (Anaptir). |
| Artifact           |      3 |              5 | Seeded: Heart of Apollo, Prism of Light, The Crimson Halo. Also named: Divine Tree of Light, Prism of Hope (DM Mechanics).                                                                                                                                                                                                        |
| Lore               |      6 |              — | Weeping, Lightfall, Laws of the Light, Species in Weeping, Classes, Backgrounds.                                                                                                                                                                                                                                                  |
| Location           |      9 |            ~25 | Seeded from the "Notable Locations" list in `Lightfall.md`. Also named: Gymnasion, Veil Market, Shadowed Quarter, Cleansing Towers, Snow Eye castle, Divine Roads, Bestiary Hall, and others.                                                                                                                                     |
| Region             |      1 |             ~8 | Seeded: Lightfall. Also named: The North / northern wastes, black desert, desert of the far east, eastern volcanic islands.                                                                                                                                                                                                       |
| Deity              |      0 |            ~10 | Apollo (central), Ares, Demeter, Hades, Hephaestus, the Olympians, the Titans, Old Gods, a silver (moon) goddess. No table for deities.                                                                                                                                                                                           |
| Event / era        |      0 |            ~15 | Founding of Lightfall, Raising of the walls, Raising of the Inquisition, Quest for the Heart of Apollo, the divine quests (first to fifth), Conquest of the north, Contact with the Anaptir; eras Age of Heroes and First age of plenty. No dates except one (below).                                                             |
| Species            |     15 |              — | `creation_catalog` kind `species`, each with "also called" and "today in Lightfall" text.                                                                                                                                                                                                                                         |
| Class              |     13 |              — | `creation_catalog` kind `class`, 75 subclasses in payload, each with an in-world touchpoint.                                                                                                                                                                                                                                      |
| Background         |     17 |              — | `creation_catalog` kind `background`, 31 variants in payload. One (Sailor) is marked "details to be unlocked" and seeded as unavailable.                                                                                                                                                                                          |
| Guide              |     18 |              — | `documents` kind `rule`, category = guide cluster.                                                                                                                                                                                                                                                                                |
| Ruling             |      4 |              — | `documents` kind `rule`, category `ruling`: Hiding, Moving Darkness, Pets, Temp HP & Spells.                                                                                                                                                                                                                                      |
| Hex                |    161 |              — | Pointcrawl nodes: LFC1001 plus complete rings 1–6 (6, 12, 18, 24, 30, 36), 30 hexes of ring 7 and 4 of ring 8.                                                                                                                                                                                                                    |
| Magic item recipe  |      0 |            516 | Common 64, Uncommon 152, Rare 180, Very Rare 120. No table for recipes.                                                                                                                                                                                                                                                           |

## Systems described in the guides

- **Game week and rest**: the game week starts Thursdays 5:30 AM IST, and
  every character gets its long rest then.
- **Magic items**: crafted from relics (Blade, Plate, Rune). Recipe cost is
  fixed by rarity at 1, 3, 6 and 12 relics. Carry limit by level: 3–4 one
  item, 5–6 two, 7–8 three, 9–10 four. Loot uses Need/Greed with pity points.
- **Hex exploration** (DM Mechanics): central hex LFC1001; ring r, hex k,
  first hex at cardinal north, numbered clockwise. Hex states are Locked,
  Unlocked and Mapped. At start only the centre and ring 1 are unlocked;
  three games in a hex mark it Mapped and unlock its six neighbours. Monster
  CR limit grows with hex distance from Lightfall.
- **Other systems**: death, stamina, downtime (quick projects), post-cap
  progression feats, mini-campaigns, character respec and retirement,
  vacation, and DM story points.

## Time

The only dated reference in the archive is "Year 97, the Fifth Divine quest,
under the Lightkeeper Leander IV" (`Codex/Backgrounds.md`). The Lightkeepers
have no reign dates. There is no month, week or era calendar.

## Naming rulings applied in the seed

The owner's defaults (2026-10-25), applied by `NAME_FIX` in the generator as
exact, listed replacements; everything else stays as written.

- **Ruler title:** "Lightkeeper". The three uses of "lightbearer" /
  "Lightbearer" (Katsík I, Laws of the Light) now read "Lightkeeper".
- **Frostmarch and Sol Invictus:** the place keeps the bare name; the order is
  "Order of Frostmarch" / "Order of Sol Invictus". Six passages that clearly
  mean the order were changed (Leander IV, Lightfall, Backgrounds, Classes).
  Place uses stay, such as "beyond the Frostmarch", "Frostmarch's Quarters"
  and the "Sol Invictus" location in Lightfall.
- **The Metron and the Mage's Guild** are left as the source has them. The
  source has one entry, "The Metron", and calls the Metron the Mage's Guild
  in it (`factionType: Mage's guild`) and in Távros III ("founded the Metron,
  the Mage's Guild"). No separate Mage's Guild entry exists to keep apart.
  The Backgrounds text uses both names side by side.

## For the DMs to fix in the source

- **Hamstring Shot** (Stamina System guide) contradicts itself: the table
  (line 53) says it reduces speed, the detail text (line 75) says it knocks
  the target prone. It is seeded as written.

## Source quirks kept as written

- The Criminal Gang background contains a deliberate redaction (`██████`).
- A typo `@veirfy` appears in a guide.
- Ten links in six guides had empty targets (`[text]()`). The seed generator
  rewrites all ten to in-app routes; none remain.
