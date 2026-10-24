#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../apps/web');
const headerSelector = '.site-chrome__top';
const overlaySelectors = new Map([
  ['src/styles/base.css', ['.nav-drawer-backdrop', '.nav-drawer-panel']],
  [
    'src/styles/primitives.css',
    ['.pr-modal__backdrop', '.pr-modal__dialog', '.pr-toast__stack', '.pop-positioner'],
  ],
  [
    'src/styles/editor.css',
    [
      '.hf2 .pf-backdrop',
      '.hf2 .pf-menu',
      '.hf2 .le-menu-backdrop',
      '.hf2 .le-menu',
      '.hf2 .le-ac',
    ],
  ],
  ['src/styles/atlas.css', ['.skip-link']],
  ['src/styles/atlas-vendor/atlas-components.css', ['.hf2 .navdrawer']],
]);
const isolatedOwners = new Map([
  ['src/components/domain/questCard.module.css', ['.boardCard']],
  ['src/features/home/pages/home.module.css', ['.banner']],
  ['src/features/map/pages/map.module.css', ['.explorer']],
  ['src/styles/primitives.css', ['.segmented-track', '.pr-avatar-group']],
  ['src/styles/editor.css', ['.hf2 .le-widget']],
]);

function cssRules(files) {
  return files.flatMap(({ file, source }) =>
    [
      ...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ].flatMap(([, selectors, body]) =>
      selectors.split(',').map((selector) => ({
        file,
        selector: selector.trim(),
        declarations: Object.fromEntries(
          [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)].map(
            ([, property, value]) => [property.toLowerCase(), value.trim()],
          ),
        ),
      })),
    ),
  );
}

export function checkStacking(files) {
  const rules = cssRules(files);
  const failures = [];
  const headers = rules.filter(
    ({ selector, declarations }) =>
      selector.includes(headerSelector) && declarations['z-index'],
  );
  const headerLevels = headers.map(({ declarations }) =>
    Number(declarations['z-index']),
  );
  if (
    !headerLevels.length ||
    headerLevels.some((level) => !Number.isInteger(level) || level <= 0 || level >= 40)
  ) {
    failures.push(
      'Site header must declare a positive z-index below the overlay floor of 40',
    );
  }
  const headerLevel = Math.min(...headerLevels);
  for (const { file, selector, declarations } of rules) {
    const value = declarations['z-index'];
    if (!value || value === 'auto' || selector.includes(headerSelector)) continue;
    const level = Number(value);
    if (!Number.isInteger(level)) {
      failures.push(
        `${file}: ${selector} needs a literal z-index for stacking verification`,
      );
    } else if (overlaySelectors.get(file)?.includes(selector)) {
      if (level < 40)
        failures.push(
          `${file}: ${selector} must stay above the header on the overlay layer (40+)`,
        );
    } else if (level >= headerLevel) {
      failures.push(
        `${file}: ${selector} z-index ${level} can cover site header ${headerLevel}`,
      );
    }
  }
  for (const [file, selectors] of isolatedOwners) {
    for (const selector of selectors) {
      const ownerRules = rules.filter(
        (rule) => rule.file === file && rule.selector === selector,
      );
      if (
        !ownerRules.some(({ declarations }) => declarations.isolation === 'isolate') ||
        ownerRules.some(
          ({ declarations }) =>
            declarations.isolation && declarations.isolation !== 'isolate',
        )
      ) {
        failures.push(`${file}: ${selector} must isolate its internal content layers`);
      }
    }
  }
  for (const { file, selector, declarations } of rules) {
    if (
      /(?:#main|\.site-chrome__main|^\.page$|^\.live-editor$|^\.card$)/.test(
        selector,
      ) &&
      (declarations.isolation === 'isolate' ||
        (declarations['z-index'] && declarations['z-index'] !== 'auto'))
    ) {
      failures.push(
        `${file}: ${selector} must not trap non-portaled overlays below the header`,
      );
    }
  }
  return failures;
}

function readCss(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? readCss(path)
      : entry.name.endsWith('.css')
        ? [
            {
              file: relative(webRoot, path).replace(/\\/g, '/'),
              source: readFileSync(path, 'utf8'),
            },
          ]
        : [];
  });
}

export function runChecks() {
  return checkStacking(readCss(join(webRoot, 'src')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runChecks();
  if (failures.length) {
    console.error(
      `check:stacking FAILED (${failures.length} issues):\n${failures.join('\n')}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      'check:stacking OK. Content layers stay below the site header; overlays remain above it.',
    );
  }
}
