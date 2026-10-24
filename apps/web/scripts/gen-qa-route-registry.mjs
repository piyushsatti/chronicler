import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';

const seedPath = path.resolve(
  import.meta.dirname,
  '../../../apps/api/db/seed/qa.jsonl',
);
const root = path.resolve(import.meta.dirname, '../../..');
const outputArg = process.argv.indexOf('--output');
if (outputArg !== -1 && !process.argv[outputArg + 1])
  throw new Error('--output requires a registry path');
const outPath =
  outputArg === -1
    ? path.resolve(import.meta.dirname, '../docs/parity/qa-route-registry.json')
    : path.resolve(process.argv[outputArg + 1]);
const manifestPath = path.resolve(
  import.meta.dirname,
  '../src/routes/routeManifest.ts',
);

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
  const doc = docsById.get(
    entry.refs?.document_id?.public_id ?? entry.refs?.document_id,
  );
  const title = doc?.title ?? q.short_code;
  push(
    `quest-${q.short_code}`,
    `/quests/${q.short_code}`,
    title,
    'seedqa quest short_code',
  );
  if (routes.filter((r) => r.path.startsWith('/quests/')).length >= 4) break;
}

for (const entry of rows) {
  if (entry.table !== 'characters') continue;
  const c = entry.row;
  if (c.status !== 'active') continue;
  push(
    `character-${c.short_code}`,
    `/characters/${c.short_code}`,
    c.name,
    'seedqa character short_code',
  );
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
    push(
      'codex-location-tower',
      '/codex/location/kept-tower',
      d.title,
      'Location slug',
    );
    push(
      'unmapped-region-link',
      '/regions/kept-tower',
      'Region',
      'Historical location slug is not a Region UUID; explain and offer the directory',
    );
  }
}

push(
  'chronicles-list',
  '/chronicles',
  'Chronicle',
  'Document-backed published Summary timeline',
);
push('codex-hub', '/codex', 'Codex', 'Directory hub');
push('rules-hub', '/rules', 'Rules', 'Rules hub page');
push('community-hub', '/community', 'Community', 'Community directory');
push(
  'map-directory',
  '/map',
  rows.find((entry) => entry.table === 'maps')?.row.name ?? 'Map',
  'Seeded pointcrawl example; current directory, graph and equivalent location list',
);
push('not-found', '/this-route-does-not-exist-qa', 'Page not found', '404 catch-all');

const publicActors = ['guest', 'player', 'dm', 'admin'];
const ownerActors = ['guest', 'owner', 'foreign-member', 'admin'];
const editorActors = [
  'guest',
  'author',
  'delegated-editor',
  'foreign-member',
  'admin',
  'configured-owner-without-staff-role',
  'revoked-editor',
];
const mapActors = [
  'guest',
  'player',
  'assigned-archon',
  'unassigned-archon',
  'admin',
  'configured-owner-without-staff-role',
  'revoked-archon',
];
const staffActors = [
  'guest',
  'player',
  'dm',
  'verifier',
  'admin',
  'configured-owner-without-staff-role',
  'revoked-staff',
];
const editorActions = [
  'load current record',
  'save draft and reload',
  'preview',
  'resolve version conflict',
  'read revisions',
  'publish permitted content',
  'change permitted audience',
  'trash and restore permitted content',
  'preserve omitted fields and hidden blocks',
];

