-- Local/preview seed. Safe to re-run after truncate.
-- Internal `id` values are assigned by identity; seed rows pin stable `public_id`s
-- for local fixtures. FKs resolve via public_id / natural-key subqueries.

INSERT INTO members (public_id, discord_id, handle, display_name, roles)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'discord-admin', 'admin', 'Admin', ARRAY['admin', 'player']),
  ('22222222-2222-4222-8222-222222222222', 'discord-dm', 'dm-one', 'DM One', ARRAY['dm', 'player']),
  ('33333333-3333-4333-8333-333333333333', 'discord-player', 'player-one', 'Player One', ARRAY['player'])
ON CONFLICT (discord_id) DO NOTHING;

INSERT INTO dm_profiles (member_id, tagline, status, accepting_players)
SELECT m.id, 'Friendly table', 'approved', true
FROM members m
WHERE m.handle = 'dm-one'
ON CONFLICT (member_id) DO NOTHING;

INSERT INTO documents (public_id, kind, slug, title, status, visibility, body, author_id, published_at)
SELECT
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'quest_brief',
  'quest-welcome',
  'Welcome Quest',
  'published',
  'public',
  'A starter quest.',
  m.id,
  now()
FROM members m
WHERE m.handle = 'dm-one'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO regions (public_id, name, kind)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Starting Marches', 'server')
ON CONFLICT (public_id) DO NOTHING;

INSERT INTO maps (public_id, name, atlas_code, map_kind, region_id, cols, rows)
SELECT
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Starting Map',
  'start',
  'hexgrid',
  r.id,
  10,
  10
FROM regions r
WHERE r.public_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
ON CONFLICT (atlas_code) DO NOTHING;

INSERT INTO game_calendar (id, definition)
VALUES (1, '{"months":[{"name":"First","days":30}]}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO site_settings (key, payload)
VALUES
  ('discord_delivery_mode', '{"mode":"queue"}'),
  ('home_banner', '{"enabled":false}')
ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload;
