import type {
  BmrLineItem,
  DetailedComputed,
  DetailedEntry,
  GeneralEntry,
  MaterialEstimateRecord,
  ProjectInfo,
} from './types.ts';
import { roundQty, toNum } from './formulas.ts';
import { getTodayIso } from './jalali.ts';
import { resolveContractorAbbreviation } from './miv.ts';
import { formatHeaderProjectTitle } from './opiInvitation.ts';

export const MD1_BMR_FORM_CODE = 'MD1EX-FQP02/09-03';
export const MD1_BMR_COMPANY_NAME = 'شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)';
export const MD1_BMR_TITLE_FA = 'گزارش موازنه و کنترل مصرف مواد';
export const MD1_BMR_TITLE_EN = 'Balance of Material Report';
export const MD1_BMR_QA_NOTICE =
  'توجه: این فرم تحت کنترل واحد QA می‌باشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA می‌باشد.';
export const MD1_BMR_COPY_TEXT = 'رونوشت: معاونت تأمین، پیمانکار نصب، دفتر فنی';

export const BMR_STATUS_SETTLED_FA = 'اتمام';
export const BMR_STATUS_DEBTOR_FA = 'بدهکار';

export interface BmrHeaderAutoFill {
  headerProjectTitle: string; // Rule 1-4 (header): e.g. "پروژه نکا"
  projectName: string; // Rule 1-4 (metadata box)
  system: string; // Rule 1-1
  island: string; // Rule 1-2
  unit: string; // Metadata cell "واحد"
  installerContractor: string; // Rule 1-5 ("پیمانکار نصب" from Detailed receiver/mivReceiver)
  supplier: string; // Rule 1-6 ("تامین کننده" from Detailed supplier, fallback General)
  date: string; // Rule 1-7 (today)
}

export interface BmrEstimateLookup {
  mtoQty: number | null;
  matchedBy: 'itemCode' | 'mtoCode' | 'none';
}

export interface BmrRowComputation {
  receivedQty: number; // Rule 1-14: packingQty
  deliveredQty: number; // Rule 1-15: actualQty (fallback effectiveActualQty / packingQty)
  returnedQty: number; // Rule 1-16: smrMapnaQty (returned to employer warehouse)
  mtoQty: number | null; // Rule 1-17
  erectedQty: number | null; // Rule 1-18
  balance: number; // Rule 1-19
  statusFa: 'اتمام' | 'بدهکار';
  statusEn: 'Completed' | 'Debtor';
  formulaSource: 'erected' | 'mto' | 'net_delivered';
}

