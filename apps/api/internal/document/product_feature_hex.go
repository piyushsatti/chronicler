package document

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/dbgen"
	"gopkg.in/yaml.v3"
)

// A Feature is a Codex entry placed on one map hex (Mortal bard's map brief):
// its frontmatter `hex` names the hex, and each hex holds at most four.
const (
	featureCategory    = "Feature"
	maxFeaturesPerHex  = 4
	featureHexFieldKey = "hex"
)

// Region letters, C (centre) or R (ring), then ring digit and three-digit index:
// LFC1001, LFR7008.
var featureHexPattern = regexp.MustCompile(`^[A-Z]{2}[CR][0-9]{4}$`)

// featureHexFromFields returns the hex code a Feature must carry, or "" when the
// entry is not a Feature. Kind and category gate it so other entries keep any
// `hex` key untouched.
func featureHexFromFields(kind string, category *string, frontmatter map[string]any) (string, error) {
	if kind != "codex_entry" || category == nil || *category != featureCategory {
		return "", nil
	}
	raw, _ := frontmatter[featureHexFieldKey].(string)
	hex := strings.ToUpper(strings.TrimSpace(raw))
	if hex == "" {
		return "", apierr.New(apierr.Invalid, "a Feature needs a hex number")
	}
	if !featureHexPattern.MatchString(hex) {
		return "", apierr.New(apierr.Invalid, "hex number must look like LFR7008")
	}
	return hex, nil
}

func frontmatterFromJSON(raw json.RawMessage) map[string]any {
	var value map[string]any
	_ = json.Unmarshal(raw, &value)
	return value
}

func frontmatterFromYAML(text pgtype.Text) map[string]any {
	var value map[string]any
	if text.Valid {
		_ = yaml.Unmarshal([]byte(text.String), &value)
	}
	return value
}

// placeFeatureOnHex links a Feature to its hex node as a `subject` entry, moves
// it off any other hex on that map and enforces the per-hex cap. It runs inside
// the document write transaction; the node row lock serialises concurrent adds.
func (p *ProductPostgres) placeFeatureOnHex(ctx context.Context, documentID, actorID, hex string, write pgtype.Timestamptz) error {
	if hex == "" {
		return nil
	}
	nodes, err := p.queries().LockFeatureHexNodes(ctx, hex)
	if err != nil {
		return err
	}
	if len(nodes) != 1 {
		return apierr.New(apierr.Invalid, "no map hex has that number")
	}
	node := nodes[0]
	docID, err := productDocumentID(documentID)
	if err != nil {
		return err
	}
	others, err := p.queries().CountOtherFeaturesOnHex(ctx, dbgen.CountOtherFeaturesOnHexParams{NodeID: node.ID, DocumentID: docID})
	if err != nil {
		return err
	}
	if others >= maxFeaturesPerHex {
		return apierr.New(apierr.Conflict, "this hex already has 4 Features")
	}
	if err := p.queries().DeleteFeatureLinksOffHex(ctx, dbgen.DeleteFeatureLinksOffHexParams{DocumentID: docID, MapID: node.MapID, NodeID: node.ID}); err != nil {
		return err
	}
	actor, err := productDocumentID(actorID)
	if err != nil {
		return err
	}
	return p.queries().InsertFeatureHexLink(ctx, dbgen.InsertFeatureHexLinkParams{
		MapID: node.MapID, NodeID: node.ID, RecordedAt: write, ActorID: actor, DocumentID: docID,
	})
}
