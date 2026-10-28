//go:build integration

package document

import (
	"strings"
	"testing"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
)

// previewBody(memberHandle:) projects the draft as that member's live read
// scope would, with no author or administrator bypass.
func TestPreviewBodyAsMemberUsesThatMembersScope(t *testing.T) {
	fixture, ctx, _, resolve := frontendDocumentFixture(t)
	queries := frontendDocumentQueries(t, fixture)
	dm, err := resolve(ctx, frontendAuthor)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := resolve(ctx, frontendReader)
	if err != nil {
		t.Fatal(err)
	}
	const hidden = "> [!redacted]\n> ████████████████████"
	body := "PUBLIC\n> [!dm]\n> DM SECRET\n\n> [!dm:@reader]\n> READER SECRET\n\n> [!dm:@archon]\n> ARCHON SECRET"
	readerView := "PUBLIC\n" + hidden + "\n\n> [!dm:@reader]\n> READER SECRET\n\n" + hidden
	dmView := "PUBLIC\n> [!dm]\n> DM SECRET\n\n" + hidden + "\n\n" + hidden
	archonView := "PUBLIC\n" + hidden + "\n\n" + hidden + "\n\n> [!dm:@archon]\n> ARCHON SECRET"
	noneView := "PUBLIC\n" + hidden + "\n\n" + hidden + "\n\n" + hidden
	handle := func(value string) *string { return &value }
	selfID := frontendAuthor
	for _, tc := range []struct {
		name     string
		spec     PreviewBodySpec
		want     string
		code     apierr.Code
		asReader bool
	}{
		{name: "member sees own handle block only", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("reader")}, want: readerView},
		{name: "another member sees their block only", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("archon")}, want: archonView},
		{name: "approved DM member sees DM block", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("author")}, want: dmView},
		{name: "member scope replaces DM audience", spec: PreviewBodySpec{Audience: PreviewAudienceDM, MemberHandle: handle("reader")}, want: readerView},
		{name: "admin member has no raw bypass", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("admin")}, want: noneView},
		{name: "author id grants no bypass", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, AuthorId: &selfID, MemberHandle: handle("reader")}, want: readerView},
		{name: "DM audience still sees DM blocks", spec: PreviewBodySpec{Audience: PreviewAudienceDM}, want: dmView},
		{name: "unknown handle", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("nobody")}, code: apierr.NotFound},
		{name: "handle match is exact", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("Reader")}, code: apierr.NotFound},
		{name: "empty handle", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("")}, code: apierr.Invalid},
		{name: "NUL handle", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("rea\x00der")}, code: apierr.Invalid},
		{name: "spaced handle", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("rea der")}, code: apierr.Invalid},
		{name: "at-prefixed handle", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("@reader")}, code: apierr.Invalid},
		{name: "over-long handle", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle(strings.Repeat("r", 65))}, code: apierr.Invalid},
		{name: "longest valid unknown handle", spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle(strings.Repeat("r", 64))}, code: apierr.NotFound},
		{name: "player may preview as a member", asReader: true, spec: PreviewBodySpec{Audience: PreviewAudiencePlayer, MemberHandle: handle("author")}, want: dmView},
		{name: "player DM audience still denied", asReader: true, spec: PreviewBodySpec{Audience: PreviewAudienceDM, MemberHandle: handle("reader")}, code: apierr.Forbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			actor := dm
			if tc.asReader {
				actor = reader
			}
			tc.spec.Body = body
			got, err := queries.PreviewBody(ctx, actor, tc.spec)
			if tc.code != "" {
				frontendErrorCode(t, err, tc.code)
				if got != "" {
					t.Fatalf("failure returned body %q", got)
				}
				return
			}
			if err != nil || got != tc.want {
				t.Fatalf("body=%q want=%q err=%v", got, tc.want, err)
			}
		})
	}
}
