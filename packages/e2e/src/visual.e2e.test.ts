import { expect } from 'bun:test';
import type { Browser, Page } from 'playwright-core';
import { e2eTest, launchBrowser, startApp, type RunningApp } from './appServer';
import { createCourse, pageHtml, save, showView } from './flows';

const TINY_PNG: Buffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/** Tiptap gives focus back to the editor a moment later; wait until it has. */
const settle = (page: Page): Promise<unknown> =>
  page.waitForFunction(
    () => document.activeElement?.getAttribute('role') === 'textbox'
  );

const editor = (page: Page) =>
  page.getByRole('textbox', { name: 'Page content' });

e2eTest(
  'visual editor: format, link, table and image survive saving and reloading',
  async (): Promise<void> => {
    const app: RunningApp = await startApp({
      IDENTITY_PROVIDER: 'single-user',
      IDENTITY_SINGLE_USER_ACKNOWLEDGED: 'true',
      SINGLE_USER_NAME: 'Visual Author',
    });
    const browser: Browser = await launchBrowser();
    const page: Page = await (await browser.newContext()).newPage();
    const problems: string[] = [];
    page.on('pageerror', (error): void => {
      problems.push(error.message);
    });
    try {
      await createCourse(page, app.baseUrl, 'Visual course');
      await page.getByRole('textbox', { name: 'Page content' }).waitFor();

      // headings start at h3 (the page title is the h2) and apply to the paragraph
      await editor(page).fill('A heading');
      await page.getByLabel('Text style').selectOption('4');
      await settle(page);
      await page.keyboard.press('Enter');
      await page.keyboard.type('Plain ');
      await page.getByRole('button', { name: 'Bold' }).click();
      await page.keyboard.type('bold');
      await page.getByRole('button', { name: 'Bold' }).click();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Bulleted list' }).click();
      await page.keyboard.type('first');
      await page.keyboard.press('Enter');
      await page.keyboard.type('second');

      // a link on a typed word
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Visit site');
      await page.keyboard.press('Shift+Home');
      await page.getByRole('button', { name: 'Link' }).click();
      await page.getByLabel('Link address').fill('https://example.com/');
      await page.getByRole('button', { name: 'Apply link' }).click();
      await settle(page);

      // uploaded image, with a description (in its own paragraph)
      await page.keyboard.press('ArrowRight');
      // ProseMirror reads the new caret from the page a moment later; a key
      // sent in the same instant still sees the old selection.
      await page.waitForTimeout(250);
      await page.keyboard.press('Enter');
      await page
        .getByLabel('Choose files to upload')
        .setInputFiles([
          { name: 'dot.png', mimeType: 'image/png', buffer: TINY_PNG },
        ]);
      await page.getByText('dot.png').first().waitFor();
      await page.getByPlaceholder('What the image shows').fill('A dot');
      await page
        .getByRole('button', { name: 'Insert dot.png into the page' })
        .click();
      await settle(page);
      await page.keyboard.press('Enter');
      // a table, and a row added to it
      await page.getByRole('button', { name: 'Insert table' }).click();
      await page.getByRole('button', { name: 'Add row below' }).click();

      await save(page);

      const before: string = await pageHtml(page);
      expect(before).toContain('<h4>A heading</h4>');
      expect(before).toMatch(/<p>Plain <strong>bold<\/strong><\/p>/);
      expect(before).toMatch(
        /<ul><li><p>first<\/p><\/li><li><p>second<\/p><\/li><\/ul>/
      );
      expect(before).toMatch(
        /<a [^>]*href="https:\/\/example.com\/"[^>]*>Visit site<\/a>/
      );
      expect(before).toMatch(/<table[^>]*>[\s\S]*<th[\s\S]*<\/table>/);
      expect(before.match(/<tr>/g)?.length).toBe(4);
      expect(before).toMatch(
        /<img src="media:[0-9a-f-]{36}" alt="A dot"\s?\/?>/
      );

      // the server's sanitiser keeps all of it: reloading shows the same page
      await page.reload();
      await page.getByRole('textbox', { name: 'Page content' }).waitFor();
      const after: string = await pageHtml(page);
      expect(after.replace(/\s+/g, ' ')).toContain('<h4>A heading</h4>');
      expect(after).toContain('<strong>bold</strong>');
      expect(after).toMatch(
        /<img src="media:[0-9a-f-]{36}" alt="A dot"\s?\/?>/
      );
      expect(after.match(/<tr>/g)?.length).toBe(4);

      // the image is shown while editing (served by the app), not a broken link
      await showView(page, 'Visual');
      const loaded: boolean = await editor(page)
        .locator('img[src^="/api/projects/"]')
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
        );
      expect(loaded).toBe(true);
      expect(problems).toEqual([]);
    } finally {
      await browser.close();
      await app.stop();
    }
  },
  120_000
);

