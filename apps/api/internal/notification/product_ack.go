package notification

import (
	"context"
	"strings"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/auth"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	subjectTypeDocument  = "document"
	subjectTypeCharacter = "character"
	subjectTypeQuest     = "quest"
	maxAckLimit          = 100
)

func normalizeAckLimit(limit int32) (int32, error) {
	if limit < 1 || limit > maxAckLimit {
		return 0, apierr.New(apierr.Invalid, "Invalid acknowledge suppressed limit")
	}
	return limit, nil
}

// selectSuppressedNotificationIDs validates the locked batch, then returns only
// ordinary hidden/missing Document subjects. Non-document missing/malformed
// proof fails the whole command (HISTORY-1 / ROWS-1). Visible rows are skipped.
func selectSuppressedNotificationIDs(ctx context.Context, batch ProductBatchRepository, audience DocumentAudienceReader, actor auth.Authority, candidates []NotificationCandidate) ([]string, error) {
	if batch == nil || audience == nil {
		return nil, apierr.New(apierr.Internal, "notification transaction dependencies required")
	}
	if len(candidates) == 0 {
		return nil, nil
	}

	keys := make([]SubjectKey, len(candidates))
	for i, candidate := range candidates {
		keys[i] = candidate.Subject
	}
	results, err := batch.ReadBatchNotificationSubjects(ctx, actor, keys)
	if err != nil {
		return nil, err
	}
	if len(results) != len(candidates) {
		return nil, apierr.New(apierr.Internal, "notification subject batch size mismatch")
	}

	documentIDs, err := notificationDocumentIDs(candidates, results)
	if err != nil {
		return nil, err
	}

	readable := map[string]bool{}
	if len(documentIDs) > 0 {
		readable, err = audience.ReadableDocumentIDs(ctx, actor, documentIDs)
		if err != nil {
			return nil, err
		}
	}

	return suppressedNotificationIDs(candidates, results, readable)
}

func notificationDocumentIDs(candidates []NotificationCandidate, results []product.BatchResult[SubjectProjection]) ([]string, error) {
	documentIDs := make([]string, 0, len(candidates))
	seenDocs := make(map[string]struct{}, len(candidates))
	for i, candidate := range candidates {
		projection, err := subjectProjectionOrFail(results[i])
		if err != nil {
			return nil, err
		}
		if projection.Malformed {
			return nil, opaqueNotificationProofError()
		}
		if candidate.Subject.SubjectType != subjectTypeDocument {
			continue
		}
		id := strings.TrimSpace(candidate.Subject.SubjectID)
		if id == "" {
			continue
		}
		if _, ok := seenDocs[id]; ok {
			continue
		}
		seenDocs[id] = struct{}{}
		documentIDs = append(documentIDs, id)
	}
	return documentIDs, nil
}

func suppressedNotificationIDs(candidates []NotificationCandidate, results []product.BatchResult[SubjectProjection], readable map[string]bool) ([]string, error) {
	selected := make([]string, 0, len(candidates))
	for i, candidate := range candidates {
		projection, err := subjectProjectionOrFail(results[i])
		if err != nil {
			return nil, err
		}
		if candidate.Subject.SubjectType == subjectTypeDocument {
			id := strings.TrimSpace(candidate.Subject.SubjectID)
			if id == "" || !readable[id] {
				selected = append(selected, candidate.NotificationID)
			}
		} else if !projection.Visible {
			return nil, opaqueNotificationProofError()
		}
	}
	return selected, nil
}

func subjectProjectionOrFail(result product.BatchResult[SubjectProjection]) (SubjectProjection, error) {
	if result.Err != nil {
		return SubjectProjection{}, result.Err
	}
	if result.Value == nil {
		return SubjectProjection{}, opaqueNotificationProofError()
	}
	return *result.Value, nil
}

func opaqueNotificationProofError() error {
	return apierr.New(apierr.Internal, "Internal error")
}
