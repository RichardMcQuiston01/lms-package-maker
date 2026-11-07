import { expect } from 'bun:test';
import type { Page } from 'playwright-core';

/** Opens the course editor on a new course with the given title. */
export async function createCourse(
  page: Page,
  baseUrl: string,
  title: string
): Promise<void> {
  await page.goto(`${baseUrl}/`);
  await page.getByPlaceholder('New course title').fill(title);
  await page.getByRole('button', { name: 'Create course' }).click();
  await page.waitForURL(/\/projects\//);
}

export async function save(page: Page): Promise<void> {
  await page.keyboard.press('Control+s');
  await page.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
}

/** Types into the visual editor, saves, and checks the live preview shows it. */
export async function editAndPreview(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Page content' }).fill(text);
  await save(page);
  const frame = page.frameLocator('iframe[title="Course preview"]');
  await frame.locator('[data-action="next"]').waitFor();
  expect(
    await frame.locator('.lpm-page:not([hidden])').textContent()
  ).toContain(text);
}

/** Clicks an export button and returns the downloaded file's name and bytes. */
export async function exportPackage(
  page: Page,
  buttonName: string
): Promise<{ readonly fileName: string; readonly bytes: Uint8Array }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName }).click(),
  ]);
  const location: string | null = await download.path();
  expect(location).not.toBeNull();
  const bytes = new Uint8Array(
    await Bun.file(location as string).arrayBuffer()
  );
  return { fileName: download.suggestedFilename(), bytes };
}

/** Switches the page between the visual and the HTML view. */
export async function showView(
  page: Page,
  view: 'Visual' | 'HTML'
): Promise<void> {
  await page.getByRole('button', { name: view, exact: true }).click();
}

/** The page's HTML as the HTML view shows it (leaves the HTML view open). */
export async function pageHtml(page: Page): Promise<string> {
  await showView(page, 'HTML');
  return page.getByLabel('Page content (HTML)').inputValue();
}
