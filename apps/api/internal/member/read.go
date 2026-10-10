package member

import "time"

type RoleChange struct {
	ID        string
	MemberID  string
	OldRoles  []string
	NewRoles  []string
	ChangedBy string
	OccurredAt time.Time
	Note      string
}

type AvailabilityWindow struct {
	Weekday      int
	StartMinute  int
	EndMinute    int
}

type ListFilter struct {
	Status *string
	Limit  int
	Offset int
}
