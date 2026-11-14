package product

const MaxPageLimit = 100

func ValidPage(limit, offset int32) bool {
	return limit > 0 && limit <= MaxPageLimit && offset >= 0
}
