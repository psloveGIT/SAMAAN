import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Mic,
  ScanLine,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { parseDetailedCsv, parseGeneralCsv } from '../shared/csvParser.ts';
import { extractEquipmentOffline } from '../shared/smartExtractor.ts';
import { matrixToCsvText, parseSpreadsheetFile } from '../shared/spreadsheetImport.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';

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
    itemCategory?: '' | 'special_tools' | 'chemicals' | 'spare_parts';
    chemicalType?: string;
    productionDate?: string;
    expirationDate?: string;
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

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

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

function toOptionalNumber(v: number | null | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function normalizeRawResult(
  raw: unknown,
  target: 'general' | 'detailed',
): GeneralAiExtractionResult | DetailedAiExtractionResult {
  const obj = (raw || {}) as Record<string, unknown>;
  if (target === 'general') {
    if (obj.header && typeof obj.header === 'object') {
      return obj as unknown as GeneralAiExtractionResult;
    }
    const pkgs = Array.isArray(obj.packages)
      ? (obj.packages as Array<Record<string, unknown>>)
      : [];
    const firstPkg = pkgs[0] || {};
    return {
      header: {
        packingListNo: typeof obj.packingListNo === 'string' ? obj.packingListNo : undefined,
        arrivalDate: typeof obj.arrivalDate === 'string' ? obj.arrivalDate : undefined,
        supplier: typeof obj.supplier === 'string' ? obj.supplier : undefined,
        dispatchLocation: typeof obj.dispatchLocation === 'string' ? obj.dispatchLocation : undefined,
        employerEntryMinutesNo:
          typeof obj.employerEntryMinutesNo === 'string' ? obj.employerEntryMinutesNo : undefined,
        mapnaEntryMinutesNo:
          typeof obj.mapnaEntryMinutesNo === 'string' ? obj.mapnaEntryMinutesNo : undefined,
        releaseNo: typeof obj.releaseNo === 'string' ? obj.releaseNo : undefined,
        releaseDate: typeof obj.releaseDate === 'string' ? obj.releaseDate : undefined,
        billOfLadingNo: typeof obj.billOfLadingNo === 'string' ? obj.billOfLadingNo : undefined,
        vehicleNo: typeof obj.vehicleNo === 'string' ? obj.vehicleNo : undefined,
        weighbridgeWeight: toOptionalNumber(obj.weighbridgeWeight as number | null | undefined),
        freightCost: toOptionalNumber(obj.freightCost as number | null | undefined),
        driverName: typeof obj.driverName === 'string' ? obj.driverName : undefined,
        opiInvitationNo: typeof obj.opiInvitationNo === 'string' ? obj.opiInvitationNo : undefined,
        opiInvitationDate: typeof obj.opiInvitationDate === 'string' ? obj.opiInvitationDate : undefined,
        island: typeof firstPkg.island === 'string' ? firstPkg.island : undefined,
        system: typeof firstPkg.system === 'string' ? firstPkg.system : undefined,
        subSystem: typeof firstPkg.subSystem === 'string' ? firstPkg.subSystem : undefined,
        unit: typeof firstPkg.unit === 'string' ? firstPkg.unit : undefined,
      },
      packages: pkgs.map((p) => ({
        packageNo: typeof p.packageNo === 'string' ? p.packageNo : undefined,
        packageType: typeof p.packageType === 'string' ? p.packageType : undefined,
        itemCount: toOptionalNumber(p.itemCount as number | null | undefined),
        itemDescription: typeof p.itemDescription === 'string' ? p.itemDescription : undefined,
        grossWeight: toOptionalNumber(p.grossWeight as number | null | undefined),
        netWeight: toOptionalNumber(p.netWeight as number | null | undefined),
        lengthCm: toOptionalNumber(p.lengthCm as number | null | undefined),
        widthCm: toOptionalNumber(p.widthCm as number | null | undefined),
        heightCm: toOptionalNumber(p.heightCm as number | null | undefined),
      })),
      transcript: typeof obj.transcript === 'string'
        ? obj.transcript
        : typeof obj.summary === 'string'
          ? obj.summary
          : undefined,
    };
  }

  const items = Array.isArray(obj.items) ? (obj.items as Array<Record<string, unknown>>) : [];
  return {
    shipmentNo: typeof obj.shipmentNo === 'string' ? obj.shipmentNo : undefined,
    packageNo: typeof obj.packageNo === 'string' ? obj.packageNo : undefined,
    transcript: typeof obj.transcript === 'string'
      ? obj.transcript
      : typeof obj.summary === 'string'
        ? obj.summary
        : undefined,
    items: items.map((item) => ({
      itemNo: typeof item.itemNo === 'string' ? item.itemNo : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      generalDescription:
        typeof item.generalDescription === 'string' ? item.generalDescription : undefined,
      itemCode: typeof item.itemCode === 'string' ? item.itemCode : undefined,
      size: typeof item.size === 'string' ? item.size : undefined,
      packingQty: toOptionalNumber(item.packingQty as number | null | undefined),
      actualQty: toOptionalNumber(item.actualQty as number | null | undefined),
      damagedQty: toOptionalNumber(item.damagedQty as number | null | undefined),
      countingUnit: typeof item.countingUnit === 'string' ? item.countingUnit : undefined,
      itemCategory:
        item.itemCategory === 'special_tools' ||
        item.itemCategory === 'chemicals' ||
        item.itemCategory === 'spare_parts'
          ? item.itemCategory
          : '',
      chemicalType: typeof item.chemicalType === 'string' ? item.chemicalType : undefined,
      productionDate: typeof item.productionDate === 'string' ? item.productionDate : undefined,
      expirationDate: typeof item.expirationDate === 'string' ? item.expirationDate : undefined,
      notes: typeof item.notes === 'string' ? item.notes : undefined,
    })),
  };
}

async function runExtractionWithFallback(payload: {
  target: 'general' | 'detailed';
  mode: 'file' | 'scan' | 'voice';
  lang: 'fa' | 'en';
  mimeType?: string;
  base64Data?: string;
  textData?: string;
}): Promise<GeneralAiExtractionResult | DetailedAiExtractionResult> {
  try {
    const res = await apiRequest<{ result: unknown }>('/api/ai/extract-equipment', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeRawResult(res.result, payload.target);
  } catch {
    const offline = extractEquipmentOffline(payload);
    return normalizeRawResult(offline, payload.target);
  }
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

  // Voice recording & live speech recognition state
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voiceNoteText, setVoiceNoteText] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (speechRef.current) {
        try {
          speechRef.current.stop();
        } catch {
          // ignore
        }
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

  const ensureGeneralDefaults = (res: GeneralAiExtractionResult): GeneralAiExtractionResult => ({
    ...res,
    header: res.header || {},
    packages:
      res.packages && res.packages.length > 0
        ? res.packages
        : [{ packageNo: '', packageType: '', itemCount: 1, itemDescription: '' }],
  });

  const ensureDetailedDefaults = (res: DetailedAiExtractionResult): DetailedAiExtractionResult => ({
    ...res,
    shipmentNo: res.shipmentNo || '',
    packageNo: res.packageNo || '',
    items:
      res.items && res.items.length > 0
        ? res.items
        : [{ itemNo: '1', description: '', generalDescription: '', packingQty: 1, countingUnit: 'PC', itemCategory: '' }],
  });

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
            setGeneralResult(
              ensureGeneralDefaults({
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
              }),
            );
            return;
          }
          const compactText = matrixToCsvText(matrix, 80);
          const aiRes = await runExtractionWithFallback({
            target: 'general',
            mode: 'file',
            lang: prefs.language,
            textData: compactText,
          });
          setGeneralResult(ensureGeneralDefaults(aiRes as GeneralAiExtractionResult));
        } else {
          const det = parseDetailedCsv(matrix, prefs.calendar, user?.username || 'system');
          if (det.rows.length > 0) {
            setDetailedResult(
              ensureDetailedDefaults({
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
                  itemCategory: r.itemCategory || '',
                  chemicalType: r.chemicalType || '',
                  productionDate: r.productionDate || '',
                  expirationDate: r.expirationDate || '',
                  notes: r.notes,
                })),
              }),
            );
            return;
          }
          const compactText = matrixToCsvText(matrix, 80);
          const aiRes = await runExtractionWithFallback({
            target: 'detailed',
            mode: 'file',
            lang: prefs.language,
            textData: compactText,
          });
          setDetailedResult(ensureDetailedDefaults(aiRes as DetailedAiExtractionResult));
        }
      } else {
        const isText = lower.endsWith('.txt');
        if (isText) {
          const textData = await file.text();
          const res = await runExtractionWithFallback({
            target,
            mode: 'file',
            lang: prefs.language,
            textData,
          });
          if (target === 'general') setGeneralResult(ensureGeneralDefaults(res as GeneralAiExtractionResult));
          else setDetailedResult(ensureDetailedDefaults(res as DetailedAiExtractionResult));
        } else {
          const base64Data = await fileToBase64(file);
          const mimeType = file.type || (lower.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
          const res = await runExtractionWithFallback({
            target,
            mode: 'file',
            lang: prefs.language,
            mimeType,
            base64Data,
          });
          if (target === 'general') setGeneralResult(ensureGeneralDefaults(res as GeneralAiExtractionResult));
          else setDetailedResult(ensureDetailedDefaults(res as DetailedAiExtractionResult));
        }
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
      const res = await runExtractionWithFallback({
        target,
        mode: 'scan',
        lang: prefs.language,
        mimeType,
        base64Data,
      });
      if (target === 'general') setGeneralResult(ensureGeneralDefaults(res as GeneralAiExtractionResult));
      else setDetailedResult(ensureDetailedDefaults(res as DetailedAiExtractionResult));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setProcessing(false);
    }
  };

  const startVoiceRecording = async () => {
    setError('');
    const SpeechCtor = getSpeechRecognitionCtor();
    if (SpeechCtor) {
      try {
        const sr = new SpeechCtor();
        sr.lang = isFa ? 'fa-IR' : 'en-US';
        sr.continuous = true;
        sr.interimResults = true;
        let finalTranscript = voiceNoteText ? `${voiceNoteText.trim()} ` : '';
        sr.onresult = (ev) => {
          let combined = '';
          for (let i = 0; i < ev.results.length; i += 1) {
            combined += `${ev.results[i][0]?.transcript || ''} `;
          }
          setVoiceNoteText(`${finalTranscript}${combined}`.replace(/\s+/g, ' ').trim());
        };
        sr.onerror = () => {};
        sr.onend = () => {
          setRecording(false);
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
        };
        speechRef.current = sr;
        sr.start();
        setRecording(true);
        setRecordSeconds(0);
        timerRef.current = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
        return;
      } catch {
        // Fallback to MediaRecorder
      }
    }

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
          const res = await runExtractionWithFallback({
            target,
            mode: 'voice',
            lang: prefs.language,
            mimeType: blob.type || 'audio/webm',
            base64Data,
            textData: voiceNoteText.trim() || undefined,
          });
          if (target === 'general') setGeneralResult(ensureGeneralDefaults(res as GeneralAiExtractionResult));
          else setDetailedResult(ensureDetailedDefaults(res as DetailedAiExtractionResult));
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
    if (speechRef.current) {
      try {
        speechRef.current.stop();
      } catch {
        // ignore
      }
      speechRef.current = null;
    }
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
      const res = await runExtractionWithFallback({
        target,
        mode: 'voice',
        lang: prefs.language,
        textData: voiceNoteText.trim(),
      });
      if (target === 'general') setGeneralResult(ensureGeneralDefaults(res as GeneralAiExtractionResult));
      else setDetailedResult(ensureDetailedDefaults(res as DetailedAiExtractionResult));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setProcessing(false);
    }
  };

  const updateGenHeader = (patch: Partial<NonNullable<GeneralAiExtractionResult['header']>>) => {
    setGeneralResult((prev) =>
      prev ? { ...prev, header: { ...(prev.header || {}), ...patch } } : prev,
    );
  };

  const updateGenPackage = (
    idx: number,
    patch: Partial<NonNullable<GeneralAiExtractionResult['packages']>[number]>,
  ) => {
    setGeneralResult((prev) => {
      if (!prev) return prev;
      const pkgs = [...(prev.packages || [])];
      pkgs[idx] = { ...(pkgs[idx] || {}), ...patch };
      return { ...prev, packages: pkgs };
    });
  };

  const updateDetItem = (
    idx: number,
    patch: Partial<NonNullable<DetailedAiExtractionResult['items']>[number]>,
  ) => {
    setDetailedResult((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      items[idx] = { ...(items[idx] || {}), ...patch };
      return { ...prev, items };
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
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
                ? 'بارگذاری فایل ورودی، اسکن اسناد (تصویر / PDF) یا صدور دستور صوتی به همراه فرم تایید و تکمیل دستی (قابل استفاده به صورت آفلاین)'
                : 'File upload, document scan, or voice command intake with interactive review & completion form (works offline)'}
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

        <div className="p-5 overflow-y-auto space-y-4">
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
                  ? 'انتخاب فایل پکینگ لیست / تجهیزات (Excel، CSV، JSON، PDF، متن)'
                  : 'Choose packing / equipment file (Excel, CSV, JSON, PDF, TXT)'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">.xlsx, .xls, .csv, .tsv, .json, .pdf, .txt</div>
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
                      ? `در حال گوش دادن / ضبط دستور صوتی... (${recordSeconds.toLocaleString('fa-IR')} ثانیه) — برای اتمام کلیک کنید`
                      : `Listening / recording... (${recordSeconds}s) — click to stop`
                    : isFa
                      ? 'برای شروع دستور صوتی روی میکروفون کلیک کنید'
                      : 'Click the microphone to speak your equipment command'}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] max-w-md">
                  {isFa
                    ? 'مثال: «ثبت پکینگ 8001 از شرکت زیمنس ارسال از تهران، خودرو 60 ایران 985 ع 14، نگله P1 صندوق چوبی 5 قلم توربین بخار»'
                    : 'Example: "Register packing 8001 from Siemens dispatch Tehran, package P1 Wooden Box 5 steam turbine valves"'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  rows={2}
                  value={voiceNoteText}
                  onChange={(e) => setVoiceNoteText(e.target.value)}
                  placeholder={isFa ? 'متن تشخیص داده‌شده از صدا یا دستور متنی خود را اینجا مشاهده و اصلاح کنید...' : 'Speech transcript / manual text command...'}
                  className="flex-1 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                />
                <button
                  type="button"
                  onClick={handleVoiceTextSubmit}
                  disabled={!voiceNoteText.trim()}
                  className="h-10 sm:h-auto px-4 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
                >
                  {isFa ? 'تحلیل و پیش‌نمایش' : 'Parse & Review'}
                </button>
              </div>
            </div>
          )}

          {/* General Extraction Interactive Review & Manual Completion Form */}
          {generalResult && (
            <div className="p-4 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)]/30 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--status-success)]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isFa
                      ? `تایید و تکمیل دستی فیلدهای استخراج‌شده (${(generalResult.packages?.length || 0).toLocaleString('fa-IR')} نگله)`
                      : `Review & Complete Extracted General Data (${generalResult.packages?.length || 0} package(s))`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onApplyGeneral?.(generalResult);
                    notify('success', isFa ? 'اطلاعات تاییدشده در فرم ثبت کلی اعمال شد.' : 'Applied to General form.');
                    onClose();
                  }}
                  className="h-8 px-4 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                >
                  {isFa ? 'تأیید و اعمال در فرم' : 'Confirm & Apply to Form'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'شماره پکینگ لیست *' : 'Packing List No. *'}
                  </label>
                  <input
                    type="text"
                    value={generalResult.header?.packingListNo || ''}
                    onChange={(e) => updateGenHeader({ packingListNo: e.target.value })}
                    className={`w-full h-8 px-2.5 rounded border bg-[var(--bg-surface)] tabular-nums ${
                      !generalResult.header?.packingListNo
                        ? 'border-[var(--status-warning)]'
                        : 'border-[var(--border-subtle)]'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'تأمین‌کننده *' : 'Supplier *'}
                  </label>
                  <input
                    type="text"
                    value={generalResult.header?.supplier || ''}
                    onChange={(e) => updateGenHeader({ supplier: e.target.value })}
                    className={`w-full h-8 px-2.5 rounded border bg-[var(--bg-surface)] ${
                      !generalResult.header?.supplier
                        ? 'border-[var(--status-warning)]'
                        : 'border-[var(--border-subtle)]'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'محل ارسال *' : 'Dispatch Location *'}
                  </label>
                  <input
                    type="text"
                    value={generalResult.header?.dispatchLocation || ''}
                    onChange={(e) => updateGenHeader({ dispatchLocation: e.target.value })}
                    className={`w-full h-8 px-2.5 rounded border bg-[var(--bg-surface)] ${
                      !generalResult.header?.dispatchLocation
                        ? 'border-[var(--status-warning)]'
                        : 'border-[var(--border-subtle)]'
                    }`}
                  />
                </div>
                <div>
                  <JalaliDateInput
                    label={isFa ? 'تاریخ ورود' : 'Arrival Date'}
                    value={generalResult.header?.arrivalDate || ''}
                    onChange={(v) => updateGenHeader({ arrivalDate: v })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'شماره خودرو' : 'Vehicle No.'}
                  </label>
                  <input
                    type="text"
                    value={generalResult.header?.vehicleNo || ''}
                    onChange={(e) => updateGenHeader({ vehicleNo: e.target.value })}
                    className="w-full h-8 px-2.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'جزیره' : 'Island'}
                  </label>
                  <input
                    type="text"
                    value={generalResult.header?.island || ''}
                    onChange={(e) => updateGenHeader({ island: e.target.value })}
                    className="w-full h-8 px-2.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'سیستم' : 'System'}
                  </label>
                  <input
                    type="text"
                    value={generalResult.header?.system || ''}
                    onChange={(e) => updateGenHeader({ system: e.target.value })}
                    className="w-full h-8 px-2.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'شماره بارنامه' : 'Waybill No.'}
                  </label>
                  <input
                    type="text"
                    value={generalResult.header?.billOfLadingNo || ''}
                    onChange={(e) => updateGenHeader({ billOfLadingNo: e.target.value })}
                    className="w-full h-8 px-2.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  />
                </div>
              </div>

              {(generalResult.packages || []).length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {generalResult.packages!.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] grid grid-cols-1 sm:grid-cols-5 gap-2 text-[11px]"
                    >
                      <input
                        type="text"
                        value={p.packageNo || ''}
                        onChange={(e) => updateGenPackage(idx, { packageNo: e.target.value })}
                        placeholder={isFa ? 'شماره نگله *' : 'Package No. *'}
                        className={`h-8 px-2 rounded border ${
                          !p.packageNo ? 'border-[var(--status-warning)]' : 'border-[var(--border-subtle)]'
                        }`}
                      />
                      <input
                        type="text"
                        value={p.packageType || ''}
                        onChange={(e) => updateGenPackage(idx, { packageType: e.target.value })}
                        placeholder={isFa ? 'نوع بسته‌بندی *' : 'Package Type *'}
                        className={`h-8 px-2 rounded border ${
                          !p.packageType ? 'border-[var(--status-warning)]' : 'border-[var(--border-subtle)]'
                        }`}
                      />
                      <input
                        type="number"
                        value={p.itemCount ?? ''}
                        onChange={(e) =>
                          updateGenPackage(idx, { itemCount: e.target.value ? Number(e.target.value) : undefined })
                        }
                        placeholder={isFa ? 'تعداد اقلام *' : 'Count *'}
                        className="h-8 px-2 rounded border border-[var(--border-subtle)]"
                      />
                      <input
                        type="text"
                        value={p.itemDescription || ''}
                        onChange={(e) => updateGenPackage(idx, { itemDescription: e.target.value })}
                        placeholder={isFa ? 'شرح کالا *' : 'Description *'}
                        className={`sm:col-span-2 h-8 px-2 rounded border ${
                          !p.itemDescription ? 'border-[var(--status-warning)]' : 'border-[var(--border-subtle)]'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Detailed Extraction Interactive Review & Manual Completion Form */}
          {detailedResult && (
            <div className="p-4 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)]/30 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--status-success)]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isFa
                      ? `تایید و تکمیل دستی اقلام استخراج‌شده (${(detailedResult.items?.length || 0).toLocaleString('fa-IR')} قلم)`
                      : `Review & Complete Detailed Items (${detailedResult.items?.length || 0} item(s))`}
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
                      {isFa ? 'تأیید و ثبت خودکار همه' : 'Confirm & Save All'}
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
                    {isFa ? 'تأیید و پر کردن فرم' : 'Confirm & Fill Form'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'شماره پکینگ / محموله *' : 'Shipment / Packing No. *'}
                  </label>
                  <input
                    type="text"
                    value={detailedResult.shipmentNo || ''}
                    onChange={(e) => setDetailedResult((prev) => (prev ? { ...prev, shipmentNo: e.target.value } : prev))}
                    className={`w-full h-8 px-2.5 rounded border bg-[var(--bg-surface)] tabular-nums ${
                      !detailedResult.shipmentNo ? 'border-[var(--status-warning)]' : 'border-[var(--border-subtle)]'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-secondary)] mb-0.5">
                    {isFa ? 'شماره نگله' : 'Package No.'}
                  </label>
                  <input
                    type="text"
                    value={detailedResult.packageNo || ''}
                    onChange={(e) => setDetailedResult((prev) => (prev ? { ...prev, packageNo: e.target.value } : prev))}
                    className="w-full h-8 px-2.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(detailedResult.items || []).map((it, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] grid grid-cols-1 sm:grid-cols-6 gap-2 text-[11px] items-center"
                  >
                    <input
                      type="text"
                      value={it.itemNo || ''}
                      onChange={(e) => updateDetItem(idx, { itemNo: e.target.value })}
                      placeholder={isFa ? 'شماره آیتم' : 'Item No.'}
                      className="h-8 px-2 rounded border border-[var(--border-subtle)]"
                    />
                    <input
                      type="text"
                      value={it.generalDescription || ''}
                      onChange={(e) => updateDetItem(idx, { generalDescription: e.target.value })}
                      placeholder={isFa ? 'شرح کلی' : 'General Desc.'}
                      className="h-8 px-2 rounded border border-[var(--border-subtle)]"
                    />
                    <input
                      type="text"
                      value={it.description || ''}
                      onChange={(e) => updateDetItem(idx, { description: e.target.value })}
                      placeholder={isFa ? 'شرح *' : 'Description *'}
                      className={`sm:col-span-2 h-8 px-2 rounded border ${
                        !it.description ? 'border-[var(--status-warning)]' : 'border-[var(--border-subtle)]'
                      }`}
                    />
                    <input
                      type="number"
                      step="any"
                      value={it.packingQty ?? ''}
                      onChange={(e) =>
                        updateDetItem(idx, { packingQty: e.target.value ? Number(e.target.value) : undefined })
                      }
                      placeholder={isFa ? 'تعداد *' : 'Qty *'}
                      className="h-8 px-2 rounded border border-[var(--border-subtle)]"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={it.countingUnit || ''}
                        onChange={(e) => updateDetItem(idx, { countingUnit: e.target.value })}
                        placeholder="PC"
                        className="flex-1 h-8 px-2 rounded border border-[var(--border-subtle)]"
                      />
                      {(detailedResult.items?.length || 0) > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDetailedResult((prev) =>
                              prev ? { ...prev, items: (prev.items || []).filter((_, i) => i !== idx) } : prev,
                            )
                          }
                          className="p-1.5 rounded text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