const groups = [
  {
    paths: ['/'],
    feature: 'home',
    actors: publicActors,
    actions: [
      'read recruiting quests and banner',
      'navigate to quest and onboarding',
      'sign up or withdraw with an eligible character',
    ],
    access: 'Public Home; signup and withdrawal require current character ownership.',
  },
  {
    paths: ['/editor-demo'],
    feature: 'gallery',
    disposition: 'demo',
    actors: publicActors,
    actions: [
      'inspect shared component states',
      'exercise keyboard controls and themes',
    ],
    access: 'Public editor demonstration; never proof of product persistence.',
  },
  {
    paths: ['/gallery'],
    feature: 'gallery',
    disposition: 'demo',
    requiredEvidence: ['authority', 'live-api', 'responsive', 'visual-review'],
    actors: staffActors,
    actions: [
      'prove current staff access before mounting demos',
      'reject revoked staff proof',
      'inspect shared component states',
      'exercise keyboard controls and themes',
    ],
    access:
      'Authenticated design surface requires current server admin-access proof, including configured owner without a staff role; guest and ordinary members are denied. Never proof of product persistence.',
  },
  {
    paths: ['/_demo'],
    feature: 'gallery',
    disposition: 'demo',
    current: 'redirect',
    target: '/editor-demo',
    actors: publicActors,
    actions: ['redirect to editor demonstration'],
    access: 'Development demonstration alias; never proof of product persistence.',
  },
  {
    paths: ['/quests'],
    feature: 'quest',
    actors: publicActors,
    actions: [
      'filter and paginate quests',
      'read details',
      'select eligible character',
      'sign up',
      'withdraw including waitlisted signup',
    ],
    access: 'Public board; mutations require current ownership and quest admission.',
  },
  {
    paths: ['/quests/:code'],
    feature: 'quest',
    actors: ['guest', 'player', 'owner', 'foreign-dm', 'quest-dm', 'admin'],
    actions: [
      'read authorized brief and participants',
      'choose eligible character',
      'sign up and withdraw',
      'select participants',
      'record attendance',
      'cancel or transition quest',
      'close played quest with PCXP',
      'edit arc and pointcrawl associations',
      'read delivery state',
      'navigate authoritative summaries',
    ],
    access:
      'Public projection follows Document audience; management requires quest authority.',
  },
  {
    paths: ['/quests/:code/summary'],
    feature: 'quest',
    actors: editorActors,
    actions: [
      'load quest and authoritative summaries',
      'append summary',
      'preserve association order',
      'reload summary reader',
    ],
    access:
      'Summary authorship and publication follow current quest and Document authority.',
  },
  {
    paths: ['/quests/new', '/quests/:code/edit'],
    feature: 'editor',
    actors: ['guest', 'player', 'quest-dm', 'foreign-dm', 'admin'],
    actions: [
      'load current quest metadata and permitted brief',
      'preview permitted brief',
      'validate quest metadata',
      'save quest metadata and brief atomically and reload the reader',
      'reject a stale update token without overwriting current content',
      'preserve omitted fields and hidden brief blocks',
      'select existing Regions',
    ],
    access:
      'Current quest command authority governs creation; editing an existing quest requires its current management authority. Foreign DM edit denial and guest denial are required.',
  },
  {
    paths: ['/characters'],
    feature: 'character',
    actors: [...publicActors, 'owner', 'foreign-member'],
    actions: [
      'filter and paginate public character roster',
      'filter own characters under the current account',
      'create character from current catalog',
      'navigate newly created character',
    ],
    access:
      'Roster uses the server public projection; creation and the own-character filter require the current member.',
  },
  {
    paths: ['/characters/:code'],
    feature: 'character',
    actors: [...ownerActors, 'verifier'],
    actions: [
      'read character',
      'edit owned profile',
      'synchronize DDB and inspect last-good mirror',
      'submit and resubmit verification',
      'read progression and logs',
      'perform permitted manual PCXP adjustment with reason',
      'write permitted log',
      'manage downtime',
      'retire owned character',
    ],
    access:
      'Owner-only amendments remain owner-only for foreign admins; review uses verifier authority.',
  },
  {
    paths: ['/community', '/players', '/dms'],
    feature: 'community',
    actors: publicActors,
    actions: [
      'filter and paginate members',
      'read roster and availability',
      'navigate player or DM profile',
    ],
    access:
      'Public directory projection; private member fields remain server-filtered.',
  },
  {
    paths: ['/players/:shortCode', '/dms/:shortCode'],
    feature: 'profile',
    actors: [...ownerActors, 'verifier'],
    actions: [
      'read public profile',
      'edit own member and DM profile',
      'edit own availability',
      'submit DM verification',
      'read filtered and paginated schedule',
      'open or edit owned DM table',
    ],
    access: 'Public profile projection; edits require current account ownership.',
  },
  {
    paths: ['/editor/dm-table', '/editor/dm-table/:id/edit'],
    feature: 'editor',
    actors: editorActors,
    actions: editorActions,
    access:
      'Document-owned community content in dm_table category; edit by actual Document UUID.',
  },
  {
    paths: ['/community/entries/:slug'],
    feature: 'community',
    actors: publicActors,
    actions: ['read authorized community Document', 'follow canonical reader links'],
    access: 'Document audience governs disclosure and server-projected body.',
  },
  {
    paths: ['/community/dm-table/:slug'],
    feature: 'profile',
    actors: editorActors,
    actions: [
      'read authorized DM table',
      'navigate DM and schedule',
      'open editor with actual UUID',
    ],
    access:
      'Document audience governs body and current authority governs edit affordance.',
  },
  {
    paths: ['/codex'],
    feature: 'codex',
    actors: publicActors,
    actions: [
      'filter current categories',
      'search and paginate readable entries',
      'open canonical reader',
    ],
    access: 'Only readable Documents affect listings, counts and snippets.',
  },
  {
    paths: ['/factions', '/npcs'],
    feature: 'codex',
    actors: publicActors,
    actions: [
      'browse readable entries for the fixed directory category',
      'load remaining entry pages',
      'open canonical reader',
    ],
    access: 'Only readable Documents in the directory category appear.',
  },
  {
    paths: ['/codex/:slug'],
    feature: 'codex',
    actors: editorActors,
    actions: [
      'read authorized body and links',
      'navigate related entities',
      'open permitted editor',
    ],
    access:
      'Canonical Codex reader; wrong-kind, missing and private records must not leak.',
  },
  {
    paths: [
      '/codex/new',
      '/codex/:id/edit',
      '/codex/:category/new',
      '/codex/:category/:id/edit',
    ],
    feature: 'editor',
    actors: [...editorActors, 'assigned-archon', 'unassigned-archon'],
    actions: editorActions,
    access:
      'codex_entry creation/editing follows current category and delegated authority; new remains a reserved route.',
  },
  {
    paths: [
      '/codex/npc/:slug',
      '/codex/faction/:slug',
      '/codex/region/:slug',
      '/codex/location/:slug',
      '/npcs/:slug',
      '/factions/:slug',
    ],
    feature: 'codex',
    disposition: 'alias',
    target: '/codex/:slug',
    actors: editorActors,
    actions: [
      'resolve actual slug',
      'redirect to canonical reader',
      'deny missing, private and wrong-kind content',
    ],
    access:
      'Typed labels do not reinterpret current categories; preserve actual Document identity.',
  },
  {
    paths: ['/codex/artifact/:id', '/codex/event/:id', '/codex/lore/:id'],
    feature: 'codex',
    disposition: 'alias',
    target: '/codex/:slug',
    actors: editorActors,
    actions: [
      'validate UUID',
      'resolve readable metadata by UUID',
      'redirect using returned slug',
      'deny invalid, missing, private and wrong-kind content',
    ],
    access: 'Use documentById; a UUID must never be sent as a slug query.',
  },
  {
    paths: ['/regions', '/regions/:slug'],
    feature: 'map',
    actors: mapActors,
    actions: [
      'open actual Region UUID from the directory',
      'explain unmapped historical location slugs without guessing',
      'read region Document and counts',
      'read complete current quest activity projection',
      'navigate pointcrawl maps',
    ],
    access:
      'Current region/location association, Document audience and spatial policy remain authoritative.',
  },
  {
    paths: ['/map', '/map/:atlasCode'],
    feature: 'map',
    actors: mapActors,
    actions: [
      'choose map',
      'explore nodes and edges by pointer and keyboard',
      'use equivalent node list',
      'read authorized linked entries',
      'navigate submap',
      'create authorized map',
      'upsert node and edge',
      'link or unlink entry',
      'reject cross-map and hidden endpoints',
    ],
    access:
      'Pointcrawl-only; regionless writes require admin/configured owner and region writes use current assignments.',
  },
  {
    paths: ['/chronicles'],
    feature: 'chronicle',
    limitations: [
      'Authenticated live account/role-change journeys have disposable native fixture evidence; valid provider OAuth, shared-account persistence and final visual approval remain separate.',
    ],
    actors: publicActors,
    requiredEvidence: ['live-api', 'authority', 'responsive', 'visual-review'],
    actions: [
      'enumerate all readable summaries in offset pages of 100 before rendering',
      'filter the complete timeline by Arc, Region, Author and text',
      'show page errors and retry rather than expose an incomplete collection',
      'remove stale audience data across account, role and logout changes',
      'navigate reader',
      'open authorized create flow',
    ],
    access:
      'Only readable summaries and server calendar projections populate timeline.',
  },
  {
    paths: ['/chronicles/:id', '/summaries/:slug'],
    feature: 'chronicle',
    actors: editorActors,
    actions: [
      'read authorized summary',
      'render safe authored content',
      'navigate associated quests in order',
      'open permitted editor',
    ],
    access:
      'Both reader destinations resolve actual summary identity; no raw-source query.',
  },
  {
    paths: ['/summaries/new', '/summaries/:id/edit'],
    feature: 'editor',
    actors: editorActors,
    actions: [...editorActions, 'associate multiple quests with stable append order'],
    access: 'Document-owned summary uses current author and quest association rules.',
  },
  {
    paths: ['/calendar'],
    feature: 'onboarding',
    actors: publicActors,
    actions: [
      'read server calendar and date projections',
      'filter and paginate scheduled quests',
      'navigate quest',
      'preserve timezone selection',
    ],
    access:
      'Server game-date projection is authoritative; no client restatement of time rules.',
  },
  {
    paths: ['/series/:shortCode'],
    feature: 'onboarding',
    actors: publicActors,
    actions: [
      'resolve actual retained quest arc UUID',
      'read arc and paginate quests',
      'navigate actual quest',
      'explain unmapped identifier without guessing',
      'create or rename arc with current DM authority',
    ],
    access:
      'Retain the historical URL as the quest arc destination; no separate series aggregate.',
  },
  {
    paths: ['/search'],
    feature: 'search',
    actors: publicActors,
    actions: [
      'restore URL query and kind filters',
      'search safe effective Document bodies and member prefixes',
      'paginate result families separately',
      'open canonical result',
      'navigate back with query state',
    ],
    access: 'Hidden text must not affect matches, ranking, totals or snippets.',
  },
  {
    paths: ['/rules'],
    feature: 'rules',
    actors: publicActors,
    requiredEvidence: ['live-api', 'authority', 'responsive', 'visual-review'],
    actions: [
      'filter and paginate guides and rulings',
      'open correct reader',
      'open permitted create flow',
    ],
    access: 'Rule Documents use current guide/ruling categories and audience.',
  },
  {
    paths: ['/rules/guides/:id', '/rules/rulings/:id'],
    feature: 'rules',
    actors: editorActors,
    actions: [
      'read authorized rule body',
      'render safe authored content',
      'open permitted editor',
    ],
    access:
      'Resolve actual rule identity and category; private and wrong-kind records stay unreadable.',
  },
  {
    paths: [
      '/rules/guides/new',
      '/rules/guides/:id/edit',
      '/rules/rulings/new',
      '/rules/rulings/:id/edit',
    ],
    feature: 'editor',
    actors: editorActors,
    actions: editorActions,
    access:
      'Persist kind rule with guide/ruling category rather than unsupported Document kinds.',
  },
  {
    paths: ['/welcome'],
    feature: 'onboarding',
    actors: publicActors,
    actions: ['read onboarding', 'navigate to login or Home'],
    access: 'Public, count-free onboarding; no invented beginner classification.',
  },
  {
    paths: ['/login'],
    feature: 'member',
    actors: ['guest', 'player', 'admin'],
    actions: [
      'start Discord login',
      'retain return destination',
      'handle existing session and rejected login',
    ],
    access: 'Use configured authentication flow without exposing tokens.',
  },
  {
    paths: ['/auth/callback'],
    feature: 'member',
    actors: ['guest', 'player', 'admin'],
    actions: [
      'exchange valid callback',
      'reject missing or invalid code',
      'restore destination',
      'refresh server-authoritative identity',
    ],
    access: 'Tokens stay out of URLs, registry and saved receipts.',
  },
  {
    paths: ['/me', '/me/characters', '/me/notes'],
    feature: 'member',
    actors: ownerActors,
    actions: [
      'read current account',
      'edit owned profile',
      'navigate character, DM and preference workflows',
      'log out and clear account-scoped cache',
    ],
    access:
      'Current authenticated member only; account changes must not reuse another member state.',
  },
  {
    paths: ['/notifications'],
    feature: 'notifications',
    actors: ownerActors,
    actions: [
      'paginate inbox',
      'mark one or all read',
      'navigate actual subject destination',
      'refresh after mutation',
    ],
    access: 'Inbox belongs to current member; no retired event or delivery ledger.',
  },
  {
    paths: ['/settings', '/me/personalize', '/me/settings'],
    feature: 'personalize',
    actors: ownerActors,
    actions: [
      'hydrate account preferences',
      'change theme, mode, density, colorblind and motion settings',
      'change timezone and notification preferences',
      'save and reload',
      'retry failed save',
      'switch account without cache leakage',
    ],
    access:
      'One settings implementation; guest preferences local and member settings server-authoritative.',
  },
  {
    paths: ['/dm'],
    feature: 'admin',
    actors: staffActors,
    actions: [
      'read DM-owned operations',
      'navigate owned quests, profile and verification',
    ],
    access: 'Current DM or admin authority; guest and unrelated member denial.',
  },
  {
    paths: ['/admin'],
    feature: 'admin',
    actors: staffActors,
    actions: ['read operations overview', 'navigate retained administration sections'],
    access: 'Current admin authority; role revocation must remove access.',
  },
  {
    paths: ['/admin/people'],
    feature: 'admin',
    actors: staffActors,
    actions: [
      'search, filter by role and status, and paginate members',
      'change permitted roles individually or in a batch',
      'read back current authority',
    ],
    access: 'Current admin authority and configured-owner restrictions apply.',
  },
  {
    paths: ['/admin/characters'],
    feature: 'admin',
    actors: staffActors,
    actions: [
      'filter characters by name, status and region and paginate results',
      'navigate canonical character readers for progression and mirrors',
    ],
    access:
      'Admin operational powers do not grant foreign owner-only profile amendments.',
  },
  {
    paths: ['/admin/review'],
    feature: 'admin',
    actors: staffActors,
    actions: [
      'paginate character and DM review queues independently',
      'approve or reject current version',
      'display mutation failure and refresh queue',
    ],
    access: 'Current verifier or admin authority; no stale queue approval.',
  },
  {
    paths: ['/admin/world'],
    feature: 'admin',
    actors: [...staffActors, 'assigned-archon', 'unassigned-archon'],
    actions: [
      'filter and paginate regions and load every assignment page',
      'edit region preserving Document and deadline',
      'advance permitted Region lifecycle and preserve associations',
      'assign or revoke archon',
      'create or edit time anchors',
      'update calendar',
      'report partial multi-command failure',
    ],
    access:
      'Current admin world operations; delegated map edits remain constrained by assignment.',
  },
  {
    paths: ['/admin/content'],
    feature: 'admin',
    actors: staffActors,
    actions: [
      'read and edit banner media',
      'filter and paginate retained catalogs',
      'create or edit catalog entry',
      'read back saved content',
    ],
    access: 'Current admin authority; no cosmetic equipment catalog.',
  },
  {
    paths: ['/admin/delivery'],
    feature: 'admin',
    actors: staffActors,
    actions: [
      'paginate delivery jobs and active alerts independently',
      'inspect desired and applied revisions',
      'distinguish queued from applied and failed delivery',
    ],
    access: 'Read retained diagnostics; terminal-job redrive is excluded.',
  },
  {
    paths: ['/admin/data-health'],
    feature: 'admin',
    actors: staffActors,
    actions: [
      'read retained job and bot heartbeat diagnostics',
      'inspect freshness and recorded delivery failures',
    ],
    access: 'Current admin authority; no retired operational-observations model.',
  },
];

