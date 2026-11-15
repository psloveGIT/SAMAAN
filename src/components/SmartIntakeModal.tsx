import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Mic,
  ScanLine,
  Square,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { parseDetailedCsv, parseGeneralCsv } from '../shared/csvParser.ts';
import { matrixToCsvText, parseSpreadsheetFile } from '../shared/spreadsheetImport.ts';

export interface GeneralAiExtractionResult {
  header?: {
    packingListNo?: string;
    arrivalDate?: string;
    supplier?: string;
    dispatchLocation?: string;
    employerEntryMinutesNo?: string;
    mapnaEntryMinutesNo?: string;
    releaseNo?: string;
    releaseDate?: string;
    billOfLadingNo?: string;
    vehicleNo?: string;
    weighbridgeWeight?: number;
    freightCost?: number;
    driverName?: string;
    opiInvitationNo?: string;
    opiInvitationDate?: string;
    island?: string;
    system?: string;
    subSystem?: string;
    unit?: string;
  };
  packages?: Array<{
    packageNo?: string;
    packageType?: string;
    itemCount?: number;
    itemDescription?: string;
    grossWeight?: number;
    netWeight?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
  }>;
  transcript?: string;
}

export interface DetailedAiExtractionResult {
  shipmentNo?: string;
  packageNo?: string;
  transcript?: string;
  items?: Array<{
    itemNo?: string;
    generalDescription?: string;
    description?: string;
    size?: string;
    itemCode?: string;
    mtoRef?: string;
    packingQty?: number;
    actualQty?: number;
    damagedQty?: number;
    countingUnit?: string;
    notes?: string;
  }>;
}

interface SmartIntakeModalProps {
  open: boolean;
  target: 'general' | 'detailed';
  onClose: () => void;
  onApplyGeneral?: (result: GeneralAiExtractionResult) => void;
  onApplyDetailed?: (result: DetailedAiExtractionResult, mode: 'fill_first' | 'save_all') => Promise<void> | void;
}

