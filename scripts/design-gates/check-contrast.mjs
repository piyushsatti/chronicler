#!/usr/bin/env node
// B7 (#467) numeric WCAG AA contrast gate over ruled palettes.
//
// Checks text-1/2/3, brand, red, green, gold vs ground-1 (>= 4.5), plus
// text-1 vs ground-0 and ground-2 (>= 4.5), for every theme/mode the
// manifest RULES (themes.manifest.json — same source of truth as
// check-theme-schema.mjs). Hairlines are NOT checked (decorative, WCAG
// 1.4.11 exemption — see notes/design/theme-matrix-research.md section 3).
//
// The owner-authorized Parchment repair on 2026-09-13 removed the final three
// `large-only` exceptions. Keep the allowlist mechanism fail-loud for future
// reviewed exceptions, but the shipped matrix now requires full AA everywhere.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, blockBody, parseTokens } from './lib/css-blocks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const feRoot = join(repoRoot, 'apps', 'web');
const manifestPath = join(feRoot, 'src', 'styles', 'themes.manifest.json');
const tokensCssPath = join(feRoot, 'src', 'styles', 'tokens.css');

const listMode = process.argv.includes('--list');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const cssLive = stripComments(readFileSync(tokensCssPath, 'utf8'));

// ── WCAG relative luminance + contrast ratio (no guessed numbers) ──────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const int = parseInt(full.slice(0, 6), 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function relLuminance({ r, g, b }) {
  const chan = (c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relLuminance(hexToRgb(hex1));
  const l2 = relLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Allowlist, transcribed from research section 3 ─────────────────────────

const ALLOWLIST = [];
function allowlistEntry(theme, mode, token) {
  return ALLOWLIST.find(
    (a) => a.theme === theme && a.mode === mode && a.token === token,
  );
}

// ── Pairs checked ────────────────────────────────────────────────────────

const GROUND1_PAIRS = ['text-1', 'text-2', 'text-3', 'brand', 'red', 'green', 'gold'];
const AA = 4.5;

const rows = [];
const failures = [];
const staleAllowlist = new Set(ALLOWLIST.map((a) => `${a.theme}/${a.mode}/${a.token}`));

for (const theme of manifest.themes) {
  for (const mode of theme.modes) {
    const body = blockBody(cssLive, theme.name, mode);
    if (body == null) {
      failures.push(
        `${theme.name}/${mode}: no primitive block found (check:theme-schema should already have failed)`,
      );
      continue;
    }
    const tokens = parseTokens(body);
    const ground1 = tokens.get('ground-1');
    const ground0 = tokens.get('ground-0');
    const ground2 = tokens.get('ground-2');

    // D5: a missing/renamed token used to `continue` silently, so coverage
    // could shrink to zero without failing the gate. Push a loud failure
    // for each expected-but-absent token/ground instead.
    if (!ground1) {
      failures.push(
        `${theme.name}/${mode}: expected primitive 'ground-1' missing or renamed — cannot check any pair`,
      );
    }

    for (const tokName of GROUND1_PAIRS) {
      const val = tokens.get(tokName);
      if (!ground1) continue; // already failed above, don't double-report per pair
      if (!val) {
        failures.push(
          `${theme.name}/${mode}: expected token '${tokName}' missing or renamed — cannot check contrast vs ground-1`,
        );
        continue;
      }
      const ratio = contrastRatio(val, ground1);
      const allow = allowlistEntry(theme.name, mode, tokName);
      const threshold = allow ? allow.threshold : AA;
      const pass = ratio >= threshold;
      rows.push({
        theme: theme.name,
        mode,
        pair: `${tokName} vs ground-1`,
        ratio: Number(ratio.toFixed(2)),
        threshold,
        allowlisted: !!allow,
        pass,
      });
      if (allow) staleAllowlist.delete(`${theme.name}/${mode}/${tokName}`);
      if (!pass) {
        failures.push(
          `${theme.name}/${mode} ${tokName} vs ground-1 = ${ratio.toFixed(2)} < ${threshold} (${allow ? 'large-only' : 'AA'})`,
        );
      } else if (allow && ratio >= AA) {
        failures.push(
          `${theme.name}/${mode} ${tokName} vs ground-1 = ${ratio.toFixed(2)} now clears full AA (4.5) — stale allowlist entry, remove it`,
        );
      }
    }

    if (ground0 && tokens.get('text-1')) {
      const ratio = contrastRatio(tokens.get('text-1'), ground0);
      rows.push({
        theme: theme.name,
        mode,
        pair: 'text-1 vs ground-0',
        ratio: Number(ratio.toFixed(2)),
        threshold: AA,
        allowlisted: false,
        pass: ratio >= AA,
      });
      if (ratio < AA)
        failures.push(
          `${theme.name}/${mode} text-1 vs ground-0 = ${ratio.toFixed(2)} < ${AA}`,
        );
    }
    if (ground2 && tokens.get('text-1')) {
      const ratio = contrastRatio(tokens.get('text-1'), ground2);
      rows.push({
        theme: theme.name,
        mode,
        pair: 'text-1 vs ground-2',
        ratio: Number(ratio.toFixed(2)),
        threshold: AA,
        allowlisted: false,
        pass: ratio >= AA,
      });
      if (ratio < AA)
        failures.push(
          `${theme.name}/${mode} text-1 vs ground-2 = ${ratio.toFixed(2)} < ${AA}`,
        );
    }
  }
}

for (const stale of staleAllowlist) {
  failures.push(
    `allowlist entry "${stale}" matched no manifest-ruled theme/mode/token — remove it (typo or the theme/token no longer exists)`,
  );
}

if (listMode) {
  console.log(
    JSON.stringify(
      { rows, allowlistedCount: rows.filter((r) => r.allowlisted).length, failures },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (failures.length > 0) {
  console.error('check:contrast FAILED:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

const allowlistedCount = rows.filter((r) => r.allowlisted).length;
console.log(
  `check:contrast OK — ${rows.length} pair(s) checked across ${manifest.themes.length} ruled theme(s), ${allowlistedCount} allowlisted large-only row(s), 0 failures.`,
);
