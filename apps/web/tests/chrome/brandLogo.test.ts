import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('brand logo (owner item 6)', () => {
  it('uses the Chronicler logo for the favicon and the nav icon', () => {
    expect(existsSync(join(root, 'public/brand/chronicler-logo.webp'))).toBe(true);
    expect(read('index.html')).toContain(
      '<link rel="icon" type="image/webp" href="/brand/chronicler-logo.webp" />',
    );
    const chrome = read('src/chrome/SiteChrome.tsx');
    expect(chrome).toMatch(
      /<img src="\/brand\/chronicler-logo\.webp" width=\{816\} height=\{856\} alt="Chronicler" \/>/,
    );
    expect(chrome).not.toContain('chronicler-logo.svg');
  });

  it('keeps the logo’s aspect ratio in the nav', () => {
    const rule = /\.site-chrome__brand img \{([^}]*)\}/.exec(
      read('src/styles/shell.css'),
    )?.[1];
    expect(rule).toMatch(/width:\s*auto;/);
    expect(rule).toMatch(/height:\s*28px;/);
    expect(rule).toMatch(/object-fit:\s*contain;/);
  });
});
