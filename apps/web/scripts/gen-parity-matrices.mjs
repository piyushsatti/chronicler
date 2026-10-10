import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../../..');
const dump = path.join(root, '.dump/chronicler-old/src/frontend');
const out = path.join(root, 'chronicler/apps/web/docs/parity');

function walk(dir, ext) {
  const files = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) files.push(...walk(p, ext));
    else if (p.endsWith(ext)) files.push(p);
  }
  return files;
}

fs.mkdirSync(path.join(out, 'sdd/tasks'), { recursive: true });
fs.mkdirSync(path.join(out, 'sdd/reports'), { recursive: true });
fs.mkdirSync(path.join(out, 'imposition'), { recursive: true });

const components = walk(path.join(dump, 'app/components'), '.tsx')
  .concat(walk(path.join(dump, 'app/components'), '.ts'))
  .sort();

const compLines = ['legacy_path,new_path,status,tests_ported,visual_checked'];
for (const file of components) {
  const legacy = file.replace(`${dump}/`, 'app/');
  const base = path.basename(file);
  let layer = 'src/components';
  if (legacy.includes('app/components/layout/')) layer = 'src/chrome';
  else if (legacy.includes('app/components/domain/audienceBlocks/')) {
    layer = 'src/components/domain/audienceBlocks';
  } else if (legacy.includes('app/components/domain/')) layer = 'src/components/domain';
  else if (legacy.includes('app/components/primitives/')) layer = 'src/components/primitives';
  else if (legacy.includes('app/components/interactive/')) layer = 'src/components/interactive';
  else if (legacy.includes('app/components/foundation/')) layer = 'src/components/foundation';
  else if (legacy.includes('app/components/data/')) layer = 'src/components/data';
  compLines.push([legacy, `${layer}/${base}`, 'pending', 'no', 'no'].join(','));
}
fs.writeFileSync(path.join(out, 'component-matrix.csv'), `${compLines.join('\n')}\n`);

const hooks = walk(path.join(dump, 'app/hooks'), '.ts').sort();
const hookLines = ['legacy_path,new_adapter_path,composition_hook,feature_owner,status'];
for (const file of hooks) {
  const legacy = file.replace(`${dump}/`, 'app/');
  const name = path.basename(file, '.ts');
  let owner = 'misc';
  if (/Admin|Verify|DmDashboard/i.test(name)) owner = 'admin';
  else if (/Quest/i.test(name)) owner = 'quest';
  else if (/Character|Backstor/i.test(name)) owner = 'character';
  else if (/Codex|Faction|NPC|Artifact/i.test(name)) owner = 'codex';
  else if (/Chronicle|Summary|WorldEvent/i.test(name)) owner = 'chronicle';
  else if (/Community|DmProfile|DmTable|Person|Follow/i.test(name)) owner = 'community';
  else if (/Map|Region|Hex/i.test(name)) owner = 'map';
  else if (/Rule|Guide|Ruling/i.test(name)) owner = 'rules';
  else if (/Search/i.test(name)) owner = 'search';
  else if (/Auth|Me|Notification|Personal/i.test(name)) owner = 'member';
  else if (/Home/i.test(name)) owner = 'home';
  hookLines.push(
    [
      legacy,
      `src/features/${owner}/adapters/${name}Adapter.ts`,
      `src/features/${owner}/hooks/${name}.ts`,
      owner,
      'pending',
    ].join(','),
  );
}
fs.writeFileSync(path.join(out, 'hook-matrix.csv'), `${hookLines.join('\n')}\n`);

const manifestSrc = fs.readFileSync(
  path.join(root, 'chronicler/apps/web/src/routes/routeManifest.ts'),
  'utf8',
);
const paths = [...manifestSrc.matchAll(/'(\/[^']+)'/g)].map((m) => m[1]);
const md = [
  '# Route manifest (legacy App.tsx order)',
  '',
  'Source of truth for registration order: `apps/web/src/routes/routeManifest.ts`.',
  '',
  ...paths.map((p, i) => `${i + 1}. \`${p}\``),
  '',
].join('\n');
fs.writeFileSync(path.join(out, 'routes.manifest.md'), md);

console.log(`components=${components.length} hooks=${hooks.length} routes=${paths.length}`);
