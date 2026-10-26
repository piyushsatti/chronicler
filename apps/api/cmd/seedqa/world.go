package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/spatial"
)

// generateQA builds a deterministic world for the UI: codex, people, map, quests.
// Public ids are stable. Re-loading uses ON CONFLICT DO NOTHING.
func generateQA() []line {
	w := &world{n: map[int]int{}}
	w.people()
	w.codex()
	w.otherDocs()
	w.revisionsAndLinks()
	w.spatial()
	w.cast()
	w.addQuests()
	w.social()
	w.jobsAndSite()
	return w.lines
}

type world struct {
	lines      []line
	n          map[int]int
	members    []memberRow
	dms        []string
	docs       map[string]string // slug -> public id
	byCat      map[string][]string
	crawlNodes []string
	region     map[string]string
	lfc        string
	underkeep  string
	chars      []charRow
	questRows  []questRow
}

type memberRow struct {
	ID, Handle, Name string
	Roles            []string
	DM               bool
}

type charRow struct {
	ID, Owner, Name, Code, Status string
}

type questRow struct {
	ID     string
	Slots  int
	Filled int
	Status string
}

func (w *world) id(domain int) string {
	w.n[domain]++
	return fmt.Sprintf("%08x-0000-4000-8000-%012x", domain, w.n[domain])
}

func (w *world) put(table string, conflict []string, refs map[string]ref, row map[string]any) {
	if row == nil {
		row = map[string]any{}
	}
	w.lines = append(w.lines, line{Table: table, Conflict: conflict, Refs: refs, Row: row})
}

func who(table, id string) ref { return ref{Table: table, PublicID: id} }

func slugify(s string) string {
	s = strings.ToLower(s)
	var b strings.Builder
	dash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
			continue
		}
		if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func (w *world) people() {
	type spec struct {
		handle, name, status string
		roles                []string
		dm                   *struct {
			tagline, philosophy, rules, status string
			accepting                          bool
		}
	}
	specs := []spec{
		{"brune", "Captain Brune", "active", []string{"dm", "player"}, &struct {
			tagline, philosophy, rules, status string
			accepting                          bool
		}{"Roads, weather, and one hard choice.", "The table moves when the road does. I prep places, not plots.", "Phones down at the table. Recap is the first ten minutes.", "approved", true}},
		{"pell", "Pell Ash", "active", []string{"dm", "archon", "player"}, &struct {
			tagline, philosophy, rules, status string
			accepting                          bool
		}{"Charter games. Consequences stick.", "Archon tables keep a written record of every bargain.", "No secret notes that the table cannot ask about.", "pending", true}},
		{"quill", "Quill Alder", "active", []string{"dm", "player"}, &struct {
			tagline, philosophy, rules, status string
			accepting                          bool
		}{"Quiet mysteries, loud weather.", "I like clues that survive a missed session.", "Late arrivals join at the next scene break.", "draft", false}},
		{"marr", "Ysolde Marr", "active", []string{"dm", "verifier", "player"}, &struct {
			tagline, philosophy, rules, status string
			accepting                          bool
		}{"I check the sheet before the story.", "Verification is a conversation, not a gate.", "Bring the sheet. Inventing a feature mid-scene needs a pause.", "rejected", false}},
		{"cox", "Lira Cox", "active", []string{"dm", "lieutenant", "player"}, &struct {
			tagline, philosophy, rules, status string
			accepting                          bool
		}{"Hexes, camps, and the long walk home.", "Hexcrawls are logistics with teeth.", "Marching order is declared before the first hex.", "approved", false}},
		{"keel", "Tam Keel", "active", []string{"archon", "player"}, nil},
		{"est", "Brother Est", "active", []string{"lieutenant", "player"}, nil},
		{"sable", "Sable Quinn", "active", []string{"verifier", "player"}, nil},
		{"idris", "Idris Fen", "active", []string{"admin", "player"}, nil},
		{"holt", "Bram Holt", "active", []string{"player"}, nil},
		{"nessa", "Nessa Quill", "active", []string{"player"}, nil},
		{"brim", "Cale Brim", "active", []string{"player"}, nil},
		{"dove", "Dove Rusk", "active", []string{"player"}, nil},
		{"rusk", "Ivo Rusk", "active", []string{"player"}, nil},
		{"lane", "Hester Lane", "active", []string{"player"}, nil},
		{"ysolde", "Ysolde Fen", "inactive", []string{"player"}, nil},
		{"tam", "Tam Voss", "banned", []string{"player"}, nil},
	}
	for i, s := range specs {
		id := w.id(1)
		w.members = append(w.members, memberRow{ID: id, Handle: s.handle, Name: s.name, Roles: s.roles, DM: s.dm != nil})
		row := map[string]any{
			"public_id": id, "discord_id": "qa-" + s.handle, "handle": s.handle,
			"display_name": s.name, "roles": s.roles, "status": s.status,
			"avatar_url": fmt.Sprintf("https://cdn.example.test/avatars/%s.png", s.handle),
			"joined_at":  fmt.Sprintf("2026-%02d-02T15:00:00Z", (i%9)+1),
		}
		w.put("members", []string{"public_id"}, nil, row)
		w.put("member_settings", []string{"member_id"}, map[string]ref{"member_id": who("members", id)}, map[string]any{
			"mode":  []string{"system", "dark", "light"}[i%3],
			"theme": "parchment", "density": "comfortable", "effects_enabled": true,
			"colorblind_safe": false, "reduced_motion": false,
			"notify_character_verification": true, "notify_quest_signup": true,
			"notify_document_activity": true, "notify_quest_scheduled": true,
			"notify_dm_mentioned": true, "notify_dm_request_decided": true,
			"timezone": []string{"America/New_York", "America/Chicago", "Europe/London", "UTC"}[i%4],
			"payload":  map[string]any{"pronouns": []string{"she/her", "he/him", "they/them"}[i%3], "table_notes": s.name + " prefers a written recap."},
		})
		w.put("member_availability", []string{"public_id"}, map[string]ref{"member_id": who("members", id)}, map[string]any{
			"public_id": w.id(21), "weekday": i % 7, "start_minute": 18 * 60, "end_minute": 22 * 60,
		})
		if s.dm != nil {
			w.dms = append(w.dms, id)
			profile := map[string]any{
				"tagline": s.dm.tagline, "philosophy": s.dm.philosophy, "house_rules": s.dm.rules,
				"status": s.dm.status, "accepting_players": s.dm.accepting, "review_revision": i % 3,
				"table_info": map[string]any{
					"night": []string{"Thursday", "Sunday", "Monday"}[i%3], "seats": 5, "style": s.dm.tagline,
					"safety": []string{"lines and veils posted in the brief"},
				},
			}
			w.put("dm_profiles", []string{"member_id"}, map[string]ref{"member_id": who("members", id)}, profile)
		}
	}
}

