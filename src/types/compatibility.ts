export type CompatibilityStatus =
  | 'compatible'
  | 'compatible_ptf'
  | 'incompatible'
  | 'upgrade_available'
  | 'no_info'
  | 'unassessed';

export type PtfInstallStatus =
  | 'applied'
  | 'not_applied'
  | 'available'
  | 'superseded'
  | 'not_available'
  | 'required';

export type ZosVersionKey = 'V2R3' | 'V2R4' | 'V2R5' | 'V3R1' | 'V3R2';

export interface PtfEntry {
  id: string;
  vendor: string;
  product: string;
  version: string;
  recordNumber: number;
  targetZos: string;
  status: PtfInstallStatus;
  statusLabel: string;
  fmid?: string;
  fixcat?: string;
  contextNote: string;
  reportUrl?: string;
}

export interface ZosMatrixCell {
  zosVersion: ZosVersionKey;
  label: string;
  status: CompatibilityStatus;
  statusText: string;
  ptfs: string[];
  verifiedInWorkbook: boolean;
  note?: string;
}

export interface CompatibilityRecord {
  id: string;
  recordNumber: number;
  vendor: string;
  normalizedVendor: string;
  product: string;
  version: string;
  rawCompatibility: string;
  status: CompatibilityStatus;
  statusLabel: string;
  ptfRequiredRaw: string;
  ptfs: PtfEntry[];
  fmids: string[];
  reportUrl: string;
  portalFallbackUrl: string;
  messageId: string;
  availableWithoutLogin: string;
  mfaRequired: string;
  comments: string;
  upgradeRecommendation?: string;
  matrix: Record<ZosVersionKey, ZosMatrixCell>;
  inSheet2Inventory: boolean;
}

export interface VendorPortal {
  vendor: string;
  normalizedVendor: string;
  reportUrl: string;
  availableWithoutLogin: string;
  mfaRequired: string;
  notes: string;
  productCount: number;
  compatibleCount: number;
  ptfCount: number;
}

export interface CatalogSummary {
  totalRecords: number;
  totalSheet2Inventory: number;
  totalUniqueVendors: number;
  totalUniquePtfs: number;
  compatibleCount: number;
  ptfRequiredCount: number;
  incompatibleCount: number;
  noInfoCount: number;
  unassessedCount: number;
  vendors: string[];
  zosVersions: Array<{ key: ZosVersionKey; label: string; shortLabel: string }>;
}

export interface BotStructuredResponse {
  answerMarkdown: string;
  matchedRecords: CompatibilityRecord[];
  matchedPtfs: PtfEntry[];
  recommendedAction: string;
  queryMeta: {
    vendor: string;
    product: string;
    zosVersion: ZosVersionKey;
    question: string;
  };
}
