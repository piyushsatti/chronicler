package document

import "testing"

func TestDraftRequiresAuthenticatedOwnerOrAdmin(t *testing.T) {
	tests := []struct {
		name   string
		author string
		scope  ViewerScope
		want   bool
	}{
		{"authorless anonymous", "", ViewerScope{Anonymous: true}, false},
		{"authorless zero scope", "", ViewerScope{}, false},
		{"authorless member", "", ViewerScope{MemberID: "member"}, false},
		{"different author", "author", ViewerScope{MemberID: "member"}, false},
		{"owner", "author", ViewerScope{MemberID: "author"}, true},
		{"admin", "", ViewerScope{MemberID: "admin", IsAdmin: true}, true},
		{"anonymous admin flag", "", ViewerScope{Anonymous: true, IsAdmin: true}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := Document{ID: "doc", Status: StatusDraft, Visibility: VisibilityPublic, AuthorID: tt.author, Body: "draft content"}
			allowed := d.Readable(tt.scope)
			if tt.want {
				if !allowed {
					t.Fatal("authorized draft denied")
				}
			} else if allowed {
				t.Fatal("denied draft admitted")
			}
		})
	}
}
