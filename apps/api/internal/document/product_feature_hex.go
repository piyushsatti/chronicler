package document

import (
	"context"
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
	// Atlas code of the Lightfall hexflower map (migration 0003).
	featureHexAtlasCode = "WEEPING-LF"
)

// Region letters, C (centre) or R (ring), then ring digit and three-digit index:
// LFC1001, LFR7008.
var featureHexPattern = regexp.MustCompile(`^[A-Z]{2}[CR][0-9]{4}$`)

// IsFeature reports whether a document is a Feature, whose map link only
// syncFeatureHex may write; the generic map link command refuses it.
func IsFeature(view *DocumentView) bool {
	return view != nil && view.Kind == "codex_entry" && view.Category != nil && *view.Category == featureCategory
}

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

func frontmatterFromYAML(text pgtype.Text) map[string]any {
	var value map[string]any
	if text.Valid {
		_ = yaml.Unmarshal([]byte(text.String), &value)
	}
	return value
}

// syncFeatureHex keeps a Feature's map link in step with the document after
// every write, inside the document write transaction. previous is the category
// before the write, so an entry that stops being a Feature leaves the map. Hexes are looked up on
// the Lightfall hexflower map only. Drafts and trashed Features are not on the
// map and do not count toward the cap; only a DM or admin may put a Feature on
// a hex. The node row lock serialises concurrent placements on one hex.
func (p *ProductPostgres) syncFeatureHex(ctx context.Context, documentID, actorID, kind string, previous, category pgtype.Text, frontmatterYAML pgtype.Text, status string, deleted bool, write pgtype.Timestamptz) error {
	isFeature := kind == "codex_entry" && category.String == featureCategory
	wasFeature := kind == "codex_entry" && previous.String == featureCategory
	if !isFeature && !wasFeature {
		return nil
	}
	docID, err := productDocumentID(documentID)
	if err != nil {
		return err
	}
	unplace := dbgen.DeleteFeatureLinksOffHexParams{DocumentID: docID, AtlasCode: featureHexAtlasCode}
	if deleted || !isFeature {
		return p.queries().DeleteFeatureLinksOffHex(ctx, unplace)
	}
	hex, err := featureHexFromFields(kind, productTextPointer(category), frontmatterFromYAML(frontmatterYAML))
	if err != nil {
		return err
	}
	nodes, err := p.queries().LockFeatureHexNode(ctx, dbgen.LockFeatureHexNodeParams{AtlasCode: featureHexAtlasCode, Hex: hex})
	if err != nil {
		return err
	}
	if len(nodes) != 1 {
		return apierr.New(apierr.Invalid, "the Lightfall map has no hex "+hex)
	}
	if status != "published" {
		return p.queries().DeleteFeatureLinksOffHex(ctx, unplace)
	}
	return p.placeFeatureOnHex(ctx, unplace, actorID, nodes[0], write)
}

// placeFeatureOnHex links a published Feature to node, moving it off any other
// hex. It checks the actor's role and the per-hex cap only when the link is new.
func (p *ProductPostgres) placeFeatureOnHex(ctx context.Context, unplace dbgen.DeleteFeatureLinksOffHexParams, actorID string, node dbgen.LockFeatureHexNodeRow, write pgtype.Timestamptz) error {
	docID := unplace.DocumentID
	linked, err := p.queries().FeatureLinkedToHexNode(ctx, dbgen.FeatureLinkedToHexNodeParams{DocumentID: docID, NodeID: node.ID})
	if err != nil || linked {
		return err
	}
	actor, err := productDocumentID(actorID)
	if err != nil {
		return err
	}
	allowed, err := p.queries().MemberMayPlaceFeatures(ctx, actor)
	if err != nil {
		return err
	}
	if !allowed {
		return apierr.New(apierr.Forbidden, "only a DM or admin can place a Feature on the map")
	}
	others, err := p.queries().CountOtherFeaturesOnHex(ctx, dbgen.CountOtherFeaturesOnHexParams{NodeID: node.ID, DocumentID: docID})
	if err != nil {
		return err
	}
	if others >= maxFeaturesPerHex {
		return apierr.New(apierr.Conflict, "this hex already has 4 Features")
	}
	unplace.KeepNodeID = node.ID
	if err := p.queries().DeleteFeatureLinksOffHex(ctx, unplace); err != nil {
		return err
	}
	return p.queries().InsertFeatureHexLink(ctx, dbgen.InsertFeatureHexLinkParams{
		MapID: node.MapID, NodeID: node.ID, RecordedAt: write, ActorID: actor, DocumentID: docID,
	})
}
