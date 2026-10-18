// Package contract_test detects drift between packages/contracts and the Go API.
//
//	cd apps/api && go test ./test/contract/...
//
// Coverage:
//   - OpenAPI paths/methods ↔ registered mux routes (app.Mount with memory fakes)
//   - GraphQL _roots.graphql Query/Mutation fields ↔ gqlgen executable schema
//
// CI also runs sqlc/gqlgen generate + git diff (see .github/workflows/api.yml).
package contract_test