func (w *world) author(i int) string {
	return w.members[i%len(w.members)].ID
}

func (w *world) addDoc(kind, category, title, body, status, visibility string, author int, extra map[string]any) string {
	id := w.id(2)
	sl := slugify(title)
	if w.docs == nil {
		w.docs = map[string]string{}
		w.byCat = map[string][]string{}
	}
	if _, ok := w.docs[sl]; ok {
		sl = sl + "-" + id[:8]
	}
	w.docs[sl] = id
	if category != "" {
		w.byCat[category] = append(w.byCat[category], id)
	}
	row := map[string]any{
		"public_id": id, "kind": kind, "slug": sl, "title": title, "body": body,
		"status": status, "visibility": visibility, "version": 0,
		"published_by": nil, "deleted_by": nil,
	}
	if category != "" {
		row["category"] = category
	}
	if status == "published" {
		row["published_at"] = "2026-09-14T18:00:00Z"
	}
	for k, v := range extra {
		row[k] = v
	}
	w.put("documents", []string{"public_id"}, map[string]ref{"author_id": who("members", w.author(author))}, row)
	return id
}

func (w *world) codex() {
	cats := []struct {
		name, prefix string
		items        []prose
	}{
		{"Entities", "ent", entityCodex},
		{"Locations", "loc", locationCodex},
		{"Feature", "feat", featureCodex},
		{"Rules", "rule", ruleCodex},
		{"Lore", "lore", loreCodex},
	}
	n := 0
	for _, cat := range cats {
		for i, item := range cat.items {
			status, vis := "published", "public"
			extra := map[string]any{}
			switch i {
			case 16:
				status = "draft"
			case 17:
				vis = "dm_only"
			case 18:
				vis = "restricted"
				extra["policy"] = map[string]any{"list": "document_readers", "reason": "charter eyes only"}
			case 19:
				status, vis = "draft", "dm_only"
			}
			if i%5 == 0 {
				extra["frontmatter_yaml"] = "aliases:\n  - " + slugify(item.Title) + "\nsource: lightfall-coast\n"
			}
			title := item.Title
			w.addDoc("codex_entry", cat.name, title, item.Body, status, vis, n, extra)
			n++
		}
	}
}

