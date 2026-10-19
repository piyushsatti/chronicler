package spatial

import "time"

type Hex struct {
	ID        string
	MapID     string
	Col       int
	Row       int
	Terrain   string
	Elevation string
	Climate   string
}

type HexChange struct {
	ID        string
	HexID     string
	Kind      string
	Payload   []byte
	CreatedAt time.Time
}

type RegionCounts struct {
	Hexes      int
	OpenQuests int
}

type MapActivity struct {
	RecentHexChanges int
}
