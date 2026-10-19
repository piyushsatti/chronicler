package member

import (
	"context"
	"fmt"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
)

func (p *ProductPostgres) productPending() error {
	return fmt.Errorf("member product surface pending wiring")
}

// ReadMemberProfile remains held: ProductMemberProfile SQL exists, but the
// GraphQL memberProfile projection still needs a dedicated product mapper.
func (p *ProductPostgres) ReadMemberProfile(context.Context, auth.Authority, MemberProfileSpec) (*MemberProfileView, error) {
	return nil, p.productPending()
}

var (
	_ MemberReadRepository  = (*ProductPostgres)(nil)
	_ MemberWriteRepository = (*ProductPostgres)(nil)
)
