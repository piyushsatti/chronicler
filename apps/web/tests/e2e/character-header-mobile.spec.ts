/**
 * Character header mobile layout — verification chip and DDB action must not overlap.
 */
import { expect, test } from '@playwright/test';

test('character verification state and D&D Beyond action do not overlap on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`<!doctype html><html><head><style>
    :root {
      --sp-1: 4px;
      --sp-2: 8px;
      --sp-3: 12px;
      --sp-5: 20px;
      --sp-6: 24px;
      --rad-sm: 8px;
      --badge-pad: 0 12px;
      --badge-radius: 999px;
      --color-bg-surface: #222;
      --color-text: #fff;
      --color-text-2: #ddd;
      --color-text-3: #aaa;
      --font-display: serif;
      --font-mono: monospace;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; }
    .phead {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 12px;
    }
    .token {
      width: 48px; height: 48px;
      display: grid; place-items: center;
      background: var(--color-bg-surface);
      border-radius: var(--rad-sm);
    }
    .phead__body { flex: 1 1 140px; min-width: 0; }
    .phead__actions { flex: 0 0 auto; }
    .row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; min-height: 24px; padding: 4px 10px; white-space: nowrap; }
    .btn { display: inline-flex; min-height: 32px; padding: 6px 12px; white-space: nowrap; }
  </style></head><body>
    <div class="phead" data-el="character.phead">
      <div class="token">A</div>
      <div class="phead__body">
        <div class="row" data-gap="2">
          <span class="chip">Active</span>
          <span class="chip" data-el="character.verificationStatus">Verified</span>
        </div>
        <h1>Adolin</h1>
      </div>
      <div class="phead__actions">
        <a class="btn" href="https://www.dndbeyond.com/characters/1">D&amp;D Beyond</a>
      </div>
    </div>
  </body></html>`);

  const verification = page.locator('[data-el="character.verificationStatus"]');
  const ddb = page.getByRole('link', { name: 'D&D Beyond' });
  await expect(verification).toBeVisible();
  await expect(ddb).toBeVisible();

  const [verificationBox, ddbBox] = await Promise.all([
    verification.boundingBox(),
    ddb.boundingBox(),
  ]);
  expect(verificationBox).not.toBeNull();
  expect(ddbBox).not.toBeNull();
  if (!verificationBox || !ddbBox) return;

  const overlaps =
    verificationBox.x < ddbBox.x + ddbBox.width &&
    verificationBox.x + verificationBox.width > ddbBox.x &&
    verificationBox.y < ddbBox.y + ddbBox.height &&
    verificationBox.y + verificationBox.height > ddbBox.y;
  expect(overlaps).toBe(false);
});
