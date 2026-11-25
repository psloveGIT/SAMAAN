import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Globe,
  Lock,
  Mail,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError } from '../lib/api.ts';
import { resolveEmployerLogoSrc } from '../lib/employerLogoCache.ts';
import { formatDigitsByLang } from '../shared/docNumbering.ts';
import { isBuiltInEmployerId } from '../shared/employers.ts';
import {
  getEmployerFormSectionsSummary,
  type OperationalFormSectionKey,
} from '../shared/formAccess.ts';
import type { EmployerProfile } from '../shared/types.ts';
import { DeveloperFormRequestPanel } from './DeveloperFormRequestPanel.tsx';

function getEmployerPrimaryLogo(emp: EmployerProfile): string | undefined {
  if (!emp.logos || emp.logos.length === 0) return undefined;
  return (emp.logos.find((l) => l.isDefault) || emp.logos[0])?.dataUrl;
}

export interface EmployersStudioViewProps {
  initialEmployerId?: string;
  initialSection?: 'profile' | 'request';
  initialFormSection?: OperationalFormSectionKey | null;
  navigationToken?: number;
  onOpenFormSection?: (sectionKey: OperationalFormSectionKey) => void;
}

export const EmployersStudioView: React.FC<EmployersStudioViewProps> = ({
  initialEmployerId,
  initialSection = 'profile',
  initialFormSection = null,
  navigationToken = 0,
  onOpenFormSection,
}) => {
  const { prefs, employers, activeProject, renameProject, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const lang = prefs.language;

  const builtInEmployers = useMemo(
    () => employers.filter((e) => e.isBuiltIn || isBuiltInEmployerId(e.id)),
    [employers],
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (initialEmployerId && builtInEmployers.some((e) => e.id === initialEmployerId)) {
      return initialEmployerId;
    }
    return activeProject?.employerId && builtInEmployers.some((e) => e.id === activeProject.employerId)
      ? activeProject.employerId
      : builtInEmployers[0]?.id || 'mapna-md1';
  });

  const [activeTab, setActiveTab] = useState<'profile' | 'request'>(initialSection);
  const [requestDefaultType, setRequestDefaultType] = useState<'missing_form' | 'new_employer'>('missing_form');
  const [requestSectionKey, setRequestSectionKey] = useState<OperationalFormSectionKey | null>(
    initialFormSection,
  );
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!navigationToken) return;
    if (initialEmployerId && builtInEmployers.some((e) => e.id === initialEmployerId)) {
      setSelectedId(initialEmployerId);
    }
    setActiveTab(initialSection);
    setRequestSectionKey(initialFormSection);
  }, [navigationToken, initialEmployerId, initialSection, initialFormSection, builtInEmployers]);

  const selectedEmployer = useMemo(
    () => builtInEmployers.find((e) => e.id === selectedId) || builtInEmployers[0],
    [builtInEmployers, selectedId],
  );

  const summary = useMemo(
    () => getEmployerFormSectionsSummary(selectedEmployer),
    [selectedEmployer],
  );

  const handleAssignToProject = async (emp: EmployerProfile) => {
    if (!activeProject) return;
    setAssigning(true);
    try {
      await renameProject(activeProject.id, {
        name: activeProject.name,
        code: activeProject.code,
        plantAbbreviation: activeProject.plantAbbreviation,
        usePlantAbbreviationInDocs: activeProject.usePlantAbbreviationInDocs,
        plantAbbreviationPosition: activeProject.plantAbbreviationPosition,
        contractRef: activeProject.contractRef,
        employerId: emp.id,
      });
      notify(
        'success',
        isFa
          ? `کارفرمای پروژه «${activeProject.name}» به «${emp.nameFa}» تغییر یافت.`
          : `Project employer set to "${emp.nameEn}".`,
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setAssigning(false);
    }
  };

  if (!selectedEmployer) return null;

  const isSelectedActiveOnProject = activeProject?.employerId === selectedEmployer.id;
  const primaryLogo = getEmployerPrimaryLogo(selectedEmployer);

  return (
    <div className="space-y-5" data-testid="employers-studio-view">
      {/* Top Mode Switcher: Built-In Employers vs Request New Employer / Forms */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 gap-1">
          <button
            type="button"
            data-testid="employers-tab-profile"
            onClick={() => setActiveTab('profile')}
            className={`h-8 px-3.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeTab === 'profile'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{isFa ? 'کارفرماهای پیش‌فرض سامانه' : 'Built-in Employers'}</span>
          </button>

          <button
            type="button"
            data-testid="employers-tab-request"
            onClick={() => {
              setRequestDefaultType('new_employer');
              setActiveTab('request');
            }}
            className={`h-8 px-3.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeTab === 'request'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {isFa
                ? 'درخواست تعریف کارفرمای جدید یا ارسال فرم به سازنده'
                : 'Request New Employer / Submit Forms'}
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'request' ? (
        <div className="max-w-4xl">
          <DeveloperFormRequestPanel
            defaultRequestType={requestDefaultType}
            defaultEmployer={{
              id: selectedEmployer.id,
              nameFa: selectedEmployer.nameFa,
              shortName: selectedEmployer.shortName,
            }}
            defaultSectionKey={requestSectionKey}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Built-in Employers List */}
          <aside className="lg:col-span-4 xl:col-span-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'کارفرماهای پیش‌فرض' : 'Default Employers'}
              </h2>
            </div>

            <div className="p-3 space-y-2">
              {builtInEmployers.map((emp) => {
                const isSelected = emp.id === selectedEmployer.id;
                const isActiveOnProject = activeProject?.employerId === emp.id;
                const logoUrl = getEmployerPrimaryLogo(emp);
                const empSummary = getEmployerFormSectionsSummary(emp);

                return (
                  <button
                    key={emp.id}
                    type="button"
                    data-testid={`employer-item-${emp.id}`}
                    onClick={() => setSelectedId(emp.id)}
                    className={`w-full p-2.5 rounded-xl border text-start transition-colors flex items-center gap-3 ${
                      isSelected
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <div className="w-14 h-10 rounded-lg border border-[var(--border-subtle)] bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                      {logoUrl ? (
                        <img
                          src={resolveEmployerLogoSrc(logoUrl)}
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
                        <span className="tabular-nums">
                          {formatDigitsByLang(`${empSummary.unlockedCount}/${empSummary.totalCount}`, lang)}
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

              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  data-testid="employers-request-new-btn"
                  onClick={() => {
                    setRequestDefaultType('new_employer');
                    setRequestSectionKey(null);
                    setActiveTab('request');
                  }}
                  className="w-full h-9 px-3 rounded-xl border border-dashed border-[var(--accent-primary)]/60 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isFa ? 'درخواست افزودن کارفرمای جدید' : 'Request New Employer'}</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Read-Only Employer Profile Details & 9-Section Form Status */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="p-5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-20 h-14 rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
                    {primaryLogo ? (
                      <img
                        src={resolveEmployerLogoSrc(primaryLogo)}
                        alt={selectedEmployer.nameFa}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Building2 className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-extrabold text-[var(--text-primary)] truncate">
                        {selectedEmployer.nameFa}
                      </h3>
                      <span
                        dir="ltr"
                        className="px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] font-mono text-xs font-bold"
                      >
                        {selectedEmployer.shortName}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {selectedEmployer.companyFullName}
                    </p>
                    {selectedEmployer.companyFullNameEn && (
                      <p dir="ltr" className="text-[11px] text-[var(--text-muted)] text-start mt-0.5">
                        {selectedEmployer.companyFullNameEn}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isSelectedActiveOnProject ? (
                    <span className="h-9 px-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>{isFa ? 'کارفرمای فعال این پروژه' : 'Active Project Employer'}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={assigning}
                      onClick={() => void handleAssignToProject(selectedEmployer)}
                      className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-55 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انتخاب برای پروژه فعال' : 'Assign to Active Project'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Read-Only Notice */}
              <div className="px-5 py-2.5 bg-[var(--bg-canvas)]/70 border-b border-[var(--border-subtle)] flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                <span>
                  {isFa
                    ? 'مشخصات و لوگوهای کارفرماهای پیش‌فرض سامانه قفل و فقط‌خواندنی است تا استاندارد رسمی فرم‌ها حفظ شود.'
                    : 'Built-in employer profiles and logos are read-only to preserve official document formatting.'}
                </span>
              </div>

              {/* Contact & Corporate Details Grid (Bilingual Digits) */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {selectedEmployer.address && (
                  <div className="sm:col-span-2 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 space-y-1">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>{isFa ? 'آدرس دفتر مرکزی' : 'Head Office Address'}</span>
                    </div>
                    <div className="text-[var(--text-primary)] font-medium leading-relaxed">
                      {formatDigitsByLang(selectedEmployer.address, lang)}
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 space-y-1">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{isFa ? 'تلفن تماس' : 'Phone'}</span>
                  </div>
                  <div dir="ltr" className="font-mono font-semibold text-[var(--text-primary)] text-start tabular-nums">
                    {selectedEmployer.phone ? formatDigitsByLang(selectedEmployer.phone, lang) : '—'}
                  </div>
                  {selectedEmployer.secondaryPhone && (
                    <div dir="ltr" className="font-mono font-semibold text-[var(--text-secondary)] text-start tabular-nums">
                      {formatDigitsByLang(selectedEmployer.secondaryPhone, lang)}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 space-y-1">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{isFa ? 'فکس و کد پستی' : 'Fax & Postal Code'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      <span className="text-[var(--text-muted)]">{isFa ? 'فکس: ' : 'Fax: '}</span>
                      <span dir="ltr" className="inline-block font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                        {selectedEmployer.fax ? formatDigitsByLang(selectedEmployer.fax, lang) : '—'}
                      </span>
                    </span>
                    <span>
                      <span className="text-[var(--text-muted)]">{isFa ? 'کد پستی: ' : 'Postal: '}</span>
                      <span dir="ltr" className="inline-block font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                        {selectedEmployer.postalCode ? formatDigitsByLang(selectedEmployer.postalCode, lang) : '—'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 space-y-1">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{isFa ? 'پست الکترونیکی' : 'Email'}</span>
                  </div>
                  <div dir="ltr" className="font-mono text-[var(--text-primary)] text-start">
                    {selectedEmployer.email || '—'}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 space-y-1">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{isFa ? 'شبکه‌های اجتماعی' : 'Social Accounts'}</span>
                  </div>
                  <div dir="ltr" className="font-mono text-[11.5px] text-[var(--text-primary)] text-start space-y-0.5">
                    {selectedEmployer.instagram && <div>IG: {selectedEmployer.instagram}</div>}
                    {selectedEmployer.linkedin && <div>IN: {selectedEmployer.linkedin}</div>}
                    {!selectedEmployer.instagram && !selectedEmployer.linkedin && '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* 9-Section Form Activation Status */}
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">
                    {isFa
                      ? `وضعیت ۹ بخش فرم‌های رسمی برای ${selectedEmployer.nameFa}`
                      : `9 Official Form Sections for ${selectedEmployer.nameEn}`}
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {isFa
                      ? 'برای بخش‌های قفل‌شده می‌توانید فایل فرم رسمی را جهت پیاده‌سازی برای سازنده برنامه ارسال کنید.'
                      : 'For locked sections, click any item to send the official form template to the developer.'}
                  </p>
                </div>
                <span className="text-xs font-bold text-[var(--accent-primary)] tabular-nums">
                  {isFa
                    ? `${formatDigitsByLang(summary.unlockedCount, lang)} از ${formatDigitsByLang(summary.totalCount, lang)} بخش فعال`
                    : `${summary.unlockedCount} of ${summary.totalCount} active`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {summary.sections.map((sec) => (
                  <button
                    key={sec.sectionKey}
                    type="button"
                    data-testid={`employer-section-card-${sec.sectionKey}`}
                    onClick={() => {
                      if (sec.hasAccess && isSelectedActiveOnProject && onOpenFormSection) {
                        onOpenFormSection(sec.sectionKey);
                      } else if (!sec.hasAccess) {
                        setRequestDefaultType('missing_form');
                        setRequestSectionKey(sec.sectionKey);
                        setActiveTab('request');
                      }
                    }}
                    className={`p-3 rounded-xl border text-start flex items-center justify-between gap-2 transition-colors ${
                      sec.hasAccess
                        ? 'border-emerald-500/35 bg-emerald-500/5 hover:border-emerald-500/60 text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 hover:border-[var(--accent-primary)]/60 text-[var(--text-secondary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {sec.hasAccess ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Lock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      )}
                      <span className="text-xs font-semibold truncate">
                        {isFa ? sec.meta.titleFa : sec.meta.titleEn}
                      </span>
                    </div>
                    <span
                      className={`text-[10.5px] font-bold shrink-0 ${
                        sec.hasAccess ? 'text-emerald-600' : 'text-[var(--accent-primary)]'
                      }`}
                    >
                      {sec.hasAccess
                        ? isFa
                          ? 'فعال'
                          : 'Active'
                        : isFa
                          ? 'ارسال فرم'
                          : 'Send Form'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