const aliases = {
  '/quests/open': '/quests',
  '/timeline': '/chronicles',
  '/schedule': '/calendar',
  '/guilds': '/codex',
  '/guilds/:shortCode': '/codex',
  '/admin/overview': '/admin',
  '/admin/members': '/admin/people',
  '/admin/home-banner': '/admin/content',
  '/admin/regions': '/admin/world',
  '/admin/world-clock': '/admin/world',
  '/admin/catalogs': '/admin/content',
  '/admin/ingestion': '/admin/data-health',
  '/verify': '/admin/review',
  '/quests/:shortCode/redirect': '/quests/:code',
  '/characters/:shortCode/redirect': '/characters/:code',
  '/players/:shortCode/redirect': '/players/:shortCode',
  '/guilds/:shortCode/redirect': '/codex',
  '/factions/:shortCode/redirect': '/codex/:slug',
  '/npcs/:shortCode/redirect': '/codex/:slug',
  '/series/:shortCode/redirect': '/series/:shortCode',
};
for (const [routePath, target] of Object.entries(aliases)) {
  const historical = routePath.startsWith('/guilds') || routePath.startsWith('/series');
  const canonical = groups.find((group) => group.paths.includes(target));
  groups.push({
    paths: [routePath],
    feature: historical || routePath === '/schedule' ? 'onboarding' : canonical.feature,
    disposition: 'alias',
    current: historical && routePath.includes(':') ? 'reader-alias' : 'redirect',
    target,
    actors: canonical.actors,
    actions: historical
      ? [
          'resolve only known historical identity',
          'navigate actual Codex entry or quest arc',
          'explain unmapped identifier without guessing',
        ]
      : [
          'preserve known entity identity',
          'replace URL with canonical destination',
          'enforce destination authority',
        ],
    access: historical
      ? 'Converge Guilds on Codex and Series on retained quest arcs; no new guild/series aggregate or guessed identifier conversion.'
      : 'Alias adds no authority and retains the canonical destination policy.',
    ...(canonical.limitations ? { limitations: canonical.limitations } : {}),
  });
}

