// Sync-only build step: flattens the app's global stylesheet (src/styles/index.css
// and its @import tree) into .design-sync/ds-pkg/dist/styles.css and copies the
// self-hosted fonts beside it, rewriting the app's absolute /fonts/ urls to
// relative ones so the converter can ship them. Run from apps/web.
/* global console */
import { build } from '../.ds-sync/node_modules/esbuild/lib/main.js';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = '.design-sync/ds-pkg/dist';
mkdirSync(`${OUT}/fonts`, { recursive: true });
await build({
  entryPoints: ['src/styles/index.css'],
  bundle: true,
  outfile: `${OUT}/styles.css`,
  external: ['/fonts/*'],
  logLevel: 'warning',
});
const css = readFileSync(`${OUT}/styles.css`, 'utf8').replace(/url\((['"]?)\/fonts\//g, 'url($1./fonts/');
writeFileSync(`${OUT}/styles.css`, css);
for (const f of ['Geist-Variable.woff2', 'GeistMono-Variable.woff2', 'fraunces-latin-full-normal.woff2', 'fraunces-latin-ext-full-normal.woff2', 'fraunces-vietnamese-full-normal.woff2']) {
  cpSync(`public/fonts/${f}`, `${OUT}/fonts/${f}`);
}
console.log(`styles.css ${(css.length / 1024).toFixed(0)} KB`);
