package character

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
)

type ddbCaptureProvenance struct {
	Capture struct {
		CaptureUTC string `json:"capture_utc"`
		SHA256     string `json:"sha256"`
	} `json:"capture"`
	Reduction struct {
		SourceSHA256  string `json:"source_sha256"`
		ReducedSHA256 string `json:"reduced_sha256"`
	} `json:"reduction"`
}

func readDdbCapture(t *testing.T) ([]byte, ddbCaptureProvenance) {
	t.Helper()
	payload, err := os.ReadFile("testdata/ddb/published-premade.reduced.json")
	if err != nil {
		t.Fatal(err)
	}
	provenanceBytes, err := os.ReadFile("testdata/ddb/published-premade.provenance.json")
	if err != nil {
		t.Fatal(err)
	}
	var provenance ddbCaptureProvenance
	if err := json.Unmarshal(provenanceBytes, &provenance); err != nil {
		t.Fatal(err)
	}
	reducedHash := sha256.Sum256(payload)
	provenanceHash := sha256.Sum256(provenanceBytes)
	if hex.EncodeToString(reducedHash[:]) != "02284379bfbcc9caedaeb325323686d5526d70e07520848ffddb400007b2be28" || provenance.Reduction.ReducedSHA256 != hex.EncodeToString(reducedHash[:]) {
		t.Fatalf("reduced fixture hash mismatch: actual=%s provenance=%s", hex.EncodeToString(reducedHash[:]), provenance.Reduction.ReducedSHA256)
	}
	if hex.EncodeToString(provenanceHash[:]) != "65531e1645c71f961598ecc8600d0471f2fc6a6bdb5158538351b21aaa9cda35" || provenance.Reduction.SourceSHA256 != provenance.Capture.SHA256 || provenance.Capture.SHA256 != "89d676ce7b8163dd23dc54da2a1796154296a78d23c7c0692450876a5f404b28" {
		t.Fatalf("capture provenance/hash mismatch: %#v", provenance)
	}
	return payload, provenance
}