const manifestSource = fs.readFileSync(manifestPath, 'utf8');
const parsedManifest = ts.createSourceFile(
  manifestPath,
  manifestSource,
  ts.ScriptTarget.Latest,
  true,
);
let manifestPaths;
for (const statement of parsedManifest.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (
      !ts.isIdentifier(declaration.name) ||
      declaration.name.text !== 'ROUTE_MANIFEST_PATHS'
    )
      continue;
    const initializer = declaration.initializer;
    const array =
      initializer && ts.isAsExpression(initializer)
        ? initializer.expression
        : initializer;
    if (
      !array ||
      !ts.isArrayLiteralExpression(array) ||
      array.elements.some((element) => !ts.isStringLiteral(element))
    ) {
      throw new Error('ROUTE_MANIFEST_PATHS must remain a literal string array');
    }
    manifestPaths = array.elements.map((element) => element.text);
  }
}
if (!manifestPaths?.length) throw new Error('No route manifest paths found');
const byPath = new Map();
for (const { paths, ...group } of groups) {
  for (const routePath of paths) {
    if (byPath.has(routePath))
      throw new Error(`Duplicate QA coverage for ${routePath}`);
    byPath.set(routePath, group);
  }
}
const missing = manifestPaths.filter((routePath) => !byPath.has(routePath));
const removed = [...byPath.keys()].filter(
  (routePath) => !manifestPaths.includes(routePath),
);
if (missing.length || removed.length) {
  throw new Error(
    `QA coverage differs from route manifest. Missing ${JSON.stringify(missing)}; removed ${JSON.stringify(removed)}`,
  );
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const facets = z.enum([
  'live-api',
  'authority',
  'persistence',
  'responsive',
  'visual-review',
]);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const boundFiles = z
  .record(z.string().min(1), hash)
  .refine(
    (files) => Object.keys(files).length > 0,
    'At least one exact file binding is required',
  );
const receiptSchema = z
  .object({
    id: z.string().min(1),
    reviewedBy: z.string().min(1),
    reviewedAt: z.string().datetime(),
    checks: z.array(z.string().min(1)).min(1),
    source: z.object({ scope: z.string().min(1), files: boundFiles }).strict(),
    artifacts: boundFiles,
    runtime: z
      .object({
        frontend: z.string().min(1),
        api: z.string().min(1),
        origin: z.string().url(),
      })
      .strict()
      .optional(),
    routes: z
      .record(
        z.string().min(1),
        z
          .object({
            requirementsSha256: hash,
            covers: z.array(facets),
          })
          .strict(),
      )
      .refine((bindings) => Object.keys(bindings).length > 0),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (
      Object.values(receipt.routes).some((binding) =>
        binding.covers.includes('live-api'),
      ) &&
      !receipt.runtime
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Live API claims require frontend/API runtime epochs and origin',
      });
  });
