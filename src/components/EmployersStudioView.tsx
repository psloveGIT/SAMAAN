import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Globe,
  ImagePlus,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError } from '../lib/api.ts';
import {
  DEFAULT_UPLOADED_FORM_PRINT_SETTINGS,
  isBuiltInEmployerId,
  sanitizeEmployerProfile,
} from '../shared/employers.ts';
import type { ResolvedEmployerProfile } from '../shared/employers.ts';
import {
  OPERATIONAL_FORM_SECTIONS,
  getEmployerFormSectionsSummary,
  getOperationalFormSectionMeta,
  type OperationalFormSectionKey,
} from '../shared/formAccess.ts';
import {
  parseIranFixedPhoneParts,
  sanitizeDigitsOnly,
  sanitizeInstagramInput,
  sanitizeLinkedInInput,
  sanitizeProvinceCodeInput,
  serializeIranFixedPhoneParts,
  validateEmail,
  validateInstagramUsername,
  validateIranFixedPhoneParts,
  validateLinkedInUsername,
  validatePostalCode,
} from '../shared/employerValidation.ts';
import type {
  BuiltInFormKey,
  EmployerLogoAsset,
  EmployerProfile,
  EmployerUploadedForm,
  UploadedFormDataSource,
  UploadedFormPrintSettings,
} from '../shared/types.ts';
import {
  parseExcelSheetModel,
  parseUploadedFormFile,
  SAMAAN_BINDABLE_FIELDS,
  UPLOADED_FORM_DATA_SOURCE_OPTIONS,
} from '../shared/uploadedFormEngine.ts';
import { UploadedFormA4Sheet } from './UploadedFormA4Sheet.tsx';

function createEmptyDraft(nameFa = ''): EmployerProfile {
  const now = new Date().toISOString();
  return {
    id: '',
    isBuiltIn: false,
    nameFa,
    nameEn: '',
    companyFullName: nameFa,
    companyFullNameEn: '',
    shortName: nameFa,
    badgeCode: '',
    imsSubtitle: '',
    docCodePrefix: '',
    hideDocCodes: false,
    securityLabel: 'حراست و انتظامات کارگاه',
    equipmentSupplyLabel: 'واحد تأمین تجهیزات',
    techOfficeLabel: 'دفتر فنی و کنترل کیفیت',
    installationLabel: 'واحد نصب و بهره‌برداری',
    inspectorLabel: 'نماینده کارفرما / دستگاه نظارت',
    address: '',
    phone: '',
    postalCode: '',
    fax: '',
    email: '',
    instagram: '',
    linkedin: '',
    contractRef: '',
    notes: '',
    logos: [],
    formTemplates: {},
    customForms: [],
    uploadedForms: [],
    createdAt: now,
    updatedAt: now,
  };
}

function toResolvedPreviewProfile(
  draft: EmployerProfile,
  projectContractRef?: string,
): ResolvedEmployerProfile {
  const shortName = draft.shortName?.trim() || draft.nameFa?.trim() || 'کارفرما';
  return {
    id: draft.id || 'preview',
    isBuiltIn: Boolean(draft.isBuiltIn || isBuiltInEmployerId(draft.id)),
    isConfigured: Boolean(draft.nameFa?.trim() || draft.companyFullName?.trim()),
    nameFa: draft.nameFa?.trim() || 'کارفرمای جدید',
    nameEn: draft.nameEn?.trim() || draft.nameFa?.trim() || 'New Employer',
    companyFullName: draft.companyFullName?.trim() || draft.nameFa?.trim() || '',
    companyFullNameEn: draft.companyFullNameEn?.trim() || draft.nameEn?.trim() || '',
    shortName,
    badgeCode: draft.badgeCode?.trim() || shortName,
    securityLabel: draft.securityLabel?.trim() || 'حراست و انتظامات کارگاه',
    equipmentSupplyLabel: draft.equipmentSupplyLabel?.trim() || `تأمین تجهیزات ${shortName}`,
    techOfficeLabel: draft.techOfficeLabel?.trim() || `دفتر فنی ${shortName}`,
    installationLabel: draft.installationLabel?.trim() || `واحد نصب ${shortName}`,
    inspectorLabel: draft.inspectorLabel?.trim() || `نماینده ${shortName}`,
    imsSubtitle: draft.imsSubtitle?.trim() || '',
    docCodePrefix: draft.docCodePrefix?.trim() || '',
    address: draft.address,
    phone: draft.phone,
    postalCode: draft.postalCode,
    fax: draft.fax,
    email: draft.email,
    instagram: draft.instagram,
    linkedin: draft.linkedin,
    contractRef: projectContractRef || draft.contractRef,
    logos: draft.logos || [],
    formTemplates: draft.formTemplates || {},
    customForms: [],
    uploadedForms: draft.uploadedForms || [],
    hideDocCodes: Boolean(draft.hideDocCodes),
  };
}

