package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
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
	lines     []line
	n         map[int]int
	members   []memberRow
	dms       []string
	docs      map[string]string // slug -> public id
	byCat     map[string][]string
	hexes     []string
	region    map[string]string
	lfc       string
	chars     []charRow
	questRows []questRow
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
			"theme_mode": []string{"system", "dark", "light"}[i%3],
			"timezone":   []string{"America/New_York", "America/Chicago", "Europe/London", "UTC"}[i%4],
			"payload":    map[string]any{"pronouns": []string{"she/her", "he/him", "they/them"}[i%3], "table_notes": s.name + " prefers a written recap."},
		})
		w.put("member_availability", []string{"public_id"}, map[string]ref{"member_id": who("members", id)}, map[string]any{
			"public_id": w.id(21), "weekday": i % 7, "start_minute": 18 * 60, "end_minute": 22 * 60,
		})
		if s.dm != nil {
			w.dms = append(w.dms, id)
			w.put("dm_profiles", []string{"member_id"}, map[string]ref{"member_id": who("members", id)}, map[string]any{
				"tagline": s.dm.tagline, "philosophy": s.dm.philosophy, "house_rules": s.dm.rules,
				"status": s.dm.status, "accepting_players": s.dm.accepting, "review_revision": i % 3,
				"table_info": map[string]any{
					"night": []string{"Thursday", "Sunday", "Monday"}[i%3], "seats": 5, "style": s.dm.tagline,
					"safety": []string{"lines and veils posted in the brief"},
				},
			})
		}
		if i%4 == 0 && i > 0 {
			w.put("role_changes", []string{"public_id"}, map[string]ref{
				"member_id": who("members", id), "changed_by": who("members", w.members[0].ID),
			}, map[string]any{
				"public_id": w.id(20), "old_roles": []string{"player"}, "new_roles": s.roles,
				"note":        s.name + " took on " + strings.Join(s.roles, ", ") + " after the spring charter.",
				"occurred_at": "2026-04-12T16:00:00Z",
			})
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
		"status": status, "visibility": visibility,
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
	for _, ids := range w.byCat {
		if len(ids) < 2 {
			continue
		}
		w.put("document_revisions", []string{"public_id"}, map[string]ref{
			"document_id": who("documents", ids[0]),
			"created_by":  who("members", w.members[0].ID),
		}, map[string]any{
			"public_id": w.id(19), "reason": "spring recension",
			"title": "Earlier draft", "body": "A shorter draft, kept so the margin notes still have a home.",
			"frontmatter_yaml": "revision: 1\n",
		})
		w.put("document_links", []string{"source_id", "target_id", "relation"}, map[string]ref{
			"source_id": who("documents", ids[0]),
			"target_id": who("documents", ids[1]),
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

	w.lfc = w.id(4)
	w.put("maps", []string{"public_id"}, map[string]ref{"region_id": who("regions", w.region["coast"])}, map[string]any{
		"public_id": w.lfc, "name": "Lightfall Coast", "atlas_code": "LFC",
		"map_kind": "hexgrid", "cols": 12, "rows": 12, "asset_path": "atlases/lfc/coast.webp",
	})
	w.put("maps", []string{"public_id"}, map[string]ref{"region_id": who("regions", w.region["grey"])}, map[string]any{
		"public_id": w.id(4), "name": "Underkeep", "atlas_code": "LFC-UNDER", "map_kind": "pointcrawl",
	})

	terrains := []string{"plains", "forest", "hills", "marsh", "mountain", "coast", "river", "ruin", "road", "waste"}
	elevations := []string{"low", "shelf", "high", "sunken"}
	climates := []string{"temperate", "wet", "wind-scoured", "salt"}
	const cols, rows = 10, 8
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			id := w.id(5)
			w.hexes = append(w.hexes, id)
			n := r*cols + c
			w.put("hexes", []string{"map_id", "col", "row"}, map[string]ref{"map_id": who("maps", w.lfc)}, map[string]any{
				"public_id": id, "col": c, "row": r,
				"terrain": terrains[n%len(terrains)], "elevation": elevations[n%len(elevations)], "climate": climates[n%len(climates)],
			})
		}
	}

	poiTypes := []string{"landmark", "settlement", "lair", "dungeon_site", "regional_feature"}
	tiers := []string{"landmark", "hidden", "secret"}
	locIDs := w.byCat["Locations"]
	for i := 0; i < 20 && i < len(w.hexes); i++ {
		refs := map[string]ref{"hex_id": who("hexes", w.hexes[i])}
		row := map[string]any{
			"public_id": w.id(6), "poi_type": poiTypes[i%len(poiTypes)], "discovery_tier": tiers[i%len(tiers)],
			"is_charter_objective": i%5 == 0,
		}
		if i < len(locIDs) {
			refs["document_id"] = who("documents", locIDs[i])
		}
		w.put("pois", []string{"public_id"}, refs, row)
	}

	edgeTypes := []string{"road", "trail", "river", "pass", "wall", "ford"}
	for i := 0; i+1 < len(w.hexes) && i < 24; i += 2 {
		w.put("hex_edges", []string{"public_id"}, map[string]ref{
			"map_id": who("maps", w.lfc),
			"hex_a":  who("hexes", w.hexes[i]),
			"hex_b":  who("hexes", w.hexes[i+1]),
		}, map[string]any{
			"public_id": w.id(7), "edge_type": edgeTypes[(i/2)%len(edgeTypes)],
			"a_side": []string{"north", "east", "south"}[(i/2)%3],
		})
	}

	feat := w.byCat["Feature"]
	for i := 0; i < len(feat) && i < 24; i++ {
		hexIdx := i % 16
		w.put("hex_entry_links", []string{"hex_id", "document_id", "relation"}, map[string]ref{
			"hex_id":      who("hexes", w.hexes[hexIdx]),
			"document_id": who("documents", feat[i]),
		}, map[string]any{"relation": "feature"})
	}
	for i := 0; i < 8 && i < len(locIDs); i++ {
		w.put("hex_entry_links", []string{"hex_id", "document_id", "relation"}, map[string]ref{
			"hex_id":      who("hexes", w.hexes[i]),
			"document_id": who("documents", locIDs[i]),
		}, map[string]any{"relation": "place"})
	}

	changeKinds := []string{
		"terrain_change", "image_change", "document_repoint", "submap_change",
		"entry_linked", "entry_unlinked", "feature_added", "razed", "renamed",
	}
	for i, kind := range changeKinds {
		w.put("hex_changes", []string{"public_id"}, map[string]ref{"hex_id": who("hexes", w.hexes[i%len(w.hexes)])}, map[string]any{
			"public_id": w.id(8), "kind": kind,
			"payload": map[string]any{"note": kind + " recorded after the autumn survey", "by": "keel"},
		})
	}

	w.put("archon_assignments", []string{"member_id", "region_id"}, map[string]ref{
		"member_id": who("members", w.memberByHandle("keel").ID),
		"region_id": who("regions", w.region["charter"]),
	}, map[string]any{})

	w.put("time_anchors", []string{"public_id"}, nil, map[string]any{
		"public_id": w.id(23), "real_utc": "2026-01-01T00:00:00Z", "epoch_day": 0, "rate": 1.5,
		"note": "Campaign clock starts on the first real Thursday of the year. One session is a day and a half on the coast.",
	})
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
	for d := 1; d <= 14; d++ {
		w.put("game_time_map", []string{"real_date"}, nil, map[string]any{
			"real_date": fmt.Sprintf("2026-10-%02dT00:00:00Z", d), "game_day": 200 + d,
		})
	}
}

func (w *world) cast() {
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

	owners := []string{"holt", "holt", "holt", "holt", "nessa", "brim", "dove", "rusk", "lane", "brune", "cox", "est"}
	statuses := []string{"active", "active", "retired", "pending_approval", "active", "dead", "active", "active", "pending_approval", "active", "retired", "active"}
	names := []string{"Bram Holt", "Nell Holt", "Old Bram", "Petition Holt", "Nessa Quill", "Cale Brim", "Dove Rusk", "Ivo Rusk", "Hester Lane", "Brune's Spare", "Cox on Leave", "Est the Younger"}
	guild := w.byCat["Entities"]
	backstories := []string{}
	for _, row := range w.lines {
		if row.Table == "backstories" {
			backstories = append(backstories, row.Row["public_id"].(string))
		}
	}
	for i := range names {
		id := w.id(11)
		owner := w.memberByHandle(owners[i])
		code := "qa-" + slugify(names[i])
		w.chars = append(w.chars, charRow{ID: id, Owner: owner.ID, Name: names[i], Code: code, Status: statuses[i]})
		row := map[string]any{
			"public_id": id, "short_code": code, "name": names[i], "status": statuses[i],
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
		if statuses[i] == "pending_approval" {
			row["verification_submitted_at"] = "2026-10-01T12:00:00Z"
		}
		w.put("characters", []string{"public_id"}, refs, row)
		w.put("character_ddb_mirrors", []string{"character_id"}, map[string]ref{"character_id": who("characters", id)}, map[string]any{
			"payload": map[string]any{
				"name": names[i], "level": 1 + i%8, "class": []string{"warden", "chronicler", "ferryman"}[i%3],
				"hp": map[string]any{"current": 12 + i, "max": 20 + i},
			},
			"synced_at": "2026-10-02T12:00:00Z",
		})
		w.put("character_progression_ledger", []string{"public_id"}, map[string]ref{"character_id": who("characters", id)}, map[string]any{
			"public_id": w.id(12), "delta": 100 + i*25, "reason": "Session award for " + names[i] + ".",
		})
		downStatus := []string{"active", "completed", "abandoned"}[i%3]
		w.put("downtime_projects", []string{"public_id"}, map[string]ref{"character_id": who("characters", id)}, map[string]any{
			"public_id": w.id(13), "name": names[i] + " — winter work",
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
				"note":    names[i] + " reviewed against the coast sheet.",
			})
		}
		w.put("character_logs", []string{"public_id"}, map[string]ref{"character_id": who("characters", id)}, map[string]any{
			"public_id": w.id(26),
			"body":      names[i] + " wrote the evening down: weather, who paid for the ferry, and what the tower lamp did at dusk.",
		})
	}
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
		signup := []string{"open", "application", "invite"}[i%3]
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
		if len(w.hexes) > 0 {
			w.put("quest_hexes", []string{"quest_id", "hex_id", "role"}, map[string]ref{
				"quest_id": who("quests", id),
				"hex_id":   who("hexes", w.hexes[i%len(w.hexes)]),
			}, map[string]any{"role": []string{"expected", "visited"}[i%2]})
		}
		used := map[string]bool{}
		for p := 0; p < s.filled && p < len(w.chars); p++ {
			ch := w.chars[p%len(w.chars)]
			if used[ch.ID] {
				continue
			}
			used[ch.ID] = true
			pst := "signed_up"
			if s.status == "played" {
				pst = "played"
			}
			w.put("quest_participants", []string{"quest_id", "character_id"}, map[string]ref{
				"quest_id": who("quests", id), "member_id": who("members", ch.Owner), "character_id": who("characters", ch.ID),
			}, map[string]any{"status": pst, "manual": p == 0})
		}
		if s.status == "open" && len(w.chars) > s.filled {
			ch := w.chars[(s.filled+1)%len(w.chars)]
			if !used[ch.ID] {
				w.put("quest_participants", []string{"quest_id", "character_id"}, map[string]ref{
					"quest_id": who("quests", id), "member_id": who("members", ch.Owner), "character_id": who("characters", ch.ID),
				}, map[string]any{"status": []string{"waitlisted", "withdrawn", "no_show"}[i%3]})
			}
		}
	}
}

