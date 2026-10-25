// Package migrations embeds the goose SQL migrations so the API binary can
// apply them (`api migrate`) without a separate migration image.
package migrations

import "embed"

// FS holds every *.sql migration at its root.
//
//go:embed *.sql
var FS embed.FS
