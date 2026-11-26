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
import {
  resolveWarehouseFromLocation,
  WAREHOUSE_LOCATION_RULES,
} from './storageLabel.ts';

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

function normalizeDocToken(raw: string | undefined | null): string {
  return toAsciiDigitsOnly(String(raw || ''))
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Splits a cell that may contain 1 or more invitation numbers stacked on separate lines
 * (or separated by commas / semicolons / pipes / spaced slashes) WITHOUT breaking slashes
 * that are part of a single document number (e.g. "OPI/1404/01").
 */
export function splitOpiDocumentTokens(raw: string | undefined | null): string[] {
  const text = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const out: string[] = [];
  const seen = new Set<string>();

  const pushToken = (candidate: string) => {
    const norm = normalizeDocToken(candidate);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  };

  for (const rawLine of text.split('\n')) {
    const lineTrimmed = rawLine.trim();
    if (!lineTrimmed) continue;
    // Split line by comma / Persian comma / semicolon / pipe
    const chunks = lineTrimmed.split(/[,،;؛|]+/);
    for (const chunk of chunks) {
      const cleanChunk = chunk.trim();
      if (!cleanChunk) continue;
      // Keep the chunk intact (preserves codes like OPI/1404/01)
      pushToken(cleanChunk);
      // Also support explicit spaced-slash separators like "NK-TU-0001 / NK-TU-0002"
      if (/\s+\/\s+/.test(cleanChunk)) {
        for (const sub of cleanChunk.split(/\s+\/\s+/)) {
          pushToken(sub);
        }
      }
    }
  }
  return out;
}

/**
 * Builds the Persian "مکان OPI" location list strictly using the 20-rule Warehouse
 * mapping defined for Storage Labels (MD1EX-FQP02/14-01), never exposing raw storage
 * location codes (e.g. W1-A2, CA-03, CR-1, S-12) from Detailed Equipment.
 */
export function buildOpiLocationOptions(
  detailedItems: readonly Pick<DetailedEntry, 'shipmentNo' | 'storageLocation'>[] = [],
  existingInvitations: readonly Pick<OpiInvitationRecord, 'location'>[] = [],
  selectedPackingNos: readonly string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (label: string | undefined | null) => {
    const clean = String(label || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  };

  const selectedPkSet = new Set(
    selectedPackingNos.map((p) => normalizeDocToken(p)).filter(Boolean),
  );

  // 1) Prioritize Persian Warehouse names mapped from the currently selected packings' Detailed rows
  if (selectedPkSet.size > 0) {
    for (const d of detailedItems) {
      if (!selectedPkSet.has(normalizeDocToken(d.shipmentNo))) continue;
      const whFa = resolveWarehouseFromLocation(d.storageLocation);
      if (whFa) add(whFa);
    }
  }

  // 2) Then Persian Warehouse names mapped from all other Detailed Equipment storage locations
  for (const d of detailedItems) {
    const whFa = resolveWarehouseFromLocation(d.storageLocation);
    if (whFa) add(whFa);
  }

  // 3) Then all 20 canonical Persian Warehouse names from Storage Label rules
  for (const rule of WAREHOUSE_LOCATION_RULES) {
    add(rule.warehouseFa);
  }

  // 4) Include previously entered custom Persian locations (mapping any legacy raw codes to Persian too)
  for (const inv of existingInvitations) {
    const rawLoc = String(inv.location || '').trim();
    if (!rawLoc) continue;
    const mapped = resolveWarehouseFromLocation(rawLoc);
    if (mapped) {
      add(mapped);
    } else if (/[\u0600-\u06FF]/.test(rawLoc)) {
      add(rawLoc);
    }
  }

  return out;
}

/**
 * تبصره (Note) — Open OPI Invitations computation for Dashboard:
 * If a packing list in General Equipment has an OPI Invitation No. issued,
 * and NOT ALL Detailed Equipment rows for that packing list have an OPI Invitation No.
 * (including when zero Detailed rows exist yet, or when zero Detailed rows match that
 * invitation number), then the invitation is OPEN and listed under "دعوتنامه‌های باز".
 *
 * Correctly supports multiline / stacked invitation numbers in Detailed's `opiNo`
 * column (e.g. "NK-TU-0001\nNK-TU-0002"), slash-containing numbers ("OPI/1404/01"),
 * Persian/Arabic digits, and multi-invitation split packings without false positives.
 */
export function computeOpenOpiInvitations(
  generalEntries: readonly Pick<GeneralEntry, 'packingListNo' | 'opiInvitationNo' | 'opiInvitationDate'>[],
  detailedItems: readonly Pick<DetailedEntry, 'shipmentNo' | 'opiNo'>[],
  opiInvitations: readonly Pick<OpiInvitationRecord, 'invitationNo' | 'date' | 'packingNos'>[] = [],
): OpenOpiInvitationItem[] {
  // Index detailed rows by normalized packingListNo / shipmentNo
  const detailedByPacking = new Map<string, Array<{ opiTokens: Set<string> }>>();
  for (const d of detailedItems) {
    const pk = normalizeDocToken(d.shipmentNo);
    if (!pk) continue;
    let bucket = detailedByPacking.get(pk);
    if (!bucket) {
      bucket = [];
      detailedByPacking.set(pk, bucket);
    }
    bucket.push({ opiTokens: new Set(splitOpiDocumentTokens(d.opiNo)) });
  }

  // Build map of invitationNoKey -> { invitationNo, date, packings (norm -> display) }
  const invMap = new Map<
    string,
    {
      invitationNo: string;
      date: string;
      packings: Map<string, string>;
    }
  >();

  // Helper to register an invitation + packing pair (supports multiline values in General too)
  const register = (invNoRaw: string | undefined, dateRaw: string | undefined, pkRaw: string | undefined) => {
    const pk = String(pkRaw || '').trim();
    const pkKey = normalizeDocToken(pk);
    if (!pkKey) return;

    const rawInvLines = String(invNoRaw || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (rawInvLines.length === 0) return;

    const rawDateLines = String(dateRaw || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    rawInvLines.forEach((lineInv, idx) => {
      // Split inline comma/semicolon/spaced-slash lists if present
      const parts = /\s+\/\s+|[,،;؛|]/.test(lineInv)
        ? lineInv.split(/\s+\/\s+|[,،;؛|]+/).map((s) => s.trim()).filter(Boolean)
        : [lineInv];
      const lineDate = rawDateLines[idx] || rawDateLines[0] || '';
      for (const invNo of parts) {
        const invKey = normalizeDocToken(invNo);
        if (!invKey) continue;
        let entry = invMap.get(invKey);
        if (!entry) {
          entry = {
            invitationNo: invNo,
            date: lineDate,
            packings: new Map<string, string>(),
          };
          invMap.set(invKey, entry);
        } else if (!entry.date && lineDate) {
          entry.date = lineDate;
        }
        if (!entry.packings.has(pkKey)) {
          entry.packings.set(pkKey, pk);
        }
      }
    });
  };

  // Source 1: General Equipment rows that have opiInvitationNo
  for (const g of generalEntries) {
    register(g.opiInvitationNo, g.opiInvitationDate, g.packingListNo);
  }

  // Fill missing dates from opiInvitations records when available
  for (const inv of opiInvitations) {
    const key = normalizeDocToken(inv.invitationNo);
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
      let exactMatched = 0;
      let rowsWithAnyOpi = 0;
      for (const row of detRows) {
        if (row.opiTokens.size > 0) {
          rowsWithAnyOpi += 1;
        }
        if (row.opiTokens.has(invKey)) {
          exactMatched += 1;
        }
      }
      // A packing is closed for this invitation when:
      //  - at least one Detailed row explicitly carries this invitationNo (including inside stacked multiline values), AND
      //  - EVERY Detailed row in the packing already has at least one invitationNo assigned (no blank rows remaining).
      const isClosedForPacking = exactMatched > 0 && rowsWithAnyOpi === detRows.length;
      linkedDetailedRows += isClosedForPacking ? detRows.length : exactMatched;
      if (!isClosedForPacking) {
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
