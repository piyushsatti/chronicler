package member

import (
	"context"
	"fmt"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func (p *ProductPostgres) productPending() error {
	return fmt.Errorf("member product surface pending wiring")
}

func (p *ProductPostgres) ReadCommunityDirectory(context.Context, auth.Authority, CommunityDirectorySpec) (CommunityDirectoryResult, error) {
	return CommunityDirectoryResult{}, p.productPending()
}
func (p *ProductPostgres) ReadMemberProfile(context.Context, auth.Authority, MemberProfileSpec) (*MemberProfileView, error) {
	return nil, p.productPending()
}

var (
	_ MemberReadRepository  = (*ProductPostgres)(nil)
	_ MemberWriteRepository = (*ProductPostgres)(nil)
)
