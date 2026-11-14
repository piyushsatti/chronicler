package member

type AvailabilityWindow struct {
	Weekday     int
	StartMinute int
	EndMinute   int
}

type ListFilter struct {
	Status *string
	Limit  int
	Offset int
}
