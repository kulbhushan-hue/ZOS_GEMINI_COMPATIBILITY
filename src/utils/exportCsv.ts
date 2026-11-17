import type { CompatibilityRecord, PtfEntry } from '../types/compatibility';

function escapeCsvField(value: string | number | undefined): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function exportMatrixCsv(records: CompatibilityRecord[], filename = 'zos-compatibility-matrix.csv'): void {
  const headers = [
    'Record #',
    'Vendor',
    'Product',
    'Version',
    'z/OS 3.2 Status',
    'z/OS 3.1 Status',
    'z/OS 2.5 Status',
    'z/OS 2.3 Status',
    'PTFs Required',
    'PTF Details',
    'FMIDs',
    'FIXCAT / Message ID',
    'Report Link',
    'Comments',
  ];

  const rows = records.map((r) => [
    r.recordNumber,
    r.normalizedVendor,
    r.product,
    r.version,
    r.matrix.V3R2.statusText,
    r.matrix.V3R1.statusText,
    r.matrix.V2R5.statusText,
    r.matrix.V2R3.statusText,
    r.ptfs.map((p) => `${p.id} (${p.statusLabel})`).join('; '),
    r.ptfRequiredRaw,
    r.fmids.join('; '),
    r.messageId,
    r.reportUrl || r.portalFallbackUrl,
    r.comments,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\r\n');

  triggerCsvDownload(filename, csv);
}

export function exportPtfsCsv(ptfs: PtfEntry[], filename = 'zos-ptf-register.csv'): void {
  const headers = [
    'PTF ID',
    'Status',
    'Vendor',
    'Product',
    'Version',
    'Target z/OS / Subsystem',
    'FMID',
    'FIXCAT / Message ID',
    'Workbook Record #',
    'Context Note',
    'Verification URL',
  ];

  const rows = ptfs.map((p) => [
    p.id,
    p.statusLabel,
    p.vendor,
    p.product,
    p.version,
    p.targetZos,
    p.fmid || '',
    p.fixcat || '',
    p.recordNumber,
    p.contextNote,
    p.reportUrl || '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\r\n');

  triggerCsvDownload(filename, csv);
}
