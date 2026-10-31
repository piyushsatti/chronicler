package document

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/notification"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

// Named recipients come from the same closed block classifier as body admission.
func newDocumentMentions(ctx context.Context, reader MentionMemberReader, before, after, actorID string) ([]string, error) {
	if before == after {
		return []string{}, nil
	}
	old, next := mentionHandles(before), mentionHandles(after)
	return resolveNewDocumentMentions(ctx, reader, old, next, actorID)
}

func mentionHandles(body string) map[string]bool {
	found := map[string]bool{}
	for _, span := range parseBody(body) {
		for _, principal := range span.Policy {
			if handle, ok := strings.CutPrefix(principal, "member:@"); ok {
				found[handle] = true
			}
		}
	}
	return found
}

func resolveNewDocumentMentions(ctx context.Context, reader MentionMemberReader, old, next map[string]bool, actorID string) ([]string, error) {
	added := false
	for handle := range next {
		if !old[handle] {
			added = true
		}
	}
	if !added {
		return []string{}, nil
	}
	if product.MissingDependency(reader) {
		return nil, apierr.New(apierr.Internal, "mention reader required")
	}
	all := make([]string, 0, len(old)+len(next))
	for handle := range next {
		all = append(all, handle)
	}
	for handle := range old {
		if !next[handle] {
			all = append(all, handle)
		}
	}
	sort.Strings(all)
	resolved, err := reader.ResolveMentionHandles(ctx, all)
	if err != nil {
		return nil, err
	}
	out := newDocumentMentionIDs(old, next, resolved, actorID)
	sort.Strings(out)
	return out, nil
}

func newDocumentMentionIDs(old, next map[string]bool, resolved map[string]string, actorID string) []string {
	out := []string{}
	previousIDs := map[string]bool{}
	for handle := range old {
		if id := resolved[handle]; id != "" {
			previousIDs[id] = true
		}
	}
	newIDs := map[string]bool{}
	for handle := range next {
		id := resolved[handle]
		if id != "" && id != actorID && !previousIDs[id] {
			newIDs[id] = true
		}
	}
	for id := range newIDs {
		out = append(out, id)
	}
	return out
}

func documentRevisionEvents(kind notification.EventKind, documentID, revisionID, actorID string, at time.Time, mentions []string) []notification.Event {
	event := notification.Event{
		Key: revisionID + ":" + string(kind), Kind: kind, SubjectType: "document", SubjectID: documentID,
		ActorID: actorID, OccurredAt: at,
		Facts: notification.Facts{Version: 1, EventKind: kind, RevisionID: &revisionID},
	}
	events := []notification.Event{event}
	if len(mentions) > 0 {
		event.Key, event.Kind, event.Facts.EventKind = revisionID+":"+string(notification.DMMentioned), notification.DMMentioned, notification.DMMentioned
		event.Facts.NewMentionMemberIDs = append([]string(nil), mentions...)
		events = append(events, event)
	}
	return events
}

func recordDocumentEvents(ctx context.Context, repos ProductCommandRepos, events []notification.Event) error {
	if product.MissingDependency(repos.Producer) {
		return apierr.New(apierr.Internal, "document notification producer required")
	}
	for _, event := range events {
		if err := repos.Producer.Record(ctx, repos.Notice, event); err != nil {
			return err
		}
	}
	return nil
}
