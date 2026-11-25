import React from 'react';
import { Building2, CheckCircle2, Lock } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import {
  getEmployerFormSectionsSummary,
  getOperationalFormSectionMeta,
  type OperationalFormSectionKey,
} from '../shared/formAccess.ts';
import { DeveloperFormRequestPanel } from './DeveloperFormRequestPanel.tsx';

interface OperationalFormGateProps {
  sectionKey: OperationalFormSectionKey;
  onSelectSection: (sectionKey: OperationalFormSectionKey) => void;
}

export const OperationalFormGate: React.FC<OperationalFormGateProps> = ({
  sectionKey,
  onSelectSection,
}) => {
  const { prefs, activeEmployer } = useApp();
  const isFa = prefs.language === 'fa';
  const meta = getOperationalFormSectionMeta(sectionKey);
  const summary = getEmployerFormSectionsSummary(activeEmployer);
  const employerLabel = activeEmployer.shortName
    ? `${activeEmployer.nameFa} (${activeEmployer.shortName})`
    : activeEmployer.nameFa;

  return (
    <div
      data-testid={`operational-form-gate-${sectionKey}`}
      className="max-w-4xl mx-auto py-3 sm:py-6 space-y-5"
    >
      {/* Locked Section Notice Header */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-primary)]/20 flex items-center justify-center text-[var(--accent-primary)] shrink-0">
            <Lock className="w-5 h-5" />
          </div>

          <div className="space-y-1.5 flex-1 min-w-0">
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
                <>
                  برای کارفرمای{' '}
                  <strong className="text-[var(--text-primary)]">{employerLabel}</strong> هنوز فرم
                  رسمی بخش «
                  <strong className="text-[var(--text-primary)]">{meta.titleFa}</strong>» در سامانه
                  تعریف نشده است. برای فعال‌سازی این بخش، لطفاً فرم مربوطه و مشخصات مورد نیاز را از
                  طریق فرم زیر برای سازنده برنامه ارسال نمایید.
                </>
              ) : (
                <>
                  No official form has been defined yet for{' '}
                  <strong className="text-[var(--text-primary)]">{employerLabel}</strong> in the{' '}
                  <strong className="text-[var(--text-primary)]">{meta.titleEn}</strong> section.
                  Submit the form template and contact details below to request implementation by
                  the developer.
                </>
              )}
            </p>
          </div>
        </div>

        {/* 9-Section Activation Status Matrix */}
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
                  onClick={() => onSelectSection(sec.sectionKey)}
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
                        ? 'درخواست فرم'
                        : 'Request'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Embedded Developer Contact & Form Submission Panel */}
      <DeveloperFormRequestPanel
        defaultRequestType="missing_form"
        defaultEmployer={activeEmployer}
        defaultSectionKey={sectionKey}
      />
    </div>
  );
};