func (w *world) otherDocs() {
	for i, item := range tableRules {
		w.addDoc("rule", "table", item.Title, item.Body, "published", "public", i, nil)
	}
	for i, item := range sessionNotes {
		vis := "public"
		if i == len(sessionNotes)-1 {
			vis = "dm_only"
		}
		w.addDoc("summary", "session", item.Title, item.Body, "published", vis, i+2, nil)
	}
	for i, item := range communityNotes {
		w.addDoc("community", "notice", item.Title, item.Body, "published", "public", i+1, nil)
	}
	for i, item := range questBriefs {
		w.addDoc("quest_brief", "quest", item.Title, item.Body, "published", "public", i, map[string]any{
			"frontmatter_yaml": "tone: " + item.Title + "\n",
		})
	}
}

func (w *world) docID(title string) string {
	id, ok := w.docs[slugify(title)]
	if !ok {
		panic("missing doc " + title)
	}
	return id
}

func (w *world) revisionsAndLinks() {
	i := 0
	categories := make([]string, 0, len(w.byCat))
	for category := range w.byCat {
		categories = append(categories, category)
	}
	sort.Strings(categories)
	for _, category := range categories {
		ids := w.byCat[category]
		if len(ids) < 2 {
			continue
		}
		w.put("document_revisions", []string{"public_id"}, map[string]ref{
			"document_id": who("documents", ids[0]),
			"created_by":  who("members", w.members[0].ID),
		}, map[string]any{
			"public_id": w.id(19), "reason": "spring recension", "rev": 1,
			"title": "Earlier draft", "body": "A shorter draft, kept so the margin notes still have a home.",
			"frontmatter_yaml": "revision: 1\n",
			"visibility":       nil, "policy": nil, "published_at": nil, "published_by": nil,
			"old_value": nil, "new_value": nil,
		})
		w.put("document_links", []string{"source_id", "target_type", "target_id", "relation"}, map[string]ref{
			"source_id":          who("documents", ids[0]),
			"document_target_id": who("documents", ids[1]),
		}, map[string]any{"relation": []string{"see_also", "mentions", "contradicts"}[i%3]})
		i++
	}
	if restricted := w.byCat["Entities"]; len(restricted) > 18 {
		w.put("document_readers", []string{"document_id", "member_id"}, map[string]ref{
			"document_id": who("documents", restricted[18]),
			"member_id":   who("members", w.memberByHandle("holt").ID),
		}, map[string]any{})
	}
	if ents := w.byCat["Entities"]; len(ents) > 0 {
		w.put("lieutenant_assignments", []string{"member_id", "npc_document_id"}, map[string]ref{
			"member_id":       who("members", w.memberByHandle("est").ID),
			"npc_document_id": who("documents", ents[0]),
		}, map[string]any{})
	}
}

func (w *world) memberByHandle(handle string) memberRow {
	for _, m := range w.members {
		if m.Handle == handle {
			return m
		}
	}
	panic("missing member " + handle)
}

func (w *world) spatial() {
	w.seedRegions()
	w.seedMaps()
	w.seedPointcrawl()
	w.seedCalendar()
}

func (w *world) seedRegions() {
	w.region = map[string]string{}
	coastDoc := w.docID("Kept Tower")
	w.region["coast"] = w.id(3)
	w.put("regions", []string{"public_id"}, map[string]ref{"document_id": who("documents", coastDoc)}, map[string]any{
		"public_id": w.region["coast"], "name": "Lightfall Coast", "kind": "server",
	})
	w.region["charter"] = w.id(3)
	w.put("regions", []string{"public_id"}, nil, map[string]any{
		"public_id": w.region["charter"], "name": "The Charter", "kind": "archon",
		"charter_deadline": "2026-12-01T00:00:00Z",
	})
	w.region["grey"] = w.id(3)
	w.put("regions", []string{"public_id"}, nil, map[string]any{
		"public_id": w.region["grey"], "name": "Grey Reach", "kind": "uncharted",
	})
}

func (w *world) seedMaps() {
	w.lfc = w.id(4)
	w.put("maps", []string{"public_id"}, map[string]ref{"region_id": who("regions", w.region["coast"])}, map[string]any{
		"public_id": w.lfc, "name": "Lightfall Coast", "atlas_code": "LFC",
		"family": "campaign", "map_kind": "pointcrawl", "asset_path": "atlases/lfc/coast.webp",
	})
	w.underkeep = w.id(4)
	w.put("maps", []string{"public_id"}, map[string]ref{"region_id": who("regions", w.region["grey"])}, map[string]any{
		"public_id": w.underkeep, "name": "Underkeep", "atlas_code": "LFC-UNDER", "family": "campaign", "map_kind": "pointcrawl",
	})
}