type IntakeTab = 'file' | 'scan' | 'voice';

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const SmartIntakeModal: React.FC<SmartIntakeModalProps> = ({
  open,
  target,
  onClose,
  onApplyGeneral,
  onApplyDetailed,
}) => {
  const { prefs, user, notify } = useApp();
  const isFa = prefs.language === 'fa';

  const [tab, setTab] = useState<IntakeTab>('file');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [generalResult, setGeneralResult] = useState<GeneralAiExtractionResult | null>(null);
  const [detailedResult, setDetailedResult] = useState<DetailedAiExtractionResult | null>(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceNoteText, setVoiceNoteText] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (timerRef.current) window.clearInterval(timerRef.current);
      setRecording(false);
      setRecordSeconds(0);
      setError('');
      setGeneralResult(null);
      setDetailedResult(null);
      setVoiceNoteText('');
    }
  }, [open]);

  if (!open) return null;

  const handleSpreadsheetOrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setGeneralResult(null);
    setDetailedResult(null);
    setProcessing(true);

    try {
      const lower = (file.name || '').toLowerCase();
      const isSpreadsheet =
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xls') ||
        lower.endsWith('.ods') ||
        lower.endsWith('.csv') ||
        lower.endsWith('.tsv') ||
        lower.endsWith('.json');

      if (isSpreadsheet) {
        const parsed = await parseSpreadsheetFile(file);
        const matrix = parsed.sheets[parsed.defaultSheet] || [];
        if (matrix.length === 0) {
          throw new Error(isFa ? 'فایل انتخاب‌شده خالی است.' : 'Selected file is empty.');
        }
        if (target === 'general') {
          const gen = parseGeneralCsv(matrix, prefs.calendar, user?.username || 'system');
          if (gen.rows.length > 0) {
            const first = gen.rows[0];
            setGeneralResult({
              header: {
                packingListNo: first.packingListNo,
                arrivalDate: first.arrivalDate,
                supplier: first.supplier,
                dispatchLocation: first.dispatchLocation,
                employerEntryMinutesNo: first.employerEntryMinutesNo,
                mapnaEntryMinutesNo: first.mapnaEntryMinutesNo,
                releaseNo: first.releaseNo,
                releaseDate: first.releaseDate,
                billOfLadingNo: first.billOfLadingNo,
                vehicleNo: first.vehicleNo,
                weighbridgeWeight: first.weighbridgeWeight ?? undefined,
                freightCost: first.freightCost ?? undefined,
                driverName: first.driverName,
                island: first.island,
                system: first.system,
                subSystem: first.subSystem,
                unit: first.unit,
              },
              packages: gen.rows.map((r) => ({
                packageNo: r.packageNo,
                packageType: r.packageType,
                itemCount: r.itemCount ?? undefined,
                itemDescription: r.itemDescription,
                grossWeight: r.grossWeight ?? undefined,
                netWeight: r.netWeight ?? undefined,
                lengthCm: r.lengthCm ?? undefined,
                widthCm: r.widthCm ?? undefined,
                heightCm: r.heightCm ?? undefined,
              })),
            });
            return;
          }
          // Fallback to AI text parser for arbitrary spreadsheet layout
          const compactText = matrixToCsvText(matrix, 80);
          const aiRes = await apiRequest<{ result: GeneralAiExtractionResult }>('/api/ai/extract-equipment', {
            method: 'POST',
            body: JSON.stringify({ target: 'general', mode: 'file', lang: prefs.language, textData: compactText }),
          });
          setGeneralResult(aiRes.result);
        } else {
          const det = parseDetailedCsv(matrix, prefs.calendar, user?.username || 'system');
          if (det.rows.length > 0) {
            setDetailedResult({
              shipmentNo: det.rows[0].shipmentNo,
              packageNo: det.rows[0].packageNo,
              items: det.rows.map((r) => ({
                itemNo: r.itemNo,
                generalDescription: r.generalDescription,
                description: r.description,
                size: r.size,
                itemCode: r.itemCode,
                mtoRef: r.mtoRef,
                packingQty: r.packingQty ?? undefined,
                actualQty: r.actualQty ?? undefined,
                damagedQty: r.damagedQty ?? undefined,
                countingUnit: r.countingUnit,
                notes: r.notes,
              })),
            });
            return;
          }
          const compactText = matrixToCsvText(matrix, 80);
          const aiRes = await apiRequest<{ result: DetailedAiExtractionResult }>('/api/ai/extract-equipment', {
            method: 'POST',
            body: JSON.stringify({ target: 'detailed', mode: 'file', lang: prefs.language, textData: compactText }),
          });
          setDetailedResult(aiRes.result);
        }
      } else {
        // PDF / text / image uploaded via File tab
        const base64Data = await fileToBase64(file);
        const mimeType = file.type || (lower.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
        const res = await apiRequest<{ result: GeneralAiExtractionResult | DetailedAiExtractionResult }>(
          '/api/ai/extract-equipment',
          {
            method: 'POST',
            body: JSON.stringify({ target, mode: 'file', lang: prefs.language, mimeType, base64Data }),
          },
        );
        if (target === 'general') setGeneralResult(res.result as GeneralAiExtractionResult);
        else setDetailedResult(res.result as DetailedAiExtractionResult);
      }
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setProcessing(false);
    }
  };

  const handleScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setGeneralResult(null);
    setDetailedResult(null);
    setProcessing(true);

    try {
      const base64Data = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';
      const res = await apiRequest<{ result: GeneralAiExtractionResult | DetailedAiExtractionResult }>(
        '/api/ai/extract-equipment',
        {
          method: 'POST',
          body: JSON.stringify({ target, mode: 'scan', lang: prefs.language, mimeType, base64Data }),
        },
      );
      if (target === 'general') setGeneralResult(res.result as GeneralAiExtractionResult);
      else setDetailedResult(res.result as DetailedAiExtractionResult);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setProcessing(false);
    }
  };

  const startVoiceRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setProcessing(true);
        try {
          const base64Data = await fileToBase64(blob);
          const res = await apiRequest<{ result: GeneralAiExtractionResult | DetailedAiExtractionResult }>(
            '/api/ai/extract-equipment',
            {
              method: 'POST',
              body: JSON.stringify({
                target,
                mode: 'voice',
                lang: prefs.language,
                mimeType: blob.type || 'audio/webm',
                base64Data,
              }),
            },
          );
          if (target === 'general') setGeneralResult(res.result as GeneralAiExtractionResult);
          else setDetailedResult(res.result as DetailedAiExtractionResult);
        } catch (err) {
          setError(err instanceof ApiError || err instanceof Error ? err.message : 'Voice processing failed');
        } finally {
          setProcessing(false);
        }
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setError(
        isFa
          ? 'دسترسی به میکروفون امکان‌پذیر نیست. می‌توانید دستور متنی خود را در کادر زیر وارد کنید.'
          : 'Microphone access unavailable. You can type your command below instead.',
      );
    }
  };

  const stopVoiceRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
  };

  const handleVoiceTextSubmit = async () => {
    if (!voiceNoteText.trim()) return;
    setError('');
    setProcessing(true);
    try {
      const res = await apiRequest<{ result: GeneralAiExtractionResult | DetailedAiExtractionResult }>(
        '/api/ai/extract-equipment',
        {
          method: 'POST',
          body: JSON.stringify({
            target,
            mode: 'voice',
            lang: prefs.language,
            textData: voiceNoteText.trim(),
          }),
        },
      );
      if (target === 'general') setGeneralResult(res.result as GeneralAiExtractionResult);
      else setDetailedResult(res.result as DetailedAiExtractionResult);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">
              {isFa
                ? target === 'general'
                  ? 'ثبت خودکار پکینگ و تجهیزات کلی'
                  : 'ثبت خودکار تجهیزات جزئی'
                : target === 'general'
                  ? 'Smart General Equipment Registration'
                  : 'Smart Detailed Equipment Registration'}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {isFa
                ? 'بارگذاری فایل ورودی، اسکن اسناد (تصویر / PDF) یا صدور دستور صوتی'
                : 'File upload, document scan (image / PDF), or voice command intake'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode tabs */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => { setTab('file'); setError(''); }}
              className={`h-10 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                tab === 'file'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isFa ? 'بارگذاری فایل' : 'File Upload'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('scan'); setError(''); }}
              className={`h-10 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                tab === 'scan'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <ScanLine className="w-4 h-4" />
              <span>{isFa ? 'اسکن اسناد' : 'Document Scan'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('voice'); setError(''); }}
              className={`h-10 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                tab === 'voice'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>{isFa ? 'دستور صوتی' : 'Voice Command'}</span>
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs text-[var(--status-danger)]">
              {error}
            </div>
          )}

          {processing && (
            <div className="p-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex items-center justify-center gap-3 text-xs font-semibold text-[var(--accent-primary)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isFa ? 'در حال تحلیل و استخراج خودکار اطلاعات...' : 'Extracting equipment data...'}</span>
            </div>
          )}

          {!processing && tab === 'file' && (
            <label className="block p-6 rounded-xl border-2 border-dashed border-[var(--border-strong)] hover:border-[var(--accent-primary)] bg-[var(--bg-canvas)] text-center cursor-pointer space-y-2 transition-colors">
              <Upload className="w-7 h-7 mx-auto text-[var(--accent-primary)]" />
              <div className="text-xs font-semibold">
                {isFa
                  ? 'انتخاب فایل پکینگ لیست / تجهیزات (Excel، CSV، JSON، PDF)'
                  : 'Choose packing / equipment file (Excel, CSV, JSON, PDF)'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">.xlsx, .xls, .csv, .tsv, .json, .pdf</div>
              <input
                type="file"
                accept=".xlsx,.xls,.ods,.csv,.tsv,.json,.pdf,.txt"
                onChange={handleSpreadsheetOrFile}
                className="hidden"
              />
            </label>
          )}

          {!processing && tab === 'scan' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="p-5 rounded-xl border-2 border-dashed border-[var(--border-strong)] hover:border-[var(--accent-primary)] bg-[var(--bg-canvas)] text-center cursor-pointer space-y-2 transition-colors">
                <ScanLine className="w-7 h-7 mx-auto text-[var(--accent-primary)]" />
                <div className="text-xs font-semibold">
                  {isFa ? 'بارگذاری تصویر یا PDF سند / بارنامه / پکینگ' : 'Upload image or PDF document'}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">PNG, JPG, WEBP, PDF</div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleScanUpload}
                  className="hidden"
                />
              </label>

              <label className="p-5 rounded-xl border-2 border-dashed border-[var(--border-strong)] hover:border-[var(--accent-primary)] bg-[var(--bg-canvas)] text-center cursor-pointer space-y-2 transition-colors">
                <ScanLine className="w-7 h-7 mx-auto text-[var(--status-success)]" />
                <div className="text-xs font-semibold">
                  {isFa ? 'اسکن مستقیم با دوربین دستگاه' : 'Capture directly with camera'}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">{isFa ? 'موبایل / وب‌کم' : 'Camera'}</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleScanUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {!processing && tab === 'voice' && (
            <div className="space-y-3">
              <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-col items-center gap-3 text-center">
                <button
                  type="button"
                  onClick={recording ? stopVoiceRecording : startVoiceRecording}
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-md transition-all ${
                    recording ? 'bg-red-600 animate-pulse' : 'bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]'
                  }`}
                >
                  {recording ? <Square className="w-5 h-5" /> : <Mic className="w-6 h-6" />}
                </button>
                <div className="text-xs font-semibold">
                  {recording
                    ? isFa
                      ? `در حال ضبط دستور صوتی... (${recordSeconds.toLocaleString('fa-IR')} ثانیه) — برای اتمام کلیک کنید`
                      : `Recording voice command... (${recordSeconds}s) — click to stop`
                    : isFa
                      ? 'برای شروع دستور صوتی روی میکروفون کلیک کنید'
                      : 'Click the microphone to speak your equipment command'}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] max-w-md">
                  {isFa
                    ? 'مثال: «ثبت پکینگ ۸۰۰۱ از شرکت زیمنس ارسال از تهران، خودرو پلاک ۶۰ ایران ۹۸۵ ع ۱۴، یک صندوق چوبی ۵ تایی توربین بخار»'
                    : 'Example: "Register packing 8001 from Siemens Tehran, 1 Wooden Box with 5 steam turbine valves"'}
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={voiceNoteText}
                  onChange={(e) => setVoiceNoteText(e.target.value)}
                  placeholder={isFa ? 'یا متن دستور صوتی را اینجا بنویسید...' : 'Or type/dictate command text here...'}
                  className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                />
                <button
                  type="button"
                  onClick={handleVoiceTextSubmit}
                  disabled={!voiceNoteText.trim()}
                  className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
                >
                  {isFa ? 'استخراج' : 'Extract'}
                </button>
              </div>
            </div>
          )}

          {/* General Extraction Preview */}
          {generalResult && (
            <div className="p-4 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)]/40 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--status-success)]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isFa
                      ? `اطلاعات استخراج شد (${(generalResult.packages?.length || 0).toLocaleString('fa-IR')} نگله)`
                      : `Extracted (${generalResult.packages?.length || 0} package(s))`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onApplyGeneral?.(generalResult);
                    notify('success', isFa ? 'اطلاعات در فرم ثبت کلی اعمال شد.' : 'Applied to General registration form.');
                    onClose();
                  }}
                  className="h-8 px-4 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                >
                  {isFa ? 'اعمال خودکار در فرم' : 'Apply to Form'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-[var(--text-muted)]">{isFa ? 'پکینگ:' : 'Packing:'} </span>
                  <strong dir="ltr">{generalResult.header?.packingListNo || '-'}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">{isFa ? 'تأمین‌کننده:' : 'Supplier:'} </span>
                  <strong>{generalResult.header?.supplier || '-'}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">{isFa ? 'خودرو:' : 'Vehicle:'} </span>
                  <strong dir="ltr">{generalResult.header?.vehicleNo || '-'}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Extraction Preview */}
          {detailedResult && (
            <div className="p-4 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)]/40 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--status-success)]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isFa
                      ? `${(detailedResult.items?.length || 0).toLocaleString('fa-IR')} آیتم تجهیزات شناسایی شد`
                      : `${detailedResult.items?.length || 0} detailed item(s) detected`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {(detailedResult.items?.length || 0) > 1 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onApplyDetailed?.(detailedResult, 'save_all');
                        onClose();
                      }}
                      className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                    >
                      {isFa ? 'ثبت خودکار همه آیتم‌ها' : 'Auto-Save All Items'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onApplyDetailed?.(detailedResult, 'fill_first');
                      onClose();
                    }}
                    className="h-8 px-3.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-semibold"
                  >
                    {isFa ? 'پر کردن فرم' : 'Fill Form'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
