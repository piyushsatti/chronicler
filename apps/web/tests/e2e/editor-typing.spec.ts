import { test, expect, type Page } from '@playwright/test';
import { TOKEN_KEY } from '../../src/auth/storage.js';
import goodMe from '../fixtures/wire/me/good.json' with { type: 'json' };

/**
 * Loop 2 review: two automated quest posts lost characters in the description
 * ("flooded nave" saved as "floodednave", "board" as "bard"). jsdom could not
 * reproduce it, so this types real key events into the description editor of a
 * new quest while the draft autosaves on every change, then checks the editor,
 * the saved draft and the preview all hold every character.
 */
const PARAGRAPH =
  'The flooded nave of the drowned chapel waits below the board of the old ' +
  'harbour, where salt and silt cover every pew and the bells still ring at low tide.';

async function signIn(page: Page) {
  const token = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        member_id: goodMe.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        roles: [],
      }),
    ).toString('base64url'),
    'browser-fixture',
  ].join('.');
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem('typing-test-seeded')) return;
      sessionStorage.setItem('typing-test-seeded', '1');
      localStorage.clear();
      localStorage.setItem(key, value);
    },
    { key: TOKEN_KEY, value: token },
  );
}

/** The newest autosaved quest draft body in this browser. */
async function savedDraftBody(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith('cr_draft_v2_') && key.includes('_quest_new_')) {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as { body: string }).body : null;
      }
    }
    return null;
  });
}

for (const delay of [0, 20]) {
  test(`keeps every keystroke in the quest description at ${delay}ms per key`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Optional slow-device run: CHRONICLER_TYPING_CPU=6 throttles the CPU sixfold.
    const cpu = Number(process.env.CHRONICLER_TYPING_CPU ?? 0);
    if (cpu > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    }
    await signIn(page);
    await page.goto('/quests/new');
    // Type a title first, as a person would, so the draft is already autosaving.
    const title = page.getByRole('textbox', { name: 'Title' });
    if (await title.count())
      await title.first().pressSequentially('The Drowned Chapel', { delay });
    const body = page.locator('[data-component="LiveEditor"]').first();
    await expect(body).toBeVisible();
    await body.click();
    const input = page.locator('textarea[aria-label="Document body"]').first();
    await expect(input).toBeFocused();
    await input.pressSequentially(PARAGRAPH, { delay });
    await expect(input).toHaveValue(PARAGRAPH);
    await expect.poll(() => savedDraftBody(page)).toBe(PARAGRAPH);
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(page.getByRole('tabpanel')).toContainText(PARAGRAPH);
  });
}
