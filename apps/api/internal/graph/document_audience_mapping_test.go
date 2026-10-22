package graph

import (
	"reflect"
	"testing"

	gql "github.com/99designs/gqlgen/graphql"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

func TestDocumentAudiencePolicyPreservesOmittedNullEmptyAndValues(t *testing.T) {
	for _, item := range []struct {
		name  string
		input gql.Omittable[[]string]
		set   bool
		value *[]string
	}{
		{name: "omitted"},
		{name: "null", input: gql.OmittableOf[[]string](nil), set: true},
		{name: "empty", input: gql.OmittableOf([]string{}), set: true, value: slicePointer([]string{})},
		{name: "named", input: gql.OmittableOf([]string{"member:reader"}), set: true, value: slicePointer([]string{"member:reader"})},
	} {
		t.Run(item.name, func(t *testing.T) {
			got := toDocumentAudienceFields(DocumentAudienceInput{Visibility: "public", Policy: item.input}).Policy
			want := product.Optional[[]string]{Set: item.set, Value: item.value}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("policy=%+v want%+v", got, want)
			}
			quest := toQuestEditFields(QuestEditInput{RegionIds: item.input, Kinds: item.input, Tags: item.input, Genres: item.input})
			for _, got := range []product.Optional[[]string]{quest.RegionIds, quest.Kinds, quest.Tags, quest.Genres} {
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("shared Quest array mapping=%+v want%+v", got, want)
				}
			}
		})
	}
}

func slicePointer(values []string) *[]string { return &values }
