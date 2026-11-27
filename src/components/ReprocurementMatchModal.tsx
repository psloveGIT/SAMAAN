import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { formatDisplayNumber } from '../shared/jalali.ts';
import {
  buildShortageReprocurementNote,
  buildSubstitutionReprocurementNote,
  matchOpenShortages,
  matchOpenSubstitutions,
  shouldCloseShortage,
  shouldCloseSubstitution,
  type ReprocurementCandidate,
} from '../shared/reprocurementMatch.ts';
import type {
  DetailedComputed,
  ReprocurementApplyPayload,
  ReprocurementApplyResponse,
  SubstitutionRecord,
} from '../shared/types.ts';

export interface ReprocurementSourceSummary {
  id: string;
  shipmentNo: string;
  packingQty: number;
  countingUnit: string;
  itemCode: string;
  description: string;
  generalDescription: string;
}

interface ReprocurementMatchModalProps {
  open: boolean;
  onClose: () => void;
  sourceItem: ReprocurementSourceSummary | null;
  enableSubstitutionMatch: boolean;
  enableShortageMatch: boolean;
  onApplied: () => void;
}

function getReasonLabel(
  reason: 'exact_code' | 'last5_digits' | 'description_keyword',
  isFa: boolean,
): string {
  if (reason === 'exact_code') return isFa ? 'تطابق دقیق کد کالا' : 'Exact Item Code';
  if (reason === 'last5_digits') return isFa ? 'تطابق ۵ رقم آخر کد کالا' : 'Last 5 Digits Match';
  return isFa ? 'تشابه شرح کالا' : 'Description Match';
}