func (w *world) social() {
	players := []memberRow{}
	for _, m := range w.members {
		if !m.DM && m.Handle != "tam" {
			players = append(players, m)
		}
	}
	for i, p := range players {
		w.put("member_follows", []string{"follower_id", "followed_id"}, map[string]ref{
			"follower_id": who("members", p.ID),
			"followed_id": who("members", w.dms[i%len(w.dms)]),
		}, map[string]any{})
	}
	w.put("member_follows", []string{"follower_id", "followed_id"}, map[string]ref{
		"follower_id": who("members", w.memberByHandle("nessa").ID),
		"followed_id": who("members", w.memberByHandle("holt").ID),
	}, map[string]any{})

	reqs := []struct{ from, to, kind, status, note string }{
		{"holt", "brune", "seat", "pending", "Looking for a Thursday seat on the coast road."},
		{"nessa", "cox", "quest", "pending", "Can Nessa bring a hexcrawl character next month?"},
		{"brim", "brune", "quest", "approved", "Approved for the salt stair job."},
		{"dove", "pell", "seat", "declined", "Table is full through Ember."},
		{"rusk", "cox", "seat", "withdrawn", "Found another night."},
		{"lane", "quill", "quest", "approved", "Mystery seat confirmed."},
	}
	for i, r := range reqs {
		refs := map[string]ref{
			"requester_id": who("members", w.memberByHandle(r.from).ID),
			"target_dm_id": who("members", w.memberByHandle(r.to).ID),
		}
		row := map[string]any{"public_id": w.id(22), "kind": r.kind, "status": r.status, "note": r.note}
		if r.status != "pending" {
			refs["resolved_by"] = who("members", w.memberByHandle(r.to).ID)
			row["resolved_at"] = "2026-10-03T18:00:00Z"
		}
		w.put("dm_requests", []string{"public_id"}, refs, row)
		_ = i
	}

	cosmetics := []struct{ code, kind string }{
		{"ink-night", "theme"}, {"salt-gold", "palette"}, {"chapbook", "font"},
		{"tower-lamp", "flair"}, {"road-warden", "title"}, {"kept-seal", "badge"},
		{"charter-frame", "frame"}, {"wharf-plate", "nameplate"}, {"ferry-token", "token"},
	}
	unlockIDs := []string{}
	for i, c := range cosmetics {
		id := w.id(18)
		unlockIDs = append(unlockIDs, id)
		w.put("unlockables", []string{"public_id"}, nil, map[string]any{
			"public_id": id, "code": c.code, "cosmetic_type": c.kind, "active": i != 3,
			"payload": map[string]any{"label": c.code, "rarity": []string{"common", "rare"}[i%2]},
		})
	}
	sources := []string{"milestone", "event", "cohort", "grant", "purchase"}
	for i, src := range sources {
		w.put("member_unlocks", []string{"member_id", "unlockable_id"}, map[string]ref{
			"member_id":     who("members", w.memberByHandle("holt").ID),
			"unlockable_id": who("unlockables", unlockIDs[i]),
			"granted_by":    who("members", w.memberByHandle("idris").ID),
		}, map[string]any{"source": src})
	}

	notes := []struct {
		handle, kind, body string
		read               bool
	}{
		{"holt", "quest_signup", "You have a seat on The Salt Stair.", false},
		{"nessa", "verification", "Nessa Quill's sheet was approved.", true},
		{"brim", "downtime", "Winter work moved to completed.", false},
		{"dove", "follow", "Captain Brune posted a new table note.", false},
		{"keel", "charter", "The Charter deadline is the first of Ember.", true},
		{"brune", "system", "QA world loaded. The coast map has hexes.", false},
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
	var answered string
	for i, j := range jobs {
		id := w.id(24)
		if i == 0 {
			answered = id
		}
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
	w.put("agent_questions", []string{"public_id"}, map[string]ref{"job_id": who("background_jobs", answered)}, map[string]any{
		"public_id": w.id(25), "question": "What is the Kept Tower's lamp schedule?",
		"state": "answered", "history": []any{map[string]any{"role": "user", "text": "lamp schedule"}},
		"result": map[string]any{"text": "Dusk until the ferry bell, unless the charter says otherwise."},
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
	w.put("idempotency_keys", []string{"endpoint", "key"}, map[string]ref{
		"actor_id": who("members", w.memberByHandle("idris").ID),
	}, map[string]any{"endpoint": "POST /v1/quests", "key": "qa-seed-quest"})

	bannerDoc := w.docID("Kept Tower")
	w.put("site_settings", []string{"key"}, map[string]ref{"document_id": who("documents", bannerDoc)}, map[string]any{
		"key": "qa_world", "payload": map[string]any{"loaded": true, "atlas": "LFC", "codex": 100},
	})
	w.put("site_settings", []string{"key"}, nil, map[string]any{
		"key": "home_banner", "payload": map[string]any{"enabled": true, "text": "Lightfall Coast is on the board."},
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
