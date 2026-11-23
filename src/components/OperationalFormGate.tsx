import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileUp,
  Lock,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import {
  getEmployerFormSectionsSummary,
  getOperationalFormSectionMeta,
  type OperationalFormSectionKey,
} from '../shared/formAccess.ts';

interface OperationalFormGateProps {
  sectionKey: OperationalFormSectionKey;
  onGoToUploadForms: (sectionKey: OperationalFormSectionKey) => void;
  onSelectSection: (sectionKey: OperationalFormSectionKey) => void;
}

export const OperationalFormGate: React.FC<OperationalFormGateProps> = ({
  sectionKey,
  onGoToUploadForms,
  onSelectSection,
}) => {
  const { prefs, activeEmployer } = useApp();
  const isFa = prefs.language === 'fa';
  const meta = getOperationalFormSectionMeta(sectionKey);
  const summary = getEmployerFormSectionsSummary(activeEmployer);
  const isMd1 = activeEmployer.id === 'mapna-md1';
  const employerLabel = activeEmployer.shortName
    ? `${activeEmployer.nameFa} (${activeEmployer.shortName})`
    : activeEmployer.nameFa;

  return (
    <div
      data-testid={`operational-form-gate-${sectionKey}`}
      className="max-w-4xl mx-auto py-4 sm:py-8 space-y-5"
    >
      {/* Main Gate Card */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 flex flex-col items-center text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-primary)]/20 flex items-center justify-center text-[var(--accent-primary)]">
            <Lock className="w-6 h-6" />
          </div>

          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
              <Building2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{employerLabel}</span>
              <span>·</span>
              <span className="tabular-nums">
                {isFa
                  ? `بخش ${meta.order} از ${summary.totalCount}`
                  : `Section ${meta.order} of ${summary.totalCount}`}
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight">
              {isFa ? meta.titleFa : meta.titleEn}
            </h2>

            <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-7">
              {isFa ? (
                isMd1 ? (
                  <>
                    فرم پیش‌فرض قبلی این بخش حذف شده و فرم جدید کارفرمای{' '}
                    <strong className="text-[var(--text-primary)]">{employerLabel}</strong> برای بخش «
                    <strong className="text-[var(--text-primary)]">{meta.titleFa}</strong>» هنوز جایگزین
                    نشده است. برای فعال‌سازی دسترسی این بخش، ابتدا فایل فرم مورد نظر را در قسمت{' '}
                    <strong className="text-[var(--text-primary)]">«آپلود و تعریف فرم‌ها»</strong> به
                    برنامه وارد کنید.
                  </>
                ) : (
                  <>
                    برای کارفرمای{' '}
                    <strong className="text-[var(--text-primary)]">{employerLabel}</strong> هنوز فرمی
                    برای بخش «<strong className="text-[var(--text-primary)]">{meta.titleFa}</strong>»
                    تعریف نشده است. ابتدا باید فرم مورد نظر این بخش را از قسمت{' '}
                    <strong className="text-[var(--text-primary)]">«آپلود و تعریف فرم‌ها»</strong> به
                    برنامه وارد کنید؛ بلافاصله پس از وارد کردن فرم، دسترسی شما به این بخش فعال می‌شود.
                  </>
                )
              ) : (
                <>
                  No form template has been configured for{' '}
                  <strong className="text-[var(--text-primary)]">{employerLabel}</strong> in the{' '}
                  <strong className="text-[var(--text-primary)]">{meta.titleEn}</strong> section yet.
                  Upload this section&apos;s form in{' '}
                  <strong className="text-[var(--text-primary)]">Upload &amp; Define Forms</strong> to
                  immediately unlock access to this section.
                </>
              )}
            </p>
          </div>

          <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              data-testid="gate-open-upload-form-btn"
              onClick={() => onGoToUploadForms(sectionKey)}
              className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
            >
              <FileUp className="w-4 h-4 shrink-0" />
              <span>
                {isFa ? 'ورود به بخش آپلود و تعریف فرم‌ها' : 'Go to Upload & Define Forms'}
              </span>
              {isFa ? (
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* 9-Section Activation Status Footer */}
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {isFa
                ? `وضعیت فعال‌سازی ۹ بخش فرم‌ها برای ${employerLabel}`
                : `9 Form Sections Status for ${employerLabel}`}
            </span>
            <span className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">
              {isFa
                ? `${summary.unlockedCount} از ${summary.totalCount} بخش فعال`
                : `${summary.unlockedCount} of ${summary.totalCount} active`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {summary.sections.map((sec) => {
              const isCurrent = sec.sectionKey === sectionKey;
              return (
                <button
                  key={sec.sectionKey}
                  type="button"
                  onClick={() =>
                    sec.hasAccess
                      ? onSelectSection(sec.sectionKey)
                      : onGoToUploadForms(sec.sectionKey)
                  }
                  className={`h-10 px-3 rounded-xl border text-start flex items-center justify-between gap-2 transition-colors ${
                    isCurrent
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/60 text-[var(--text-primary)]'
                      : sec.hasAccess
                        ? 'border-emerald-500/35 bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-emerald-500/60'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {sec.hasAccess ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    )}
                    <span className="text-[11.5px] font-medium truncate">
                      {isFa ? sec.meta.titleFa : sec.meta.titleEn}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold shrink-0 ${
                      sec.hasAccess ? 'text-emerald-600' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {sec.hasAccess
                      ? isFa
                        ? 'فعال'
                        : 'Active'
                      : isFa
                        ? 'آپلود'
                        : 'Upload'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
