# Media storage boundary

Chronicler links to externally hosted media. The API does not own or store uploaded image bytes. This follows [D24](/docs/decisions/D24-Media-Is-Linked-Not-Hosted.md) and the [media-linked interface](/docs/interfaces/media-linked.md).

The API's image URL fields refer to external links. Discord avatar hashes are resolved through Discord. The web upload controls documented in older designs do not provide a backend upload path.

There is no product object-storage provider, bucket layout, upload API, signed URL flow, or asset table in the current design. Do not use Supabase Storage or droplet storage for product media without a new accepted decision. The production PostgreSQL backup target is separate from media storage; see [D10](/docs/decisions/D10-Backup-Location-And-Cadence.md).

For the accepted product boundary and exceptions, see [D24](/docs/decisions/D24-Media-Is-Linked-Not-Hosted.md), the [media-linked interface](/docs/interfaces/media-linked.md), and [API docs](/apps/api/docs/README.md).
