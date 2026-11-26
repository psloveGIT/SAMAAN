import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Mail,
  Paperclip,
  Send,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { APP_VERSION } from '../shared/appVersion.ts';
import { isBuiltInEmployerId, type ResolvedEmployerProfile } from '../shared/employers.ts';
import {
  OPERATIONAL_FORM_SECTIONS,
  type OperationalFormSectionKey,
} from '../shared/formAccess.ts';
import type {
  DeveloperEmployerRequest,
  DeveloperRequestAttachment,
} from '../shared/types.ts';

const ALLOWED_EXTENSIONS = [
  '.xlsx',
  '.xls',
  '.xlsm',
  '.csv',
  '.docx',
  '.doc',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.txt',
];
const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const idx = res.indexOf('base64,');
      resolve(idx >= 0 ? res.slice(idx + 7) : res);
    };
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number, isFa: boolean): string {
  if (bytes < 1024) return isFa ? `${bytes} بایت` : `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadAttachmentSafely(att: DeveloperRequestAttachment): void {
  try {
    const binary = atob(att.dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.fileName.replace(/[/\\:*?"<>|]/g, '_') || 'attachment.bin';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    // ignore malformed base64
  }
}

export interface DeveloperFormRequestPanelProps {
  defaultRequestType?: 'missing_form' | 'new_employer';
  defaultEmployer?: Pick<ResolvedEmployerProfile, 'id' | 'nameFa' | 'shortName'> | null;
  defaultSectionKey?: OperationalFormSectionKey | null;
  compact?: boolean;
  onSubmitted?: (req: DeveloperEmployerRequest) => void;
}

export const DeveloperFormRequestPanel: React.FC<DeveloperFormRequestPanelProps> = ({
  defaultRequestType = 'missing_form',
  defaultEmployer = null,
  defaultSectionKey = null,
  compact = false,
  onSubmitted,
}) => {
  const { prefs, user, activeProject, activeEmployer, employers, notify, formatDate } = useApp();
  const isFa = prefs.language === 'fa';

  const builtInEmployers = useMemo(
    () => employers.filter((e) => e.isBuiltIn || isBuiltInEmployerId(e.id)),
    [employers],
  );

  const [requestType, setRequestType] = useState<'missing_form' | 'new_employer'>(defaultRequestType);
  const [targetEmployerId, setTargetEmployerId] = useState<string>(
    () => defaultEmployer?.id || activeEmployer?.id || builtInEmployers[0]?.id || 'mapna-md1',
  );
  const [selectedSections, setSelectedSections] = useState<string[]>(() =>
    defaultSectionKey ? [defaultSectionKey] : [],
  );

  const [requesterName, setRequesterName] = useState<string>(() => user?.fullName || '');
  const [requesterRole, setRequesterRole] = useState<string>('');
  const [requesterPhone, setRequesterPhone] = useState<string>('');
  const [requesterEmail, setRequesterEmail] = useState<string>('');
  const [projectName, setProjectName] = useState<string>(() => activeProject?.name || '');

  // New employer fields
  const [newEmployerNameFa, setNewEmployerNameFa] = useState('');
  const [newEmployerNameEn, setNewEmployerNameEn] = useState('');
  const [newEmployerShortName, setNewEmployerShortName] = useState('');
  const [newEmployerAddress, setNewEmployerAddress] = useState('');
  const [newEmployerPhone, setNewEmployerPhone] = useState('');
  const [newEmployerFax, setNewEmployerFax] = useState('');
  const [newEmployerPostalCode, setNewEmployerPostalCode] = useState('');
  const [newEmployerEmail, setNewEmployerEmail] = useState('');
  const [newEmployerSocials, setNewEmployerSocials] = useState('');

  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<DeveloperRequestAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<DeveloperEmployerRequest | null>(null);

  // History inbox (authenticated users)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<DeveloperEmployerRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    setRequestType(defaultRequestType);
  }, [defaultRequestType]);

  useEffect(() => {
    if (defaultEmployer?.id) {
      setTargetEmployerId(defaultEmployer.id);
    }
  }, [defaultEmployer?.id]);

  useEffect(() => {
    if (defaultSectionKey) {
      setSelectedSections((prev) =>
        prev.includes(defaultSectionKey) ? prev : [defaultSectionKey, ...prev],
      );
    }
  }, [defaultSectionKey]);

  useEffect(() => {
    if (user?.fullName && !requesterName) {
      setRequesterName(user.fullName);
    }
  }, [user?.fullName, requesterName]);

  useEffect(() => {
    if (activeProject?.name && !projectName) {
      setProjectName(activeProject.name);
    }
  }, [activeProject?.name, projectName]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const res = await apiRequest<{ requests: DeveloperEmployerRequest[] }>('/api/employer-requests');
      setHistoryList(res.requests || []);
    } catch {
      // ignore quietly
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  useEffect(() => {
    if (historyOpen && user) {
      void loadHistory();
    }
  }, [historyOpen, user, loadHistory]);

  const toggleSection = (key: string) => {
    setSelectedSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleAttachFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    if (remainingSlots <= 0) {
      notify(
        'warning',
        isFa
          ? `حداکثر ${MAX_ATTACHMENTS} فایل می‌توانید پیوست کنید.`
          : `You can attach up to ${MAX_ATTACHMENTS} files.`,
      );
      return;
    }

    const toProcess = files.slice(0, remainingSlots);
    const added: DeveloperRequestAttachment[] = [];

    for (const file of toProcess) {
      if (!hasAllowedExtension(file.name)) {
        notify(
          'error',
          isFa
            ? `فرمت فایل «${file.name}» مجاز نیست. فرمت‌های مجاز: اکسل، ورد، PDF، تصویر یا متن.`
            : `File "${file.name}" has an unsupported format.`,
        );
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        notify(
          'warning',
          isFa
            ? `حجم فایل «${file.name}» بیش از ۴ مگابایت است.`
            : `File "${file.name}" exceeds 4MB.`,
        );
        continue;
      }
      try {
        const dataBase64 = await readFileAsBase64(file);
        added.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          dataBase64,
        });
      } catch {
        notify(
          'error',
          isFa ? `خواندن فایل «${file.name}» ناموفق بود.` : `Failed to read "${file.name}".`,
        );
      }
    }

    if (added.length > 0) {
      setAttachments((prev) => [...prev, ...added]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const selectedBuiltInEmployer = useMemo(
    () => builtInEmployers.find((e) => e.id === targetEmployerId) || builtInEmployers[0],
    [builtInEmployers, targetEmployerId],
  );

  const buildPayload = () => {
    const employerName =
      requestType === 'missing_form'
        ? selectedBuiltInEmployer
          ? `${selectedBuiltInEmployer.nameFa} (${selectedBuiltInEmployer.shortName})`
          : targetEmployerId
        : newEmployerNameFa.trim();

    return {
      requestType,
      targetEmployerId: requestType === 'missing_form' ? targetEmployerId : undefined,
      targetEmployerName: employerName || undefined,
      sectionKeys: selectedSections,
      requesterName: requesterName.trim(),
      requesterRole: requesterRole.trim() || undefined,
      requesterPhone: requesterPhone.trim(),
      requesterEmail: requesterEmail.trim() || undefined,
      projectName: projectName.trim() || undefined,
      newEmployerNameFa: requestType === 'new_employer' ? newEmployerNameFa.trim() : undefined,
      newEmployerNameEn: requestType === 'new_employer' ? newEmployerNameEn.trim() || undefined : undefined,
      newEmployerShortName: requestType === 'new_employer' ? newEmployerShortName.trim() || undefined : undefined,
      newEmployerAddress: requestType === 'new_employer' ? newEmployerAddress.trim() || undefined : undefined,
      newEmployerPhone: requestType === 'new_employer' ? newEmployerPhone.trim() || undefined : undefined,
      newEmployerFax: requestType === 'new_employer' ? newEmployerFax.trim() || undefined : undefined,
      newEmployerPostalCode: requestType === 'new_employer' ? newEmployerPostalCode.trim() || undefined : undefined,
      newEmployerEmail: requestType === 'new_employer' ? newEmployerEmail.trim() || undefined : undefined,
      newEmployerSocials: requestType === 'new_employer' ? newEmployerSocials.trim() || undefined : undefined,
      description: description.trim() || undefined,
      attachments,
      appVersion: APP_VERSION,
    };
  };

  const validateBeforeSubmit = (): boolean => {
    if (!requesterName.trim()) {
      notify('error', isFa ? 'لطفاً نام و نام خانوادگی خود را وارد کنید.' : 'Please enter your full name.');
      return false;
    }
    if (!requesterPhone.trim()) {
      notify('error', isFa ? 'لطفاً شماره تماس خود را وارد کنید.' : 'Please enter your contact phone.');
      return false;
    }
    if (requestType === 'new_employer' && !newEmployerNameFa.trim()) {
      notify('error', isFa ? 'لطفاً نام فارسی کارفرمای جدید را وارد کنید.' : 'Please enter the new employer name.');
      return false;
    }
    if (selectedSections.length === 0 && requestType === 'missing_form') {
      notify(
        'error',
        isFa ? 'لطفاً حداقل یک بخش/فرم مورد نیاز را انتخاب کنید.' : 'Please select at least one form section.',
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateBeforeSubmit()) return;

    setSubmitting(true);
    try {
      const payload = buildPayload();
      const res = await apiRequest<{ ok: boolean; request: DeveloperEmployerRequest }>(
        '/api/employer-requests',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setLastSubmitted(res.request);
      if (user) {
        setHistoryList((prev) => [res.request, ...prev.filter((r) => r.id !== res.request.id)]);
      }
      setAttachments([]);
      setDescription('');
      notify(
        'success',
        isFa
          ? 'درخواست و فایل‌های شما به‌صورت خودکار و داخلی برای سازنده سامانه ارسال شد.'
          : 'Your request and attached files were delivered internally to the developer.',
      );
      onSubmitted?.(res.request);
    } catch (err) {
      notify(
        'error',
        err instanceof ApiError
          ? err.message
          : isFa
            ? 'ارسال درخواست ناموفق بود. می‌توانید فایل پکیج درخواست را دانلود کرده و مجدداً تلاش کنید.'
            : 'Failed to submit request. You can download the request bundle and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadBundle = () => {
    const payload = buildPayload();
    const bundle = {
      exportedAt: new Date().toISOString(),
      ...payload,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `samaan-employer-form-request-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify(
      'info',
      isFa
        ? 'پکیج درخواست و فایل‌های پیوست با فرمت JSON دانلود شد.'
        : 'Request bundle JSON downloaded.',
    );
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await apiRequest(`/api/employer-requests/${id}`, { method: 'DELETE' });
      setHistoryList((prev) => prev.filter((r) => r.id !== id));
      notify('success', isFa ? 'درخواست از فهرست حذف شد.' : 'Request deleted.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  return (
    <div
      data-testid="developer-form-request-panel"
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden ${
        compact ? '' : 'shadow-sm'
      }`}
    >
      {/* Top Contact Intro Header */}
      <div className="px-4 sm:px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-primary)]/20 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
              {isFa
                ? 'ارتباط با سازنده برنامه — درخواست تعریف کارفرما و ارسال فرم‌ها'
                : 'Contact Developer — Request New Employer or Official Forms'}
            </h3>
            <p className="text-[11.5px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
              {isFa
                ? 'فرم‌های هر کارفرما به‌صورت دقیق و استاندارد توسط سازنده برنامه پیاده‌سازی می‌شوند. مشخصات کارفرما و فایل فرم‌های مورد نظر خود را ارسال کنید تا در نسخه بعدی به سامانه اضافه گردد.'
                : 'Employer forms are engineered natively by the developer to guarantee exact print layout and stock automation. Submit employer details and template files below.'}
            </p>
          </div>
        </div>

        <span className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1.5 shrink-0">
          <Mail className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>{isFa ? 'ارسال خودکار و داخلی به سازنده' : 'Internal Delivery to Developer'}</span>
        </span>
      </div>

      {/* Submission Confirmation Banner */}
      {lastSubmitted && (
        <div
          data-testid="dev-request-success-banner"
          className="mx-4 sm:mx-5 mt-4 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {isFa
                ? `درخواست شما با کد پیگیری ${lastSubmitted.id.slice(-8).toUpperCase()} ثبت شد.`
                : `Your request (Ref: ${lastSubmitted.id.slice(-8).toUpperCase()}) has been recorded.`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setLastSubmitted(null)}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {isFa ? 'بستن پیام' : 'Dismiss'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-5">
        {/* Request Type Toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            data-testid="dev-req-type-missing-form"
            onClick={() => setRequestType('missing_form')}
            className={`p-3 rounded-xl border text-start transition-colors flex items-start gap-2.5 ${
              requestType === 'missing_form'
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <FileText
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                requestType === 'missing_form' ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
              }`}
            />
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {isFa ? 'ارسال فرم برای کارفرمای پیش‌فرض' : 'Send Forms for Built-in Employer'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {isFa
                  ? 'افزودن فرم بخش‌های قفل‌شده برای مپنا توسعه ۱، ۲ یا ۳'
                  : 'Add official forms for MAPNA MD1, MD2, or MD3'}
              </div>
            </div>
          </button>

          <button
            type="button"
            data-testid="dev-req-type-new-employer"
            onClick={() => setRequestType('new_employer')}
            className={`p-3 rounded-xl border text-start transition-colors flex items-start gap-2.5 ${
              requestType === 'new_employer'
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Building2
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                requestType === 'new_employer' ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
              }`}
            />
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {isFa ? 'درخواست تعریف کارفرمای جدید و ارسال فرم‌ها' : 'Request New Employer & Submit Forms'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {isFa
                  ? 'ارسال مشخصات شرکت کارفرمای جدید، لوگو و فرم‌های رسمی آن'
                  : 'Send new employer corporate details, logo, and templates'}
              </div>
            </div>
          </button>
        </div>

        {/* Target Built-in Employer OR New Employer Profile */}
        {requestType === 'missing_form' ? (
          <div className="space-y-2">
            <label
              htmlFor="dev-req-target-employer"
              className="block text-xs font-bold text-[var(--text-primary)]"
            >
              {isFa ? 'کارفرمای پیش‌فرض مورد نظر *' : 'Target Built-in Employer *'}
            </label>
            <select
              id="dev-req-target-employer"
              data-testid="dev-req-target-employer"
              value={targetEmployerId}
              onChange={(e) => setTargetEmployerId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            >
              {builtInEmployers.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nameFa} {emp.shortName ? `(${emp.shortName})` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/45 space-y-3">
            <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{isFa ? 'مشخصات کارفرمای جدید درخواستی' : 'Requested New Employer Details'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'نام فارسی کارفرما *' : 'Employer Name (Persian) *'}
                </label>
                <input
                  type="text"
                  data-testid="dev-req-new-emp-name-fa"
                  value={newEmployerNameFa}
                  onChange={(e) => setNewEmployerNameFa(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'نام انگلیسی (اختیاری)' : 'English Name (Optional)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newEmployerNameEn}
                  onChange={(e) => setNewEmployerNameEn(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'نام اختصاری (مثل MD4)' : 'Short Code (e.g. MD4)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newEmployerShortName}
                  onChange={(e) => setNewEmployerShortName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'آدرس کامل شرکت' : 'Company Address'}
                </label>
                <input
                  type="text"
                  value={newEmployerAddress}
                  onChange={(e) => setNewEmployerAddress(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'شماره تلفن' : 'Phone'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newEmployerPhone}
                  onChange={(e) => setNewEmployerPhone(e.target.value)}
                  placeholder="+98-21-..."
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'فکس' : 'Fax'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newEmployerFax}
                  onChange={(e) => setNewEmployerFax(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'کد پستی' : 'Postal Code'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newEmployerPostalCode}
                  onChange={(e) => setNewEmployerPostalCode(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'ایمیل شرکت' : 'Company Email'}
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={newEmployerEmail}
                  onChange={(e) => setNewEmployerEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'وب‌سایت / شبکه‌های اجتماعی' : 'Website / Social Media'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newEmployerSocials}
                  onChange={(e) => setNewEmployerSocials(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Target Form Sections Multi-Select */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {isFa ? 'بخش‌ها و فرم‌های مورد نیاز *' : 'Required Form Sections *'}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              {isFa ? `${selectedSections.length} بخش انتخاب‌شده` : `${selectedSections.length} selected`}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {OPERATIONAL_FORM_SECTIONS.map((sec) => {
              const checked = selectedSections.includes(sec.key);
              return (
                <label
                  key={sec.key}
                  className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 cursor-pointer select-none transition-colors ${
                    checked
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(sec.key)}
                    className="w-3.5 h-3.5 accent-[var(--accent-primary)] shrink-0"
                  />
                  <span className="truncate">{isFa ? sec.titleFa : sec.titleEn}</span>
                </label>
              );
            })}
            <label
              className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 cursor-pointer select-none transition-colors ${
                selectedSections.includes('other')
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedSections.includes('other')}
                onChange={() => toggleSection('other')}
                className="w-3.5 h-3.5 accent-[var(--accent-primary)] shrink-0"
              />
              <span className="truncate">{isFa ? 'سایر فرم‌ها / لوگو' : 'Other Forms / Logo'}</span>
            </label>
          </div>
        </div>

        {/* Requester Contact Information */}
        <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/45 space-y-3">
          <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>{isFa ? 'اطلاعات تماس درخواست‌کننده' : 'Requester Contact Information'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'نام و نام خانوادگی *' : 'Full Name *'}
              </label>
              <input
                type="text"
                required
                data-testid="dev-req-requester-name"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'سمت / واحد' : 'Role / Department'}
              </label>
              <input
                type="text"
                value={requesterRole}
                onChange={(e) => setRequesterRole(e.target.value)}
                placeholder={isFa ? 'مثلاً: سرپرست انبار' : 'e.g. Warehouse Supervisor'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره تماس / موبایل *' : 'Contact Phone *'}
              </label>
              <input
                type="text"
                required
                dir="ltr"
                data-testid="dev-req-requester-phone"
                value={requesterPhone}
                onChange={(e) => setRequesterPhone(e.target.value)}
                placeholder="09..."
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'ایمیل (اختیاری)' : 'Email (Optional)'}
              </label>
              <input
                type="email"
                dir="ltr"
                value={requesterEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'نام پروژه / نیروگاه' : 'Project / Power Plant Name'}
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
              />
            </div>
          </div>
        </div>

        {/* File Attachments (Employer Forms / Logo) */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>
                {isFa
                  ? 'پیوست فایل فرم‌های کارفرما و لوگو (اختیاری — حداکثر ۵ فایل)'
                  : 'Attach Employer Form Files & Logo (Optional — up to 5 files)'}
              </span>
            </label>
            <span className="text-[10.5px] text-[var(--text-muted)]">
              {isFa
                ? 'فرمت‌های مجاز: Excel, Word, PDF, PNG, JPG, TXT (حداکثر ۴ مگابایت)'
                : 'Allowed: Excel, Word, PDF, PNG, JPG, TXT (max 4MB each)'}
            </span>
          </div>

          <label className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-[var(--border-strong)] hover:border-[var(--accent-primary)] bg-[var(--bg-canvas)]/40 hover:bg-[var(--accent-soft)]/30 cursor-pointer transition-colors">
            <Upload className="w-5 h-5 text-[var(--accent-primary)]" />
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {isFa ? 'برای انتخاب فایل فرم‌ها یا لوگو کلیک کنید' : 'Click to attach form templates or logo'}
            </span>
            <input
              type="file"
              multiple
              data-testid="dev-req-file-input"
              accept={ALLOWED_EXTENSIONS.join(',')}
              onChange={(e) => {
                void handleAttachFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  data-testid="dev-req-attachment-chip"
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px]"
                >
                  <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                  <span className="font-medium text-[var(--text-primary)] max-w-[180px] truncate" dir="ltr">
                    {att.fileName}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                    ({formatFileSize(att.sizeBytes, isFa)})
                  </span>
                  <button
                    type="button"
                    aria-label={isFa ? `حذف ${att.fileName}` : `Remove ${att.fileName}`}
                    onClick={() => removeAttachment(att.id)}
                    className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--status-danger)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Additional Description / Notes */}
        <div>
          <label
            htmlFor="dev-req-description"
            className="block text-xs font-bold text-[var(--text-primary)] mb-1"
          >
            {isFa ? 'توضیحات تکمیلی و قوانین خاص فرم (اختیاری)' : 'Additional Notes & Form Rules (Optional)'}
          </label>
          <textarea
            id="dev-req-description"
            data-testid="dev-req-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              isFa
                ? 'توضیحات مربوط به شماره‌گذاری، امضاها، فیلدهای الزامی یا نحوه تکمیل فرم را بنویسید...'
                : 'Describe numbering conventions, required fields, signatories, or special rules...'
            }
            className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-1 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="dev-req-download-bundle-btn"
              onClick={handleDownloadBundle}
              className="h-9 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isFa ? 'دانلود فایل پکیج درخواست' : 'Download Request Bundle'}</span>
            </button>
          </div>

          <button
            type="submit"
            data-testid="dev-req-submit-btn"
            disabled={submitting}
            className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-55 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {submitting
                ? isFa
                  ? 'در حال ارسال...'
                  : 'Submitting...'
                : isFa
                  ? 'ارسال درخواست به سازنده برنامه'
                  : 'Submit Request to Developer'}
            </span>
          </button>
        </div>
      </form>

      {/* Submitted Requests Accordion (for authenticated users) */}
      {user && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40">
          <button
            type="button"
            data-testid="dev-req-history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span>
              {isFa
                ? `سوابق درخواست‌های ارسال‌شده به سازنده (${historyList.length})`
                : `Submitted Developer Requests (${historyList.length})`}
            </span>
            {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {historyOpen && (
            <div className="px-4 sm:px-5 pb-4 space-y-2">
              {loadingHistory ? (
                <div className="text-xs text-[var(--text-muted)] py-3 text-center">
                  {isFa ? 'در حال بارگذاری...' : 'Loading...'}
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] py-3 text-center">
                  {isFa ? 'هنوز درخواستی ثبت نشده است.' : 'No requests submitted yet.'}
                </div>
              ) : (
                historyList.map((req) => (
                  <div
                    key={req.id}
                    data-testid={`dev-req-history-item-${req.id}`}
                    className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 font-bold text-[var(--text-primary)]">
                        <span>
                          {req.requestType === 'new_employer'
                            ? isFa
                              ? `کارفرمای جدید: ${req.newEmployerNameFa || '-'}`
                              : `New Employer: ${req.newEmployerNameFa || '-'}`
                            : isFa
                              ? `درخواست فرم: ${req.targetEmployerName || req.targetEmployerId || '-'}`
                              : `Form Request: ${req.targetEmployerName || req.targetEmployerId || '-'}`}
                        </span>
                        <span className="text-[10.5px] font-normal text-[var(--text-muted)] tabular-nums">
                          {formatDate(req.createdAt.slice(0, 10))}
                        </span>
                      </div>

                      {user.role === 'admin' && (
                        <button
                          type="button"
                          aria-label={isFa ? 'حذف درخواست' : 'Delete request'}
                          onClick={() => void handleDeleteHistory(req.id)}
                          className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="text-[11px] text-[var(--text-secondary)] flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        {isFa ? 'درخواست‌کننده:' : 'Requester:'} {req.requesterName}
                      </span>
                      <span dir="ltr" className="font-mono">
                        {req.requesterPhone}
                      </span>
                      {req.projectName && (
                        <span>
                          {isFa ? 'پروژه:' : 'Project:'} {req.projectName}
                        </span>
                      )}
                    </div>

                    {req.description && (
                      <p className="text-[11px] text-[var(--text-secondary)] whitespace-pre-line">
                        {req.description}
                      </p>
                    )}

                    {req.attachments && req.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {req.attachments.map((att) => (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => downloadAttachmentSafely(att)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[10.5px] text-[var(--accent-primary)] font-medium"
                          >
                            <Download className="w-3 h-3" />
                            <span dir="ltr">{att.fileName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
