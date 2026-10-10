import fs from 'node:fs';
import path from 'node:path';

const seedPath = path.resolve(
  import.meta.dirname,
  '../../../apps/api/db/seed/qa.jsonl',
);
const outPath = path.resolve(import.meta.dirname, '../docs/parity/qa-route-registry.json');

const rows = fs
  .readFileSync(seedPath, 'utf8')
  .trim()
  .split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => JSON.parse(line));

const docsById = new Map();
for (const entry of rows) {
  if (entry.table !== 'documents') continue;
  docsById.set(entry.row.public_id, entry.row);
}

const routes = [];

function push(label, routePath, expectText, note) {
  routes.push({ label, path: routePath, expectText, note });
}

push('home', '/', 'Lightfall', 'War-room home (MSW or live stats)');
push('quest-board', '/quests', 'Salt Stair', 'Board lists seeded open quests');

for (const entry of rows) {
  if (entry.table !== 'quests') continue;
  const q = entry.row;
  if (q.status !== 'open') continue;
  const doc = docsById.get(entry.refs?.document_id?.public_id ?? entry.refs?.document_id);
  const title = doc?.title ?? q.short_code;
  push(`quest-${q.short_code}`, `/quests/${q.short_code}`, title, 'seedqa quest short_code');
  if (routes.filter((r) => r.path.startsWith('/quests/')).length >= 4) break;
}

for (const entry of rows) {
  if (entry.table !== 'characters') continue;
  const c = entry.row;
  if (c.status !== 'active') continue;
  push(`character-${c.short_code}`, `/characters/${c.short_code}`, c.name, 'seedqa character short_code');
  if (routes.filter((r) => r.path.startsWith('/characters/')).length >= 4) break;
}

for (const entry of rows) {
  if (entry.table !== 'documents') continue;
  const d = entry.row;
  if (d.status !== 'published' || d.visibility !== 'public') continue;
  if (d.kind !== 'codex_entry') continue;
  if (d.category === 'Entities' && d.slug === 'mara-vellum') {
    push('codex-npc-mara', '/codex/npc/mara-vellum', d.title, 'NPC slug');
    push('npc-short-mara', '/npcs/mara-vellum', d.title, 'NPC directory path');
  }
  if (d.slug === 'kept-tower') {
    push('codex-location-tower', '/codex/location/kept-tower', d.title, 'Location slug');
    push('region-hub-kept', '/regions/kept-tower', 'Lightfall Coast', 'Region hub uses location slug');
  }
}

push('chronicles-list', '/chronicles', 'Chronicle', 'Timeline list (adapter fixtures until live)');
push('codex-hub', '/codex', 'Codex', 'Directory hub');
push('rules-hub', '/rules', 'Rules', 'Rules hub page');
push('community-hub', '/community', 'Community', 'Community directory');
push('map-stub', '/map', 'Coming soon', 'Legacy ComingSoon copy');
push('not-found', '/this-route-does-not-exist-qa', 'Page not found', '404 catch-all');

fs.writeFileSync(
  outPath,
  `${JSON.stringify({ schemaVersion: 1, source: 'apps/api/db/seed/qa.jsonl', routes }, null, 2)}\n`,
);

console.log(`wrote ${routes.length} qa routes`);
