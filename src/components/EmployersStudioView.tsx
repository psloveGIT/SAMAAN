import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileUp,
  ImagePlus,
  LayoutTemplate,
  Plus,
  RotateCcw,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError } from '../lib/api.ts';
import {
  BUILT_IN_FORM_DEFINITIONS,
  DEFAULT_UPLOADED_FORM_PRINT_SETTINGS,
  getBuiltInFormDefinition,
  resolveBuiltInFormDesign,
  resolveEmployerLogoById,
  sanitizeEmployerProfile,
} from '../shared/employers.ts';
import type { ResolvedEmployerProfile } from '../shared/employers.ts';
import type {
  BuiltInFormKey,
  EmployerFormTemplate,
  EmployerLogoAsset,
  EmployerProfile,
  EmployerUploadedForm,
  FormHeaderLayout,
  UploadedFormDataSource,
  UploadedFormPrintSettings,
} from '../shared/types.ts';
import {
  parseExcelSheetModel,
  parseUploadedFormFile,
  SAMAAN_BINDABLE_FIELDS,
} from '../shared/uploadedFormEngine.ts';
import {
  OfficialExtraMetaStrip,
  OfficialFormFooter,
  OfficialFormHeader,
  OfficialFormSignatures,
} from './OfficialSheetHeader.tsx';
import { UploadedFormA4Sheet } from './UploadedFormA4Sheet.tsx';

