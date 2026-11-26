import type {
  DetailedEntry,
  GeneralEntry,
  OpiInvitationLineItem,
  OpiInvitationRecord,
  ProjectInfo,
} from './types.ts';
import type { PlantDocNumberConfig } from './docNumbering.ts';
import { validatePlantAbbreviation } from './docNumbering.ts';
import { resolveSupplierPrefix } from './substitution.ts';

function toAsciiDigitsOnly(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

function preserveMultilineText(raw: string | undefined | null): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

export const MD1_OPI_INVITATION_FORM_CODE = 'MD1EX-FQP02/02-03';

export interface OpiInvitationHeaderAutoFill {
  headerProjectTitle: string; // Rule 1-1: e.g. "پروژه نکا"
  projectBareName: string; // Rule 1-5: without "پروژه" word, e.g. "نکا"
  contractNo: string; // Rule 1-3: contractRef or blank
  system: string; // Rule 1-6
  island: string; // Rule 1-7
  unit: string; // Rule 1-8
  supplier: string; // Rule 1-9 / 1-10
  supplierForDocNo: string;
  purchasePackageNo: string; // Rule 1-11
}

export interface OpenOpiInvitationItem {
  invitationNo: string;
  date: string;
  packingNos: string[];
  missingDetailedPackings: string[];
  totalDetailedRows: number;
  linkedDetailedRows: number;
}

function uniqueNonEmpty(values: Array<string | undefined | null>, sep = ' ، '): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const clean = String(raw || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out.join(sep);
}

/**
 * Rule 1-5: Strips leading "پروژه" / "Project" prefix from project name so
 * the "پروژه:" box displays only the project name (e.g. "پروژه نکا" -> "نکا").
 */
export function stripProjectWord(projectName: string | undefined | null): string {
  const raw = String(projectName || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^(?:پروژه(?:‌|\s)*|project\s+)/i, '')
    .trim();
}

/**
 * Rule 1-1: Formats top header title ("پروژه ...") avoiding double "پروژه پروژه".
 */
export function formatHeaderProjectTitle(projectName: string | undefined | null): string {
  const bare = stripProjectWord(projectName);
  if (!bare) return 'پروژه ..................';
  return `پروژه ${bare}`;
}

/**
 * Rule 1-4: Generates official MD1 OPI Invitation document number:
 *   `<PLANT_ABBR>-<SUPPLIER_PREFIX>-####` (e.g. `NK-TU-0001`)
 * Uses exact supplier prefix rules:
 *   - TUGA / توگا -> TU
 *   - MECO / مکو -> ME
 *   - PARS / پارس -> PS
 *   - Other suppliers -> deterministic 2-letter abbreviation
 * Falls back cleanly to `<SUPPLIER_PREFIX>-####` when no plant abbreviation is configured.
 */
export function generateOpiInvitationNo(
  supplierName: string | undefined | null,
  existingDocNos: readonly string[],
  plantConfig?: PlantDocNumberConfig | null,
  padWidth = 4,
): string {
  const supplierPrefix = resolveSupplierPrefix(supplierName);
  const abbrCheck = validatePlantAbbreviation(plantConfig?.plantAbbreviation);
  const plantAbbr = abbrCheck.valid && abbrCheck.normalized ? abbrCheck.normalized : '';

  const prefix = plantAbbr ? `${plantAbbr}-${supplierPrefix}` : supplierPrefix;
  const escapedSupplier = supplierPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seqMatcher = new RegExp(
    `^(?:[A-Z]{2,3}-)?${escapedSupplier}-(\\d+)$`,
    'i',
  );

  const used = new Set<string>();
  let maxSeq = 0;

  for (const rawNo of existingDocNos) {
    const clean = toAsciiDigitsOnly(String(rawNo || '')).trim().toUpperCase();
    if (!clean) continue;
    used.add(clean);
    const m = clean.match(seqMatcher);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }

  let next = maxSeq + 1;
  let candidate = `${prefix}-${String(next).padStart(padWidth, '0')}`;
  while (used.has(candidate.toUpperCase())) {
    next += 1;
    candidate = `${prefix}-${String(next).padStart(padWidth, '0')}`;
  }
  return candidate;
}

/**
 * Rules 1-1 through 1-11: Automatically fills OPI Invitation header fields
 * from selected General Equipment rows and the active Project configuration.
 */
export function buildOpiInvitationHeaderAutoFill(
  selectedRows: readonly GeneralEntry[],
  activeProject?: Pick<
    ProjectInfo,
    'name' | 'contractRef' | 'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): OpiInvitationHeaderAutoFill {
  const projectNameRaw = (activeProject?.name || '').trim();
  const projectBareName = stripProjectWord(projectNameRaw);
  const headerProjectTitle = formatHeaderProjectTitle(projectNameRaw);
  // Rule 1-3: strictly use contractRef; leave blank if absent
  const contractNo = (activeProject?.contractRef || '').trim();

  const system = uniqueNonEmpty(selectedRows.map((r) => r.system));
  const island = uniqueNonEmpty(selectedRows.map((r) => r.island));
  const unit = uniqueNonEmpty(selectedRows.map((r) => r.unit));
  const supplier = uniqueNonEmpty(selectedRows.map((r) => r.supplier));
  const supplierForDocNo =
    selectedRows.map((r) => (r.supplier || '').trim()).find(Boolean) || '';
  const purchasePackageNo = uniqueNonEmpty(selectedRows.map((r) => r.purchasePackageNo));

  return {
    headerProjectTitle,
    projectBareName,
    contractNo,
    system,
    island,
    unit,
    supplier,
    supplierForDocNo,
    purchasePackageNo,
  };
}

/**
 * Rules 1-12 through 1-17: Maps selected General Equipment rows and optional per-row remarks
 * into official OPI Invitation table line items.
 * - Item No.: 1..N sequential
 * - Packing List No.: packingListNo
 * - Package No.: packageNo
 * - شرح کالا: itemDescription
 * - واحد (UOM): packageType ("نوع بسته‌بندی")
 * - توضیحات: optional per-row user remarks
 */
export function buildOpiInvitationLineItems(
  selectedRows: readonly GeneralEntry[],
  remarksByGeneralId: Readonly<Record<string, string>> = {},
): OpiInvitationLineItem[] {
  return selectedRows.map((row, idx) => ({
    itemNo: String(idx + 1),
    packingListNo: (row.packingListNo || '').trim(),
    packageNo: (row.packageNo || '').trim(),
    description: preserveMultilineText(row.itemDescription),
    uom: (row.packageType || '').trim(),
    remarks: preserveMultilineText(remarksByGeneralId[row.id] || ''),
  }));
}

/**
 * Filters General Equipment rows to entries that do NOT yet have an OPI Invitation No.
 * (unless explicitly included when editing an existing OPI Invitation).
 */
export function filterEligibleGeneralForOpi(
  generalEntries: readonly GeneralEntry[],
  editingInvitationNo?: string | null,
): GeneralEntry[] {
  const editNoNorm = (editingInvitationNo || '').trim().toUpperCase();
  return generalEntries.filter((g) => {
    const inv = (g.opiInvitationNo || '').trim();
    if (!inv) return true;
    if (editNoNorm && inv.toUpperCase() === editNoNorm) return true;
    return false;
  });
}

function splitDocumentTokens(raw: string | undefined | null): string[] {
  return String(raw || '')
    .split(/[\n\r,،;؛/]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * تبصره (Note) — Open OPI Invitations computation for Dashboard:
 * If a packing list in General Equipment has an OPI Invitation No. issued,
 * and NOT ALL Detailed Equipment rows for that packing list contain that exact
 * OPI Invitation No. in their `opiNo` ("شماره دعوتنامه") column (including when
 * zero Detailed rows exist yet for that packing list), then the invitation is OPEN
 * and must be listed under "دعوتنامه‌های باز" with its invitation number & date.
 */
export function computeOpenOpiInvitations(
  generalEntries: readonly Pick<GeneralEntry, 'packingListNo' | 'opiInvitationNo' | 'opiInvitationDate'>[],
  detailedItems: readonly Pick<DetailedEntry, 'shipmentNo' | 'opiNo'>[],
  opiInvitations: readonly Pick<OpiInvitationRecord, 'invitationNo' | 'date' | 'packingNos'>[] = [],
): OpenOpiInvitationItem[] {
  // Index detailed rows by normalized packingListNo / shipmentNo
  const detailedByPacking = new Map<string, Array<{ opiTokens: Set<string> }>>();
  for (const d of detailedItems) {
    const pk = (d.shipmentNo || '').trim().toUpperCase();
    if (!pk) continue;
    let bucket = detailedByPacking.get(pk);
    if (!bucket) {
      bucket = [];
      detailedByPacking.set(pk, bucket);
    }
    bucket.push({ opiTokens: new Set(splitDocumentTokens(d.opiNo)) });
  }

  // Build map of invitationNoKey -> { invitationNo, date, packingNosMap (upper -> display) }
  const invMap = new Map<
    string,
    {
      invitationNo: string;
      date: string;
      packings: Map<string, string>;
    }
  >();

  // Helper to register an invitation + packing pair
  const register = (invNoRaw: string | undefined, dateRaw: string | undefined, pkRaw: string | undefined) => {
    const invNo = (invNoRaw || '').trim();
    const pk = (pkRaw || '').trim();
    if (!invNo || !pk) return;
    const invKey = invNo.toUpperCase();
    const pkKey = pk.toUpperCase();
    let entry = invMap.get(invKey);
    if (!entry) {
      entry = {
        invitationNo: invNo,
        date: (dateRaw || '').trim(),
        packings: new Map<string, string>(),
      };
      invMap.set(invKey, entry);
    } else if (!entry.date && (dateRaw || '').trim()) {
      entry.date = (dateRaw || '').trim();
    }
    if (!entry.packings.has(pkKey)) {
      entry.packings.set(pkKey, pk);
    }
  };

  // Source 1: General Equipment rows that have opiInvitationNo
  for (const g of generalEntries) {
    register(g.opiInvitationNo, g.opiInvitationDate, g.packingListNo);
  }

  // Fill missing dates from opiInvitations records when available (do not invent entries absent from general)
  for (const inv of opiInvitations) {
    const key = (inv.invitationNo || '').trim().toUpperCase();
    if (!key) continue;
    const existing = invMap.get(key);
    if (existing && !existing.date && inv.date) {
      existing.date = inv.date.trim();
    }
  }

  const openList: OpenOpiInvitationItem[] = [];

  for (const [invKey, entry] of invMap.entries()) {
    const missingDetailedPackings: string[] = [];
    let totalDetailedRows = 0;
    let linkedDetailedRows = 0;

    for (const [pkKey, pkDisplay] of entry.packings.entries()) {
      const detRows = detailedByPacking.get(pkKey) || [];
      if (detRows.length === 0) {
        // Packing has OPI invitation in General, but zero Detailed rows exist yet -> OPEN
        missingDetailedPackings.push(pkDisplay);
        continue;
      }
      totalDetailedRows += detRows.length;
      let matchedInPacking = 0;
      for (const row of detRows) {
        if (row.opiTokens.has(invKey)) {
          matchedInPacking += 1;
        }
      }
      linkedDetailedRows += matchedInPacking;
      if (matchedInPacking < detRows.length) {
        // Not all Detailed rows for this packing have this invitationNo in opiNo -> OPEN
        missingDetailedPackings.push(pkDisplay);
      }
    }

    if (missingDetailedPackings.length > 0) {
      openList.push({
        invitationNo: entry.invitationNo,
        date: entry.date,
        packingNos: Array.from(entry.packings.values()),
        missingDetailedPackings,
        totalDetailedRows,
        linkedDetailedRows,
      });
    }
  }

  // Sort newest date first, then invitationNo descending
  openList.sort((a, b) => {
    const cmpDate = (b.date || '').localeCompare(a.date || '');
    if (cmpDate !== 0) return cmpDate;
    return b.invitationNo.localeCompare(a.invitationNo, 'en');
  });

  return openList;
}