async function processLogoImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File read error'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        reject(new Error('Invalid image file'));
        return;
      }
      if (file.type === 'image/svg+xml') {
        resolve(result);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxDim = 560;
        if (img.width <= maxDim && img.height <= maxDim && result.length < 220_000) {
          resolve(result);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

function getEmployerPrimaryLogo(emp: EmployerProfile): EmployerLogoAsset | undefined {
  if (!emp.logos || emp.logos.length === 0) return undefined;
  return emp.logos.find((l) => l.isDefault) || emp.logos[0];
}

interface IranPhoneSplitInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  onBlurValidate?: () => void;
  onLeadingZeroAttempt?: () => void;
  hasError?: boolean;
  isFa: boolean;
  testIdPrefix: string;
}

const IranPhoneSplitInput: React.FC<IranPhoneSplitInputProps> = ({
  value,
  onChange,
  onBlurValidate,
  onLeadingZeroAttempt,
  hasError,
  isFa,
  testIdPrefix,
}) => {
  const provinceRef = useRef<HTMLInputElement | null>(null);
  const subscriberRef = useRef<HTMLInputElement | null>(null);
  const { provinceCode, subscriber } = parseIranFixedPhoneParts(value);

  const handleProvinceChange = (raw: string) => {
    const digitsOnly = sanitizeDigitsOnly(raw, 4);
    if (/^[0۰٠]/.test(digitsOnly)) {
      onLeadingZeroAttempt?.();
    }
    const cleanProvince = sanitizeProvinceCodeInput(digitsOnly);
    onChange(serializeIranFixedPhoneParts(cleanProvince, subscriber));
    if (cleanProvince.length === 2) {
      subscriberRef.current?.focus();
    }
  };

  const handleSubscriberChange = (raw: string) => {
    const cleanSubscriber = sanitizeDigitsOnly(raw, 8);
    onChange(serializeIranFixedPhoneParts(provinceCode, cleanSubscriber));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const digits = sanitizeDigitsOnly(pasted, 16);
    if (digits.length >= 10) {
      e.preventDefault();
      const parsed = parseIranFixedPhoneParts(pasted);
      onChange(serializeIranFixedPhoneParts(parsed.provinceCode, parsed.subscriber));
      if (parsed.provinceCode.length === 2) {
        subscriberRef.current?.focus();
      }
    }
  };

  return (
    <div
      dir="ltr"
      data-testid={`${testIdPrefix}-box`}
      className={`w-full h-9 rounded-lg border bg-[var(--bg-canvas)] flex items-center overflow-hidden transition-colors focus-within:border-[var(--accent-primary)] ${
        hasError ? 'border-[var(--status-danger)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <span
        aria-label="Country code +98"
        className="h-full px-2.5 bg-[var(--bg-subtle)]/80 border-r border-[var(--border-subtle)] text-xs font-mono font-semibold text-[var(--text-secondary)] flex items-center select-none shrink-0"
      >
        +98
      </span>
      <input
        ref={provinceRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        data-testid={`${testIdPrefix}-province`}
        aria-label={isFa ? 'کد استان (۲ رقم بدون صفر)' : 'Province code (2 digits, no leading zero)'}
        value={provinceCode}
        onChange={(e) => handleProvinceChange(e.target.value)}
        onPaste={handlePaste}
        onBlur={onBlurValidate}
        placeholder="##"
        className="w-11 h-full px-1.5 bg-transparent text-xs font-mono tabular-nums text-center text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/55 focus:outline-none shrink-0"
      />
      <span aria-hidden="true" className="text-[var(--text-muted)] font-mono text-xs select-none">
        -
      </span>
      <input
        ref={subscriberRef}
        type="text"
        inputMode="numeric"
        maxLength={8}
        data-testid={`${testIdPrefix}-subscriber`}
        aria-label={isFa ? 'شماره ۸ رقمی' : '8-digit number'}
        value={subscriber}
        onChange={(e) => handleSubscriberChange(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && !subscriber) {
            provinceRef.current?.focus();
          }
        }}
        onBlur={onBlurValidate}
        placeholder="########"
        className="flex-1 min-w-0 h-full px-2 bg-transparent text-xs font-mono tabular-nums text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/55 focus:outline-none"
      />
    </div>
  );
};

export interface EmployersStudioWorkspaceProps {
  onAssignEmployer?: (employerId: string) => void;
  initialMode?: 'list' | 'new';
  compact?: boolean;
  initialEmployerId?: string;
  initialSection?: 'profile' | 'forms';
  initialFormSection?: OperationalFormSectionKey | null;
  navigationToken?: number;
  onOpenFormSection?: (sectionKey: OperationalFormSectionKey) => void;
}

export const EmployersStudioWorkspace: React.FC<EmployersStudioWorkspaceProps> = ({
  onAssignEmployer,
  initialMode = 'list',
  compact = false,
  initialEmployerId,
  initialSection,
  initialFormSection = null,
  navigationToken = 0,
  onOpenFormSection,
}) => {
  const {
    prefs,
    employers,
    activeProject,
    createEmployer,
    updateEmployer,
    deleteEmployer,
    renameProject,
    notify,
  } = useApp();
  const isFa = prefs.language === 'fa';

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (initialMode === 'new') return '__new__';
    if (initialEmployerId && employers.some((e) => e.id === initialEmployerId)) {
      return initialEmployerId;
    }
    return employers[0]?.id || '__new__';
  });
  const [draft, setDraft] = useState<EmployerProfile>(() => {
    if (initialMode === 'new') return createEmptyDraft('');
    const target =
      (initialEmployerId && employers.find((e) => e.id === initialEmployerId)) || employers[0];
    return target ? structuredClone(target) : createEmptyDraft('');
  });
  const [activeSection, setActiveSection] = useState<'profile' | 'forms'>(
    () => initialSection || 'profile',
  );
  const [highlightedFormSection, setHighlightedFormSection] =
    useState<OperationalFormSectionKey | null>(initialFormSection || null);
  const [selectedUploadedFormId, setSelectedUploadedFormId] = useState<string>(() => {
    if (initialMode === 'new') return '';
    const target =
      (initialEmployerId && employers.find((e) => e.id === initialEmployerId)) || employers[0];
    return target?.uploadedForms?.[0]?.id || '';
  });
  const [uploadingForm, setUploadingForm] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    phone?: string;
    postalCode?: string;
    fax?: string;
    email?: string;
    instagram?: string;
    linkedin?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(() => initialMode === 'new');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const builtInEmployers = useMemo(
    () => employers.filter((e) => e.isBuiltIn || isBuiltInEmployerId(e.id)),
    [employers],
  );
  const customEmployers = useMemo(
    () => employers.filter((e) => !e.isBuiltIn && !isBuiltInEmployerId(e.id)),
    [employers],
  );

  const isCreatingNew = selectedId === '__new__' || !draft.id;
  const isDraftBuiltIn = Boolean(draft.isBuiltIn || isBuiltInEmployerId(draft.id));

  useEffect(() => {
    if (!navigationToken) return;
    if (initialEmployerId) {
      const target = employers.find((e) => e.id === initialEmployerId);
      if (target) {
        setSelectedId(target.id);
        setDraft(structuredClone(target));
        setSelectedUploadedFormId(target.uploadedForms?.[0]?.id || '');
        setFieldErrors({});
        setDirty(false);
      }
    }
    if (initialSection) {
      setActiveSection(initialSection);
    }
    setHighlightedFormSection(initialFormSection || null);
  }, [navigationToken, initialEmployerId, initialSection, initialFormSection, employers]);

  useEffect(() => {
    if (selectedId === '__new__') return;
    const found = employers.find((e) => e.id === selectedId);
    if (found && !dirty) {
      setDraft(structuredClone(found));
      setFieldErrors({});
    } else if (!found && employers.length > 0 && !dirty) {
      setSelectedId(employers[0].id);
      setDraft(structuredClone(employers[0]));
      setFieldErrors({});
    }
  }, [employers, selectedId, dirty]);

  const selectEmployer = (emp: EmployerProfile) => {
    setSelectedId(emp.id);
    setDraft(structuredClone(emp));
    setSelectedUploadedFormId(emp.uploadedForms?.[0]?.id || '');
    setFieldErrors({});
    setDirty(false);
    setConfirmDeleteId(null);
  };

  const startNewEmployer = () => {
    setSelectedId('__new__');
    setDraft(createEmptyDraft(''));
    setSelectedUploadedFormId('');
    setActiveSection('profile');
    setFieldErrors({});
    setDirty(true);
    setConfirmDeleteId(null);
  };

  const patchDraft = (updater: (prev: EmployerProfile) => EmployerProfile) => {
    setDraft((prev) => updater(prev));
    setDirty(true);
  };

  const handleUploadLogos = async (fileList: File[]) => {
    if (!fileList || fileList.length === 0) return;
    const added: EmployerLogoAsset[] = [];
    for (let i = 0; i < fileList.length; i += 1) {
      const file = fileList[i];
      if (file.size > 4 * 1024 * 1024) {
        notify('warning', isFa ? `حجم فایل ${file.name} بیش از ۴ مگابایت است.` : `${file.name} exceeds 4MB.`);
        continue;
      }
      try {
        const dataUrl = await processLogoImageFile(file);
        const baseName = file.name.replace(/\.[^.]+$/, '') || `لوگو ${i + 1}`;
        added.push({
          id: `logo-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          label: baseName,
          dataUrl,
          isDefault: false,
        });
      } catch {
        notify('error', isFa ? `خواندن فایل ${file.name} ناموفق بود.` : `Failed to load ${file.name}`);
      }
    }
    if (added.length === 0) return;
    patchDraft((prev) => {
      const nextLogos = [...(prev.logos || []), ...added];
      if (!nextLogos.some((l) => l.isDefault)) {
        nextLogos[0].isDefault = true;
      }
      return { ...prev, logos: nextLogos };
    });
    notify(
      'success',
      isFa ? `${added.length} لوگو اضافه شد.` : `Added ${added.length} logo(s).`,
    );
  };

  const saveDraftInternal = async (): Promise<EmployerProfile | null> => {
    if (!draft.nameFa.trim()) {
      notify('error', isFa ? 'نام کارفرما الزامی است.' : 'Employer name is required.');
      setActiveSection('profile');
      return null;
    }

    let phoneToSave = draft.phone?.trim() || '';
    let postalCodeToSave = draft.postalCode?.trim() || '';
    let faxToSave = draft.fax?.trim() || '';
    let emailToSave = draft.email?.trim() || '';
    let instagramToSave = draft.instagram?.trim() || '';
    let linkedinToSave = draft.linkedin?.trim() || '';

    if (!isDraftBuiltIn) {
      const nextErrors: {
        phone?: string;
        postalCode?: string;
        fax?: string;
        email?: string;
        instagram?: string;
        linkedin?: string;
      } = {};

      const phoneParts = parseIranFixedPhoneParts(phoneToSave);
      const phoneCheck = validateIranFixedPhoneParts(
        phoneParts.provinceCode,
        phoneParts.subscriber,
        'تلفن',
        'Phone',
      );
      if (!phoneCheck.valid) {
        nextErrors.phone = isFa ? phoneCheck.errorFa : phoneCheck.errorEn;
      } else {
        phoneToSave = phoneCheck.normalized;
      }

      const postalCheck = validatePostalCode(postalCodeToSave);
      if (!postalCheck.valid) {
        nextErrors.postalCode = isFa ? postalCheck.errorFa : postalCheck.errorEn;
      } else {
        postalCodeToSave = postalCheck.normalized;
      }

      const faxParts = parseIranFixedPhoneParts(faxToSave);
      const faxCheck = validateIranFixedPhoneParts(
        faxParts.provinceCode,
        faxParts.subscriber,
        'فکس',
        'Fax',
      );
      if (!faxCheck.valid) {
        nextErrors.fax = isFa ? faxCheck.errorFa : faxCheck.errorEn;
      } else {
        faxToSave = faxCheck.normalized;
      }

      const emailCheck = validateEmail(emailToSave);
      if (!emailCheck.valid) {
        nextErrors.email = isFa ? emailCheck.errorFa : emailCheck.errorEn;
      } else {
        emailToSave = emailCheck.normalized;
      }

      const igCheck = validateInstagramUsername(instagramToSave);
      if (!igCheck.valid) {
        nextErrors.instagram = isFa ? igCheck.errorFa : igCheck.errorEn;
      } else {
        instagramToSave = igCheck.normalized;
      }

      const liCheck = validateLinkedInUsername(linkedinToSave);
      if (!liCheck.valid) {
        nextErrors.linkedin = isFa ? liCheck.errorFa : liCheck.errorEn;
      } else {
        linkedinToSave = liCheck.normalized;
      }

      const firstError =
        nextErrors.phone ||
        nextErrors.postalCode ||
        nextErrors.fax ||
        nextErrors.email ||
        nextErrors.instagram ||
        nextErrors.linkedin;

      if (firstError) {
        setFieldErrors(nextErrors);
        notify('error', firstError);
        setActiveSection('profile');
        return null;
      }
    }

    setFieldErrors({});
    setSaving(true);
    try {
      const payload: Partial<EmployerProfile> = {
        ...draft,
        nameFa: draft.nameFa.trim(),
        nameEn: isDraftBuiltIn
          ? draft.nameEn?.trim() || undefined
          : draft.companyFullNameEn?.trim() || draft.shortName.trim() || draft.nameFa.trim(),
        companyFullName: draft.companyFullName.trim() || draft.nameFa.trim(),
        companyFullNameEn: draft.companyFullNameEn?.trim() || undefined,
        shortName: draft.shortName.trim() || draft.nameFa.trim(),
        badgeCode: draft.shortName.trim() || draft.nameFa.trim(),
        docCodePrefix: draft.docCodePrefix?.trim() || undefined,
        imsSubtitle: draft.imsSubtitle?.trim() || undefined,
        address: draft.address?.trim() || undefined,
        phone: phoneToSave || undefined,
        postalCode: postalCodeToSave || undefined,
        fax: faxToSave || undefined,
        email: emailToSave || undefined,
        instagram: instagramToSave || undefined,
        linkedin: linkedinToSave || undefined,
        customForms: [],
      };

      let saved: EmployerProfile;
      if (isCreatingNew) {
        saved = await createEmployer(payload);
        setSelectedId(saved.id);
      } else {
        saved = await updateEmployer(draft.id, payload);
      }
      setDraft(structuredClone(saved));
      setDirty(false);
      notify(
        'success',
        isFa
          ? `اطلاعات کارفرمای «${saved.nameFa}» با موفقیت ذخیره شد.`
          : `Saved employer "${saved.nameFa}".`,
      );
      return saved;
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const saved = await saveDraftInternal();
    if (saved && onAssignEmployer && compact) {
      onAssignEmployer(saved.id);
    }
  };

  const handleAssignToActive = async () => {
    let targetId = draft.id;
    if (isCreatingNew || dirty) {
      const saved = await saveDraftInternal();
      if (!saved) return;
      targetId = saved.id;
    }
    if (!targetId) return;
    if (onAssignEmployer) {
      onAssignEmployer(targetId);
      return;
    }
    if (!activeProject) return;
    try {
      await renameProject(activeProject.id, {
        name: activeProject.name,
        code: activeProject.code,
        contractRef: activeProject.contractRef,
        employerId: targetId,
      });
      notify(
        'success',
        isFa
          ? `کارفرمای پروژه «${activeProject.name}» به «${draft.nameFa}» تنظیم شد.`
          : `Assigned "${draft.nameFa}" to active project.`,
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (isBuiltInEmployerId(id)) return;
    setSaving(true);
    try {
      await deleteEmployer(id);
      setConfirmDeleteId(null);
      setDirty(false);
      const remaining = employers.filter((e) => e.id !== id);
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id);
        setDraft(structuredClone(remaining[0]));
      } else {
        startNewEmployer();
      }
      notify('success', isFa ? 'کارفرمای سفارشی حذف شد.' : 'Custom employer deleted.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportTemplate = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `samaan-employer-${draft.shortName || draft.nameFa || 'profile'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplate = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = sanitizeEmployerProfile(JSON.parse(text));
      if (!parsed) {
        notify('error', isFa ? 'فایل الگوی کارفرما نامعتبر است.' : 'Invalid employer JSON file.');
        return;
      }
      const created = await createEmployer({ ...parsed, id: undefined, isBuiltIn: false });
      setSelectedId(created.id);
      setDraft(structuredClone(created));
      setDirty(false);
      notify('success', isFa ? `کارفرمای «${created.nameFa}» وارد شد.` : `Imported "${created.nameFa}".`);
    } catch {
      notify('error', isFa ? 'خطا در خواندن فایل کارفرما.' : 'Failed to read employer JSON file.');
    }
  };

  // Uploaded Forms State & Helpers
  const resolvedPreview = useMemo(
    () => toResolvedPreviewProfile(draft, activeProject?.contractRef),
    [draft, activeProject?.contractRef],
  );
  const uploadedForms = draft.uploadedForms || [];
  const activeUploadedForm =
    uploadedForms.find((f) => f.id === selectedUploadedFormId) || uploadedForms[0] || null;
  const deferredUploadedForm = useDeferredValue(activeUploadedForm);

  const activeExcelBase64 = activeUploadedForm?.fileType === 'excel' ? activeUploadedForm.fileDataBase64 : '';
  const activeExcelSheetName = activeUploadedForm?.fileType === 'excel' ? activeUploadedForm.sheetName : undefined;
  const activeExcelSheetMeta = useMemo(() => {
    if (!activeExcelBase64) return null;
    try {
      return parseExcelSheetModel(activeExcelBase64, activeExcelSheetName);
    } catch {
      return null;
    }
  }, [activeExcelBase64, activeExcelSheetName]);

  const persistUploadedFormsImmediately = async (
    nextUploadedForms: EmployerUploadedForm[],
    successMsgFa: string,
    successMsgEn: string,
  ) => {
    if (isCreatingNew || !draft.id) {
      setDraft((prev) => ({ ...prev, uploadedForms: nextUploadedForms }));
      setDirty(true);
      notify('success', isFa ? successMsgFa : successMsgEn);
      return;
    }
    try {
      const updatedDraft: EmployerProfile = {
        ...draft,
        uploadedForms: nextUploadedForms,
        customForms: [],
      };
      const saved = await updateEmployer(draft.id, updatedDraft);
      setDraft(structuredClone(saved));
      setDirty(false);
      notify('success', isFa ? successMsgFa : successMsgEn);
    } catch (err) {
      setDraft((prev) => ({ ...prev, uploadedForms: nextUploadedForms }));
      setDirty(true);
      notify(
        'error',
        err instanceof ApiError
          ? err.message
          : isFa
            ? 'فرم در پیش‌نویس اضافه شد اما ذخیره خودکار ناموفق بود؛ دکمه ذخیره تغییرات را بزنید.'
            : 'Added to draft, but auto-save failed. Please click Save Changes.',
      );
    }
  };

  const handleUploadCompanyFormFiles = async (
    fileList: File[],
    forcedSection?: OperationalFormSectionKey,
  ) => {
    if (!fileList || fileList.length === 0) return;
    setUploadingForm(true);
    try {
      const sectionMeta = forcedSection ? getOperationalFormSectionMeta(forcedSection) : null;
      const defaultSource = sectionMeta?.defaultDataSource || 'general';
      const createdList: EmployerUploadedForm[] = [];
      for (let i = 0; i < fileList.length; i += 1) {
        const file = fileList[i];
        if (file.size > 8 * 1024 * 1024) {
          notify('warning', isFa ? `حجم فایل ${file.name} بیش از ۸ مگابایت است.` : `${file.name} exceeds 8MB.`);
          continue;
        }
        try {
          const parsed = await parseUploadedFormFile(file, defaultSource);
          if (forcedSection && sectionMeta) {
            parsed.targetAppSection = forcedSection;
            parsed.targetSectionConfirmed = true;
            parsed.targetSectionConfidence = 'high';
            parsed.dataSource = sectionMeta.defaultDataSource;
            parsed.dataSources = [sectionMeta.defaultDataSource];
          }
          createdList.push(parsed);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : `خطا در خواندن ${file.name}`);
        }
      }
      if (createdList.length > 0) {
        const nextUploadedForms = [...(draft.uploadedForms || []), ...createdList];
        setSelectedUploadedFormId(createdList[0].id);
        if (forcedSection) {
          setHighlightedFormSection(forcedSection);
        }
        const msgFa = sectionMeta
          ? isCreatingNew
            ? `فرم بخش «${sectionMeta.titleFa}» اضافه شد. پس از ثبت کارفرما دسترسی این بخش فعال می‌شود.`
            : `فرم بخش «${sectionMeta.titleFa}» ذخیره شد و دسترسی به این بخش بلافاصله فعال گردید.`
          : isCreatingNew
            ? `${createdList.length} فرم اضافه شد. برای ثبت نهایی، دکمه ثبت کارفرما را بزنید.`
            : `${createdList.length} فرم با موفقیت بارگذاری و ذخیره شد.`;
        const msgEn = sectionMeta
          ? isCreatingNew
            ? `Form added for "${sectionMeta.titleEn}". Save the employer to unlock this section.`
            : `Form saved for "${sectionMeta.titleEn}". Access to this section is now active.`
          : `Uploaded ${createdList.length} form(s) successfully.`;
        await persistUploadedFormsImmediately(nextUploadedForms, msgFa, msgEn);
      }
    } finally {
      setUploadingForm(false);
    }
  };

  const patchUploadedForm = (updater: (f: EmployerUploadedForm) => EmployerUploadedForm) => {
    if (!activeUploadedForm) return;
    patchDraft((prev) => ({
      ...prev,
      uploadedForms: (prev.uploadedForms || []).map((f) =>
        f.id === activeUploadedForm.id ? updater({ ...f, updatedAt: new Date().toISOString() }) : f,
      ),
    }));
  };

  const patchUploadedPrintSettings = (patch: Partial<UploadedFormPrintSettings>) => {
    patchUploadedForm((f) => ({
      ...f,
      printSettings: {
        ...(f.printSettings || DEFAULT_UPLOADED_FORM_PRINT_SETTINGS),
        ...patch,
      },
    }));
  };

  const deleteUploadedForm = async (id: string) => {
    const remaining = (draft.uploadedForms || []).filter((f) => f.id !== id);
    if (selectedUploadedFormId === id) {
      setSelectedUploadedFormId(remaining[0]?.id || '');
    }
    await persistUploadedFormsImmediately(
      remaining,
      'فرم انتخاب‌شده حذف شد.',
      'Selected form removed.',
    );
  };

  const samplePreviewData = useMemo(() => {
    const headerTokens: Record<string, string> = {
      projectName: activeProject?.name || 'نیروگاه نکا',
      contractNo: activeProject?.contractRef || activeProject?.code || 'CNT-1404',
      employerName: draft.companyFullName || draft.nameFa || 'کارفرما',
      todayDate: '1404/02/15',
      docNo: activeUploadedForm?.formCode || 'FRM-001',
      minutesNo: '404-012',
      employerEntryMinutesNo: 'EMP-404-08',
      releaseNoteNo: 'RN-8841',
      packingListNo: 'PK-1042-A',
      packageNo: 'PKG-03',
      arrivalDate: '1404/02/10',
      supplier: 'تأمین‌کننده نمونه',
      origin: 'بندرعباس',
      island: 'جزیره توربین',
      system: 'سیستم خنک‌کاری',
      subSystem: 'پمپ‌های اصلی',
      unit: 'واحد ۱',
      waybillNo: 'BL-99412',
      vehicleNo: '60 ایران 985 ع 14',
      driverName: 'آقای رضایی',
      grossWeight: '4,250',
      netWeight: '3,980',
      weighbridgeWeight: '4,260',
      dimensions: '3.2 × 1.8 × 1.5',
      remarks: 'پیش‌نمایش نمونه جهت بررسی تطبیق ستون‌ها و چاپ A4',
    };
    const lineRows: Array<Record<string, string>> = [
      {
        ...headerTokens,
        rowNo: '1',
        itemNo: '001',
        itemCode: 'TUR-VALV-402',
        size: '8" CL600',
        description: 'شیر کنترل فشار اصلی توربین بخار همراه با عملگر الکتریکی',
        packingQty: '2',
        actualQty: '2',
        countingUnit: 'دستگاه',
        shortage: '0',
        surplus: '0',
        damagedQty: '0',
        storageLocation: 'سالن A - ردیف ۳',
      },
      {
        ...headerTokens,
        rowNo: '2',
        itemNo: '002',
        itemCode: 'GSK-109',
        size: 'DN200',
        description: 'واشر آب‌بندی فشار بالا',
        packingQty: '10',
        actualQty: '10',
        countingUnit: 'عدد',
        shortage: '0',
        surplus: '0',
        damagedQty: '0',
        storageLocation: 'قفسه B12',
      },
    ];
    return { headerTokens, lineRows };
  }, [activeProject?.name, activeProject?.contractRef, activeProject?.code, activeUploadedForm?.formCode, draft.companyFullName, draft.nameFa]);

  const primaryLogo = getEmployerPrimaryLogo(draft);

  return (
    <div className={`grid grid-cols-1 ${compact && initialMode === 'new' ? '' : 'lg:grid-cols-12'} gap-5 items-start`}>
      {/* Left/Start Master List of Employers (hidden when modal is strictly in compact New Employer mode) */}
      {!(compact && initialMode === 'new') && (
        <aside className="lg:col-span-4 xl:col-span-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="px-3.5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <h2 className="text-sm font-bold text-[var(--text-primary)] whitespace-nowrap">
                {isFa ? 'کارفرمایان' : 'Employers'}
              </h2>
            </div>
            <button
              type="button"
              data-testid="new-employer-btn"
              onClick={startNewEmployer}
              className="h-8 px-2.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isFa ? 'کارفرمای جدید' : 'New Employer'}</span>
            </button>
          </div>

          <div className="p-3 space-y-4">
            {/* Built-in Default MAPNA Employers */}
            <div className="space-y-1.5">
              <div className="px-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
                {isFa ? 'کارفرماهای پیش‌فرض سامانه' : 'Built-in Default Employers'}
              </div>
              <div className="space-y-1.5">
                {builtInEmployers.map((emp) => {
                  const isSelected = selectedId === emp.id;
                  const isActiveOnProject = activeProject?.employerId === emp.id;
                  const logo = getEmployerPrimaryLogo(emp);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      data-testid={`employer-item-${emp.id}`}
                      onClick={() => selectEmployer(emp)}
                      className={`w-full p-2.5 rounded-xl border text-start transition-colors flex items-center gap-3 ${
                        isSelected
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <div className="w-14 h-10 rounded-lg border border-[var(--border-subtle)] bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                        {logo?.dataUrl ? (
                          <img
                            src={logo.dataUrl}
                            alt={emp.nameFa}
                            referrerPolicy="no-referrer"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <Building2 className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {emp.nameFa}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5 truncate">
                          <span dir="ltr" className="font-mono font-semibold text-[var(--text-secondary)]">
                            {emp.shortName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{isFa ? 'پیش‌فرض' : 'Default'}</span>
                          {isActiveOnProject && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[var(--accent-primary)] font-semibold">
                                {isFa ? 'فعال' : 'Active'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom User-Defined Employers */}
            <div className="space-y-1.5 pt-3 border-t border-[var(--border-subtle)]">
              <div className="px-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
                {isFa ? 'کارفرماهای تعریف‌شده توسط کاربر' : 'Custom Employers'}
              </div>
              {customEmployers.length === 0 ? (
                <div className="px-2 py-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
                  {isFa
                    ? 'هنوز کارفرمای سفارشی تعریف نشده است. برای افزودن کارفرما با لوگو و فرم‌های اختصاصی، روی «کارفرمای جدید» کلیک کنید.'
                    : 'No custom employers yet. Click "New Employer" to define one with its own logo and forms.'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {customEmployers.map((emp) => {
                    const isSelected = selectedId === emp.id;
                    const isActiveOnProject = activeProject?.employerId === emp.id;
                    const logo = getEmployerPrimaryLogo(emp);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        data-testid={`employer-item-${emp.id}`}
                        onClick={() => selectEmployer(emp)}
                        className={`w-full p-2.5 rounded-xl border text-start transition-colors flex items-center gap-3 ${
                          isSelected
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 hover:bg-[var(--bg-subtle)]'
                        }`}
                      >
                        <div className="w-14 h-10 rounded-lg border border-[var(--border-subtle)] bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          {logo?.dataUrl ? (
                            <img
                              src={logo.dataUrl}
                              alt={emp.nameFa}
                              referrerPolicy="no-referrer"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <Building2 className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                            {emp.nameFa}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5 truncate">
                            <span dir="ltr" className="font-mono">
                              {emp.shortName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {isFa
                                ? `${(emp.uploadedForms || []).length} فرم`
                                : `${(emp.uploadedForms || []).length} forms`}
                            </span>
                            {isActiveOnProject && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[var(--accent-primary)] font-semibold">
                                  {isFa ? 'فعال' : 'Active'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Subtle JSON Import / Export */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center gap-2">
              <label className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium text-[var(--text-secondary)] flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>{isFa ? 'ورود الگو' : 'Import'}</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.currentTarget.value = '';
                    if (file) void handleImportTemplate(file);
                  }}
                />
              </label>
              {!isCreatingNew && (
                <button
                  type="button"
                  onClick={handleExportTemplate}
                  className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium text-[var(--text-secondary)] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isFa ? 'خروجی الگو' : 'Export'}</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* Right/End Employer Profile & Uploaded Forms Panel */}
      <div
        className={`${
          compact && initialMode === 'new' ? '' : 'lg:col-span-8 xl:col-span-9'
        } rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden`}
      >
        {/* Top Action Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-20 h-12 rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
              {primaryLogo?.dataUrl ? (
                <img
                  src={primaryLogo.dataUrl}
                  alt={draft.nameFa || 'لوگوی کارفرما'}
                  referrerPolicy="no-referrer"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <Building2 className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[var(--text-primary)] truncate">
                {isCreatingNew
                  ? isFa
                    ? 'تعریف کارفرمای جدید'
                    : 'Define New Employer'
                  : draft.nameFa}
              </h3>
              <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-1.5 mt-0.5">
                <span>
                  {isDraftBuiltIn
                    ? isFa
                      ? 'کارفرمای پیش‌فرض سامانه'
                      : 'Built-in Default Employer'
                    : isCreatingNew
                      ? isFa
                        ? 'ثبت مشخصات، آپلود لوگو و بارگذاری فرم‌های اختصاصی'
                        : 'Configure profile, logo, and uploaded forms'
                      : isFa
                        ? 'کارفرمای سفارشی'
                        : 'Custom Employer'}
                </span>
                {draft.shortName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span dir="ltr" className="font-mono font-semibold text-[var(--text-secondary)]">
                      {draft.shortName}
                    </span>
                  </>
                )}
                {draft.docCodePrefix && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span dir="ltr" className="font-mono">
                      {draft.docCodePrefix}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isCreatingNew && !isDraftBuiltIn && (
              confirmDeleteId === draft.id ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleDelete(draft.id)}
                    className="h-9 px-3 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    {isFa ? 'تأیید حذف' : 'Confirm Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium whitespace-nowrap"
                  >
                    {isFa ? 'انصراف' : 'Cancel'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(draft.id)}
                  className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--status-danger)] text-[var(--status-danger)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isFa ? 'حذف' : 'Delete'}</span>
                </button>
              )
            )}

            {activeProject && !compact && (
              <button
                type="button"
                data-testid="assign-employer-to-project-btn"
                disabled={saving}
                onClick={handleAssignToActive}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  activeProject.employerId === draft.id && !isCreatingNew
                    ? 'border border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-contrast)]'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {activeProject.employerId === draft.id && !isCreatingNew
                    ? isFa
                      ? 'کارفرمای پروژه فعلی'
                      : 'Active on Project'
                    : isFa
                      ? 'انتخاب برای پروژه فعلی'
                      : 'Assign to Project'}
                </span>
              </button>
            )}

            <button
              type="button"
              data-testid="save-employer-btn"
              disabled={saving}
              onClick={handleSave}
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? isFa
                    ? 'در حال ذخیره...'
                    : 'Saving...'
                  : compact && onAssignEmployer
                    ? isFa
                      ? 'ثبت و انتخاب کارفرما'
                      : 'Save & Select'
                    : isCreatingNew
                      ? isFa
                        ? 'ثبت کارفرمای جدید'
                        : 'Create Employer'
                      : isFa
                        ? 'ذخیره تغییرات'
                        : 'Save Changes'}
              </span>
            </button>
          </div>
        </div>

        {/* Clean 2-Tab Navigation (NO Form Designer!) */}
        <div className="px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-subtle)]">
            <button
              type="button"
              data-testid="employer-tab-profile"
              onClick={() => setActiveSection('profile')}
              className={`h-8 px-3.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                activeSection === 'profile'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isFa ? '۱. مشخصات و لوگوی کارفرما' : '1. Employer Profile & Logo'}
            </button>
            <button
              type="button"
              data-testid="employer-tab-forms"
              onClick={() => setActiveSection('forms')}
              className={`h-8 px-3.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeSection === 'forms'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>
                {isFa ? '۲. آپلود و تعریف فرم‌ها' : '2. Upload & Define Forms'}
              </span>
              {uploadedForms.length > 0 && (
                <span className="tabular-nums opacity-75">({uploadedForms.length})</span>
              )}
            </button>
          </div>
        </div>

        {/* TAB 1: Employer Profile, Contact Details & Logo */}
        {activeSection === 'profile' && (
          <div className="p-4 sm:p-6 space-y-6">
            {/* Logo Display / Upload Section */}
            <div className="pb-6 border-b border-[var(--border-subtle)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa ? 'لوگوی کارفرما (نمایش در بخش‌های رابط کاربری)' : 'Employer Logo (App UI Display)'}
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                    {isFa
                      ? 'این لوگو صرفاً جهت استفاده در بخش‌هایی از برنامه است که نیاز به نمایش لوگو دارند؛ لوگوی مخصوص هر فرم به‌صورت جداگانه در داخل خود فرم‌ها گنجانده می‌شود.'
                      : 'Used strictly in UI sections displaying employer branding; operational forms embed their own dedicated headers/logos.'}
                  </p>
                </div>

                {!isDraftBuiltIn && (
                  <label className="h-9 px-3.5 rounded-lg border border-dashed border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors">
                    <ImagePlus className="w-4 h-4" />
                    <span>{isFa ? 'آپلود لوگوی کارفرما' : 'Upload Logo'}</span>
                    <input
                      type="file"
                      data-testid="employer-logo-upload-input"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        e.currentTarget.value = '';
                        void handleUploadLogos(files);
                      }}
                    />
                  </label>
                )}
              </div>

              {draft.logos.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)]/50 text-center text-xs text-[var(--text-muted)]">
                  {isFa
                    ? 'هنوز لوگویی برای این کارفرما بارگذاری نشده است. می‌توانید تصویر لوگوی شرکت را با فرمت PNG، JPG یا SVG آپلود کنید.'
                    : 'No logo uploaded yet. Upload a PNG, JPG, or SVG company logo.'}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {draft.logos.map((logo) => (
                    <div
                      key={logo.id}
                      className={`p-3 rounded-xl border bg-[var(--bg-canvas)]/60 flex items-center gap-3 ${
                        logo.isDefault
                          ? 'border-[var(--accent-primary)]'
                          : 'border-[var(--border-subtle)]'
                      }`}
                    >
                      <div className="h-14 w-36 rounded-lg border border-[var(--border-subtle)] bg-white p-2 flex items-center justify-center overflow-hidden shrink-0">
                        <img
                          src={logo.dataUrl}
                          alt={logo.label}
                          referrerPolicy="no-referrer"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="space-y-1.5 min-w-0">
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate max-w-[180px]">
                          {logo.label}
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          {isDraftBuiltIn ? (
                            <span className="text-[var(--accent-primary)] font-medium flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>{isFa ? 'لوگوی پیش‌فرض رسمی' : 'Official Built-in Logo'}</span>
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  patchDraft((p) => ({
                                    ...p,
                                    logos: p.logos.map((l) => ({ ...l, isDefault: l.id === logo.id })),
                                  }))
                                }
                                className={`flex items-center gap-1 font-medium ${
                                  logo.isDefault
                                    ? 'text-[var(--accent-primary)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                <Star className="w-3.5 h-3.5" />
                                <span>{logo.isDefault ? (isFa ? 'اصلی' : 'Primary') : (isFa ? 'انتخاب اصلی' : 'Set Primary')}</span>
                              </button>
                              <span aria-hidden="true" className="text-[var(--border-strong)]">·</span>
                              <button
                                type="button"
                                onClick={() =>
                                  patchDraft((p) => {
                                    const remaining = p.logos.filter((l) => l.id !== logo.id);
                                    if (remaining.length > 0 && !remaining.some((l) => l.isDefault)) {
                                      remaining[0].isDefault = true;
                                    }
                                    return { ...p, logos: remaining };
                                  })
                                }
                                className="text-[var(--status-danger)] hover:underline"
                              >
                                {isFa ? 'حذف' : 'Remove'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 1: Company Identity */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                {isFa ? 'مشخصات هویتی کارفرما' : 'Company Identity'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3.5">
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نام کارفرما *' : 'Employer Name *'}
                  </label>
                  <input
                    type="text"
                    data-testid="employer-name-fa-input"
                    value={draft.nameFa}
                    onChange={(e) => patchDraft((p) => ({ ...p, nameFa: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نام کوتاه' : 'Short Name / Code'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    data-testid="employer-short-name-input"
                    value={draft.shortName}
                    onChange={(e) => patchDraft((p) => ({ ...p, shortName: e.target.value, badgeCode: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'عنوان کامل فارسی' : 'Full Persian Title'}
                  </label>
                  <input
                    type="text"
                    value={draft.companyFullName}
                    onChange={(e) => patchDraft((p) => ({ ...p, companyFullName: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'عنوان کامل انگلیسی' : 'Full English Title'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.companyFullNameEn || ''}
                    onChange={(e) => patchDraft((p) => ({ ...p, companyFullNameEn: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Management System & Document Coding */}
            <div className="pt-5 border-t border-[var(--border-subtle)] space-y-3.5">
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                {isFa ? 'سیستم مدیریت و کدگذاری فرم‌ها' : 'Management System & Document Coding'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'پیشوند کد فرم‌ها' : 'Form Code Prefix'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    data-testid="employer-doc-prefix-input"
                    value={draft.docCodePrefix || ''}
                    onChange={(e) => patchDraft((p) => ({ ...p, docCodePrefix: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'زیرعنوان سیستم مدیریت' : 'Management System Subtitle'}
                  </label>
                  <input
                    type="text"
                    data-testid="employer-ims-subtitle-input"
                    value={draft.imsSubtitle || ''}
                    onChange={(e) => patchDraft((p) => ({ ...p, imsSubtitle: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Contact Info & Social Links */}
            <div className="pt-5 border-t border-[var(--border-subtle)] space-y-3.5">
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                {isFa ? 'اطلاعات تماس و شبکه‌های اجتماعی' : 'Contact Information & Social Channels'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>{isFa ? 'آدرس' : 'Address'}</span>
                  </label>
                  <input
                    type="text"
                    value={draft.address || ''}
                    onChange={(e) => patchDraft((p) => ({ ...p, address: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    <Phone className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>{isFa ? 'تلفن' : 'Phone'}</span>
                  </label>
                  {isDraftBuiltIn ? (
                    <input
                      type="text"
                      value={draft.phone || ''}
                      onChange={(e) => patchDraft((p) => ({ ...p, phone: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  ) : (
                    <IranPhoneSplitInput
                      value={draft.phone || ''}
                      isFa={isFa}
                      testIdPrefix="employer-phone"
                      hasError={Boolean(fieldErrors.phone)}
                      onLeadingZeroAttempt={() =>
                        setFieldErrors((prev) => ({
                          ...prev,
                          phone: isFa
                            ? 'کد استان باید ۲ رقم و بدون صفر ابتدایی باشد.'
                            : 'Province code must be 2 digits without a leading zero.',
                        }))
                      }
                      onChange={(nextVal) => {
                        patchDraft((p) => ({ ...p, phone: nextVal }));
                        if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                      }}
                      onBlurValidate={() => {
                        const parts = parseIranFixedPhoneParts(draft.phone);
                        const res = validateIranFixedPhoneParts(parts.provinceCode, parts.subscriber, 'تلفن', 'Phone');
                        setFieldErrors((prev) => ({
                          ...prev,
                          phone: res.valid ? undefined : isFa ? res.errorFa : res.errorEn,
                        }));
                      }}
                    />
                  )}
                  {fieldErrors.phone && (
                    <div className="text-[11px] text-[var(--status-danger)] mt-1">{fieldErrors.phone}</div>
                  )}
                </div>

                {/* Postal Code */}
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'کدپستی' : 'Postal Code'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    data-testid="employer-postal-code-input"
                    value={draft.postalCode || ''}
                    onChange={(e) => {
                      const val = isDraftBuiltIn ? e.target.value : sanitizeDigitsOnly(e.target.value, 10);
                      patchDraft((p) => ({ ...p, postalCode: val }));
                      if (fieldErrors.postalCode) setFieldErrors((prev) => ({ ...prev, postalCode: undefined }));
                    }}
                    onBlur={() => {
                      if (isDraftBuiltIn) return;
                      const res = validatePostalCode(draft.postalCode);
                      setFieldErrors((prev) => ({
                        ...prev,
                        postalCode: res.valid ? undefined : isFa ? res.errorFa : res.errorEn,
                      }));
                    }}
                    className={`w-full h-9 px-3 rounded-lg border bg-[var(--bg-canvas)] text-xs font-mono tabular-nums text-[var(--text-primary)] focus:outline-none ${
                      fieldErrors.postalCode
                        ? 'border-[var(--status-danger)]'
                        : 'border-[var(--border-subtle)] focus:border-[var(--accent-primary)]'
                    }`}
                  />
                  {fieldErrors.postalCode && (
                    <div className="text-[11px] text-[var(--status-danger)] mt-1">{fieldErrors.postalCode}</div>
                  )}
                </div>

                {/* Fax */}
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'فکس' : 'Fax'}
                  </label>
                  {isDraftBuiltIn ? (
                    <input
                      type="text"
                      value={draft.fax || ''}
                      onChange={(e) => patchDraft((p) => ({ ...p, fax: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  ) : (
                    <IranPhoneSplitInput
                      value={draft.fax || ''}
                      isFa={isFa}
                      testIdPrefix="employer-fax"
                      hasError={Boolean(fieldErrors.fax)}
                      onLeadingZeroAttempt={() =>
                        setFieldErrors((prev) => ({
                          ...prev,
                          fax: isFa
                            ? 'کد استان فکس باید ۲ رقم و بدون صفر ابتدایی باشد.'
                            : 'Fax province code must be 2 digits without a leading zero.',
                        }))
                      }
                      onChange={(nextVal) => {
                        patchDraft((p) => ({ ...p, fax: nextVal }));
                        if (fieldErrors.fax) setFieldErrors((prev) => ({ ...prev, fax: undefined }));
                      }}
                      onBlurValidate={() => {
                        const parts = parseIranFixedPhoneParts(draft.fax);
                        const res = validateIranFixedPhoneParts(parts.provinceCode, parts.subscriber, 'فکس', 'Fax');
                        setFieldErrors((prev) => ({
                          ...prev,
                          fax: res.valid ? undefined : isFa ? res.errorFa : res.errorEn,
                        }));
                      }}
                    />
                  )}
                  {fieldErrors.fax && (
                    <div className="text-[11px] text-[var(--status-danger)] mt-1">{fieldErrors.fax}</div>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>{isFa ? 'پست الکترونیکی' : 'Email'}</span>
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    data-testid="employer-email-input"
                    value={draft.email || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\s+/g, '');
                      patchDraft((p) => ({ ...p, email: val }));
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    onBlur={() => {
                      if (isDraftBuiltIn) return;
                      const res = validateEmail(draft.email);
                      setFieldErrors((prev) => ({
                        ...prev,
                        email: res.valid ? undefined : isFa ? res.errorFa : res.errorEn,
                      }));
                    }}
                    className={`w-full h-9 px-3 rounded-lg border bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none ${
                      fieldErrors.email
                        ? 'border-[var(--status-danger)]'
                        : 'border-[var(--border-subtle)] focus:border-[var(--accent-primary)]'
                    }`}
                  />
                  {fieldErrors.email && (
                    <div className="text-[11px] text-[var(--status-danger)] mt-1">{fieldErrors.email}</div>
                  )}
                </div>

                {/* Instagram */}
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    <Globe className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>{isFa ? 'اینستاگرام' : 'Instagram'}</span>
                  </label>
                  <div
                    dir="ltr"
                    className={`w-full h-9 rounded-lg border bg-[var(--bg-canvas)] flex items-center overflow-hidden transition-colors focus-within:border-[var(--accent-primary)] ${
                      fieldErrors.instagram ? 'border-[var(--status-danger)]' : 'border-[var(--border-subtle)]'
                    }`}
                  >
                    <span className="h-full px-2.5 bg-[var(--bg-subtle)]/80 border-r border-[var(--border-subtle)] text-xs font-mono font-semibold text-[var(--text-muted)] flex items-center select-none shrink-0">
                      @
                    </span>
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={30}
                      data-testid="employer-instagram-input"
                      value={draft.instagram || ''}
                      onChange={(e) => {
                        const val = isDraftBuiltIn ? e.target.value : sanitizeInstagramInput(e.target.value);
                        patchDraft((p) => ({ ...p, instagram: val }));
                        if (fieldErrors.instagram) setFieldErrors((prev) => ({ ...prev, instagram: undefined }));
                      }}
                      onBlur={() => {
                        if (isDraftBuiltIn) return;
                        const res = validateInstagramUsername(draft.instagram);
                        setFieldErrors((prev) => ({
                          ...prev,
                          instagram: res.valid ? undefined : isFa ? res.errorFa : res.errorEn,
                        }));
                      }}
                      className="flex-1 min-w-0 h-full px-2.5 bg-transparent text-xs font-mono text-[var(--text-primary)] focus:outline-none"
                    />
                  </div>
                  {fieldErrors.instagram && (
                    <div className="text-[11px] text-[var(--status-danger)] mt-1">{fieldErrors.instagram}</div>
                  )}
                </div>

                {/* LinkedIn */}
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    <Globe className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>{isFa ? 'لینکدین' : 'LinkedIn'}</span>
                  </label>
                  <div
                    dir="ltr"
                    className={`w-full h-9 rounded-lg border bg-[var(--bg-canvas)] flex items-center overflow-hidden transition-colors focus-within:border-[var(--accent-primary)] ${
                      fieldErrors.linkedin ? 'border-[var(--status-danger)]' : 'border-[var(--border-subtle)]'
                    }`}
                  >
                    <span className="h-full px-2.5 bg-[var(--bg-subtle)]/80 border-r border-[var(--border-subtle)] text-xs font-mono font-semibold text-[var(--text-muted)] flex items-center select-none shrink-0">
                      in/
                    </span>
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={100}
                      data-testid="employer-linkedin-input"
                      value={draft.linkedin || ''}
                      onChange={(e) => {
                        const val = isDraftBuiltIn ? e.target.value : sanitizeLinkedInInput(e.target.value);
                        patchDraft((p) => ({ ...p, linkedin: val }));
                        if (fieldErrors.linkedin) setFieldErrors((prev) => ({ ...prev, linkedin: undefined }));
                      }}
                      onBlur={() => {
                        if (isDraftBuiltIn) return;
                        const res = validateLinkedInUsername(draft.linkedin);
                        setFieldErrors((prev) => ({
                          ...prev,
                          linkedin: res.valid ? undefined : isFa ? res.errorFa : res.errorEn,
                        }));
                      }}
                      className="flex-1 min-w-0 h-full px-2.5 bg-transparent text-xs font-mono text-[var(--text-primary)] focus:outline-none"
                    />
                  </div>
                  {fieldErrors.linkedin && (
                    <div className="text-[11px] text-[var(--status-danger)] mt-1">{fieldErrors.linkedin}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Define & Upload Employer Forms (9 Operational Sections Matrix) */}
        {activeSection === 'forms' && (
          <div className="p-4 sm:p-6 space-y-5">
            {(() => {
              const formSummary = getEmployerFormSectionsSummary(draft);
              return (
                <div
                  data-testid="employer-9-sections-grid"
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                        <span>
                          {isFa
                            ? `آپلود و تعریف فرم‌های ۹ بخش عملیاتی (${draft.nameFa || 'کارفرمای جدید'})`
                            : `Upload & Define Forms for 9 Operational Sections (${draft.nameFa || 'New Employer'})`}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        {isFa
                          ? 'برای فعال‌سازی دسترسی به هر یک از ۹ بخش فرم‌های سامانه، فایل فرم مخصوص همان بخش را بارگذاری کنید تا بلافاصله فعال شود.'
                          : 'Upload each section’s form file below to immediately unlock access to that operational section.'}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[var(--accent-primary)] tabular-nums shrink-0">
                      {isFa
                        ? `${formSummary.unlockedCount} از ${formSummary.totalCount} بخش فعال`
                        : `${formSummary.unlockedCount} / ${formSummary.totalCount} active`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {formSummary.sections.map((sec) => {
                      const isHighlighted = highlightedFormSection === sec.sectionKey;
                      const primaryUploaded = sec.uploadedForms[0];
                      return (
                        <div
                          key={sec.sectionKey}
                          data-testid={`employer-section-slot-${sec.sectionKey}`}
                          className={`p-3 rounded-xl border transition-colors flex flex-col justify-between gap-2.5 ${
                            isHighlighted
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/50 ring-1 ring-[var(--accent-primary)]/30'
                              : sec.hasAccess
                                ? 'border-emerald-500/35 bg-[var(--bg-surface)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-[11.5px] font-bold text-[var(--text-primary)] leading-snug">
                                {sec.meta.order}. {isFa ? sec.meta.titleFa : sec.meta.titleEn}
                              </div>
                              <div className="text-[10.5px] text-[var(--text-muted)] truncate">
                                {sec.mode === 'uploaded' && primaryUploaded
                                  ? primaryUploaded.fileName
                                  : sec.mode === 'builtin'
                                    ? isFa
                                      ? 'فرم پیش‌فرض سامانه فعال است'
                                      : 'Built-in default form active'
                                    : isFa
                                      ? 'فرمی بارگذاری نشده (بخش قفل است)'
                                      : 'No form uploaded (section locked)'}
                              </div>
                            </div>
                            {sec.hasAccess ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <Lock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--border-subtle)]/70">
                            <label className="h-7 px-2.5 rounded-lg border border-dashed border-[var(--accent-primary)]/70 text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors">
                              <FileUp className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {sec.mode === 'uploaded'
                                  ? isFa
                                    ? 'افزودن / تعویض فرم'
                                    : 'Add / Replace'
                                  : isFa
                                    ? 'آپلود فرم'
                                    : 'Upload Form'}
                              </span>
                              <input
                                type="file"
                                data-testid={`section-upload-input-${sec.sectionKey}`}
                                accept=".xlsx,.xls,.xlsm,.csv,.docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.svg"
                                disabled={uploadingForm}
                                className="hidden"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || []);
                                  e.currentTarget.value = '';
                                  void handleUploadCompanyFormFiles(files, sec.sectionKey);
                                }}
                              />
                            </label>

                            <div className="flex items-center gap-1.5">
                              {primaryUploaded && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedUploadedFormId(primaryUploaded.id)}
                                  className="h-7 px-2 rounded-lg text-[10.5px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                                >
                                  {isFa ? 'تنظیمات' : 'Edit'}
                                </button>
                              )}
                              {sec.hasAccess &&
                                onOpenFormSection &&
                                !isCreatingNew &&
                                activeProject?.employerId === draft.id && (
                                  <button
                                    type="button"
                                    data-testid={`open-unlocked-section-${sec.sectionKey}`}
                                    onClick={() => onOpenFormSection(sec.sectionKey)}
                                    className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-semibold transition-colors"
                                  >
                                    {isFa ? 'ورود به بخش' : 'Open'}
                                  </button>
                                )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Upload Form Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {uploadedForms.map((uf) => (
                  <button
                    key={uf.id}
                    type="button"
                    onClick={() => setSelectedUploadedFormId(uf.id)}
                    className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      activeUploadedForm?.id === uf.id
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{uf.titleFa}</span>
                  </button>
                ))}

                <label className="h-9 px-3.5 rounded-lg border border-dashed border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors">
                  <FileUp className="w-4 h-4" />
                  <span>
                    {uploadingForm
                      ? isFa
                        ? 'در حال پردازش فایل...'
                        : 'Processing...'
                      : isFa
                        ? 'آپلود فرم کارفرما (اکسل، ورد، پی‌دی‌اف یا تصویر)'
                        : 'Upload Employer Form (Excel, Word, PDF, Image)'}
                  </span>
                  <input
                    type="file"
                    data-testid="company-form-upload-input"
                    accept=".xlsx,.xls,.xlsm,.csv,.docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.svg"
                    multiple
                    disabled={uploadingForm}
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      e.currentTarget.value = '';
                      void handleUploadCompanyFormFiles(files);
                    }}
                  />
                </label>
              </div>
            </div>

            {!activeUploadedForm ? (
              <div className="p-8 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)]/50 text-center space-y-2">
                <FileUp className="w-7 h-7 text-[var(--accent-primary)] mx-auto" />
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  {isFa
                    ? 'فرم آپلودی برای این کارفرما ثبت نشده است'
                    : 'No uploaded forms for this employer yet'}
                </div>
                <p className="text-xs text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed">
                  {isFa
                    ? 'برای کارفرماهای جدید یا فرم‌های اختصاصی، فایل فرم آماده (اکسل، ورد، پی‌دی‌اف یا تصویر) را آپلود کنید تا سامانه ستون‌ها و متغیرها را به داده‌های انبار متصل کند.'
                    : 'Upload official Excel, Word, PDF, or Image templates to connect fields and print directly from warehouse records.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Uploaded Form Binding & Print Settings */}
                <div className="xl:col-span-6 space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                  <div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {activeUploadedForm.titleFa}
                      </div>
                      <div dir="ltr" className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                        {activeUploadedForm.fileName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteUploadedForm(activeUploadedForm.id)}
                      className="text-xs text-[var(--status-danger)] hover:underline flex items-center gap-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'حذف فرم' : 'Remove'}</span>
                    </button>
                  </div>

                  {/* Target App Section Matching */}
                  <div
                    data-testid="target-section-card"
                    className={`p-3 rounded-lg border space-y-2 ${
                      activeUploadedForm.targetSectionConfirmed
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-amber-500/40 bg-amber-500/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-primary)]">
                        {activeUploadedForm.targetSectionConfirmed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        )}
                        <span>{isFa ? 'بخش عملیاتی متناظر در سامانه:' : 'Target Operational Section:'}</span>
                      </div>
                      {activeUploadedForm.targetSectionConfirmed && (
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          {isFa ? 'تأیید شده' : 'Confirmed'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        data-testid="target-section-select"
                        value={activeUploadedForm.targetAppSection || 'custom_standalone'}
                        onChange={(e) =>
                          patchUploadedForm((f) => ({
                            ...f,
                            targetAppSection: e.target.value as BuiltInFormKey | 'custom_standalone',
                            targetSectionConfirmed: true,
                          }))
                        }
                        className="flex-1 min-w-[200px] h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      >
                        <option value="custom_standalone">
                          {isFa ? 'فرم مستقل (در بخش فرم‌های آپلودشده کارفرما)' : 'Standalone Uploaded Form'}
                        </option>
                        {OPERATIONAL_FORM_SECTIONS.map((sec) => (
                          <option key={sec.key} value={sec.key}>
                            {isFa
                              ? `بخش ${sec.order}: ${sec.titleFa}`
                              : `Section ${sec.order}: ${sec.titleEn}`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        data-testid="confirm-target-section-btn"
                        onClick={() =>
                          patchUploadedForm((f) => ({
                            ...f,
                            targetSectionConfirmed: !f.targetSectionConfirmed,
                          }))
                        }
                        className={`h-8 px-3 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                          activeUploadedForm.targetSectionConfirmed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] hover:bg-[var(--accent-hover)]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {activeUploadedForm.targetSectionConfirmed
                            ? isFa
                              ? 'تأیید شد'
                              : 'Confirmed'
                            : isFa
                              ? 'تأیید انطباق'
                              : 'Confirm'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Form Title & Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'عنوان فرم *' : 'Form Title *'}
                      </label>
                      <input
                        type="text"
                        data-testid="uploaded-form-title-input"
                        value={activeUploadedForm.titleFa}
                        onChange={(e) => patchUploadedForm((f) => ({ ...f, titleFa: e.target.value }))}
                        className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'کد مدرک فرم' : 'Form Code'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={activeUploadedForm.formCode || ''}
                        onChange={(e) => patchUploadedForm((f) => ({ ...f, formCode: e.target.value }))}
                        placeholder="FQP-WH-014"
                        className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                      />
                    </div>
                    {activeUploadedForm.fileType === 'excel' && activeExcelSheetMeta && (
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'برگه فعال اکسل' : 'Active Worksheet'}
                        </label>
                        <select
                          value={activeUploadedForm.sheetName || activeExcelSheetMeta.activeSheetName}
                          onChange={(e) => {
                            const nextSheet = e.target.value;
                            const parsed = parseExcelSheetModel(activeUploadedForm.fileDataBase64, nextSheet);
                            patchUploadedForm((f) => ({
                              ...f,
                              sheetName: nextSheet,
                              detectedTokens: parsed.detectedTokens,
                              detectedFormulas: parsed.detectedFormulas,
                            }));
                          }}
                          dir="ltr"
                          className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                        >
                          {activeExcelSheetMeta.sheetNames.map((sn) => (
                            <option key={sn} value={sn}>
                              {sn}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Multi-Source Data Binding */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                    {(() => {
                      const currentSources: UploadedFormDataSource[] =
                        activeUploadedForm.dataSources && activeUploadedForm.dataSources.length > 0
                          ? activeUploadedForm.dataSources
                          : [activeUploadedForm.dataSource || 'general'];
                      const setSourcesCount = (count: number) => {
                        const clamped = Math.min(5, Math.max(1, count));
                        const next = [...currentSources];
                        const fallbacks: UploadedFormDataSource[] = ['general', 'detailed', 'siteEntry', 'miv', 'gcv'];
                        while (next.length < clamped) {
                          const candidate = fallbacks.find((s) => !next.includes(s)) || 'detailed';
                          next.push(candidate);
                        }
                        const trimmed = next.slice(0, clamped);
                        patchUploadedForm((f) => ({ ...f, dataSource: trimmed[0], dataSources: trimmed }));
                      };
                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                              <span>{isFa ? 'منابع خواندن اطلاعات از سامانه:' : 'System Data Sources:'}</span>
                            </span>
                            <select
                              data-testid="multi-source-count-select"
                              value={currentSources.length}
                              onChange={(e) => setSourcesCount(Number(e.target.value) || 1)}
                              className="h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                            >
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            {currentSources.map((src, sIdx) => (
                              <div key={`${sIdx}-${src}`} className="flex items-center gap-2">
                                <span className="text-[10.5px] font-semibold text-[var(--text-muted)] w-14 shrink-0">
                                  {isFa ? `منبع ${sIdx + 1}:` : `Src ${sIdx + 1}:`}
                                </span>
                                <select
                                  data-testid={`data-source-select-${sIdx}`}
                                  value={src}
                                  onChange={(e) => {
                                    const nextVal = e.target.value as UploadedFormDataSource;
                                    const updated = currentSources.map((item, i) => (i === sIdx ? nextVal : item));
                                    patchUploadedForm((f) => ({
                                      ...f,
                                      dataSource: updated[0],
                                      dataSources: updated,
                                    }));
                                  }}
                                  className="flex-1 h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                                >
                                  {UPLOADED_FORM_DATA_SOURCE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {isFa ? opt.labelFa : opt.labelEn}
                                    </option>
                                  ))}
                                </select>
                                {currentSources.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = currentSources.filter((_, i) => i !== sIdx);
                                      patchUploadedForm((f) => ({
                                        ...f,
                                        dataSource: updated[0] || 'general',
                                        dataSources: updated,
                                      }));
                                    }}
                                    className="p-1 text-[var(--status-danger)]"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Detected Excel Formulas */}
                  {activeUploadedForm.fileType === 'excel' &&
                    (activeUploadedForm.detectedFormulas || []).length > 0 && (
                      <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                        <div className="text-[11px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>
                            {isFa
                              ? `فرمول‌های شناسایی‌شده (${activeUploadedForm.detectedFormulas?.length} سلول):`
                              : `Detected Formulas (${activeUploadedForm.detectedFormulas?.length}):`}
                          </span>
                        </div>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pe-1">
                          {(activeUploadedForm.detectedFormulas || []).map((fm, fIdx) => (
                            <div
                              key={`${fm.cellRef}-${fIdx}`}
                              className="grid grid-cols-12 gap-1.5 items-center bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-2 py-1"
                            >
                              <div dir="ltr" className="col-span-2 text-[10.5px] font-mono font-bold text-[var(--accent-primary)]">
                                {fm.cellRef}
                              </div>
                              <div dir="ltr" className="col-span-4 text-[10px] font-mono text-[var(--text-secondary)] truncate" title={fm.formula}>
                                {fm.formula}
                              </div>
                              <select
                                value={fm.boundFieldKey || ''}
                                onChange={(e) =>
                                  patchUploadedForm((f) => ({
                                    ...f,
                                    detectedFormulas: (f.detectedFormulas || []).map((item, i) =>
                                      i === fIdx ? { ...item, boundFieldKey: e.target.value || undefined } : item,
                                    ),
                                  }))
                                }
                                className="col-span-6 h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[10.5px]"
                              >
                                <option value="">{isFa ? '-- حفظ فرمول اصلی --' : '-- Keep Formula --'}</option>
                                {SAMAAN_BINDABLE_FIELDS.map((sf) => (
                                  <option key={sf.key} value={sf.key}>
                                    {isFa ? sf.labelFa : sf.labelEn}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Placeholder {{Token}} Bindings */}
                  {(activeUploadedForm.fileType === 'excel' ||
                    activeUploadedForm.fileType === 'word' ||
                    activeUploadedForm.fileType === 'image') && (
                    <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[var(--text-primary)]">
                          {isFa ? 'اتصال متغیرهای {{...}} به فیلدهای سامانه:' : 'Template {{Placeholder}} Bindings:'}
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            dir="ltr"
                            value={newTokenName}
                            onChange={(e) => setNewTokenName(e.target.value)}
                            placeholder="token"
                            className="w-24 h-6 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[10.5px] font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const tok = newTokenName.trim().replace(/^\{\{|\}\}$/g, '').trim();
                              if (!tok) return;
                              patchUploadedForm((f) => ({
                                ...f,
                                detectedTokens: Array.from(new Set([...(f.detectedTokens || []), tok])),
                              }));
                              setNewTokenName('');
                            }}
                            className="h-6 px-2 rounded border border-[var(--border-subtle)] text-[10.5px] font-semibold hover:bg-[var(--bg-subtle)]"
                          >
                            + {isFa ? 'افزودن' : 'Add'}
                          </button>
                        </div>
                      </div>
                      {(activeUploadedForm.detectedTokens || []).length > 0 && (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pe-1">
                          {(activeUploadedForm.detectedTokens || []).map((tok) => (
                            <div key={tok} className="grid grid-cols-12 gap-1.5 items-center">
                              <div dir="ltr" className="col-span-5 text-[11px] font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 truncate">
                                {`{{${tok}}}`}
                              </div>
                              <select
                                value={activeUploadedForm.tokenBindings?.[tok] || ''}
                                onChange={(e) =>
                                  patchUploadedForm((f) => ({
                                    ...f,
                                    tokenBindings: {
                                      ...(f.tokenBindings || {}),
                                      [tok]: e.target.value,
                                    },
                                  }))
                                }
                                className="col-span-6 h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]"
                              >
                                <option value="">{isFa ? '-- تطبیق خودکار --' : '-- Auto --'}</option>
                                {SAMAAN_BINDABLE_FIELDS.map((sf) => (
                                  <option key={sf.key} value={sf.key}>
                                    {isFa ? sf.labelFa : sf.labelEn}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  patchUploadedForm((f) => {
                                    const nextBindings = { ...(f.tokenBindings || {}) };
                                    delete nextBindings[tok];
                                    return {
                                      ...f,
                                      detectedTokens: (f.detectedTokens || []).filter((x) => x !== tok),
                                      tokenBindings: nextBindings,
                                    };
                                  })
                                }
                                className="col-span-1 text-[var(--status-danger)] flex justify-center"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* A4 Print Settings */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                    <div className="text-[11px] font-bold text-[var(--text-primary)]">
                      {isFa ? 'تنظیمات چاپ A4:' : 'A4 Print Settings:'}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                          {isFa ? 'جهت صفحه' : 'Orientation'}
                        </label>
                        <select
                          value={activeUploadedForm.printSettings.orientation}
                          onChange={(e) =>
                            patchUploadedPrintSettings({ orientation: e.target.value as 'portrait' | 'landscape' })
                          }
                          className="w-full h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]"
                        >
                          <option value="portrait">{isFa ? 'عمودی' : 'Portrait'}</option>
                          <option value="landscape">{isFa ? 'افقی' : 'Landscape'}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                          {isFa ? 'فونت (pt)' : 'Font (pt)'}
                        </label>
                        <input
                          type="number"
                          min={6}
                          max={20}
                          value={activeUploadedForm.printSettings.fontSizePt}
                          onChange={(e) =>
                            patchUploadedPrintSettings({
                              fontSizePt: Math.min(20, Math.max(6, Number(e.target.value) || 10)),
                            })
                          }
                          className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-center"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                          {isFa ? 'مقیاس (%)' : 'Scale (%)'}
                        </label>
                        <input
                          type="number"
                          min={40}
                          max={150}
                          value={activeUploadedForm.printSettings.scalePercent}
                          onChange={(e) =>
                            patchUploadedPrintSettings({
                              scalePercent: Math.min(150, Math.max(40, Number(e.target.value) || 100)),
                            })
                          }
                          className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-center"
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-[11px] pt-4 cursor-pointer text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={activeUploadedForm.printSettings.autoRowHeight}
                          onChange={(e) => patchUploadedPrintSettings({ autoRowHeight: e.target.checked })}
                        />
                        <span>{isFa ? 'سطر خودکار' : 'AutoFit'}</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Live A4 Preview */}
                <div className="xl:col-span-6 space-y-2">
                  <div className="text-xs font-bold text-[var(--text-secondary)]">
                    {isFa ? 'پیش‌نمایش فرم بارگذاری‌شده (A4)' : 'Uploaded Form Preview (A4)'}
                  </div>
                  <UploadedFormA4Sheet
                    form={deferredUploadedForm || activeUploadedForm}
                    employer={resolvedPreview}
                    headerTokens={samplePreviewData.headerTokens}
                    lineRows={samplePreviewData.lineRows}
                    isFa={isFa}
                    onOrientationChange={(orientation) => patchUploadedPrintSettings({ orientation })}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export interface EmployersStudioViewProps {
  initialEmployerId?: string;
  initialSection?: 'profile' | 'forms';
  initialFormSection?: OperationalFormSectionKey | null;
  navigationToken?: number;
  onOpenFormSection?: (sectionKey: OperationalFormSectionKey) => void;
}

export const EmployersStudioView: React.FC<EmployersStudioViewProps> = ({
  initialEmployerId,
  initialSection,
  initialFormSection,
  navigationToken,
  onOpenFormSection,
}) => {
  return (
    <EmployersStudioWorkspace
      initialEmployerId={initialEmployerId}
      initialSection={initialSection}
      initialFormSection={initialFormSection}
      navigationToken={navigationToken}
      onOpenFormSection={onOpenFormSection}
    />
  );
};