export const ReprocurementMatchModal: React.FC<ReprocurementMatchModalProps> = ({
  open,
  onClose,
  sourceItem,
  enableSubstitutionMatch,
  enableShortageMatch,
  onApplied,
}) => {
  const { prefs, notify } = useApp();
  const isFa = prefs.language === 'fa';

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [allDetailed, setAllDetailed] = useState<DetailedComputed[]>([]);
  const [allSubstitutions, setAllSubstitutions] = useState<SubstitutionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'substitution' | 'shortage'>('substitution');
  const [search, setSearch] = useState('');
  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);
  const [selectedShortageIds, setSelectedShortageIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !sourceItem) return;
    setActiveTab(enableSubstitutionMatch ? 'substitution' : 'shortage');
    setSearch('');
    setSelectedSubIds([]);
    setSelectedShortageIds([]);
    setLoading(true);

    const requests: [
      Promise<{ items?: DetailedComputed[] }>,
      Promise<{ records?: SubstitutionRecord[]; items?: SubstitutionRecord[] }>,
    ] = [
      apiRequest<{ items?: DetailedComputed[] }>('/api/detailed?all=true'),
      enableSubstitutionMatch
        ? apiRequest<{ records?: SubstitutionRecord[]; items?: SubstitutionRecord[] }>('/api/substitutions')
        : Promise.resolve({ records: [] }),
    ];

    Promise.all(requests)
      .then(([detRes, subRes]) => {
        setAllDetailed(detRes.items || []);
        setAllSubstitutions(subRes.records || subRes.items || []);
      })
      .catch(() => {
        notify(
          'error',
          isFa
            ? 'خطا در بارگذاری لیست کالاهای جایگزین‌شده و کسری.'
            : 'Failed to load open substitution/shortage records.',
        );
      })
      .finally(() => setLoading(false));
  }, [open, sourceItem, enableSubstitutionMatch, enableShortageMatch, isFa, notify]);

  const subGroups = useMemo(() => {
    if (!sourceItem || !enableSubstitutionMatch) return { suggested: [], others: [] };
    return matchOpenSubstitutions(
      {
        itemCode: sourceItem.itemCode,
        description: sourceItem.description,
        generalDescription: sourceItem.generalDescription,
        excludeDetailedId: sourceItem.id,
      },
      allDetailed,
      allSubstitutions,
    );
  }, [sourceItem, enableSubstitutionMatch, allDetailed, allSubstitutions]);

  const shortageGroups = useMemo(() => {
    if (!sourceItem || !enableShortageMatch) return { suggested: [], others: [] };
    return matchOpenShortages(
      {
        itemCode: sourceItem.itemCode,
        description: sourceItem.description,
        generalDescription: sourceItem.generalDescription,
        excludeDetailedId: sourceItem.id,
      },
      allDetailed,
    );
  }, [sourceItem, enableShortageMatch, allDetailed]);

  const subCandidateMap = useMemo(() => {
    const map = new Map<string, ReprocurementCandidate>();
    for (const c of [...subGroups.suggested, ...subGroups.others]) {
      map.set(c.detailedId, c);
    }
    return map;
  }, [subGroups]);

  const shortageCandidateMap = useMemo(() => {
    const map = new Map<string, ReprocurementCandidate>();
    for (const c of [...shortageGroups.suggested, ...shortageGroups.others]) {
      map.set(c.detailedId, c);
    }
    return map;
  }, [shortageGroups]);

  const filterList = (list: ReprocurementCandidate[]): ReprocurementCandidate[] => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [
        c.itemCode,
        c.description,
        c.shipmentNo,
        c.packageNo,
        c.itemNo,
        c.repNo,
        c.merNo,
        c.unit,
        c.system,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  };

  if (!open || !sourceItem) return null;

  const isSubTab = activeTab === 'substitution';
  const currentGroups = isSubTab ? subGroups : shortageGroups;
  const filteredSuggested = filterList(currentGroups.suggested);
  const filteredOthers = filterList(currentGroups.others);
  const selectedIds = isSubTab ? selectedSubIds : selectedShortageIds;
  const totalSelected = selectedSubIds.length + selectedShortageIds.length;

  const toggleSelection = (detailedId: string) => {
    if (isSubTab) {
      setSelectedSubIds((prev) =>
        prev.includes(detailedId) ? prev.filter((id) => id !== detailedId) : [...prev, detailedId],
      );
    } else {
      setSelectedShortageIds((prev) =>
        prev.includes(detailedId) ? prev.filter((id) => id !== detailedId) : [...prev, detailedId],
      );
    }
  };

  const handleConfirm = async () => {
    if (totalSelected === 0) {
      notify(
        'warning',
        isFa
          ? 'حداقل یک ردیف مرتبط برای ثبت تأمین مجدد انتخاب کنید.'
          : 'Select at least one related item to apply re-procurement.',
      );
      return;
    }

    const payload: ReprocurementApplyPayload = {
      sourceDetailedId: sourceItem.id,
      sourceShipmentNo: sourceItem.shipmentNo,
      sourcePackingQty: sourceItem.packingQty,
      sourceCountingUnit: sourceItem.countingUnit,
      substitutionTargets: selectedSubIds.map((id) => {
        const cand = subCandidateMap.get(id);
        return {
          detailedId: id,
          repNo: cand?.repNo,
          substitutionId: cand?.substitutionId,
          targetQty: cand?.targetQty,
        };
      }),
      shortageTargets: selectedShortageIds.map((id) => ({
        detailedId: id,
      })),
    };

    setApplying(true);
    try {
      const res = await apiRequest<ReprocurementApplyResponse>('/api/detailed/apply-reprocurement', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const updatedSubs = res.updatedSubstitutionRowIds?.length ?? 0;
      const closedSubs = res.closedSubstitutionRowIds?.length ?? 0;
      const updatedShortages = res.updatedShortageRowIds?.length ?? 0;
      const closedShortages = res.closedShortageRowIds?.length ?? 0;

      const partsFa: string[] = [];
      const partsEn: string[] = [];
      if (updatedSubs > 0) {
        partsFa.push(
          `${formatDisplayNumber(updatedSubs, 'fa')} جایگزینی به‌روزرسانی شد` +
            (closedSubs > 0
              ? ` (${formatDisplayNumber(closedSubs, 'fa')} مورد بسته شد)`
              : ''),
        );
        partsEn.push(
          `${updatedSubs} substitution(s) updated` +
            (closedSubs > 0 ? ` (${closedSubs} closed)` : ''),
        );
      }
      if (updatedShortages > 0) {
        partsFa.push(
          `${formatDisplayNumber(updatedShortages, 'fa')} کسری/مغایرت به‌روزرسانی شد` +
            (closedShortages > 0
              ? ` (${formatDisplayNumber(closedShortages, 'fa')} مورد بسته شد)`
              : ''),
        );
        partsEn.push(
          `${updatedShortages} shortage(s) updated` +
            (closedShortages > 0 ? ` (${closedShortages} closed)` : ''),
        );
      }

      notify(
        'success',
        isFa
          ? partsFa.length > 0
            ? `تأمین مجدد با موفقیت ثبت شد: ${partsFa.join(' · ')}`
            : 'تأمین مجدد با موفقیت ثبت شد.'
          : partsEn.length > 0
            ? `Re-procurement applied: ${partsEn.join(' · ')}`
            : 'Re-procurement applied successfully.',
      );
      onApplied();
      onClose();
    } catch (err) {
      notify(
        'error',
        err instanceof Error
          ? err.message
          : isFa
            ? 'خطا در ثبت تأمین مجدد'
            : 'Failed to apply re-procurement',
      );
    } finally {
      setApplying(false);
    }
  };

  const renderCandidateRow = (cand: ReprocurementCandidate, isSuggested: boolean) => {
    const checked = selectedIds.includes(cand.detailedId);
    const willAutoClose = isSubTab
      ? shouldCloseSubstitution(sourceItem.packingQty, cand.targetQty)
      : shouldCloseShortage(sourceItem.packingQty, cand.shortage, cand.damagedQty);

    const notePreview = isSubTab
      ? buildSubstitutionReprocurementNote(
          cand.repNo || '-',
          sourceItem.shipmentNo,
          sourceItem.packingQty,
        )
      : buildShortageReprocurementNote(
          sourceItem.packingQty,
          sourceItem.countingUnit || cand.countingUnit,
          sourceItem.shipmentNo,
        );

    return (
      <div
        key={cand.detailedId}
        onClick={() => toggleSelection(cand.detailedId)}
        data-testid={`reproc-candidate-${cand.detailedId}`}
        className={`rounded-xl border p-3 cursor-pointer transition-all space-y-2 ${
          checked
            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/70 ring-1 ring-[var(--accent-primary)]'
            : isSuggested
              ? 'border-[var(--accent-primary)]/35 bg-[var(--bg-canvas)] hover:border-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)]/50'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
              checked
                ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[var(--accent-contrast)]'
                : 'border-[var(--border-strong)] bg-[var(--bg-surface)]'
            }`}
          >
            {checked && <Check className="w-3 h-3" />}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-[var(--text-primary)] bidi-plaintext">
                {cand.description}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {cand.matchReasons.map((reason) => (
                  <span
                    key={reason}
                    className="px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[10px] font-semibold"
                  >
                    {getReasonLabel(reason, isFa)}
                  </span>
                ))}
                {willAutoClose && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>
                      {isFa
                        ? 'وضعیت به‌صورت خودکار «بسته» می‌شود'
                        : 'Auto-closes status to Closed'}
                    </span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)] tabular-nums">
              {cand.itemCode && (
                <span>
                  {isFa ? 'کد کالا:' : 'Code:'}{' '}
                  <strong dir="ltr" className="text-[var(--text-primary)]">
                    {cand.itemCode}
                  </strong>
                </span>
              )}
              <span>
                {isFa ? 'پکینگ:' : 'Packing:'} <span dir="ltr">{cand.shipmentNo || '-'}</span>
                {cand.packageNo ? (
                  <>
                    {' · '}
                    {isFa ? 'نگله:' : 'Pkg:'} <span dir="ltr">{cand.packageNo}</span>
                  </>
                ) : null}
              </span>
              {cand.unit && (
                <span>
                  {isFa ? 'واحد:' : 'Unit:'} {cand.unit}
                </span>
              )}
              {isSubTab ? (
                <>
                  <span>
                    {isFa ? 'شماره جایگزینی:' : 'Sub No.:'}{' '}
                    <strong dir="ltr" className="text-[var(--accent-primary)]">
                      {cand.repNo || '-'}
                    </strong>
                  </span>
                  <span>
                    {isFa ? 'مقدار جایگزین‌شده:' : 'Sub Qty:'}{' '}
                    <strong>{formatDisplayNumber(cand.targetQty, prefs.language)}</strong>
                  </span>
                </>
              ) : (
                <>
                  {cand.merNo && (
                    <span>
                      {isFa ? 'شماره کسری/مغایرت:' : 'MER No.:'}{' '}
                      <strong dir="ltr">{cand.merNo}</strong>
                    </span>
                  )}
                  <span className="text-[var(--status-danger)] font-semibold">
                    {isFa ? 'کسری:' : 'Shortage:'}{' '}
                    {formatDisplayNumber(cand.shortage, prefs.language)}
                    {cand.damagedQty > 0
                      ? ` · ${isFa ? 'آسیب‌دیده:' : 'Damaged:'} ${formatDisplayNumber(cand.damagedQty, prefs.language)}`
                      : ''}
                  </span>
                </>
              )}
            </div>

            {checked && (
              <div className="mt-2 p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">
                  {isFa ? 'متن افزوده‌شونده به توضیحات:' : 'Note to append:'}{' '}
                </span>
                <span className="bidi-plaintext">{notePreview}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4"
      data-testid="reprocurement-match-modal"
    >
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {isFa
                  ? 'تطبیق و ثبت تأمین مجدد کالا'
                  : 'Match & Apply Item Re-procurement'}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] truncate tabular-nums bidi-plaintext">
                {sourceItem.description} · {isFa ? 'پکینگ' : 'Packing'}:{' '}
                <span dir="ltr">{sourceItem.shipmentNo}</span> · {isFa ? 'مقدار:' : 'Qty:'}{' '}
                {formatDisplayNumber(sourceItem.packingQty, prefs.language)}{' '}
                {sourceItem.countingUnit}
                {sourceItem.itemCode ? ` · ${sourceItem.itemCode}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs & Search */}
        <div className="px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {enableSubstitutionMatch && (
              <button
                type="button"
                onClick={() => setActiveTab('substitution')}
                data-testid="reproc-tab-substitution"
                className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                  activeTab === 'substitution'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>
                  {isFa ? 'تأمین مجدد جایگزینی' : 'Substitution Re-procurement'} (
                  {formatDisplayNumber(
                    subGroups.suggested.length + subGroups.others.length,
                    prefs.language,
                  )}
                  )
                </span>
                {selectedSubIds.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-white/20 text-[10px] font-bold">
                    {formatDisplayNumber(selectedSubIds.length, prefs.language)}
                  </span>
                )}
              </button>
            )}
            {enableShortageMatch && (
              <button
                type="button"
                onClick={() => setActiveTab('shortage')}
                data-testid="reproc-tab-shortage"
                className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                  activeTab === 'shortage'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {isFa ? 'تأمین مجدد کسری' : 'Shortage Re-procurement'} (
                  {formatDisplayNumber(
                    shortageGroups.suggested.length + shortageGroups.others.length,
                    prefs.language,
                  )}
                  )
                </span>
                {selectedShortageIds.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-white/20 text-[10px] font-bold">
                    {formatDisplayNumber(selectedShortageIds.length, prefs.language)}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isFa ? 'جستجو در کد کالا، شرح، پکینگ، شماره فرم...' : 'Search code, description, doc no...'
              }
              className="w-full h-8 ps-8 pe-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isFa ? 'در حال جستجوی ردیف‌های مرتبط...' : 'Loading matching records...'}</span>
            </div>
          ) : filteredSuggested.length === 0 && filteredOthers.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              {isSubTab
                ? isFa
                  ? 'هیچ ردیف جایگزینی با وضعیت «باز» یافت نشد.'
                  : 'No open substitution rows found.'
                : isFa
                  ? 'هیچ ردیف دارای کسری یا آسیب‌دیدگی باز یافت نشد.'
                  : 'No open shortage or damaged rows found.'}
            </div>
          ) : (
            <>
              {filteredSuggested.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-primary)]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {isFa
                        ? `پیشنهادی (${formatDisplayNumber(filteredSuggested.length, 'fa')} مورد)`
                        : `Suggested (${filteredSuggested.length})`}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {filteredSuggested.map((c) => renderCandidateRow(c, true))}
                  </div>
                </div>
              )}

              {filteredOthers.length > 0 && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-[var(--text-secondary)]">
                    {isFa
                      ? `سایر ردیف‌های باز (${formatDisplayNumber(filteredOthers.length, 'fa')} مورد)`
                      : `Other Open Rows (${filteredOthers.length})`}
                  </div>
                  <div className="space-y-2">
                    {filteredOthers.map((c) => renderCandidateRow(c, false))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--text-secondary)] tabular-nums">
            {totalSelected > 0
              ? isFa
                ? `${formatDisplayNumber(totalSelected, 'fa')} ردیف برای اعمال تأمین مجدد انتخاب شده است.`
                : `${totalSelected} row(s) selected for re-procurement.`
              : isFa
                ? 'ردیف(های) موردنظر را از لیست بالا انتخاب کنید یا برای رد کردن روی «انصراف» بزنید.'
                : 'Select target row(s) above or cancel to skip.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium"
            >
              {isFa ? 'انصراف / بدون تطبیق' : 'Skip / Cancel'}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={applying || totalSelected === 0}
              data-testid="reprocurement-confirm-btn"
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isFa ? 'ثبت و اعمال تأمین مجدد' : 'Apply Re-procurement'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