func (w *world) seedPointcrawl() {
	locIDs := w.byCat["Locations"]
	feat := w.byCat["Feature"]
	nodeNames := []string{"Kept Tower", "Salt Stair", "Ferry House", "Charter Gate", "Grey Causeway", "Underkeep Mouth"}
	for i := 0; i < 24; i++ {
		id := w.id(5)
		w.crawlNodes = append(w.crawlNodes, id)
		mapRef := w.lfc
		if i >= 18 {
			mapRef = w.underkeep
		}
		w.put("pointcrawl_nodes", []string{"public_id"}, map[string]ref{"map_id": who("maps", mapRef)}, map[string]any{
			"public_id":  id,
			"name":       nodeNames[i%len(nodeNames)] + fmt.Sprintf(" %d", i+1),
			"x":          float64(i%6) * 120,
			"y":          float64(i/6) * 90,
			"created_at": "2026-09-20T12:00:00Z",
		})
	}
	// Nodes 0..17 are on Lightfall Coast; 18..23 on Underkeep. Edges must stay
	// inside one map or (map_id, node_*) FKs fail.
	const lfcNodeCount = 18
	edgeKinds := []string{"road", "trail", "river", "pass"}
	putEdge := func(mapRef string, a, b string, i int) {
		w.put("pointcrawl_edges", []string{"public_id"}, map[string]ref{
			"map_id": who("maps", mapRef),
			"node_a": who("pointcrawl_nodes", a),
			"node_b": who("pointcrawl_nodes", b),
		}, map[string]any{
			"public_id": w.id(7), "directed": i%3 == 0, "kind": edgeKinds[i%len(edgeKinds)],
			"label": fmt.Sprintf("leg-%d", i+1),
		})
	}
	edgeN := 0
	for i := 0; i+1 < lfcNodeCount && edgeN < 20; i++ {
		putEdge(w.lfc, w.crawlNodes[i], w.crawlNodes[i+1], edgeN)
		edgeN++
	}
	for i := lfcNodeCount; i+1 < len(w.crawlNodes); i++ {
		putEdge(w.underkeep, w.crawlNodes[i], w.crawlNodes[i+1], edgeN)
		edgeN++
	}
	brune := w.memberByHandle("brune").ID
	for i := 0; i < len(feat) && i < 16; i++ {
		w.put("pointcrawl_entry_links", []string{"node_id", "document_id", "relation"}, map[string]ref{
			"map_id":      who("maps", w.lfc),
			"node_id":     who("pointcrawl_nodes", w.crawlNodes[i%lfcNodeCount]),
			"document_id": who("documents", feat[i]),
			"created_by":  who("members", brune),
		}, map[string]any{"relation": "subject", "created_at": "2026-09-20T12:00:00Z"})
	}
	for i := 0; i < 8 && i < len(locIDs); i++ {
		w.put("pointcrawl_entry_links", []string{"node_id", "document_id", "relation"}, map[string]ref{
			"map_id":      who("maps", w.lfc),
			"node_id":     who("pointcrawl_nodes", w.crawlNodes[i]),
			"document_id": who("documents", locIDs[i]),
			"created_by":  who("members", brune),
		}, map[string]any{"relation": "location", "created_at": "2026-09-20T12:00:00Z"})
	}

	w.put("archon_assignments", []string{"member_id", "region_id"}, map[string]ref{
		"member_id": who("members", w.memberByHandle("keel").ID),
		"region_id": who("regions", w.region["charter"]),
	}, map[string]any{})

	w.put("time_anchors", []string{"public_id"}, nil, map[string]any{
		"public_id": w.id(23), "real_utc": qaAnchor.RealUtc.Format(time.RFC3339), "epoch_day": int(qaAnchor.EpochDay), "rate": qaAnchor.Rate,
		"note": "Campaign clock starts on the first real Thursday of the year. One session is a day and a half on the coast.",
	})
}

func (w *world) seedCalendar() {
	w.put("game_calendar", []string{"id"}, nil, map[string]any{
		"id": 1,
		"definition": map[string]any{
			"epoch": "Year of the Kept Tower",
			"months": []any{
				map[string]any{"name": "Thaw", "days": 30},
				map[string]any{"name": "Salt", "days": 30},
				map[string]any{"name": "Harrow", "days": 30},
				map[string]any{"name": "Ember", "days": 30},
			},
		},
	})
	// Every real date from the anchor through qaMappedDays is mapped, so the QA
	// calendar has no gaps across the months the seed schedules quests in. Each
	// game day comes from spatial.GameDayAt, the formula the API projects with.
	for d := 0; d < qaMappedDays; d++ {
		day := qaAnchor.RealUtc.AddDate(0, 0, d)
		w.put("game_time_map", []string{"real_date"}, nil, map[string]any{
			"real_date": day.Format(time.RFC3339), "game_day": qaGameDay(day),
		})
	}
}

