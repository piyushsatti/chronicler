package quest

import "context"

type BatchLoader struct {
	Read *ReadModel
}

func (b BatchLoader) LoadMany(ctx context.Context, ids []string) ([]QuestView, error) {
	if b.Read == nil {
		return nil, nil
	}
	out := make([]QuestView, 0, len(ids))
	for _, id := range ids {
		q, err := b.Read.ByID(ctx, id)
		if err != nil {
			continue
		}
		out = append(out, q)
	}
	return out, nil
}
