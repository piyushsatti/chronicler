-- +goose Up
CREATE VIEW quest_display_status AS
SELECT q.id,
  CASE
    WHEN q.status IN ('open', 'full')
      AND now() >= q.scheduled_at
      AND now() < q.scheduled_at + q.duration_hours * interval '1 hour'
      THEN 'live'
    WHEN q.status = 'open' AND q.filled_count > 0 THEN 'filling'
    WHEN q.status = 'full' AND q.scheduled_at > now() THEN 'scheduled'
    ELSE q.status
  END::text AS display_status
FROM quests q;

-- +goose Down
DROP VIEW quest_display_status;