// qaAnchor is the single seeded time anchor; game_time_map rows derive from it.
var qaAnchor = spatial.TimeAnchorView{
	RealUtc:  time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC),
	EpochDay: 0,
	Rate:     1.5,
}

// qaMappedDays is how many real days from the anchor get a game day: one year,
// which covers every date the seed uses.
const qaMappedDays = 365

func qaGameDay(midnight time.Time) int {
	day, err := spatial.GameDayAt(midnight, qaAnchor)
	if err != nil {
		panic(fmt.Sprintf("seedqa: game day for %s: %v", midnight.Format(time.DateOnly), err))
	}
	return int(day)
}

func (w *world) cast() {
	w.seedBackstoriesAndCatalog()
	owners := []string{"holt", "holt", "holt", "holt", "nessa", "brim", "dove", "rusk", "lane", "brune", "cox", "est"}
	statuses := []string{"active", "active", "retired", "pending_approval", "active", "dead", "active", "active", "pending_approval", "active", "retired", "active"}
	names := []string{"Bram Holt", "Nell Holt", "Old Bram", "Petition Holt", "Nessa Quill", "Cale Brim", "Dove Rusk", "Ivo Rusk", "Hester Lane", "Brune's Spare", "Cox on Leave", "Est the Younger"}
	guild := w.byCat["Entities"]
	backstories := w.backstoryIDs()
	for i := range names {
		w.seedCharacter(i, owners[i], statuses[i], names[i], guild, backstories)
	}
}

func (w *world) seedBackstoriesAndCatalog() {
	for _, b := range []struct {
		name, lore, cohort string
		retired            bool
		region             string
	}{
		{"Salt Heir", "A family that still pays the tower tax in dried fish and excuses.", "coast", false, "coast"},
		{"Charter Foundling", "Raised in the archon's counting house, then sent out to see what the numbers described.", "charter", false, "charter"},
		{"Grey Pilgrim", "Walked out of the unmapped reach with a map that does not match the ground.", "reach", false, "grey"},
		{"Retired Warden", "Kept the river road until the knee gave out. The stories are better than the limp.", "coast", true, "coast"},
	} {
		w.put("backstories", []string{"public_id"}, map[string]ref{"source_region_id": who("regions", w.region[b.region])}, map[string]any{
			"public_id": w.id(9), "name": b.name, "lore": b.lore, "cohort": b.cohort, "retired": b.retired,
		})
	}
	catalog := []struct {
		kind, code, name string
		ok               bool
	}{
		{"species", "human", "Human", true},
		{"species", "coastborn", "Coastborn", true},
		{"species", "fenfolk", "Fenfolk", true},
		{"species", "ashmarked", "Ashmarked", false},
		{"class", "warden", "Warden", true},
		{"class", "chronicler", "Chronicler", true},
		{"class", "ferryman", "Ferryman", true},
		{"class", "charter-clerk", "Charter Clerk", true},
		{"class", "ruin-diver", "Ruin Diver", false},
		{"background", "salt-heir", "Salt Heir", true},
		{"background", "foundling", "Charter Foundling", true},
		{"background", "pilgrim", "Grey Pilgrim", true},
	}
	for _, c := range catalog {
		w.put("creation_catalog", []string{"public_id"}, nil, map[string]any{
			"public_id": w.id(10), "kind": c.kind, "code": c.code, "name": c.name, "available": c.ok,
			"payload": map[string]any{"blurb": c.name + " is on the Lightfall sheet.", "edition": "qa"},
		})
	}
}

func (w *world) backstoryIDs() []string {
	backstories := []string{}
	for _, row := range w.lines {
		if row.Table == "backstories" {
			backstories = append(backstories, row.Row["public_id"].(string))
		}
	}
	return backstories
}

