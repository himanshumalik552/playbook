import { fromDbDate, type PrismaClient } from '@adpulse/database';
import type { Logger } from '../logger';
import { redactSecrets } from '../logger';
import type { StorageProvider } from '../storage/storage';
import { renderReportExcel } from './excel-renderer';
import { renderReportHtml } from './html-template';
import type { PdfRenderer } from './pdf-renderer';
import { ReportDataService } from './report-data';

export const REPORT_CONTENT_TYPES = {
  PDF: 'application/pdf',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export const REPORT_EXTENSIONS = { PDF: 'pdf', EXCEL: 'xlsx' } as const;

export class ReportGenerationService {
  private readonly data: ReportDataService;

  constructor(
    private readonly db: PrismaClient,
    private readonly storage: StorageProvider,
    private readonly pdf: PdfRenderer,
    private readonly logger: Logger,
  ) {
    this.data = new ReportDataService(db);
  }

  async run(
    reportId: string,
    options: { isFinalAttempt: boolean },
  ): Promise<{ storageKey: string; size: number }> {
    const report = await this.db.generatedReport.findUniqueOrThrow({ where: { id: reportId } });
    if (report.status === 'COMPLETED' && report.storageKey) {
      return { storageKey: report.storageKey, size: report.fileSize ?? 0 };
    }
    await this.db.generatedReport.update({
      where: { id: report.id },
      data: { status: 'PROCESSING', startedAt: new Date(), error: null },
    });

    try {
      const filters = report.filters as { adAccountId?: string | null; campaignIds?: string[] };
      const data = await this.data.build({
        organizationId: report.organizationId,
        title: report.title,
        frequency: report.frequency,
        period: { from: fromDbDate(report.periodStart), to: fromDbDate(report.periodEnd) },
        adAccountId: filters.adAccountId ?? null,
        campaignIds: filters.campaignIds ?? [],
        commentary: report.commentary,
      });
      const body =
        report.format === 'PDF'
          ? await this.pdf.render(renderReportHtml(data), `${data.organizationName} · ${data.title}`)
          : await renderReportExcel(data);
      const key = `reports/${report.organizationId}/${report.id}.${REPORT_EXTENSIONS[report.format]}`;
      await this.storage.put(key, body, REPORT_CONTENT_TYPES[report.format]);
      await this.db.generatedReport.update({
        where: { id: report.id },
        data: { status: 'COMPLETED', storageKey: key, fileSize: body.length, completedAt: new Date() },
      });
      this.logger.info({ reportId, format: report.format, size: body.length }, 'Report generated');
      return { storageKey: key, size: body.length };
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await this.db.generatedReport.update({
        where: { id: report.id },
        data: options.isFinalAttempt
          ? { status: 'FAILED', error: message }
          : { status: 'QUEUED', error: message },
      });
      throw error;
    }
  }
}