function normToken(raw: string | undefined | null): string {
  return String(raw || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u00a0]/g, ' ')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function uniqueJoined(values: Array<string | undefined | null>, sep = '، '): string {
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
 * Rule 1-6 (and sub-rules 1-6-1 through 1-6-16):
 * Generates unique BMR document number in exact format `<PLANT>-<CONTRACTOR>-BMR-####`
 * (or `<CONTRACTOR>-BMR-####` when plantAbbreviation is not configured),
 * incrementing strictly from the highest existing BMR sequence number for the same prefix (starting at 0001).
 */
export function generateBmrDocNo(
  contractorName: string | undefined | null,
  existingBmrNos: readonly string[],
  activeProject?: Pick<
    ProjectInfo,
    'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): string {
  const plantAbbr = String(activeProject?.plantAbbreviation || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  const contractorAbbr = resolveContractorAbbreviation(contractorName);
  const prefix = plantAbbr ? `${plantAbbr}-${contractorAbbr}-BMR` : `${contractorAbbr}-BMR`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}-(\\d+)$`, 'i');

  let maxNum = 0;
  for (const raw of existingBmrNos) {
    const clean = String(raw || '').trim();
    const m = clean.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

/**
 * Rules 1-1 through 1-7: Auto-fills BMR header metadata from selected Detailed rows,
 * optional General Equipment entries (for supplier fallback), and active project.
 */
export function buildBmrHeaderAutoFill(
  selectedRows: ReadonlyArray<
    Pick<
      DetailedEntry,
      'shipmentNo' | 'packageNo' | 'system' | 'island' | 'unit' | 'receiver' | 'mivReceiver' | 'supplier'
    >
  >,
  generalEntries: ReadonlyArray<Pick<GeneralEntry, 'packingListNo' | 'packageNo' | 'supplier'>>,
  activeProject?: Pick<ProjectInfo, 'name'> | null,
  todayIso?: string,
): BmrHeaderAutoFill {
  const generalSupplierByPk = new Map<string, string>();
  for (const g of generalEntries) {
    const pkKey = normToken(g.packingListNo);
    const sup = String(g.supplier || '').trim();
    if (pkKey && sup && !generalSupplierByPk.has(pkKey)) {
      generalSupplierByPk.set(pkKey, sup);
    }
  }

  const systems: string[] = [];
  const islands: string[] = [];
  const units: string[] = [];
  const installers: string[] = [];
  const suppliers: string[] = [];

  for (const row of selectedRows) {
    if (row.system?.trim()) systems.push(row.system.trim());
    if (row.island?.trim()) islands.push(row.island.trim());
    if (row.unit?.trim()) units.push(row.unit.trim());
    const rec = String(row.receiver || row.mivReceiver || '').trim();
    if (rec) installers.push(rec);

    const rowSup = String(row.supplier || '').trim();
    if (rowSup) {
      suppliers.push(rowSup);
    } else {
      const fallbackSup = generalSupplierByPk.get(normToken(row.shipmentNo));
      if (fallbackSup) suppliers.push(fallbackSup);
    }
  }

  const rawProjName = String(activeProject?.name || '').trim();
  return {
    headerProjectTitle: formatHeaderProjectTitle(rawProjName),
    projectName: rawProjName,
    system: uniqueJoined(systems),
    island: uniqueJoined(islands),
    unit: uniqueJoined(units),
    installerContractor: uniqueJoined(installers),
    supplier: uniqueJoined(suppliers),
    date: todayIso || getTodayIso(),
  };
}

/**
 * Rules 1-17 & 1-18: Looks up a Detailed item's `itemCode` ("کد کالا") or `mtoRef`
 * in the Material Estimation table ("برآورد تجهیزات") and aggregates `estimatedQty`.
 */
export function lookupBmrEstimateQty(
  row: Pick<DetailedEntry, 'itemCode' | 'mtoRef'>,
  estimates: ReadonlyArray<Pick<MaterialEstimateRecord, 'itemCode' | 'mtoCode' | 'estimatedQty'>>,
): BmrEstimateLookup {
  const codeKey = normToken(row.itemCode);
  const mtoKey = normToken(row.mtoRef);

  if (codeKey) {
    let sum = 0;
    let found = false;
    for (const est of estimates) {
      if (normToken(est.itemCode) === codeKey) {
        sum = roundQty(sum + toNum(est.estimatedQty));
        found = true;
      }
    }
    if (found) return { mtoQty: sum, matchedBy: 'itemCode' };
  }

  if (mtoKey) {
    let sum = 0;
    let found = false;
    for (const est of estimates) {
      if (normToken(est.mtoCode) === mtoKey) {
        sum = roundQty(sum + toNum(est.estimatedQty));
        found = true;
      }
    }
    if (found) return { mtoQty: sum, matchedBy: 'mtoCode' };
  }

  return { mtoQty: null, matchedBy: 'none' };
}

/**
 * Rule 1-19: Standard EPC Power Plant Material Balance (Conservation) Formula:
 *
 *   Net Contractor Receipt = Total Delivered Qty - Total Returned Qty
 *
 *   - Primary (when Total Erected Qty is known):
 *       Balance = Total Delivered Qty - Total Returned Qty - Total Erected Qty
 *       • Balance = 0  → "اتمام" (Settled: Delivered = Erected + Returned)
 *       • Balance > 0  → "بدهکار" (Contractor holds unaccounted surplus material to return)
 *       • Balance < 0  → "بدهکار" (Over-erected / reported discrepancy exceeding delivered qty)
 *
 *   - Secondary (when Total Erected Qty is blank, Total MTO Qty is known):
 *       Balance = Total Delivered Qty - Total Returned Qty - Total MTO Qty
 *
 *   - Tertiary (when both Erected Qty and MTO Qty are blank):
 *       Balance = Total Delivered Qty - Total Returned Qty
 */
export function computeBmrBalance(params: {
  deliveredQty: number;
  returnedQty: number;
  mtoQty: number | null;
  erectedQty: number | null;
}): {
  balance: number;
  statusFa: 'اتمام' | 'بدهکار';
  statusEn: 'Completed' | 'Debtor';
  formulaSource: 'erected' | 'mto' | 'net_delivered';
} {
  const delivered = toNum(params.deliveredQty);
  const returned = toNum(params.returnedQty);
  const hasErected =
    params.erectedQty !== null &&
    params.erectedQty !== undefined &&
    Number.isFinite(Number(params.erectedQty));
  const hasMto =
    params.mtoQty !== null &&
    params.mtoQty !== undefined &&
    Number.isFinite(Number(params.mtoQty));

  let balance: number;
  let formulaSource: 'erected' | 'mto' | 'net_delivered';

  if (hasErected) {
    balance = roundQty(delivered - returned - Number(params.erectedQty));
    formulaSource = 'erected';
  } else if (hasMto) {
    balance = roundQty(delivered - returned - Number(params.mtoQty));
    formulaSource = 'mto';
  } else {
    balance = roundQty(delivered - returned);
    formulaSource = 'net_delivered';
  }

  // Normalize -0 to 0
  if (Math.abs(balance) < 1e-9) balance = 0;

  const isSettled = balance === 0;
  return {
    balance,
    statusFa: isSettled ? BMR_STATUS_SETTLED_FA : BMR_STATUS_DEBTOR_FA,
    statusEn: isSettled ? 'Completed' : 'Debtor',
    formulaSource,
  };
}

export function resolveBmrBalanceStatus(balance: number): 'اتمام' | 'بدهکار' {
  const normalized = Math.abs(roundQty(balance)) < 1e-9 ? 0 : roundQty(balance);
  return normalized === 0 ? BMR_STATUS_SETTLED_FA : BMR_STATUS_DEBTOR_FA;
}

export function parseOptionalQtyInput(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? roundQty(raw) : null;
  const cleaned = String(raw)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,٬\s]/g, '')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? roundQty(n) : null;
}

/**
 * Rules 1-8 through 1-19: Computes a full BMR line item from a Detailed row + optional user overrides.
 */
export function buildBmrLineItem(
  row: Pick<
    DetailedComputed,
    | 'id'
    | 'shipmentNo'
    | 'packageNo'
    | 'itemNo'
    | 'itemCode'
    | 'description'
    | 'generalDescription'
    | 'countingUnit'
    | 'packingQty'
    | 'actualQty'
    | 'effectiveActualQty'
    | 'smrMapnaQty'
    | 'smrMapnaNo'
    | 'mtoRef'
  >,
  estimates: ReadonlyArray<Pick<MaterialEstimateRecord, 'itemCode' | 'mtoCode' | 'estimatedQty'>>,
  overrides?: {
    mtoQty?: number | null;
    erectedQty?: number | null;
  },
): BmrLineItem {
  const receivedQty = roundQty(toNum(row.packingQty));
  const deliveredQty =
    row.actualQty !== null && row.actualQty !== undefined && Number.isFinite(Number(row.actualQty))
      ? roundQty(Number(row.actualQty))
      : roundQty(toNum(row.effectiveActualQty ?? row.packingQty));
  const returnedQty = roundQty(toNum(row.smrMapnaQty));

  const estLookup = lookupBmrEstimateQty(row, estimates);
  const mtoQty =
    overrides && overrides.mtoQty !== undefined ? overrides.mtoQty : estLookup.mtoQty;
  const erectedQty =
    overrides && overrides.erectedQty !== undefined ? overrides.erectedQty : null;

  const computed = computeBmrBalance({
    deliveredQty,
    returnedQty,
    mtoQty,
    erectedQty,
  });

  return {
    detailedId: row.id,
    plNo: String(row.shipmentNo || '').trim(),
    packageNo: String(row.packageNo || '').trim(),
    packageItemNo: String(row.itemNo || '').trim(),
    tagNo: String(row.itemCode || '').trim(),
    description: String(row.description || row.generalDescription || '').trim(),
    uom: String(row.countingUnit || '').trim(),
    receivedQty,
    deliveredQty,
    returnedQty,
    smrMapnaNo: String(row.smrMapnaNo || '').trim() || undefined,
    mtoQty,
    erectedQty,
    balance: computed.balance,
    balanceStatus: computed.statusFa,
  };
}