func (w *world) seedCharacter(i int, ownerHandle, status, name string, guild, backstories []string) {
	id := w.id(11)
	owner := w.memberByHandle(ownerHandle)
	code := "qa-" + slugify(name)
	w.chars = append(w.chars, charRow{ID: id, Owner: owner.ID, Name: name, Code: code, Status: status})
	row := map[string]any{
		"public_id": id, "short_code": code, "name": name, "status": status,
		"player_xp": 100 + i*25,
	}
	refs := map[string]ref{
		"owner_id":     who("members", owner.ID),
		"region_id":    who("regions", w.region["coast"]),
		"backstory_id": who("backstories", backstories[i%len(backstories)]),
	}
	if len(guild) > 0 {
		refs["guild_document_id"] = who("documents", guild[i%len(guild)])
	}
	if status == "pending_approval" {
		row["verification_submitted_at"] = "2026-10-01T12:00:00Z"
	}
	w.put("characters", []string{"public_id"}, refs, row)
	// Stored mirrors must match decodeStoredCharacterDDBMirror (closed field set).
	classes := []string{"Warden", "Chronicler", "Ferryman"}[i%3]
	level := 1 + i%8
	w.put("character_ddb_mirrors", []string{"character_id"}, map[string]ref{"character_id": who("characters", id)}, map[string]any{
		"payload": map[string]any{
			"level": level, "xp": level * 100, "armorClass": 12 + i%4, "maxHp": 20 + i,
			"species": []string{"Human", "Elf", "Dwarf"}[i%3], "classes": fmt.Sprintf("%s %d", classes, level),
			"background": []string{"Soldier", "Sailor", "Sage"}[i%3],
			"proficiencies": []map[string]any{
				{"kind": "language", "name": "Common"},
				{"kind": "proficiency", "name": "Athletics"},
			},
		},
		"synced_at": "2026-10-02T12:00:00Z",
	})
	w.put("character_progression_ledger", []string{"public_id"}, map[string]ref{"character_id": who("characters", id)}, map[string]any{
		"public_id": w.id(12), "delta": 100 + i*25, "reason": "Session award for " + name + ".",
	})
	downStatus := []string{"active", "completed", "abandoned"}[i%3]
	w.put("downtime_projects", []string{"public_id"}, map[string]ref{"character_id": who("characters", id)}, map[string]any{
		"public_id": w.id(13), "name": name + " — winter work",
		"target": 10, "progress": []int{2, 10, 4}[i%3], "status": downStatus,
		"goal": "A finished piece of coast-work before Thaw.", "notes": "Logged between sessions. Tools live at the Kept Tower.",
	})
	if i < 4 {
		w.put("verifications", []string{"public_id"}, map[string]ref{
			"subject_id": who("characters", id),
			"decided_by": who("members", w.memberByHandle("sable").ID),
		}, map[string]any{
			"public_id": w.id(14), "subject_type": "character",
			"verdict": []string{"approved", "rejected"}[i%2],
			"note":    name + " reviewed against the coast sheet.",
		})
	}
	w.put("character_logs", []string{"public_id"}, map[string]ref{"character_id": who("characters", id)}, map[string]any{
		"public_id": w.id(26),
		"body":      name + " wrote the evening down: weather, who paid for the ferry, and what the tower lamp did at dusk.",
	})
}

func (w *world) addQuests() {
	arc := w.id(15)
	w.put("quest_arcs", []string{"public_id"}, map[string]ref{"created_by": who("members", w.dms[0])}, map[string]any{
		"public_id": arc, "name": "The Coast Charter",
	})
	arc2 := w.id(15)
	w.put("quest_arcs", []string{"public_id"}, map[string]ref{"created_by": who("members", w.dms[1])}, map[string]any{
		"public_id": arc2, "name": "Grey Errands",
	})

	type qspec struct {
		title, status, signup string
		kinds                 []string
		slots, filled         int
		hours                 float64
		tags, genres          []string
		dm                    int
		arc                   string
		level                 int
	}
	specs := []qspec{}
	for i, item := range questBriefs {
		st := "open"
		signup := []string{"last_game_played", "dm_pick"}[i%2]
		filled := i % 4
		slots := 5
		switch {
		case i >= 18:
			st, filled = "cancelled", 0
		case i >= 16:
			st = "closed"
		case i >= 14:
			st, filled = "played", slots
		case i >= 12:
			st, filled, slots = "full", 4, 4
		}
		if filled > slots {
			filled = slots
		}
		specs = append(specs, qspec{
			title: item.Title, status: st, signup: signup,
			kinds: [][]string{{"standard"}, {"event"}, {"lieutenant"}, {"hexcrawl"}, {"one_shot"}, {"mini_campaign"}, {"standard", "hexcrawl"}}[i%7],
			slots: slots, filled: filled, hours: []float64{3.5, 4, 6.5, 2.5}[i%4],
			tags:   []string{[]string{"coast", "charter", "ruin", "road", "festival"}[i%5], "qa"},
			genres: []string{[]string{"exploration", "intrigue", "travel", "mystery"}[i%4]},
			dm:     i % len(w.dms), arc: []string{arc, arc2}[i%2], level: 1 + i%6,
		})
	}
	for i, s := range specs {
		id := w.id(16)
		w.questRows = append(w.questRows, questRow{ID: id, Slots: s.slots, Filled: s.filled, Status: s.status})
		row := map[string]any{
			"public_id": id, "short_code": "qa-" + slugify(s.title),
			"kinds": s.kinds, "status": s.status, "scheduled_at": fmt.Sprintf("2026-11-%02dT23:00:00Z", (i%27)+1),
			"duration_hours": s.hours, "slots_max": s.slots, "filled_count": s.filled,
			"tags": s.tags, "genres": s.genres, "avg_party_level": s.level, "signup_type": s.signup,
			"discord_desired_revision": 1 + i%3, "discord_applied_revision": i % 2,
		}
		if i%3 == 0 {
			row["discord_message_id"] = fmt.Sprintf("msg-qa-%d", i)
			row["event_url"] = "https://discord.example.test/events/" + slugify(s.title)
		}
		w.put("quests", []string{"public_id"}, map[string]ref{
			"dm_id":       who("members", w.dms[s.dm]),
			"created_by":  who("members", w.dms[s.dm]),
			"document_id": who("documents", w.docID(s.title)),
			"arc_id":      who("quest_arcs", s.arc),
		}, row)
		w.put("quest_regions", []string{"quest_id", "region_id"}, map[string]ref{
			"quest_id":  who("quests", id),
			"region_id": who("regions", w.region["coast"]),
		}, map[string]any{})
		if len(w.crawlNodes) > 0 {
			w.put("quest_pointcrawl_nodes", []string{"quest_id", "node_id", "role"}, map[string]ref{
				"quest_id": who("quests", id),
				"node_id":  who("pointcrawl_nodes", w.crawlNodes[i%len(w.crawlNodes)]),
			}, map[string]any{"role": []string{"expected", "visited"}[i%2]})
		}
		w.seedQuestParticipants(i, id, s.status, s.filled)
	}
}

