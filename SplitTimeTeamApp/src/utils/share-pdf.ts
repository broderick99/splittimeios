import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatExportDate, buildDetailedSplitSections } from '@/utils/export-csv';
import type { Split } from '@/types';

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase() || 'export';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDetailedSplitPdfHtml(options: {
  workoutDate: number;
  workoutName: string;
  splits: Split[];
  getAthleteName: (athleteId: string) => string;
  getGroupName?: (athleteId: string) => string;
}): string {
  const sections = buildDetailedSplitSections({
    splits: options.splits,
    getAthleteName: options.getAthleteName,
    getGroupName: options.getGroupName,
  });

  const sectionHtml = sections
    .map((section) => {
      const rowsHtml = section.rows
        .map((row) => {
          const rowClass = row.isFinal
            ? 'final-row'
            : row.stepType === 'recovery'
              ? 'recovery-row'
              : '';
          return `
            <tr class="${rowClass}">
              <td>${escapeHtml(row.step)}</td>
              <td>${escapeHtml(row.split)}</td>
              <td>${escapeHtml(row.lap)}</td>
              <td>${escapeHtml(row.pace)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <section class="athlete-section">
          <div class="athlete-header">
            <div class="athlete-name">${escapeHtml(section.athleteName)}</div>
            ${section.groupName ? `<div class="group-name">${escapeHtml(section.groupName)}</div>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th>Split</th>
                <th>Lap</th>
                <th>Pace</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </section>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 32px;
            color: #111827;
            background: #ffffff;
          }
          .page-title {
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 4px;
          }
          .page-date {
            font-size: 12px;
            color: #6b7280;
            margin: 0 0 24px;
          }
          .athlete-section {
            margin-bottom: 28px;
            page-break-inside: avoid;
          }
          .athlete-header {
            margin-bottom: 8px;
          }
          .athlete-name {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
          }
          .group-name {
            font-size: 11px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          th {
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #6b7280;
            padding: 8px 10px;
            border-bottom: 1px solid #e5e7eb;
          }
          td {
            font-size: 14px;
            padding: 9px 10px;
            border-bottom: 1px solid #eef2f7;
            vertical-align: top;
          }
          th:nth-child(1), td:nth-child(1) {
            width: 40%;
          }
          th:nth-child(2), td:nth-child(2),
          th:nth-child(3), td:nth-child(3),
          th:nth-child(4), td:nth-child(4) {
            width: 20%;
          }
          .recovery-row td:first-child {
            color: #f59e0b;
            font-style: italic;
          }
          .final-row {
            background: #eef2ff;
          }
          .final-row td {
            color: #2563eb;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <h1 class="page-title">${escapeHtml(options.workoutName)}</h1>
        <p class="page-date">${escapeHtml(formatExportDate(options.workoutDate))}</p>
        ${sectionHtml}
      </body>
    </html>
  `;
}

export async function shareDetailedSplitPdf(options: {
  workoutDate: number;
  workoutName: string;
  splits: Split[];
  getAthleteName: (athleteId: string) => string;
  getGroupName?: (athleteId: string) => string;
  fileNameBase: string;
  dialogTitle: string;
}): Promise<void> {
  const html = buildDetailedSplitPdfHtml(options);
  const printed = await Print.printToFileAsync({ html });
  const file = new File(printed.uri);
  const renamed = new File(Paths.cache, `${sanitizeFileName(options.fileNameBase)}.pdf`);

  if (renamed.exists) {
    renamed.delete();
  }

  file.move(renamed);

  await Sharing.shareAsync(renamed.uri, {
    dialogTitle: options.dialogTitle,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
}
