import type { Browser } from 'puppeteer';

export interface PdfRenderer {
  render(html: string, footerText: string): Promise<Buffer>;
  close(): Promise<void>;
}

/** Renders printable HTML to PDF with page numbers. One browser is reused across jobs. */
export class PuppeteerPdfRenderer implements PdfRenderer {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly executablePath?: string) {}

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const puppeteer = await import('puppeteer');
      this.browser = puppeteer.default.launch({
        headless: true,
        executablePath: this.executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
      });
      this.browser.catch(() => {
        this.browser = null;
      });
    }
    return this.browser;
  }

  async render(html: string, footerText: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setJavaScriptEnabled(false);
      await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
      const safeFooter = footerText.replace(/[<>&]/g, '');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;color:#5f6b7a;display:flex;justify-content:space-between"><span>${safeFooter}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
        margin: { top: '18mm', bottom: '20mm', left: '14mm', right: '14mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      const browser = await this.browser.catch(() => null);
      await browser?.close();
      this.browser = null;
    }
  }
}