function createEmptyDraft(nameFa = ''): EmployerProfile {
  const now = new Date().toISOString();
  return {
    id: '',
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

function toResolvedPreviewProfile(draft: EmployerProfile): ResolvedEmployerProfile {
  const shortName = draft.shortName?.trim() || draft.nameFa?.trim() || 'کارفرما';
  return {
    id: draft.id || 'preview',
    isConfigured: Boolean(draft.nameFa?.trim() || draft.companyFullName?.trim()),
    nameFa: draft.nameFa?.trim() || 'پیش‌نمایش کارفرما',
    nameEn: draft.nameEn?.trim() || draft.nameFa?.trim() || 'Employer Preview',
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
    contractRef: draft.contractRef,
    logos: draft.logos || [],
    formTemplates: draft.formTemplates || {},
    customForms: draft.customForms || [],
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
      // Keep SVG cleanly as-is without rasterizing
      if (file.type === 'image/svg+xml') {
        resolve(result);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxDim = 520;
        if (img.width <= maxDim && img.height <= maxDim && result.length < 180_000) {
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

const LAYOUT_OPTIONS: { value: FormHeaderLayout; labelFa: string; labelEn: string }[] = [
  { value: 'classic_right_logo', labelFa: 'کلاسیک (لوگو راست · عنوان وسط · کد چپ)', labelEn: 'Classic (Right Logo)' },
  { value: 'split_dual_logo', labelFa: 'دو لوگویی (لوگوی اول راست · لوگوی دوم چپ)', labelEn: 'Dual Logo Split' },
  { value: 'left_logo', labelFa: 'لوگو چپ (کد راست · عنوان وسط · لوگو چپ)', labelEn: 'Left Logo' },
  { value: 'minimal_no_logo', labelFa: 'ساده بدون لوگو', labelEn: 'Minimal (No Logo)' },
];

const ACCENT_PRESETS = ['#000000', '#0f172a', '#0369a1', '#0f766e', '#1d4ed8', '#7c2d12'];

interface EmployersStudioWorkspaceProps {
  onAssignEmployer?: (employerId: string) => void;
  compact?: boolean;
}

export const EmployersStudioWorkspace: React.FC<EmployersStudioWorkspaceProps> = ({
  onAssignEmployer,
  compact = false,
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

  const [selectedId, setSelectedId] = useState<string>(() => employers[0]?.id || '__new__');
  const [draft, setDraft] = useState<EmployerProfile>(() => {
    const first = employers[0];
    return first ? structuredClone(first) : createEmptyDraft('');
  });
  const [studioTab, setStudioTab] = useState<'profile' | 'builtin' | 'custom'>('profile');
  const [selectedFormKey, setSelectedFormKey] = useState<BuiltInFormKey>('siteEntry');
  const [selectedUploadedFormId, setSelectedUploadedFormId] = useState<string>(
    () => employers[0]?.uploadedForms?.[0]?.id || '',
  );
  const [uploadingForm, setUploadingForm] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId === '__new__') return;
    const found = employers.find((e) => e.id === selectedId);
    if (found && !dirty) {
      setDraft(structuredClone(found));
    } else if (!found && employers.length > 0 && !dirty) {
      setSelectedId(employers[0].id);
      setDraft(structuredClone(employers[0]));
    }
  }, [employers, selectedId, dirty]);

  const selectEmployer = (emp: EmployerProfile) => {
    setSelectedId(emp.id);
    setDraft(structuredClone(emp));
    setSelectedUploadedFormId(emp.uploadedForms?.[0]?.id || '');
    setDirty(false);
    setConfirmDeleteId(null);
  };

  const startNewEmployer = () => {
    setSelectedId('__new__');
    setDraft(createEmptyDraft(''));
    setSelectedUploadedFormId('');
    setStudioTab('profile');
    setDirty(true);
    setConfirmDeleteId(null);
  };

  const patchDraft = (updater: (prev: EmployerProfile) => EmployerProfile) => {
    setDraft((prev) => updater(prev));
    setDirty(true);
  };

  const handleUploadLogos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: EmployerLogoAsset[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (file.size > 4 * 1024 * 1024) {
        notify('warning', isFa ? `حجم فایل ${file.name} بیش از ۴ مگابایت است.` : `${file.name} exceeds 4MB.`);
        continue;
      }
      try {
        const dataUrl = await processLogoImageFile(file);
        const baseName = file.name.replace(/\.[^.]+$/, '') || `لوگو ${i + 1}`;
        added.push({
          id: `logo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
      isFa ? `${added.length} لوگو به گالری کارفرما اضافه شد.` : `Added ${added.length} logo(s).`,
    );
  };

  const handleSave = async () => {
    if (!draft.nameFa.trim()) {
      notify('error', isFa ? 'نام کارفرما / شرکت الزامی است.' : 'Employer name is required.');
      setStudioTab('profile');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<EmployerProfile> = {
        ...draft,
        nameFa: draft.nameFa.trim(),
        companyFullName: draft.companyFullName.trim() || draft.nameFa.trim(),
        shortName: draft.shortName.trim() || draft.nameFa.trim(),
      };
      let saved: EmployerProfile;
      if (selectedId === '__new__' || !draft.id) {
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
          ? `اطلاعات، لوگوها و قالب فرم‌های «${saved.nameFa}» ذخیره شد.`
          : `Saved employer "${saved.nameFa}".`,
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (emp: EmployerProfile) => {
    setSaving(true);
    try {
      const copy = await createEmployer({
        ...emp,
        id: undefined,
        nameFa: `${emp.nameFa} (${isFa ? 'کپی' : 'Copy'})`,
      });
      setSelectedId(copy.id);
      setDraft(structuredClone(copy));
      setDirty(false);
      notify('success', isFa ? 'نسخه کپی کارفرما ایجاد شد.' : 'Employer duplicated.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
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
        setSelectedId('__new__');
        setDraft(createEmptyDraft(''));
      }
      notify('success', isFa ? 'کارفرما حذف شد.' : 'Employer deleted.');
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
    a.download = `samaan-employer-${draft.shortName || draft.nameFa || 'template'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplate = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = sanitizeEmployerProfile(JSON.parse(text));
      if (!parsed) {
        notify('error', isFa ? 'فایل الگوی کارفرما نامعتبر است.' : 'Invalid employer template JSON.');
        return;
      }
      const created = await createEmployer({ ...parsed, id: undefined });
      setSelectedId(created.id);
      setDraft(structuredClone(created));
      setDirty(false);
      notify('success', isFa ? `کارفرمای «${created.nameFa}» وارد شد.` : `Imported "${created.nameFa}".`);
    } catch {
      notify('error', isFa ? 'خطا در خواندن فایل الگو.' : 'Failed to parse template JSON.');
    }
  };

  const handleAssignToActive = async () => {
    if (!draft.id || !activeProject) return;
    try {
      if (dirty) await handleSave();
      if (onAssignEmployer) {
        onAssignEmployer(draft.id);
      } else {
        await renameProject(activeProject.id, {
          name: activeProject.name,
          code: activeProject.code,
          employerId: draft.id,
        });
        notify(
          'success',
          isFa
            ? `کارفرمای پروژه فعال «${activeProject.name}» به «${draft.nameFa}» تنظیم شد.`
            : `Assigned "${draft.nameFa}" to active project.`,
        );
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const resolvedPreview = useMemo(() => toResolvedPreviewProfile(draft), [draft]);
  const builtInDef = getBuiltInFormDefinition(selectedFormKey);
  const currentTpl: EmployerFormTemplate = draft.formTemplates?.[selectedFormKey] || {
    formKey: selectedFormKey,
  };
  const resolvedFormDesign = useMemo(
    () => resolveBuiltInFormDesign(resolvedPreview, selectedFormKey),
    [resolvedPreview, selectedFormKey],
  );

  const patchBuiltInTemplate = (patch: Partial<EmployerFormTemplate>) => {
    patchDraft((prev) => ({
      ...prev,
      formTemplates: {
        ...(prev.formTemplates || {}),
        [selectedFormKey]: {
          ...(prev.formTemplates?.[selectedFormKey] || { formKey: selectedFormKey }),
          ...patch,
          formKey: selectedFormKey,
        },
      },
    }));
  };

  const resetBuiltInTemplate = () => {
    patchDraft((prev) => {
      const next = { ...(prev.formTemplates || {}) };
      delete next[selectedFormKey];
      return { ...prev, formTemplates: next };
    });
  };

  const uploadedForms = draft.uploadedForms || [];
  const activeUploadedForm =
    uploadedForms.find((f) => f.id === selectedUploadedFormId) || uploadedForms[0] || null;

  const activeExcelSheetMeta = useMemo(() => {
    if (!activeUploadedForm || activeUploadedForm.fileType !== 'excel') return null;
    try {
      return parseExcelSheetModel(activeUploadedForm.fileDataBase64, activeUploadedForm.sheetName);
    } catch {
      return null;
    }
  }, [activeUploadedForm]);

  const handleUploadCompanyFormFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingForm(true);
    try {
      const createdList: EmployerUploadedForm[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        if (file.size > 8 * 1024 * 1024) {
          notify('warning', isFa ? `حجم فایل ${file.name} بیش از ۸ مگابایت است.` : `${file.name} exceeds 8MB.`);
          continue;
        }
        try {
          const parsed = await parseUploadedFormFile(file, 'general');
          createdList.push(parsed);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : `خطا در خواندن ${file.name}`);
        }
      }
      if (createdList.length > 0) {
        patchDraft((prev) => ({
          ...prev,
          uploadedForms: [...(prev.uploadedForms || []), ...createdList],
        }));
        setSelectedUploadedFormId(createdList[0].id);
        notify(
          'success',
          isFa
            ? `${createdList.length} فرم رسمی شرکت اضافه شد. لطفاً دکمه «ذخیره تغییرات» را بزنید.`
            : `Uploaded ${createdList.length} form(s). Remember to save.`,
        );
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

  const deleteUploadedForm = (id: string) => {
    patchDraft((prev) => {
      const remaining = (prev.uploadedForms || []).filter((f) => f.id !== id);
      setSelectedUploadedFormId(remaining[0]?.id || '');
      return { ...prev, uploadedForms: remaining };
    });
  };

  const samplePreviewData = useMemo(() => {
    const headerTokens: Record<string, string> = {
      projectName: activeProject?.name || 'نیروگاه نمونه (پیش‌نمایش)',
      contractNo: activeProject?.code || draft.contractRef || 'CNT-1404',
      employerName: draft.companyFullName || draft.nameFa || 'کارفرما',
      todayDate: '1404/02/15',
      docNo: activeUploadedForm?.formCode || 'FRM-001',
      minutesNo: '404-012',
      releaseNoteNo: 'RN-8841',
      packingListNo: 'PK-1042-A',
      packageNo: 'PKG-03',
      arrivalDate: '1404/02/10',
      supplier: 'شرکت تأمین‌کننده نمونه',
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
      dimensions: '3.2 × 1.8 × 1.5',
      overallStatus: 'تحویل در کارگاه',
      remarks: 'تست خودکار تطبیق ارتفاع سطر با متن طولانی تجهیز جهت بررسی نمایش صحیح و چاپ A4 بدون برش متن در سلول',
    };
    const lineRows: Array<Record<string, string>> = [
      {
        ...headerTokens,
        rowNo: '1',
        itemNo: '001',
        itemCode: 'TUR-VALV-402',
        description:
          'شیر کنترل فشار اصلی توربین بخار با فلنج کلاس ۶۰۰ و عملگر الکتریکی کامل همراه با متعلقات نصب و دفترچه راهنما',
        packingQty: '2',
        actualQty: '2',
        countingUnit: 'دستگاه',
        shortage: '0',
        damagedQty: '0',
        storageLocation: 'سالن A - ردیف ۳',
      },
      {
        ...headerTokens,
        rowNo: '2',
        itemNo: '002',
        itemCode: 'GSK-109',
        description: 'واشر آب‌بندی فشار بالا',
        packingQty: '10',
        actualQty: '10',
        countingUnit: 'عدد',
        shortage: '0',
        damagedQty: '0',
        storageLocation: 'قفسه B12',
      },
    ];
    return { headerTokens, lineRows };
  }, [activeProject?.name, activeProject?.code, activeUploadedForm?.formCode, draft]);

  const logoSelectorGrid = (
    selectedLogoId: string | undefined,
    onSelect: (val: string | undefined) => void,
    allowDefaultOption = true,
  ) => (
    <div className="flex flex-wrap gap-2">
      {allowDefaultOption && (
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          className={`h-14 px-2.5 rounded-lg border text-[11px] font-medium flex flex-col items-center justify-center transition-colors ${
            !selectedLogoId
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
          }`}
        >
          <span>{isFa ? 'پیش‌فرض کارفرما' : 'Default'}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => onSelect('__none__')}
        className={`h-14 px-2.5 rounded-lg border text-[11px] font-medium flex flex-col items-center justify-center transition-colors ${
          selectedLogoId === '__none__'
            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
        }`}
      >
        <span>{isFa ? 'بدون لوگو' : 'No Logo'}</span>
      </button>
      {draft.logos.map((logo) => {
        const active = selectedLogoId === logo.id;
        return (
          <button
            key={logo.id}
            type="button"
            onClick={() => onSelect(logo.id)}
            className={`h-14 px-2 rounded-lg border flex items-center gap-2 transition-colors ${
              active
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                : 'border-[var(--border-subtle)] bg-white'
            }`}
          >
            <img
              src={logo.dataUrl}
              alt={logo.label}
              className="h-10 w-10 object-contain shrink-0"
            />
            <span className="text-[11px] font-medium text-slate-800 max-w-[90px] truncate">
              {logo.label}
            </span>
          </button>
        );
      })}
      {draft.logos.length === 0 && (
        <div className="text-[11px] text-[var(--text-muted)] self-center">
          {isFa
            ? 'ابتدا در تب «اطلاعات پایه و گالری لوگوها» لوگو آپلود کنید.'
            : 'Upload logos in Base Profile first.'}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Left Master List of Employers */}
      <div className="lg:col-span-4 xl:col-span-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="p-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <span className="text-xs font-bold truncate">
              {isFa ? 'فهرست کارفرمایان / نیروگاه‌ها' : 'Employers Registry'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <label
              title={isFa ? 'ورود الگوی JSON کارفرما' : 'Import JSON'}
              className="h-8 w-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] flex items-center justify-center cursor-pointer text-[var(--text-secondary)]"
            >
              <Upload className="w-3.5 h-3.5" />
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportTemplate(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={startNewEmployer}
              className="h-8 px-2.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isFa ? 'جدید' : 'New'}</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-[var(--border-subtle)] max-h-[65vh] overflow-y-auto">
          {employers.length === 0 ? (
            <div className="p-4 text-xs text-[var(--text-muted)] space-y-2 leading-relaxed">
              <div className="font-semibold text-[var(--text-primary)]">
                {isFa ? 'نرم‌افزار در حالت خام است' : 'System is in Raw Default State'}
              </div>
              <p>
                {isFa
                  ? 'هیچ کارفرمایی به‌صورت پیش‌فرض تعریف نشده است. جزئیات کارفرما و لوگوهای آن را از پنل مقابل وارد کنید تا فرم‌های اختصاصی هر نیروگاه آماده شوند.'
                  : 'No built-in employer presets exist. Define your first employer profile, upload logos, and customize its forms.'}
              </p>
            </div>
          ) : (
            employers.map((emp) => {
              const active = selectedId === emp.id;
              const defLogo = emp.logos.find((l) => l.isDefault) || emp.logos[0];
              const isAssigned = activeProject?.employerId === emp.id;
              const customTplCount = Object.keys(emp.formTemplates || {}).length;
              return (
                <div
                  key={emp.id}
                  onClick={() => selectEmployer(emp)}
                  className={`p-3 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                    active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-lg border border-[var(--border-subtle)] bg-white flex items-center justify-center shrink-0 overflow-hidden">
                      {defLogo ? (
                        <img
                          src={defLogo.dataUrl}
                          alt={emp.nameFa}
                          className="w-8 h-8 object-contain"
                        />
                      ) : (
                        <Building2 className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                        <span>{emp.nameFa}</span>
                        {isAssigned && (
                          <span className="text-[10px] font-semibold text-[var(--accent-primary)]">
                            · {isFa ? 'فعال' : 'Active'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] tabular-nums truncate">
                        {emp.logos.length} {isFa ? 'لوگو' : 'logos'} · {customTplCount}{' '}
                        {isFa ? 'قالب' : 'templates'} · {emp.uploadedForms?.length || 0}{' '}
                        {isFa ? 'فرم آپلودی' : 'uploaded'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Studio Workspace */}
      <div className="lg:col-span-8 xl:col-span-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        {/* Studio Header Action Bar */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
              {selectedId === '__new__'
                ? isFa
                  ? 'تعریف کارفرما / نیروگاه جدید'
                  : 'Create New Employer'
                : draft.nameFa || (isFa ? 'ویرایش کارفرما' : 'Edit Employer')}
            </h3>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex flex-wrap items-center gap-2">
              <span>{draft.companyFullName || (isFa ? 'نام کامل شرکت وارد نشده است' : 'No full title yet')}</span>
              {dirty && (
                <span className="text-[var(--status-warning)] font-semibold">
                  · {isFa ? 'تغییرات ذخیره نشده' : 'Unsaved changes'}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!compact && draft.id && activeProject && activeProject.employerId !== draft.id && (
              <button
                type="button"
                onClick={handleAssignToActive}
                className="h-9 px-3 rounded-lg border border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-xs font-semibold flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isFa ? 'اعمال روی پروژه فعال' : 'Assign to Active Project'}</span>
              </button>
            )}
            {compact && draft.id && onAssignEmployer && (
              <button
                type="button"
                onClick={handleAssignToActive}
                className="h-9 px-3 rounded-lg border border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-xs font-semibold flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isFa ? 'انتخاب این کارفرما' : 'Select This Employer'}</span>
              </button>
            )}
            {draft.id && (
              <>
                <button
                  type="button"
                  onClick={handleExportTemplate}
                  title={isFa ? 'خروجی JSON الگوی کارفرما' : 'Export JSON'}
                  className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isFa ? 'خروجی الگو' : 'Export'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicate(draft)}
                  title={isFa ? 'کپی کارفرما' : 'Duplicate'}
                  className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {confirmDeleteId === draft.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleDelete(draft.id)}
                      className="h-9 px-2.5 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold"
                    >
                      {isFa ? 'تأیید حذف' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] text-xs"
                    >
                      {isFa ? 'انصراف' : 'Cancel'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(draft.id)}
                    className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] text-xs flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره تغییرات' : 'Save Employer'}</span>
            </button>
          </div>
        </div>

        {/* Studio Section Tabs */}
        <div className="px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap gap-1">
          {[
            {
              key: 'profile' as const,
              icon: <Building2 className="w-3.5 h-3.5" />,
              label: isFa ? '۱. اطلاعات پایه و گالری لوگوها' : '1. Identity & Multi-Logos',
            },
            {
              key: 'builtin' as const,
              icon: <LayoutTemplate className="w-3.5 h-3.5" />,
              label: isFa ? '۲. طراحی و لوگوی فرم‌های عملیاتی' : '2. Design Operational Forms',
            },
            {
              key: 'custom' as const,
              icon: <FileUp className="w-3.5 h-3.5" />,
              label: isFa ? '۳. فرم‌های آپلودی شرکتی (Word / Excel / PDF)' : '3. Uploaded Company Forms',
            },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStudioTab(tab.key)}
              className={`h-10 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                studioTab === tab.key
                  ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab 1: Base Identity + Multi-Logo Gallery */}
        {studioTab === 'profile' && (
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'نام کارفرما / نیروگاه (فارسی) *' : 'Employer Name (FA) *'}
                </label>
                <input
                  type="text"
                  value={draft.nameFa}
                  onChange={(e) => patchDraft((p) => ({ ...p, nameFa: e.target.value }))}
                  placeholder={isFa ? 'مثال: شرکت تولید نیروی برق...' : 'Employer Name'}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'نام لاتین کارفرما (اختیاری)' : 'Employer Name (EN)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.nameEn || ''}
                  onChange={(e) => patchDraft((p) => ({ ...p, nameEn: e.target.value }))}
                  placeholder="Power Generation Co."
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'نام کوتاه (در امضاها و خلاصه‌ها)' : 'Short Name'}
                </label>
                <input
                  type="text"
                  value={draft.shortName}
                  onChange={(e) => patchDraft((p) => ({ ...p, shortName: e.target.value }))}
                  placeholder={isFa ? 'نام کوتاه کارفرما' : 'Short Name'}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'عنوان کامل شرکت در سربرگ فرم‌ها (فارسی)' : 'Header Full Company Title (FA)'}
                </label>
                <input
                  type="text"
                  value={draft.companyFullName}
                  onChange={(e) => patchDraft((p) => ({ ...p, companyFullName: e.target.value }))}
                  placeholder={isFa ? 'عنوان رسمی شرکت کارفرما در بالای تمام برگه‌های چاپی' : 'Official Header Title'}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'عنوان کامل انگلیسی در سربرگ' : 'Header Title (EN)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.companyFullNameEn || ''}
                  onChange={(e) => patchDraft((p) => ({ ...p, companyFullNameEn: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'پیشوند کد فرم‌ها (اختیاری)' : 'Document Code Prefix'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.docCodePrefix || ''}
                  onChange={(e) => patchDraft((p) => ({ ...p, docCodePrefix: e.target.value }))}
                  placeholder="PP-WH-FQP"
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'زیرعنوان سیستم مدیریت (IMS / ISO)' : 'Management System Subtitle'}
                </label>
                <input
                  type="text"
                  value={draft.imsSubtitle || ''}
                  onChange={(e) => patchDraft((p) => ({ ...p, imsSubtitle: e.target.value }))}
                  placeholder={isFa ? 'مثال: سیستم مدیریت یکپارچه / کنترل پروژه' : 'IMS / ISO Header'}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'کد / شماره قرارداد مرجع' : 'Contract / Badge Ref'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.contractRef || ''}
                  onChange={(e) => patchDraft((p) => ({ ...p, contractRef: e.target.value }))}
                  placeholder="CNT-403-01"
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'نشانی نیروگاه / کارفرما' : 'Plant Address'}
                </label>
                <input
                  type="text"
                  value={draft.address || ''}
                  onChange={(e) => patchDraft((p) => ({ ...p, address: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'تلفن / فکس' : 'Phone'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={draft.phone || ''}
                  onChange={(e) => patchDraft((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(draft.hideDocCodes)}
                  onChange={(e) => patchDraft((p) => ({ ...p, hideDocCodes: e.target.checked }))}
                />
                <span>{isFa ? 'مخفی‌سازی پیش‌فرض کد مدرک در فرم‌ها' : 'Hide doc codes by default'}</span>
              </label>
            </div>

            {/* Signatory Role Labels */}
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {isFa ? 'عناوین پیش‌فرض واحدهای امضاءکننده کارفرما:' : 'Default Signatory Unit Labels:'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  { key: 'inspectorLabel' as const, label: isFa ? 'عنوان نماینده کارفرما' : 'Employer Rep' },
                  { key: 'equipmentSupplyLabel' as const, label: isFa ? 'عنوان واحد تأمین تجهیزات' : 'Supply Unit' },
                  { key: 'techOfficeLabel' as const, label: isFa ? 'عنوان دفتر فنی / کنترل کیفیت' : 'Tech Office' },
                  { key: 'installationLabel' as const, label: isFa ? 'عنوان واحد نصب / بهره‌برداری' : 'Installation Dept' },
                  { key: 'securityLabel' as const, label: isFa ? 'عنوان انتظامات / حراست' : 'Security Dept' },
                ].map((item) => (
                  <div key={item.key}>
                    <label className="block text-[10.5px] text-[var(--text-muted)] mb-1">{item.label}</label>
                    <input
                      type="text"
                      value={draft[item.key] || ''}
                      onChange={(e) => patchDraft((p) => ({ ...p, [item.key]: e.target.value }))}
                      className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-Logo Gallery Section */}
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa ? 'گالری لوگوهای کارفرما (امکان افزودن یک یا چند لوگو)' : 'Employer Multi-Logo Gallery'}
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {isFa
                      ? 'می‌توانید چند لوگوی مختلف (لوگوی شرکت کارفرما، لوگوی نیروگاه، لوگوی مشاور، لوگوی استاندارد ISO و...) آپلود کنید و برای هر فرم مشخص کنید از کدام لوگو(ها) استفاده کند.'
                      : 'Upload multiple logos (corporate, plant, consultant, ISO) and choose which ones appear on each form.'}
                  </p>
                </div>
                <label className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                  <ImagePlus className="w-4 h-4" />
                  <span>{isFa ? 'آپلود لوگو (تکی یا چندتایی)' : 'Upload Logo(s)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleUploadLogos(e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>

              {draft.logos.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)] text-center text-xs text-[var(--text-muted)]">
                  {isFa
                    ? 'هنوز لوگویی برای این کارفرما بارگذاری نشده است. می‌توانید یک یا چند تصویر لوگو (PNG، SVG، JPG) انتخاب کنید.'
                    : 'No logos uploaded yet.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {draft.logos.map((logo) => (
                    <div
                      key={logo.id}
                      className={`p-3 rounded-xl border flex flex-col gap-2.5 ${
                        logo.isDefault
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/50'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]'
                      }`}
                    >
                      <div className="h-24 rounded-lg border border-[var(--border-subtle)] bg-white flex items-center justify-center p-2 overflow-hidden">
                        <img
                          src={logo.dataUrl}
                          alt={logo.label}
                          className="max-h-20 max-w-full object-contain"
                        />
                      </div>
                      <input
                        type="text"
                        value={logo.label}
                        onChange={(e) =>
                          patchDraft((prev) => ({
                            ...prev,
                            logos: prev.logos.map((l) =>
                              l.id === logo.id ? { ...l, label: e.target.value } : l,
                            ),
                          }))
                        }
                        placeholder={isFa ? 'عنوان لوگو (مثلاً: لوگوی نیروگاه)' : 'Logo label'}
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            patchDraft((prev) => ({
                              ...prev,
                              logos: prev.logos.map((l) => ({
                                ...l,
                                isDefault: l.id === logo.id,
                              })),
                            }))
                          }
                          className={`h-7 px-2 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                            logo.isDefault
                              ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                              : 'border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                          }`}
                        >
                          <Star className="w-3 h-3" />
                          <span>{logo.isDefault ? (isFa ? 'پیش‌فرض' : 'Default') : isFa ? 'تنظیم پیش‌فرض' : 'Set Default'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patchDraft((prev) => {
                              const next = prev.logos.filter((l) => l.id !== logo.id);
                              if (next.length > 0 && !next.some((l) => l.isDefault)) {
                                next[0].isDefault = true;
                              }
                              return { ...prev, logos: next };
                            })
                          }
                          className="p-1.5 rounded-md text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                          title={isFa ? 'حذف لوگو' : 'Delete logo'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Built-In Form Designer */}
        {studioTab === 'builtin' && (
          <div className="p-5 space-y-5">
            {/* Built-in Form Selector Strip */}
            <div className="flex flex-wrap gap-1.5">
              {BUILT_IN_FORM_DEFINITIONS.map((def) => {
                const isCustomized = Boolean(draft.formTemplates?.[def.key]);
                const active = selectedFormKey === def.key;
                return (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => setSelectedFormKey(def.key)}
                    className={`h-8 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <span>{isFa ? def.titleFa : def.titleEn}</span>
                    {isCustomized && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          active ? 'bg-white' : 'bg-[var(--accent-primary)]'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              {/* Customization Controls */}
              <div className="xl:col-span-6 space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa ? builtInDef.titleFa : builtInDef.titleEn}
                  </span>
                  <button
                    type="button"
                    onClick={resetBuiltInTemplate}
                    className="h-7 px-2 rounded-md border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isFa ? 'بازنشانی فرم' : 'Reset'}</span>
                  </button>
                </div>

                {/* Logo Selection for this Specific Form */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-[var(--text-primary)]">
                    {isFa ? 'انتخاب لوگوی اول (اصلی) برای این فرم:' : 'Primary Logo for This Form:'}
                  </label>
                  {logoSelectorGrid(currentTpl.primaryLogoId, (val) =>
                    patchBuiltInTemplate({ primaryLogoId: val }),
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'چیدمان سربرگ فرم' : 'Header Layout'}
                    </label>
                    <select
                      value={currentTpl.headerLayout || builtInDef.defaultHeaderLayout}
                      onChange={(e) =>
                        patchBuiltInTemplate({ headerLayout: e.target.value as FormHeaderLayout })
                      }
                      className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                    >
                      {LAYOUT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {isFa ? opt.labelFa : opt.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'جهت کاغذ چاپ (A4)' : 'Paper Orientation'}
                    </label>
                    <select
                      value={currentTpl.orientation || builtInDef.defaultOrientation}
                      onChange={(e) =>
                        patchBuiltInTemplate({
                          orientation: e.target.value as 'portrait' | 'landscape',
                        })
                      }
                      className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                    >
                      <option value="portrait">{isFa ? 'عمودی (Portrait)' : 'Portrait'}</option>
                      <option value="landscape">{isFa ? 'افقی (Landscape)' : 'Landscape'}</option>
                    </select>
                  </div>
                </div>

                {(currentTpl.headerLayout || builtInDef.defaultHeaderLayout) === 'split_dual_logo' && (
                  <div className="space-y-2 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <label className="block text-[11px] font-bold text-[var(--text-primary)]">
                      {isFa ? 'انتخاب لوگوی دوم (سمت مقابل):' : 'Secondary Logo:'}
                    </label>
                    {logoSelectorGrid(
                      currentTpl.secondaryLogoId || '__none__',
                      (val) => patchBuiltInTemplate({ secondaryLogoId: val }),
                      false,
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      {isFa ? 'عنوان فارسی اختصاصی فرم' : 'Custom Title (FA)'}
                    </label>
                    <input
                      type="text"
                      value={currentTpl.titleFa ?? ''}
                      placeholder={builtInDef.titleFa}
                      onChange={(e) => patchBuiltInTemplate({ titleFa: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      {isFa ? 'عنوان انگلیسی فرم' : 'Custom Title (EN)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={currentTpl.titleEn ?? ''}
                      placeholder={builtInDef.titleEn}
                      onChange={(e) => patchBuiltInTemplate({ titleEn: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      {isFa ? 'کد اختصاصی این فرم' : 'Custom Doc Code'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={currentTpl.docCode ?? ''}
                      placeholder={resolvedFormDesign.docCode || 'FQP-01'}
                      onChange={(e) => patchBuiltInTemplate({ docCode: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      {isFa ? 'شماره بازنگری (Revision)' : 'Revision'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={currentTpl.revisionText ?? ''}
                      placeholder="Rev.02"
                      onChange={(e) => patchBuiltInTemplate({ revisionText: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(currentTpl.hideDocCode)}
                      onChange={(e) => patchBuiltInTemplate({ hideDocCode: e.target.checked })}
                    />
                    <span>{isFa ? 'مخفی‌سازی کد مدرک برای این فرم' : 'Hide doc code'}</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {isFa ? 'رنگ کادر:' : 'Border:'}
                    </span>
                    {ACCENT_PRESETS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => patchBuiltInTemplate({ accentColor: col })}
                        style={{ backgroundColor: col }}
                        className={`w-5 h-5 rounded border ${
                          (currentTpl.accentColor || '#000000') === col
                            ? 'ring-2 ring-offset-1 ring-[var(--accent-primary)]'
                            : 'border-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Intro / Footer Texts */}
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      {isFa ? 'متن شرح / صورتجلسه / تعهدنامه فرم' : 'Body / Declaration Text'}
                    </label>
                    <textarea
                      rows={2}
                      value={currentTpl.introText ?? ''}
                      placeholder={builtInDef.defaultIntroText || ''}
                      onChange={(e) => patchBuiltInTemplate({ introText: e.target.value })}
                      className="w-full p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                      {isFa ? 'متن رونوشت / پاورقی پایین فرم' : 'Footer Copy / Notes'}
                    </label>
                    <input
                      type="text"
                      value={currentTpl.footerCopyText ?? ''}
                      placeholder={builtInDef.defaultFooterCopyText || ''}
                      onChange={(e) => patchBuiltInTemplate({ footerCopyText: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                    />
                  </div>
                </div>

                {/* Extra Header Meta Fields */}
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[var(--text-primary)]">
                      {isFa ? 'فیلدهای متادیتای اضافی سربرگ:' : 'Extra Metadata Strip Fields:'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        patchBuiltInTemplate({
                          extraMetaFields: [
                            ...(currentTpl.extraMetaFields || []),
                            { id: `meta-${Date.now()}`, label: isFa ? 'فیلد جدید' : 'New Field', defaultValue: '' },
                          ],
                        })
                      }
                      className="h-6 px-2 rounded border border-[var(--border-subtle)] text-[10.5px] font-semibold flex items-center gap-1 hover:bg-[var(--bg-subtle)]"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isFa ? 'افزودن فیلد' : 'Add Field'}</span>
                    </button>
                  </div>
                  {(currentTpl.extraMetaFields || []).map((f, idx) => (
                    <div key={f.id} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={f.label}
                        onChange={(e) =>
                          patchBuiltInTemplate({
                            extraMetaFields: (currentTpl.extraMetaFields || []).map((item, i) =>
                              i === idx ? { ...item, label: e.target.value } : item,
                            ),
                          })
                        }
                        placeholder={isFa ? 'عنوان فیلد' : 'Label'}
                        className="flex-1 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                      <input
                        type="text"
                        value={f.defaultValue || ''}
                        onChange={(e) =>
                          patchBuiltInTemplate({
                            extraMetaFields: (currentTpl.extraMetaFields || []).map((item, i) =>
                              i === idx ? { ...item, defaultValue: e.target.value } : item,
                            ),
                          })
                        }
                        placeholder={isFa ? 'مقدار پیش‌فرض (اختیاری)' : 'Default value'}
                        className="flex-1 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          patchBuiltInTemplate({
                            extraMetaFields: (currentTpl.extraMetaFields || []).filter((_, i) => i !== idx),
                          })
                        }
                        className="p-1 text-[var(--status-danger)]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Columns Visibility & Labels */}
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <span className="block text-[11px] font-bold text-[var(--text-primary)]">
                    {isFa ? 'ستون‌های جدول فرم (نام سفارشی و نمایش/عدم نمایش):' : 'Table Columns Customization:'}
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pe-1">
                    {builtInDef.defaultColumns.map((col) => {
                      const ov = currentTpl.columnOverrides?.find((c) => c.key === col.key);
                      const visible = ov ? ov.visible !== false : true;
                      const customLabel = ov?.label ?? '';
                      const updateCol = (nextLabel: string, nextVis: boolean) => {
                        const existing = currentTpl.columnOverrides || [];
                        const filtered = existing.filter((c) => c.key !== col.key);
                        patchBuiltInTemplate({
                          columnOverrides: [...filtered, { key: col.key, label: nextLabel, visible: nextVis }],
                        });
                      };
                      return (
                        <div key={col.key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={visible}
                            onChange={(e) => updateCol(customLabel, e.target.checked)}
                          />
                          <input
                            type="text"
                            value={customLabel}
                            placeholder={col.label}
                            onChange={(e) => updateCol(e.target.value, visible)}
                            className="flex-1 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Signature Boxes Builder */}
                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentTpl.showSignatures !== false}
                        onChange={(e) => patchBuiltInTemplate({ showSignatures: e.target.checked })}
                      />
                      <span>{isFa ? 'کادرهای امضاء پایین فرم:' : 'Signature Boxes:'}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const base =
                          currentTpl.signatures && currentTpl.signatures.length > 0
                            ? currentTpl.signatures
                            : builtInDef.defaultSignatures;
                        patchBuiltInTemplate({
                          signatures: [
                            ...base,
                            {
                              id: `sig-${Date.now()}`,
                              label: isFa ? 'امضاءکننده جدید' : 'New Signatory',
                              subtitle: isFa ? 'نام و امضاء' : 'Name & Signature',
                            },
                          ],
                        });
                      }}
                      className="h-6 px-2 rounded border border-[var(--border-subtle)] text-[10.5px] font-semibold flex items-center gap-1 hover:bg-[var(--bg-subtle)]"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isFa ? 'افزودن امضاء' : 'Add Signatory'}</span>
                    </button>
                  </div>
                  {(currentTpl.signatures && currentTpl.signatures.length > 0
                    ? currentTpl.signatures
                    : builtInDef.defaultSignatures
                  ).map((sig, idx, arr) => (
                    <div key={sig.id} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={sig.label}
                        onChange={(e) =>
                          patchBuiltInTemplate({
                            signatures: arr.map((s, i) => (i === idx ? { ...s, label: e.target.value } : s)),
                          })
                        }
                        className="flex-1 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                      <input
                        type="text"
                        value={sig.subtitle || ''}
                        placeholder={isFa ? 'زیرنویس' : 'Subtitle'}
                        onChange={(e) =>
                          patchBuiltInTemplate({
                            signatures: arr.map((s, i) => (i === idx ? { ...s, subtitle: e.target.value } : s)),
                          })
                        }
                        className="w-32 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          patchBuiltInTemplate({
                            signatures: arr.filter((_, i) => i !== idx),
                          })
                        }
                        className="p-1 text-[var(--status-danger)]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Form Sheet Preview */}
              <div className="xl:col-span-6 space-y-2">
                <div className="text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
                  <span>{isFa ? 'پیش‌نمایش زنده فرم طراحی‌شده (A4)' : 'Live Sheet Preview (A4)'}</span>
                  <span className="text-[11px] font-normal text-[var(--text-muted)]">
                    {resolvedFormDesign.orientation === 'landscape'
                      ? isFa
                        ? 'افقی (Landscape)'
                        : 'Landscape'
                      : isFa
                        ? 'عمودی (Portrait)'
                        : 'Portrait'}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-white text-black shadow-xs space-y-2 overflow-x-auto">
                  <OfficialFormHeader
                    employer={resolvedPreview}
                    design={resolvedFormDesign}
                    rightMetaSlot={
                      <>
                        <div className="px-2 py-1 flex items-center justify-between gap-2">
                          <span className="font-semibold">شماره فرم:</span>
                          <span dir="ltr" className="font-mono font-bold">
                            1404-001
                          </span>
                        </div>
                        <div className="px-2 py-1 flex items-center justify-between gap-2">
                          <span className="font-semibold">تاریخ:</span>
                          <span dir="ltr" className="font-mono">
                            1404/01/15
                          </span>
                        </div>
                      </>
                    }
                  />
                  <OfficialExtraMetaStrip design={resolvedFormDesign} />

                  <table
                    dir="rtl"
                    style={{ borderColor: resolvedFormDesign.accentColor }}
                    className="w-full border-collapse border border-black text-[10px]"
                  >
                    <thead>
                      <tr className="bg-slate-100">
                        {builtInDef.defaultColumns
                          .filter((c) => resolvedFormDesign.isColumnVisible(c.key))
                          .map((c) => (
                            <th key={c.key} className="border border-black px-1.5 py-1 text-center font-bold">
                              {resolvedFormDesign.columnLabel(c.key, c.label)}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2].map((r) => (
                        <tr key={r}>
                          {builtInDef.defaultColumns
                            .filter((c) => resolvedFormDesign.isColumnVisible(c.key))
                            .map((c) => (
                              <td key={c.key} className="border border-black px-1.5 py-1.5 text-center text-slate-500">
                                {c.key === 'row' ? r : '—'}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {resolvedFormDesign.introText && (
                    <div
                      dir="rtl"
                      className="p-2 border border-black text-[10px] leading-relaxed bg-slate-50/50"
                    >
                      {resolvedFormDesign.introText}
                    </div>
                  )}

                  <OfficialFormSignatures
                    signatures={resolvedFormDesign.signatures}
                    showSignatures={resolvedFormDesign.showSignatures}
                    borderColor={resolvedFormDesign.accentColor}
                  />

                  <OfficialFormFooter design={resolvedFormDesign} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Company Uploaded Forms (Excel, Word, PDF, Image) */}
        {studioTab === 'custom' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {uploadedForms.map((uf) => (
                  <button
                    key={uf.id}
                    type="button"
                    onClick={() => setSelectedUploadedFormId(uf.id)}
                    className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                      activeUploadedForm?.id === uf.id
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{uf.titleFa}</span>
                    <span className="text-[10px] opacity-80 uppercase font-mono">
                      [{uf.fileType}]
                    </span>
                  </button>
                ))}
                <label className="h-8 px-3 rounded-lg border border-dashed border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>
                    {uploadingForm
                      ? isFa
                        ? 'در حال پردازش...'
                        : 'Parsing...'
                      : isFa
                        ? 'آپلود فرم شرکت (Word / Excel / PDF / تصویر)'
                        : 'Upload Company Form'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.csv,.docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.svg"
                    multiple
                    disabled={uploadingForm}
                    className="hidden"
                    onChange={(e) => {
                      handleUploadCompanyFormFiles(e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            {!activeUploadedForm ? (
              <div className="p-8 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)] text-center space-y-2">
                <FileUp className="w-7 h-7 text-[var(--accent-primary)] mx-auto" />
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  {isFa
                    ? 'هنوز فرم رسمی شرکتی برای این کارفرما آپلود نشده است'
                    : 'No official company forms uploaded yet'}
                </div>
                <p className="text-xs text-[var(--text-muted)] max-w-xl mx-auto leading-relaxed">
                  {isFa
                    ? 'فایل‌های آماده و کددار شرکت را با فرمت Excel (.xlsx)، Word (.docx)، PDF یا تصویر وارد کنید. می‌توانید متغیرهای {{نام_فیلد}} یا ستون‌های اکسل را به داده‌های سامانه متصل کرده، تنظیمات پرینت A4 و تطبیق خودکار ارتفاع سطر را کالیبره کنید.'
                    : 'Upload official coded Excel, Word, PDF, or Image forms, bind SAMAAN fields, and calibrate A4 print settings with automatic Excel-style row height scaling.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Settings & Data Binding Panel */}
                <div className="xl:col-span-6 space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{activeUploadedForm.titleFa}</div>
                      <div dir="ltr" className="text-[10.5px] font-mono text-[var(--text-muted)] truncate">
                        {activeUploadedForm.fileName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteUploadedForm(activeUploadedForm.id)}
                      className="text-xs text-[var(--status-danger)] hover:underline flex items-center gap-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'حذف فرم' : 'Remove'}</span>
                    </button>
                  </div>

                  {/* Form Identity & Data Source */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'عنوان فرم *' : 'Form Title *'}
                      </label>
                      <input
                        type="text"
                        value={activeUploadedForm.titleFa}
                        onChange={(e) =>
                          patchUploadedForm((f) => ({ ...f, titleFa: e.target.value }))
                        }
                        className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'کد مدرک شرکت' : 'Company Form Code'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={activeUploadedForm.formCode || ''}
                        onChange={(e) =>
                          patchUploadedForm((f) => ({ ...f, formCode: e.target.value }))
                        }
                        placeholder="FQP-WH-014"
                        className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'منبع خواندن اطلاعات از سامانه' : 'Data Source Binding'}
                      </label>
                      <select
                        value={activeUploadedForm.dataSource}
                        onChange={(e) =>
                          patchUploadedForm((f) => ({
                            ...f,
                            dataSource: e.target.value as UploadedFormDataSource,
                          }))
                        }
                        className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      >
                        <option value="general">{isFa ? 'ثبت کلی تجهیزات و پکینگ لیست' : 'General / Packing List'}</option>
                        <option value="siteEntry">{isFa ? 'صورتجلسات ورود کالا به کارگاه' : 'Site Entry Minutes'}</option>
                        <option value="detailed">{isFa ? 'ثبت جزئیات تجهیزات (اقلام)' : 'Detailed Equipment Items'}</option>
                        <option value="transit">{isFa ? 'تجهیزات در راه' : 'In-Transit Equipment'}</option>
                        <option value="manual">{isFa ? 'ورود دستی مقادیر در زمان پرینت' : 'Manual Entry Only'}</option>
                      </select>
                    </div>
                    {activeUploadedForm.fileType === 'excel' && activeExcelSheetMeta && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'شیت فعال اکسل' : 'Active Worksheet'}
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

                  {/* Optional Company Logo Overlay */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-[var(--text-primary)]">
                      {isFa ? 'افزودن لوگوی شرکت بالای فرم (اختیاری):' : 'Stamp Logo Header (Optional):'}
                    </label>
                    {logoSelectorGrid(
                      activeUploadedForm.primaryLogoId || '__none__',
                      (val) => patchUploadedForm((f) => ({ ...f, primaryLogoId: val })),
                      false,
                    )}
                  </div>

                  {/* A4 Print & Auto Row Height Calibration */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                    <div className="text-[11px] font-bold text-[var(--text-primary)]">
                      {isFa ? 'تنظیمات چاپ، مقیاس A4 و اندازه خودکار سطرها:' : 'A4 Print & Auto-Fit Row Calibration:'}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                          {isFa ? 'جهت صفحه A4' : 'Orientation'}
                        </label>
                        <select
                          value={activeUploadedForm.printSettings.orientation}
                          onChange={(e) =>
                            patchUploadedPrintSettings({
                              orientation: e.target.value as 'portrait' | 'landscape',
                            })
                          }
                          className="w-full h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]"
                        >
                          <option value="portrait">{isFa ? 'عمودی' : 'Portrait'}</option>
                          <option value="landscape">{isFa ? 'افقی' : 'Landscape'}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                          {isFa ? 'اندازه فونت (pt)' : 'Font (pt)'}
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
                          {isFa ? 'مقیاس چاپ (%)' : 'Scale (%)'}
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
                      <div>
                        <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                          {isFa ? 'حداقل ارتفاع سطر (px)' : 'Min Row H (px)'}
                        </label>
                        <input
                          type="number"
                          min={16}
                          max={120}
                          value={activeUploadedForm.printSettings.minRowHeightPx}
                          onChange={(e) =>
                            patchUploadedPrintSettings({
                              minRowHeightPx: Math.min(120, Math.max(16, Number(e.target.value) || 24)),
                            })
                          }
                          className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-center"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {(
                        [
                          { key: 'marginTopMm' as const, label: isFa ? 'حاشیه بالا (mm)' : 'Top mm' },
                          { key: 'marginRightMm' as const, label: isFa ? 'حاشیه راست' : 'Right mm' },
                          { key: 'marginBottomMm' as const, label: isFa ? 'حاشیه پایین' : 'Bottom mm' },
                          { key: 'marginLeftMm' as const, label: isFa ? 'حاشیه چپ' : 'Left mm' },
                        ]
                      ).map((m) => (
                        <div key={m.key}>
                          <label className="block text-[10px] text-[var(--text-muted)] mb-1">{m.label}</label>
                          <input
                            type="number"
                            min={0}
                            max={40}
                            value={activeUploadedForm.printSettings[m.key]}
                            onChange={(e) =>
                              patchUploadedPrintSettings({
                                [m.key]: Math.min(40, Math.max(0, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-center"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3 pt-1">
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer font-semibold text-[var(--accent-primary)]">
                        <input
                          type="checkbox"
                          checked={activeUploadedForm.printSettings.autoRowHeight}
                          onChange={(e) =>
                            patchUploadedPrintSettings({ autoRowHeight: e.target.checked })
                          }
                        />
                        <span>
                          {isFa
                            ? 'تغییر اندازه خودکار ارتفاع سطر متناسب با متن (مانند اکسل)'
                            : 'Auto-fit row height to content (Excel AutoFit)'}
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={activeUploadedForm.printSettings.fitToPageWidth}
                          onChange={(e) =>
                            patchUploadedPrintSettings({ fitToPageWidth: e.target.checked })
                          }
                        />
                        <span>{isFa ? 'تنظیم عرض در یک صفحه A4' : 'Fit to A4 Page Width'}</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={activeUploadedForm.printSettings.showGridlines}
                          onChange={(e) =>
                            patchUploadedPrintSettings({ showGridlines: e.target.checked })
                          }
                        />
                        <span>{isFa ? 'نمایش خطوط جدول' : 'Show Gridlines'}</span>
                      </label>
                    </div>
                  </div>

                  {/* Placeholder {{Token}} -> SAMAAN Field Mappings */}
                  {(activeUploadedForm.fileType === 'excel' || activeUploadedForm.fileType === 'word' || activeUploadedForm.fileType === 'image') && (
                    <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[var(--text-primary)]">
                          {isFa
                            ? 'اتصال متغیرهای {{...}} درون فایل به فیلدهای سمان:'
                            : 'Template {{Placeholder}} Field Bindings:'}
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
                      {(activeUploadedForm.detectedTokens || []).length === 0 ? (
                        <div className="text-[10.5px] text-[var(--text-muted)]">
                          {isFa
                            ? 'در این فایل متغیر {{...}} یافت نشد. اگر داخل ورد یا اکسل متغیرهایی مثل {{packingListNo}} یا {{شماره پکینگ}} بگذارید، به‌صورت خودکار پر می‌شوند.'
                            : 'No {{tokens}} detected in file. Use tokens like {{packingListNo}} inside Excel/Word for auto-fill.'}
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pe-1">
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
                                <option value="">{isFa ? '-- تطبیق خودکار / دستی --' : '-- Auto / Manual --'}</option>
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

                  {/* Excel Dynamic Table Row Insertion Config */}
                  {activeUploadedForm.fileType === 'excel' && (
                    <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[var(--text-primary)]">
                          {isFa ? 'تزریق خودکار ردیف اقلام در جدول اکسل:' : 'Excel Table Row Injection:'}
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="text-[10.5px] text-[var(--text-secondary)]">
                            {isFa ? 'شروع از ردیف:' : 'Start Row (1-based):'}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={
                              typeof activeUploadedForm.tableStartRowIndex === 'number'
                                ? activeUploadedForm.tableStartRowIndex + 1
                                : ''
                            }
                            placeholder="مثلاً 6"
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              patchUploadedForm((f) => ({
                                ...f,
                                tableStartRowIndex: Number.isFinite(n) && n >= 1 ? Math.floor(n) - 1 : undefined,
                              }));
                            }}
                            className="w-16 h-6 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-center"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              patchUploadedForm((f) => {
                                const list = f.tableColumnBindings || [];
                                const nextCol = list.length > 0 ? Math.max(...list.map((c) => c.colIndex)) + 1 : 0;
                                return {
                                  ...f,
                                  tableColumnBindings: [
                                    ...list,
                                    {
                                      colIndex: nextCol,
                                      headerLabel: `ستون ${nextCol + 1}`,
                                      fieldKey: 'description',
                                    },
                                  ],
                                };
                              })
                            }
                            className="h-6 px-2 rounded border border-[var(--border-subtle)] text-[10.5px] font-semibold hover:bg-[var(--bg-subtle)]"
                          >
                            + {isFa ? 'ستون جدول' : 'Add Col Binding'}
                          </button>
                        </div>
                      </div>
                      {(activeUploadedForm.tableColumnBindings || []).map((cb, idx) => (
                        <div key={`${cb.colIndex}-${idx}`} className="grid grid-cols-12 gap-1.5 items-center">
                          <input
                            type="number"
                            min={1}
                            max={40}
                            value={cb.colIndex + 1}
                            onChange={(e) => {
                              const nextIdx = Math.max(0, (Number(e.target.value) || 1) - 1);
                              patchUploadedForm((f) => ({
                                ...f,
                                tableColumnBindings: (f.tableColumnBindings || []).map((item, i) =>
                                  i === idx ? { ...item, colIndex: nextIdx } : item,
                                ),
                              }));
                            }}
                            title={isFa ? 'شماره ستون (از ۱)' : 'Column #'}
                            className="col-span-2 h-7 px-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-center"
                          />
                          <input
                            type="text"
                            value={cb.headerLabel}
                            onChange={(e) =>
                              patchUploadedForm((f) => ({
                                ...f,
                                tableColumnBindings: (f.tableColumnBindings || []).map((item, i) =>
                                  i === idx ? { ...item, headerLabel: e.target.value } : item,
                                ),
                              }))
                            }
                            placeholder={isFa ? 'عنوان ستون' : 'Label'}
                            className="col-span-4 h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]"
                          />
                          <select
                            value={cb.fieldKey}
                            onChange={(e) =>
                              patchUploadedForm((f) => ({
                                ...f,
                                tableColumnBindings: (f.tableColumnBindings || []).map((item, i) =>
                                  i === idx ? { ...item, fieldKey: e.target.value } : item,
                                ),
                              }))
                            }
                            className="col-span-5 h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]"
                          >
                            {SAMAAN_BINDABLE_FIELDS.map((sf) => (
                              <option key={sf.key} value={sf.key}>
                                {isFa ? sf.labelFa : sf.labelEn}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              patchUploadedForm((f) => ({
                                ...f,
                                tableColumnBindings: (f.tableColumnBindings || []).filter((_, i) => i !== idx),
                              }))
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

                {/* Live A4 Form Preview with Auto-Fit Row Height */}
                <div className="xl:col-span-6 space-y-2">
                  <div className="text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between gap-2">
                    <span>
                      {isFa ? 'پیش‌نمایش زنده فرم آپلودی (کاغذ A4 و ارتفاع سطر خودکار)' : 'Live A4 Preview'}
                    </span>
                    <span className="text-[10.5px] font-normal text-[var(--text-muted)]">
                      {activeUploadedForm.printSettings.autoRowHeight
                        ? isFa
                          ? 'ارتفاع سطر خودکار: فعال'
                          : 'AutoFit Rows: ON'
                        : isFa
                          ? 'ارتفاع ثابت'
                          : 'Fixed Height'}
                    </span>
                  </div>
                  <UploadedFormA4Sheet
                    form={activeUploadedForm}
                    employer={resolvedPreview}
                    headerTokens={samplePreviewData.headerTokens}
                    lineRows={samplePreviewData.lineRows}
                    isFa={isFa}
                  />
                </div>
              </div>
            )}

            {/* Legacy archive accordion if old manually-created custom forms exist */}
            {draft.customForms.length > 0 && (
              <details className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs">
                <summary className="cursor-pointer font-semibold text-[var(--text-secondary)]">
                  {isFa
                    ? `آرشیو فرم‌های دست‌ساز قبلی (${draft.customForms.length} مورد)`
                    : `Legacy Manual Custom Forms (${draft.customForms.length})`}
                </summary>
                <div className="mt-2 space-y-1.5">
                  {draft.customForms.map((cf) => (
                    <div key={cf.id} className="flex items-center justify-between px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <span>{cf.titleFa} {cf.docCode ? `(${cf.docCode})` : ''}</span>
                      <button
                        type="button"
                        onClick={() =>
                          patchDraft((p) => ({
                            ...p,
                            customForms: p.customForms.filter((x) => x.id !== cf.id),
                          }))
                        }
                        className="text-[var(--status-danger)] text-[11px] hover:underline"
                      >
                        {isFa ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const EmployersStudioView: React.FC = () => {
  return <EmployersStudioWorkspace />;
};
