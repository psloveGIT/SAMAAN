import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_UPLOADED_FORM_PRINT_SETTINGS, resolveEmployerLogoById } from '../shared/employers.ts';
import type { ResolvedEmployerProfile } from '../shared/employers.ts';
import type { EmployerUploadedForm, FormPaperOrientation } from '../shared/types.ts';
import {
  base64ToBlobUrl,
  buildRenderedExcelGrid,
  parseWordDocModel,
  replaceTokensInText,
} from '../shared/uploadedFormEngine.ts';
import type { ParsedWordModel } from '../shared/uploadedFormEngine.ts';

interface UploadedFormA4SheetProps {
  form: EmployerUploadedForm;
  employer: ResolvedEmployerProfile;
  headerTokens: Record<string, string>;
  lineRows: Array<Record<string, string>>;
  isFa?: boolean;
  /** Render at native A4 print dimensions inside print portal */
  forPrint?: boolean;
  /** Optional quick orientation toggle directly in preview bar */
  onOrientationChange?: (orientation: FormPaperOrientation) => void;
}

const UploadedFormA4SheetInner: React.FC<UploadedFormA4SheetProps> = ({
  form,
  employer,
  headerTokens,
  lineRows,
  isFa = true,
  forPrint = false,
  onOrientationChange,
}) => {
  const ps = form.printSettings || DEFAULT_UPLOADED_FORM_PRINT_SETTINGS;
  const logo = resolveEmployerLogoById(employer, form.primaryLogoId || '__none__', false);

  const excelResult = useMemo(() => {
    if (form.fileType !== 'excel') return null;
    try {
      return buildRenderedExcelGrid(form, headerTokens, lineRows);
    } catch {
      return null;
    }
  }, [
    form.fileType,
    form.fileDataBase64,
    form.sheetName,
    form.tokenBindings,
    form.tableStartRowIndex,
    form.tableColumnBindings,
    form.detectedFormulas,
    form.printSettings,
    headerTokens,
    lineRows,
  ]);

  const [wordModel, setWordModel] = useState<ParsedWordModel | null>(null);
  const [wordError, setWordError] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (form.fileType !== 'word') {
      setWordModel(null);
      setWordError('');
      return () => {
        active = false;
      };
    }
    if (!form.fileName.toLowerCase().endsWith('.docx')) {
      setWordModel(null);
      setWordError(
        isFa
          ? 'فایل‌های قدیمی با پسوند .doc فقط جهت نگهداری و دانلود قابل استفاده هستند؛ برای پیش‌نمایش و پرشدن خودکار، فایل را با فرمت .docx ذخیره و آپلود کنید.'
          : 'Legacy .doc format stored for download; save as .docx for live preview & auto-fill.',
      );
      return () => {
        active = false;
      };
    }
    parseWordDocModel(form.fileDataBase64, headerTokens, form.tokenBindings, lineRows)
      .then((res) => {
        if (active) {
          setWordModel(res);
          setWordError('');
        }
      })
      .catch(() => {
        if (active) {
          setWordError(isFa ? 'خطا در خواندن ساختار فایل ورد (.docx)' : 'Failed to parse .docx content.');
        }
      });
    return () => {
      active = false;
    };
  }, [form.fileDataBase64, form.fileName, form.fileType, form.tokenBindings, headerTokens, lineRows, isFa]);

  const [blobUrl, setBlobUrl] = useState<string>('');
  useEffect(() => {
    if (form.fileType !== 'pdf' && form.fileType !== 'image') {
      setBlobUrl('');
      return undefined;
    }
    try {
      const url = base64ToBlobUrl(form.fileDataBase64, form.mimeType);
      setBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch {
      setBlobUrl('');
      return undefined;
    }
  }, [form.fileDataBase64, form.fileType, form.mimeType]);

  // Build merge lookup maps using shifted effectiveMerges so footer merges remain aligned
  const excelMergeMaps = useMemo(() => {
    const startMap = new Map<string, { rowSpan: number; colSpan: number }>();
    const coveredSet = new Set<string>();
    if (!excelResult) return { startMap, coveredSet };

    const mergesToUse = excelResult.effectiveMerges || excelResult.model.merges;
    for (const m of mergesToUse) {
      if (excelResult.injectedRowIndices.has(m.s.r)) continue;
      startMap.set(`${m.s.r}:${m.s.c}`, {
        rowSpan: m.e.r - m.s.r + 1,
        colSpan: m.e.c - m.s.c + 1,
      });
      for (let r = m.s.r; r <= m.e.r; r += 1) {
        for (let c = m.s.c; c <= m.e.c; c += 1) {
          if (r !== m.s.r || c !== m.s.c) {
            coveredSet.add(`${r}:${c}`);
          }
        }
      }
    }
    return { startMap, coveredSet };
  }, [excelResult]);

  // Compute proportional percentage column widths when fitToPageWidth is enabled so table-fixed never crushes wide columns
  const colWidthPercentages = useMemo(() => {
    if (!excelResult) return [] as number[];
    const widths = excelResult.model.colWidthsPx;
    const total = widths.reduce((sum, w) => sum + Math.max(36, w || 70), 0) || 1;
    return widths.map((w) => Number(((Math.max(36, w || 70) / total) * 100).toFixed(3)));
  }, [excelResult]);

  const scaleFactor = ps.fitToPageWidth ? 1 : (ps.scalePercent || 100) / 100;
  const pageWidthMm = ps.orientation === 'landscape' ? 297 : 210;

  return (
    <div className="space-y-2">
      {!forPrint && onOrientationChange && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="text-[11px] text-[var(--text-muted)]">
            {isFa
              ? `ابعاد کاغذ A4 (${ps.orientation === 'landscape' ? '۲۹۷×۲۱۰ میلی‌متر افقی' : '۲۱۰×۲۹۷ میلی‌متر عمودی'})`
              : `A4 Sheet (${ps.orientation === 'landscape' ? '297×210mm Landscape' : '210×297mm Portrait'})`}
          </div>
          <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5 text-[11px]">
            <button
              type="button"
              data-testid="a4-preview-portrait"
              onClick={() => onOrientationChange('portrait')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                ps.orientation === 'portrait'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isFa ? 'عمودی (Portrait)' : 'Portrait'}
            </button>
            <button
              type="button"
              data-testid="a4-preview-landscape"
              onClick={() => onOrientationChange('landscape')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                ps.orientation === 'landscape'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isFa ? 'افقی (Landscape)' : 'Landscape'}
            </button>
          </div>
        </div>
      )}

      <div
        dir="rtl"
        data-orientation={ps.orientation}
        style={{
          width: '100%',
          maxWidth: `${pageWidthMm}mm`,
          paddingTop: `${ps.marginTopMm}mm`,
          paddingRight: `${ps.marginRightMm}mm`,
          paddingBottom: `${ps.marginBottomMm}mm`,
          paddingLeft: `${ps.marginLeftMm}mm`,
          fontSize: `${ps.fontSizePt}pt`,
        }}
        className={`mx-auto bg-white text-black ${
          forPrint
            ? ''
            : 'border border-[var(--border-subtle)] rounded-xl shadow-xs overflow-x-auto'
        }`}
      >
        {/* Optional Selected Company Logo Stamp Banner */}
        {logo && (
          <div className="flex items-center justify-between border-b border-black/25 pb-2 mb-2">
            <div className="flex items-center gap-2">
              <img src={logo.dataUrl} alt={logo.label} className="h-10 max-w-[110px] object-contain" />
              <div>
                <div className="font-bold text-[11px]">{employer.companyFullName || employer.nameFa}</div>
                <div className="text-[10px] text-slate-600">{form.titleFa}</div>
              </div>
            </div>
            {form.formCode && (
              <div dir="ltr" className="text-[10px] font-mono font-semibold text-slate-700">
                {form.formCode}
              </div>
            )}
          </div>
        )}

        {/* Content Renderer by File Type */}
        <div
          style={
            scaleFactor !== 1
              ? {
                  transform: `scale(${scaleFactor})`,
                  transformOrigin: 'top right',
                  width: `${100 / scaleFactor}%`,
                }
              : undefined
          }
        >
          {form.fileType === 'excel' && excelResult && (
            <table
              className="w-full border-collapse table-fixed"
              style={{
                fontSize: `${ps.fontSizePt}pt`,
                borderCollapse: 'collapse',
                minWidth: ps.fitToPageWidth ? undefined : `${excelResult.model.colWidthsPx.reduce((a, b) => a + b, 0)}px`,
              }}
            >
              <colgroup>
                {excelResult.model.colWidthsPx.map((w, idx) => (
                  <col
                    key={idx}
                    style={
                      ps.fitToPageWidth
                        ? { width: `${colWidthPercentages[idx] ?? 10}%` }
                        : { width: `${w}px` }
                    }
                  />
                ))}
              </colgroup>
              <tbody>
                {excelResult.displayRows.map((rowArr, rIdx) => {
                  const rowHeight = excelResult.rowHeightsPx[rIdx] || ps.minRowHeightPx;
                  const isInjected = excelResult.injectedRowIndices.has(rIdx);
                  return (
                    <tr
                      key={rIdx}
                      style={{
                        height: ps.autoRowHeight ? `${rowHeight}px` : `${ps.minRowHeightPx}px`,
                      }}
                    >
                      {rowArr.map((cellText, cIdx) => {
                        const key = `${rIdx}:${cIdx}`;
                        if (!isInjected && excelMergeMaps.coveredSet.has(key)) {
                          return null;
                        }
                        const span = !isInjected ? excelMergeMaps.startMap.get(key) : undefined;
                        const trimmed = (cellText || '').trim();
                        const isNumeric = /^[\d.,/\-\s:%]+$/.test(trimmed) && trimmed !== '';
                        return (
                          <td
                            key={cIdx}
                            rowSpan={span?.rowSpan}
                            colSpan={span?.colSpan}
                            style={{
                              border: ps.showGridlines ? '1px solid #334155' : 'none',
                              minHeight: `${rowHeight}px`,
                              overflowWrap: 'anywhere',
                              wordBreak: 'break-word',
                            }}
                            className={`px-1.5 py-1 align-middle whitespace-pre-wrap leading-snug ${
                              isNumeric ? 'text-center font-mono' : 'text-right'
                            } ${rIdx === 0 ? 'font-bold bg-slate-100' : isInjected ? 'bg-white' : ''}`}
                          >
                            {cellText}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {form.fileType === 'word' && (
            <div className="space-y-2.5">
              {wordError ? (
                <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs leading-relaxed">
                  {wordError}
                </div>
              ) : !wordModel ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {isFa ? 'در حال بارگذاری محتوای فایل ورد...' : 'Loading Word document...'}
                </div>
              ) : (
                wordModel.blocks.map((block, bIdx) => {
                  if (block.type === 'paragraph') {
                    return (
                      <p
                        key={bIdx}
                        style={{
                          fontSize: block.isHeading ? `${ps.fontSizePt + 2}pt` : `${ps.fontSizePt}pt`,
                          textAlign: block.align || 'right',
                        }}
                        className={`whitespace-pre-wrap break-words leading-relaxed ${
                          block.isHeading ? 'font-bold' : ''
                        }`}
                      >
                        {block.text}
                      </p>
                    );
                  }
                  return (
                    <table
                      key={bIdx}
                      className="w-full border-collapse"
                      style={{ fontSize: `${ps.fontSizePt}pt` }}
                    >
                      <tbody>
                        {block.rows.map((rCells, rIdx) => (
                          <tr key={rIdx}>
                            {rCells.map((cellTxt, cIdx) => (
                              <td
                                key={cIdx}
                                style={{
                                  border: ps.showGridlines ? '1px solid #1e293b' : '1px solid #e2e8f0',
                                  minHeight: `${ps.minRowHeightPx}px`,
                                  overflowWrap: 'anywhere',
                                }}
                                className={`px-2 py-1.5 align-middle whitespace-pre-wrap break-words leading-snug ${
                                  rIdx === 0 ? 'font-bold bg-slate-50' : ''
                                }`}
                              >
                                {cellTxt}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })
              )}
            </div>
          )}

          {form.fileType === 'pdf' && blobUrl && (
            <div className="space-y-2">
              {forPrint ? (
                <div className="text-center p-4 text-xs text-slate-600 border border-slate-300 rounded">
                  {isFa
                    ? 'برای چاپ مستقیم فایل PDF رسمی شرکت، از دکمه «باز کردن / چاپ PDF» یا دانلود PDF استفاده کنید.'
                    : 'Use the Open/Print PDF button for native vector PDF printing.'}
                </div>
              ) : (
                <iframe
                  src={blobUrl}
                  title={form.titleFa}
                  className="w-full border border-slate-200 rounded-lg bg-slate-50"
                  style={{
                    height: ps.orientation === 'landscape' ? '520px' : '740px',
                  }}
                />
              )}
            </div>
          )}

          {form.fileType === 'image' && blobUrl && (
            <div className="space-y-2 text-center">
              <img
                src={blobUrl}
                alt={form.titleFa}
                className="mx-auto max-w-full object-contain border border-slate-200"
              />
              {(form.detectedTokens || []).length > 0 && (
                <div className="grid grid-cols-2 gap-1 border border-black p-2 text-right text-[10px]">
                  {(form.detectedTokens || []).map((tok) => (
                    <div key={tok}>
                      <span className="font-bold">{tok}: </span>
                      <span>{replaceTokensInText(`{{${tok}}}`, headerTokens, form.tokenBindings)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Screen preview page footer indicator (print uses CSS @page @bottom-center) */}
        {!forPrint && (
          <div className="mt-3 pt-1.5 border-t border-slate-200 text-center text-[10px] text-slate-500 font-medium">
            {isFa ? 'صفحه: ۱ از ۱' : 'Page: 1 of 1'}
          </div>
        )}
      </div>
    </div>
  );
};

export const UploadedFormA4Sheet = React.memo(UploadedFormA4SheetInner);