e2eTest(
  'visual editor: a page with markup it cannot keep opens in the HTML view',
  async (): Promise<void> => {
    const app: RunningApp = await startApp({
      IDENTITY_PROVIDER: 'single-user',
      IDENTITY_SINGLE_USER_ACKNOWLEDGED: 'true',
      SINGLE_USER_NAME: 'Visual Author',
    });
    const browser: Browser = await launchBrowser();
    const page: Page = await (await browser.newContext()).newPage();
    try {
      await createCourse(page, app.baseUrl, 'Markup course');
      await showView(page, 'HTML');
      await page
        .getByLabel('Page content (HTML)')
        .fill('<div><p>Boxed</p></div><dl><dt>Term</dt><dd>Meaning</dd></dl>');
      await save(page);
      await page.reload();

      // opened in the HTML view, with the reason
      await page.getByLabel('Page content (HTML)').waitFor();
      await expect(
        await page.getByText('Opened in the HTML view because').textContent()
      ).toContain('<div>');
      expect(
        await page.getByLabel('Page content (HTML)').inputValue()
      ).toContain('<dl>');

      // choosing the visual view first warns, and "keep" leaves the HTML alone
      await page.getByRole('button', { name: 'Visual', exact: true }).click();
      const warning = page
        .getByRole('alert')
        .filter({ hasText: 'cannot keep' });
      expect(await warning.textContent()).toContain('<dd>');
      await page.getByRole('button', { name: 'Keep the HTML view' }).click();
      expect(
        await page.getByLabel('Page content (HTML)').inputValue()
      ).toContain('<dl>');

      // "edit anyway" opens the visual editor, which keeps the text
      await page.getByRole('button', { name: 'Visual', exact: true }).click();
      await page.getByRole('button', { name: 'Edit visually anyway' }).click();
      await page.getByRole('textbox', { name: 'Page content' }).waitFor();
      expect(await editor(page).textContent()).toContain('Boxed');
    } finally {
      await browser.close();
      await app.stop();
    }
  },
  120_000
);

e2eTest(
  'visual editor: the toolbar is one tab stop and works from the keyboard',
  async (): Promise<void> => {
    const app: RunningApp = await startApp({
      IDENTITY_PROVIDER: 'single-user',
      IDENTITY_SINGLE_USER_ACKNOWLEDGED: 'true',
      SINGLE_USER_NAME: 'Keyboard Author',
    });
    const browser: Browser = await launchBrowser();
    const page: Page = await (await browser.newContext()).newPage();
    const focused = (): Promise<string> =>
      page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.id ??
          document.activeElement?.tagName ??
          ''
      );
    const tabStops = (): Promise<number> =>
      page
        .getByRole('toolbar', { name: 'Formatting' })
        .locator('[data-toolbar-item]:not([tabindex="-1"])')
        .count();
    try {
      await createCourse(page, app.baseUrl, 'Keyboard course');
      await page.getByRole('textbox', { name: 'Page content' }).waitFor();
      await editor(page).fill('keys');
      await settle(page);

      // exactly one control in the toolbar can be reached with Tab
      expect(await tabStops()).toBe(1);

      // Shift+Tab from the editor lands on that one control (the style list)
      await page.keyboard.press('Shift+Tab');
      expect(await focused()).toBe('lpm-block-style');

      // arrows move along the toolbar, wrapping at both ends
      await page.keyboard.press('ArrowRight');
      expect(await focused()).toBe('Bold');
      await page.keyboard.press('ArrowRight');
      expect(await focused()).toBe('Italic');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      expect(await focused()).toBe('lpm-block-style');
      await page.keyboard.press('ArrowLeft');
      // Redo is disabled (nothing to redo), so the last control is Undo
      expect(await focused()).toBe('Undo');
      await page.keyboard.press('ArrowRight');
      expect(await focused()).toBe('lpm-block-style');
      await page.keyboard.press('End');
      expect(await focused()).toBe('Undo');
      await page.keyboard.press('Home');
      expect(await focused()).toBe('lpm-block-style');

      // the arrow keys never change the text-style list
      expect(await page.getByLabel('Text style').inputValue()).toBe('p');

      // the control last used stays the tab stop
      await page.keyboard.press('ArrowRight');
      expect(await tabStops()).toBe(1);
      await page.keyboard.press('Tab');
      expect(await focused()).toBe('Page content');
      await page.keyboard.press('Shift+Tab');
      expect(await focused()).toBe('Bold');

      // Space presses a button; focus stays on it so several can be pressed
      await page.keyboard.press('Space');
      expect(
        await page
          .getByRole('button', { name: 'Bold' })
          .getAttribute('aria-pressed')
      ).toBe('true');
      expect(await focused()).toBe('Bold');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      expect(
        await page
          .getByRole('button', { name: 'Italic' })
          .getAttribute('aria-pressed')
      ).toBe('true');

      // Escape returns to the text
      await page.keyboard.press('Escape');
      await settle(page);
      expect(await focused()).toBe('Page content');

      // a control that becomes disabled gives up its tab stop
      await page.getByRole('button', { name: 'Undo' }).waitFor();
      expect(await tabStops()).toBe(1);

      // the link address field takes focus when opened and Escape closes it
      await page.getByRole('button', { name: 'Link' }).click();
      expect(await focused()).toBe('lpm-link-url');
      await page.keyboard.press('Escape');
      expect(await page.getByLabel('Link address').count()).toBe(0);
      await settle(page);
      expect(await focused()).toBe('Page content');
    } finally {
      await browser.close();
      await app.stop();
    }
  },
  120_000
);
