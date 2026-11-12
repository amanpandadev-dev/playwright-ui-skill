import type { Page } from '@playwright/test';

// Replace this minimal class with source-grounded page objects; do not invent selectors.
export class AppPage {
  constructor(readonly page: Page) {}

  async open(pathname = '/'): Promise<void> {
    await this.page.goto(pathname);
  }
}