func (w *world) seedQuestParticipants(index int, questID, status string, filled int) {
	used := map[string]bool{}
	for position := 0; position < filled && position < len(w.chars); position++ {
		character := w.chars[position%len(w.chars)]
		if used[character.ID] {
			continue
		}
		used[character.ID] = true
		participantStatus := "signed_up"
		if status == "played" {
			participantStatus = "played"
		}
		w.put("quest_participants", []string{"quest_id", "character_id"}, map[string]ref{
			"quest_id": who("quests", questID), "member_id": who("members", character.Owner), "character_id": who("characters", character.ID),
		}, map[string]any{"status": participantStatus, "manual": position == 0})
	}
	if status == "open" && len(w.chars) > filled {
		w.addOpenQuestWaitlist(index, questID, filled, used)
	}
}

func (w *world) addOpenQuestWaitlist(index int, questID string, filled int, used map[string]bool) {
	character := w.chars[(filled+1)%len(w.chars)]
	if used[character.ID] {
		return
	}
	w.put("quest_participants", []string{"quest_id", "character_id"}, map[string]ref{
		"quest_id": who("quests", questID), "member_id": who("members", character.Owner), "character_id": who("characters", character.ID),
	}, map[string]any{"status": []string{"waitlisted", "withdrawn", "no_show"}[index%3]})
}

func (w *world) social() {
	notes := []struct {
		handle, kind, body string
		read               bool
	}{
		{"holt", "quest_signup", "You have a seat on The Salt Stair.", false},
		{"nessa", "verification", "Nessa Quill's sheet was approved.", true},
		{"brim", "downtime", "Winter work moved to completed.", false},
		{"dove", "follow", "Captain Brune posted a new table note.", false},
		{"keel", "charter", "The Charter deadline is the first of Ember.", true},
		{"brune", "system", "QA world loaded. The coast map is pointcrawl.", false},
	}
	for _, n := range notes {
		row := map[string]any{"public_id": w.id(17), "kind": n.kind, "body": n.body}
		if n.read {
			row["read_at"] = "2026-10-04T12:00:00Z"
		}
		w.put("notifications", []string{"public_id"}, map[string]ref{
			"member_id": who("members", w.memberByHandle(n.handle).ID),
		}, row)
	}
}