const previous = fs.existsSync(outPath)
  ? JSON.parse(fs.readFileSync(outPath, 'utf8'))
  : {};
const reviewedReceipts = z.array(receiptSchema).parse(previous.reviewedReceipts ?? []);
if (
  new Set(reviewedReceipts.map((receipt) => receipt.id)).size !==
  reviewedReceipts.length
)
  throw new Error('Reviewed receipt IDs must be unique');
if (
  !reviewedReceipts.length &&
  previous.manifestCoverage?.some((route) => route.verification?.status !== 'pending')
)
  throw new Error('Acceptance records must reference source-bound reviewedReceipts');

function changedBindings(files) {
  return Object.entries(files).flatMap(([file, expected]) => {
    const fullPath = path.resolve(root, file);
    if (
      path.isAbsolute(file) ||
      file.split(/[\\/]/).includes('..') ||
      !fullPath.startsWith(`${root}${path.sep}`)
    )
      throw new Error(`Receipt binding must be a repository-relative path: ${file}`);
    if (!fs.existsSync(fullPath)) return [`missing file: ${file}`];
    return sha256(fs.readFileSync(fullPath)) === expected
      ? []
      : [`changed file: ${file}`];
  });
}
const receiptDrift = new Map(
  reviewedReceipts.map((receipt) => [
    receipt.id,
    [...changedBindings(receipt.source.files), ...changedBindings(receipt.artifacts)],
  ]),
);
const manifestCoverage = manifestPaths.map((pattern) => {
  const group = byPath.get(pattern);
  const metadata = {
    pattern,
    feature: group.feature,
    disposition: group.disposition ?? 'retained',
    current: group.current ?? (group.disposition === 'alias' ? 'reader-alias' : 'page'),
    ...(group.target ? { target: group.target } : {}),
    actors: group.actors,
    access: group.access,
    actions: group.actions,
    ...(group.limitations ? { limitations: group.limitations } : {}),
    requiredEvidence:
      group.requiredEvidence ??
      (group.disposition === 'demo'
        ? ['responsive', 'visual-review']
        : [
            'live-api',
            'authority',
            ...(group.disposition !== 'alias' &&
            /\b(save|create|edit|change|publish|sign up|withdraw|submit|retire|approve|reject|record|close|cancel|mark|append|upsert|link or unlink)\b/i.test(
              group.actions.join(' '),
            )
              ? ['persistence']
              : []),
            'responsive',
            'visual-review',
          ]),
  };
  const requirementsSha256 = sha256(JSON.stringify(metadata));
  const receipts = [];
  const invalidatedReceipts = [];
  const covered = new Set();
  for (const receipt of reviewedReceipts) {
    const binding = receipt.routes[pattern];
    if (!binding) continue;
    const reasons = [...receiptDrift.get(receipt.id)];
    if (binding.requirementsSha256 !== requirementsSha256)
      reasons.push('route requirements changed');
    if (reasons.length) invalidatedReceipts.push({ id: receipt.id, reasons });
    else {
      receipts.push(receipt.id);
      binding.covers.forEach((facet) => covered.add(facet));
    }
  }
  const remainingEvidence = metadata.requiredEvidence.filter(
    (facet) => !covered.has(facet),
  );
  return {
    ...metadata,
    requirementsSha256,
    verification: {
      status: !receipts.length
        ? 'pending'
        : remainingEvidence.length
          ? 'partial'
          : 'verified',
      receipts,
      invalidatedReceipts,
      remainingEvidence,
    },
  };
});
const registry = {
  schemaVersion: 1,
  source: 'apps/api/db/seed/qa.jsonl',
  routes,
  coverageVersion: 2,
  coverageSource: {
    path: 'apps/web/src/routes/routeManifest.ts',
    sha256: sha256(manifestSource),
    generator: 'apps/web/scripts/gen-qa-route-registry.mjs',
  },
  completionPolicy: {
    acceptedPlan:
      'Complete the Chronicler frontend, owner implementation request 2026-10-20 UTC',
    fixtureRoutes:
      'The routes array remains the existing sampled walkthrough input; fixture assertions are not live acceptance.',
    actors:
      'Actors name required allowed and denied cases. Access text and current server policy decide authority; UI role labels never grant it. Privileged journeys also require configured-owner-without-staff-role, role/assignment revocation, logout and account-switch checks. Configured-owner authority never implies immutable resource ownership. Public editor-demo and server-gated staff Gallery are distinct surfaces.',
    evidence:
      'Reviewed receipts are retained with exact source/artifact hashes and per-route requirement hashes. Changed bindings invalidate claims without erasing history. Partial means reviewed checks exist while named route facets remain; registration, source review and fixture checks alone never pass a route. Live claims name actual frontend/API epochs.',
    evidenceFacets: {
      'live-api':
        'Actual API route and applicable action journey, including error and pagination states',
      authority:
        'All required allowed and denied actors, including current-session changes',
      persistence: 'Applicable mutations read back and survive reload',
      responsive:
        'Actual phone, intermediate and desktop route behavior and keyboard access',
      'visual-review':
        'Independent review of actual route screenshots against accepted presentation',
    },
    excluded: [
      'D-AGENT',
      'hexes and fog',
      'retired social requests and follows',
      'terminal-job redrive',
      'cosmetic equipment',
      'unrelated endpoint migration',
      'production deployment',
    ],
  },
  reviewedReceipts,
  manifestCoverage,
};
const output = `${JSON.stringify(registry, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (fs.readFileSync(outPath, 'utf8') !== output) {
    console.error(
      'QA registry is stale. Run node apps/web/scripts/gen-qa-route-registry.mjs.',
    );
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(outPath, output);
}

console.log(
  `${process.argv.includes('--check') ? 'checked' : 'wrote'} ${routes.length} fixture routes and ${manifestCoverage.length} manifest coverage entries`,
);
