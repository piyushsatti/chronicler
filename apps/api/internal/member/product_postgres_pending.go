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
func (p *ProductPostgres) ReadPendingDmProfileVerifications(context.Context, auth.Authority, PendingDmProfileVerificationsSpec) (CommunityDirectoryResult, error) {
	return CommunityDirectoryResult{}, p.productPending()
}
func (p *ProductPostgres) LockDecideDmProfileVerification(context.Context, DecideDmProfileVerificationSpec) (DecideDmProfileVerificationState, error) {
	return DecideDmProfileVerificationState{}, p.productPending()
}
func (p *ProductPostgres) StoreDecideDmProfileVerification(context.Context, DecideDmProfileVerificationWrite) (DmProfileView, error) {
	return DmProfileView{}, p.productPending()
}
func (p *ProductPostgres) LockSubmitDmProfileForVerification(context.Context, string, SubmitDmProfileForVerificationSpec) (SubmitDmProfileForVerificationState, error) {
	return SubmitDmProfileForVerificationState{}, p.productPending()
}
func (p *ProductPostgres) StoreSubmitDmProfileForVerification(context.Context, SubmitDmProfileForVerificationWrite) (DmProfileView, error) {
	return DmProfileView{}, p.productPending()
}
func (p *ProductPostgres) LockUpdateMyDmProfile(context.Context, string, UpdateMyDmProfileSpec) (UpdateMyDmProfileState, error) {
	return UpdateMyDmProfileState{}, p.productPending()
}
func (p *ProductPostgres) StoreUpdateMyDmProfile(context.Context, UpdateMyDmProfileWrite) (DmProfileView, error) {
	return DmProfileView{}, p.productPending()
}

var (
	_ MemberReadRepository  = (*ProductPostgres)(nil)
	_ MemberWriteRepository = (*ProductPostgres)(nil)
)