func (w *world) jobsAndSite() {
	jobs := []struct{ key, state, kind, lane string }{
		{"qa-discord-done", "succeeded", "quest_discord_delivery", "discord"},
		{"qa-repair", "repair_required", "quest_discord_delivery", "discord"},
		{"qa-dead", "dead", "quest_discord_delivery", "discord"},
		{"qa-cancelled", "cancelled", "quest_discord_delivery", "default"},
		{"qa-future", "queued", "quest_discord_delivery", "discord"},
		{"qa-later", "retry_wait", "quest_discord_delivery", "discord"},
	}
	for i, j := range jobs {
		id := w.id(24)
		row := map[string]any{
			"public_id": id, "job_key": j.key, "kind": j.kind, "lane": j.lane, "state": j.state,
			"attempts": i % 3,
			"payload":  map[string]any{"source": "qa", "note": j.key},
		}
		if j.state == "queued" || j.state == "retry_wait" {
			row["next_run_at"] = "2099-01-01T00:00:00Z"
		}
		if j.state == "dead" {
			row["error_message"] = "QA sample of a dead letter. Not a live delivery."
		}
		w.put("background_jobs", []string{"job_key"}, nil, row)
	}
	// D44: background_jobs owns lifecycle; agent_questions is the projection.
	// Allocate after the delivery fixtures to preserve their six stable IDs.
	answered := w.id(24)
	question := "What is the Kept Tower's lamp schedule?"
	history := map[string]any{
		"messages":   []any{map[string]any{"role": "user", "content": "lamp schedule"}},
		"incomplete": false,
	}
	result := map[string]any{
		"version": 1, "type": "question.completed", "job_id": answered,
		"answer":  "Dusk until the ferry bell, unless the charter says otherwise.",
		"sources": []any{map[string]any{"document_id": w.docID("Kept Tower"), "title": "Kept Tower"}},
	}
	w.put("background_jobs", []string{"job_key"}, nil, map[string]any{
		"public_id": answered, "job_key": "agent:" + answered,
		"kind": "agent_question", "lane": "agent", "state": "succeeded",
		"attempts": 1, "lease_token": 1,
		"payload":              map[string]any{"version": 1, "type": "question.requested", "job_id": answered, "question": question, "history": history},
		"completion_operation": "succeed", "completion_payload": result,
		"created_at": "2026-10-05T12:00:00Z", "next_run_at": "2026-10-05T12:00:00Z",
		"updated_at": "2026-10-05T12:00:30Z", "question_deadline_at": "2026-10-05T12:01:40Z",
	})
	w.put("agent_questions", []string{"public_id"}, map[string]ref{"job_id": who("background_jobs", answered)}, map[string]any{
		"public_id": w.id(25), "question": question, "history": history, "result": result,
		"created_at": "2026-10-05T12:00:00Z", "updated_at": "2026-10-05T12:00:30Z",
	})
	for i := 0; i < 5; i++ {
		w.put("discord_activity_events", []string{"event_id"}, nil, map[string]any{
			"event_id": fmt.Sprintf("qa-evt-%d", i), "kind": []string{"message", "reaction", "voice"}[i%3],
			"discord_user_id": "qa-" + w.members[i].Handle, "channel_id": "qa-coast-hall",
			"occurred_at": fmt.Sprintf("2026-10-%02dT20:00:00Z", i+1), "amount": 1 + float64(i)/2,
		})
	}
	w.put("bot_heartbeats", []string{"id"}, nil, map[string]any{
		"id": 9001, "payload": map[string]any{"ok": true, "source": "qa"}, "received_at": "2026-10-05T12:00:00Z",
	})
	w.put("idempotency_keys", []string{"endpoint", "actor_id", "key"}, map[string]ref{
		"actor_id": who("members", w.memberByHandle("idris").ID),
	}, map[string]any{"endpoint": "POST /v1/quests", "key": "qa-seed-quest", "fingerprint": nil, "receipt": nil, "completed_at": nil})

	bannerDoc := w.docID("Kept Tower")
	w.put("site_settings", []string{"key"}, map[string]ref{"document_id": who("documents", bannerDoc)}, map[string]any{
		"key": "qa_world", "payload": map[string]any{"loaded": true, "atlas": "LFC", "codex": 100},
	})
	w.put("site_settings", []string{"key"}, nil, map[string]any{
		"key": "home_banner", "payload": map[string]any{
			"enabled": true,
			"title":   "Lightfall Coast",
			"body":    "Lightfall Coast is on the board.",
			"text":    "Lightfall Coast is on the board.",
		},
	})
}

func writeQA(path string) error {
	lines := generateQA()
	var b strings.Builder
	b.WriteString("# generated by: go run ./cmd/seedqa -write\n")
	for i, row := range lines {
		if err := validate(row); err != nil {
			return fmt.Errorf("row %d %s: %w", i+1, row.Table, err)
		}
		raw, err := json.Marshal(row)
		if err != nil {
			return err
		}
		b.Write(raw)
		b.WriteByte('\n')
	}
	if err := os.WriteFile(path, []byte(b.String()), 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %d rows to %s\n", len(lines), path)
	return nil
}
