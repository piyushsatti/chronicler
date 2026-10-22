package character

import (
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

func requireCharacterInvalid(t *testing.T, err error, label string) {
	t.Helper()
	if expected, ok := err.(*apierr.Error); !ok || expected.Code != apierr.Invalid {
		t.Fatalf("%s: want INVALID value, got %v", label, err)
	}
}

const (
	testRegionID    = "20000000-0000-4000-8000-000000000011"
	testBackstoryID = "20000000-0000-4000-8000-000000000012"
)

func createSpecWith(ddb, image *string) *CreateCharacterSpec {
	region, backstory := testRegionID, testBackstoryID
	return &CreateCharacterSpec{Input: CreateCharacterFields{Name: "Hero", DdbUrl: ddb, ImageUrl: image, RegionId: &region, BackstoryId: &backstory}}
}

func TestCreateCharacterRequiresDdbURL(t *testing.T) {
	valid := "https://www.dndbeyond.com/characters/152579009"
	spec := func(ddb *string) *CreateCharacterSpec { return createSpecWith(ddb, nil) }
	if err := validateCreateCharacterInput(spec(&valid)); err != nil {
		t.Fatalf("valid DDB URL rejected: %v", err)
	}
	blank := "   "
	requireCharacterInvalid(t, validateCreateCharacterInput(spec(nil)), "missing DDB URL")
	requireCharacterInvalid(t, validateCreateCharacterInput(spec(&blank)), "blank DDB URL")
	for _, bad := range []string{
		"http://www.dndbeyond.com/characters/1",
		"https://evil.example/characters/1",
		"https://www.dndbeyond.com/profile/someone",
		"javascript:alert(1)",
	} {
		bad := bad
		requireCharacterInvalid(t, validateCreateCharacterInput(spec(&bad)), bad)
	}
}

func TestCharacterImageURLValidation(t *testing.T) {
	for _, ok := range []string{"https://i.imgur.com/a.png", "https://cdn.example.org/p/x.webp?size=2", "https://" + strings.Repeat("a", 2040)} {
		if err := validateCharacterImageURL(ok); err != nil {
			t.Fatalf("%q rejected: %v", ok, err)
		}
	}
	for _, bad := range []string{
		"",
		"http://i.imgur.com/a.png",
		"HTTPS://i.imgur.com/a.png",
		"https://",
		"https://user:pass@example.org/a.png",
		"https://exa mple.org/a.png",
		"data:image/png;base64,AAAA",
		"https://" + strings.Repeat("a", 2041),
	} {
		requireCharacterInvalid(t, validateCharacterImageURL(bad), bad)
	}
	ddb := "https://www.dndbeyond.com/characters/7"
	image := "http://insecure.example/a.png"
	if err := validateCreateCharacterInput(createSpecWith(&ddb, nil)); err != nil {
		t.Fatalf("create without image rejected: %v", err)
	}
	requireCharacterInvalid(t, validateCreateCharacterInput(createSpecWith(&ddb, &image)), "create with http image")
}

func TestCreateCharacterRequiresRegionAndBackstory(t *testing.T) {
	ddb := "https://www.dndbeyond.com/characters/7"
	if err := validateCreateCharacterInput(createSpecWith(&ddb, nil)); err != nil {
		t.Fatalf("complete create rejected: %v", err)
	}
	noRegion := createSpecWith(&ddb, nil)
	noRegion.Input.RegionId = nil
	requireCharacterInvalid(t, validateCreateCharacterInput(noRegion), "missing region")
	if err, _ := validateCreateCharacterInput(noRegion).(*apierr.Error); err == nil || err.Message != "region required" {
		t.Fatalf("missing region error=%v", err)
	}
	noBackstory := createSpecWith(&ddb, nil)
	noBackstory.Input.BackstoryId = nil
	requireCharacterInvalid(t, validateCreateCharacterInput(noBackstory), "missing backstory")
	if err, _ := validateCreateCharacterInput(noBackstory).(*apierr.Error); err == nil || err.Message != "backstory required" {
		t.Fatalf("missing backstory error=%v", err)
	}
	blank := ""
	blankRegion := createSpecWith(&ddb, nil)
	blankRegion.Input.RegionId = &blank
	requireCharacterInvalid(t, validateCreateCharacterInput(blankRegion), "blank region")
}
