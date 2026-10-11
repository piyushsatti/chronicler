#!/usr/bin/env node
// A6 theme-schema gate: manifest-driven (src/styles/themes.manifest.json).
// For every theme the manifest RULES, tokens.css must define complete
// [data-theme="<name>"][data-mode="<mode>"] blocks for every mode the
// manifest declares. This does not police tokens.css blocks for themes NOT
// in the manifest (atlas, dracula, default) — those
// predate Epic B's 5-theme matrix ruling and are out of this gate's scope
// until an owner ruling adds them to the manifest.
//
// #456 (A6) review FIX 4: block EXISTENCE alone passes a block missing
// most of its tokens (the issue's actual ask: "a block missing any --p-*
// token fails"). Two checks added:
//   1. Token completeness — the REQUIRED set is derived from whichever
//      manifest-ruled block has the most --p-* declarations (today,
//      Parchment dark/light — both complete and identical in shape, so
//      either could seed it), then every other manifest-ruled block must
//      declare every name in that set.
//   2. Typed-options schema — the manifest itself: "modes" may only
//      contain "light"/"dark" (the only two the CSS block-matcher below
//      understands), "name" and "ruled" must be non-empty strings. A
//      malformed manifest entry currently just silently never matches
//      any CSS block; validate it explicitly instead.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const manifestPath = join(feRoot, 'src', 'styles', 'themes.manifest.json');
const tokensCssPath = join(feRoot, 'src', 'styles', 'tokens.css');

const listMode = process.argv.includes('--list');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const css = readFileSync(tokensCssPath, 'utf8');
// Strip /* ... */ comments so commented-out future-theme blocks (the
// midnight/ember/dracula/vegan placeholder list) never count as present.
const cssLive = css.replace(/\/\*[\s\S]*?\*\//g, '');

function blockExists(theme, mode) {
  const patterns = [
    new RegExp(`\\[data-theme=["']${theme}["']\\]\\[data-mode=["']${mode}["']\\]`),
    new RegExp(`\\[data-mode=["']${mode}["']\\]\\[data-theme=["']${theme}["']\\]`),
  ];
  return patterns.some((re) => re.test(cssLive));
}

// Extract the { --p-name: value; ... } body of a specific block by
// locating its selector and matching the following brace pair.
function blockBody(theme, mode) {
  const patterns = [
    new RegExp(
      `\\[data-theme=["']${theme}["']\\]\\[data-mode=["']${mode}["']\\]\\s*\\{`,
    ),
    new RegExp(
      `\\[data-mode=["']${mode}["']\\]\\[data-theme=["']${theme}["']\\]\\s*\\{`,
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(cssLive);
    if (!m) continue;
    const start = m.index + m[0].length;
    const end = cssLive.indexOf('}', start);
    if (end === -1) continue;
    return cssLive.slice(start, end);
  }
  return null;
}

function pTokenNames(body) {
  return new Set([...body.matchAll(/--p-[a-zA-Z0-9-]+(?=\s*:)/g)].map((m) => m[0]));
}

const missing = [];
const present = [];
for (const theme of manifest.themes) {
  for (const mode of theme.modes) {
    if (blockExists(theme.name, mode)) present.push(`${theme.name}/${mode}`);
    else missing.push(`${theme.name}/${mode}`);
  }
}

// ---- Typed-options schema check on the manifest itself ----
const VALID_MODES = new Set(['light', 'dark']);
const schemaErrors = [];
for (const theme of manifest.themes) {
  if (typeof theme.name !== 'string' || theme.name.trim() === '') {
    schemaErrors.push(`theme entry has invalid "name": ${JSON.stringify(theme.name)}`);
  }
  if (typeof theme.ruled !== 'string' || theme.ruled.trim() === '') {
    schemaErrors.push(
      `"${theme.name}": "ruled" must be a non-empty date string, got ${JSON.stringify(theme.ruled)}`,
    );
  }
  if (!Array.isArray(theme.modes) || theme.modes.length === 0) {
    schemaErrors.push(`"${theme.name}": "modes" must be a non-empty array`);
  } else {
    for (const mode of theme.modes) {
      if (!VALID_MODES.has(mode)) {
        schemaErrors.push(
          `"${theme.name}": invalid mode "${mode}" — only ${[...VALID_MODES].join('/')} are recognized`,
        );
      }
    }
  }
}

// ---- Token-completeness check ----
// Required set: union of --p-* names across every manifest-ruled, present
// block (rather than trusting a single block to be the complete one).
const blockTokens = new Map(); // "theme/mode" -> Set<token>
for (const theme of manifest.themes) {
  for (const mode of theme.modes) {
    if (!VALID_MODES.has(mode)) continue; // already flagged by schema check
    const body = blockBody(theme.name, mode);
    if (body == null) continue; // already flagged by missing-block check
    blockTokens.set(`${theme.name}/${mode}`, pTokenNames(body));
  }
}
const requiredTokens = new Set();
for (const tokens of blockTokens.values())
  for (const t of tokens) requiredTokens.add(t);

const incompleteBlocks = [];
for (const [key, tokens] of blockTokens) {
  const missingTokens = [...requiredTokens].filter((t) => !tokens.has(t));
  if (missingTokens.length > 0) incompleteBlocks.push({ block: key, missingTokens });
}

if (listMode) {
  console.log(
    JSON.stringify(
      {
        manifestThemes: manifest.themes.map((t) => t.name),
        present,
        missing,
        requiredTokenCount: requiredTokens.size,
        incompleteBlocks,
        schemaErrors,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (schemaErrors.length > 0) {
  console.error(
    'check:theme-schema (A6) FAILED — themes.manifest.json fails its typed-options schema:',
  );
  for (const e of schemaErrors) console.error(`  ${e}`);
  console.error(`\nManifest: ${manifestPath}`);
  process.exit(1);
}

if (missing.length > 0) {
  console.error(
    'check:theme-schema (A6) FAILED — manifest-declared theme/mode with no block in tokens.css:',
  );
  for (const m of missing) console.error(`  [data-theme] × [data-mode] missing: ${m}`);
  console.error(
    `\nManifest: ${manifestPath}\nEither author the block or remove the theme from the manifest until it ships.`,
  );
  process.exit(1);
}

if (incompleteBlocks.length > 0) {
  console.error(
    'check:theme-schema (A6) FAILED — manifest-ruled block missing one or more required --p-* tokens:',
  );
  for (const b of incompleteBlocks) {
    console.error(`  ${b.block} missing: ${b.missingTokens.join(', ')}`);
  }
  console.error(
    `\nRequired set (${requiredTokens.size} tokens) is the union across all manifest-ruled blocks. Add the missing declarations.`,
  );
  process.exit(1);
}

console.log(
  `check:theme-schema (A6) OK — ${manifest.themes.length} manifest theme(s), ${present.length} theme/mode block(s) present, all complete against the ${requiredTokens.size}-token required set, manifest schema valid.`,
);
