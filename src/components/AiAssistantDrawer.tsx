import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { formatDisplayNumber } from '../shared/jalali.ts';

interface AiAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface WarehouseAiMetrics {
  generalRows: number;
  detailedRows: number;
  transitRows: number;
  uniquePackings: number;
  grossWeightTons: number;
  netWeightTons: number;
  shortageItemsCount: number;
  shortageQtySum: number;
  damagedItemsCount: number;
  openMerCount: number;
  openRepCount: number;
  opiPendingCount: number;
  expiringChemicalsCount: number;
  transitArrivedPackingsCount: number;
  transitShippingPackingsCount: number;
  transitInspectionPackingsCount: number;
}

interface WarehouseAnalysis {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  priorityActions: string[];
  followUpSuggestions: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
}

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({ open, onClose }) => {
  const { prefs, notify } = useApp();
  const isFa = prefs.language === 'fa';

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<WarehouseAnalysis | null>(null);
  const [metrics, setMetrics] = useState<WarehouseAiMetrics | null>(null);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const [keyRequired, setKeyRequired] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  if (!open) return null;

  const fmt = (val: number) => formatDisplayNumber(val, prefs.language);

  const extractMetricsFromError = (err: ApiError): WarehouseAiMetrics | null => {
    if (err.payload && typeof err.payload === 'object' && 'metrics' in err.payload) {
      return (err.payload as { metrics?: WarehouseAiMetrics }).metrics || null;
    }
    return null;
  };

  const handleAnalyzeWarehouse = async () => {
    setAnalyzing(true);
    setAnalysisNotice(null);
    try {
      const res = await apiRequest<{
        analysis: WarehouseAnalysis;
        metrics: WarehouseAiMetrics;
      }>('/api/ai/analyze-warehouse', {
        method: 'POST',
        body: JSON.stringify({ lang: prefs.language }),
      });
      setAnalysis(res.analysis);
      setMetrics(res.metrics);
      setKeyRequired(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const m = extractMetricsFromError(err);
        if (m) setMetrics(m);
        if (err.code === 'AI_KEY_REQUIRED' || err.status === 503) {
          setKeyRequired(true);
        }
        setAnalysisNotice(err.message);
      } else {
        notify('error', isFa ? 'خطا در اجرای تحلیل هوشمند' : 'AI analysis failed');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendQuestion = async (rawQuestion?: string) => {
    const text = (rawQuestion ?? prompt).trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      text,
    };
    const nextHistory = [
      ...messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          text: m.text,
        })),
    ];

    setMessages((prev) => [...prev, userMsg]);
    if (!rawQuestion) setPrompt('');
    setSending(true);

    try {
      const res = await apiRequest<{
        answer: string;
        metrics?: WarehouseAiMetrics;
      }>('/api/ai/assistant', {
        method: 'POST',
        body: JSON.stringify({
          prompt: text,
          lang: prefs.language,
          history: nextHistory,
        }),
      });
      if (res.metrics) setMetrics(res.metrics);
      setKeyRequired(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: 'assistant',
          text: res.answer || (isFa ? 'پاسخی دریافت نشد.' : 'No response received.'),
        },
      ]);
    } catch (err) {
      if (err instanceof ApiError) {
        const m = extractMetricsFromError(err);
        if (m) setMetrics(m);
        if (err.code === 'AI_KEY_REQUIRED' || err.status === 503) {
          setKeyRequired(true);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-e`,
            role: 'error',
            text: err.message,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-e`,
            role: 'error',
            text: isFa ? 'خطای غیرمنتظره در ارتباط با سرویس هوش مصنوعی.' : 'Unexpected AI service error.',
          },
        ]);
      }
    } finally {
      setSending(false);
    }
  };

  const quickPrompts = isFa
    ? [
        {
          label: 'وضعیت کسری و مغایرت‌ها',
          prompt: 'وضعیت اقلام دارای کسری، آسیب‌دیدگی، MER و REP باز را خلاصه کن و اولویت‌ها را بگو.',
        },
        {
          label: 'مواد شیمیایی رو به انقضا',
          prompt: 'کدام مواد شیمیایی در آستانه انقضا (زیر ۳۰ روز) هستند و چه اقدامی لازم است؟',
        },
        {
          label: 'خلاصه محموله‌های در راه',
          prompt: 'وضعیت پکینگ لیست‌های در راه (ارسال‌شده، در دست بازرسی، رسیده) چگونه است؟',
        },
        {
          label: 'گزارش وزن و پکینگ‌ها',
          prompt: 'خلاصه تعداد پکینگ‌ها، ردیف‌های ثبتی و وزن ناخالص/خالص کل انبار را گزارش بده.',
        },
      ]
    : [
        {
          label: 'Shortages & Discrepancies',
          prompt: 'Summarize active shortages, damaged items, and open MER/REP priorities.',
        },
        {
          label: 'Expiring Chemicals',
          prompt: 'Which chemicals are expiring within 30 days and what actions are recommended?',
        },
        {
          label: 'In-Transit Summary',
          prompt: 'Summarize in-transit packing lists across shipping, inspection, and arrived statuses.',
        },
        {
          label: 'Weight & Packing Totals',
          prompt: 'Provide an overview of unique packing lists, registered rows, and total gross/net tonnage.',
        },
      ];

  const riskBadgeStyle =
    analysis?.riskLevel === 'high'
      ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-[var(--status-danger)]/40'
      : analysis?.riskLevel === 'medium'
        ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning)]/40'
        : 'bg-[var(--status-success-bg)] text-[var(--status-success)] border-[var(--status-success)]/40';

  const riskLabel =
    analysis?.riskLevel === 'high'
      ? isFa ? 'ریسک بالا' : 'High Risk'
      : analysis?.riskLevel === 'medium'
        ? isFa ? 'ریسک متوسط' : 'Medium Risk'
        : isFa ? 'ریسک پایین / پایدار' : 'Low Risk';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex justify-end print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isFa ? 'دستیار هوشمند سمان' : 'SAMAAN AI Assistant'}
    >
      <div
        className="w-full max-w-xl h-full bg-[var(--bg-surface)] border-s border-[var(--border-subtle)] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">
                {isFa ? 'دستیار و تحلیل‌گر هوشمند انبار' : 'Warehouse AI Assistant & Analyst'}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                {isFa
                  ? 'تحلیل ریسک عملیاتی و پرسش‌وپاسخ زنده بر اساس داده‌های انبار'
                  : 'Operational risk briefing & live Q&A grounded in warehouse data'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isFa ? 'بستن دستیار هوشمند' : 'Close AI Assistant'}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Executive Analysis Section */}
          <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <ShieldAlert className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>{isFa ? 'تحلیل وضعیت و ریسک انبار' : 'Executive Risk Briefing'}</span>
              </div>
              <button
                type="button"
                onClick={handleAnalyzeWarehouse}
                disabled={analyzing}
                className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {analyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>
                  {analyzing
                    ? isFa ? 'در حال تحلیل...' : 'Analyzing...'
                    : isFa ? 'تحلیل هوشمند وضعیت انبار' : 'Run Risk Analysis'}
                </span>
              </button>
            </div>

            {keyRequired && (
              <div className="rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning-bg)] px-3 py-2.5 text-xs text-[var(--status-warning)] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">
                    {isFa
                      ? 'سرویس هوش مصنوعی آماده دریافت کلید سرور است'
                      : 'Server AI Key Required'}
                  </div>
                  <p className="text-[11px] opacity-90">
                    {analysisNotice ||
                      (isFa
                        ? 'کلید GEMINI_API_KEY در سرور تنظیم نشده است. آمار زنده زیر مستقیماً از پایگاه داده محاسبه شده است.'
                        : 'GEMINI_API_KEY is not configured on the server. Live operational metrics below are computed directly from the database.')}
                  </p>
                </div>
              </div>
            )}

            {!keyRequired && analysisNotice && (
              <div className="rounded-lg border border-[var(--status-danger)]/40 bg-[var(--status-danger-bg)] px-3 py-2 text-xs text-[var(--status-danger)]">
                {analysisNotice}
              </div>
            )}

            {metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2">
                  <div className="text-[var(--text-muted)]">{isFa ? 'پکینگ یکتا' : 'Packings'}</div>
                  <div className="font-bold text-sm tabular-nums mt-0.5">{fmt(metrics.uniquePackings)}</div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2">
                  <div className="text-[var(--text-muted)]">{isFa ? 'اقلام کسری' : 'Shortages'}</div>
                  <div className="font-bold text-sm tabular-nums text-[var(--status-danger)] mt-0.5">
                    {fmt(metrics.shortageItemsCount)}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2">
                  <div className="text-[var(--text-muted)]">{isFa ? 'MER / REP باز' : 'Open MER/REP'}</div>
                  <div className="font-bold text-sm tabular-nums text-[var(--status-warning)] mt-0.5">
                    {fmt(metrics.openMerCount)} / {fmt(metrics.openRepCount)}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2">
                  <div className="text-[var(--text-muted)]">{isFa ? 'وزن ناخالص (تن)' : 'Gross (t)'}</div>
                  <div className="font-bold text-sm tabular-nums mt-0.5">{fmt(metrics.grossWeightTons)}</div>
                </div>
              </div>
            )}

            {analysis && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2.5 py-1 rounded-md border text-[11px] font-bold ${riskBadgeStyle}`}>
                    {riskLabel}
                  </span>
                </div>
                <p className="text-xs leading-6 text-[var(--text-primary)] whitespace-pre-wrap">
                  {analysis.summary}
                </p>

                {analysis.priorityActions?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-[var(--text-secondary)]">
                      {isFa ? 'اقدامات اولویت‌دار پیشنهادی:' : 'Priority Actions:'}
                    </div>
                    <ul className="space-y-1">
                      {analysis.priorityActions.map((act, i) => (
                        <li key={i} className="text-xs text-[var(--text-primary)] flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 mt-1" />
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.followUpSuggestions?.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-[var(--text-secondary)]">
                      {isFa ? 'پرسش‌های پیگیری پیشنهادی:' : 'Suggested Follow-ups:'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.followUpSuggestions.map((sug, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSendQuestion(sug)}
                          className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] text-[11px] text-start transition-colors"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Quick Questions */}
          <section className="space-y-2">
            <div className="text-[11px] font-bold text-[var(--text-muted)]">
              {isFa ? 'پرسش‌های سریع انبار:' : 'Quick Warehouse Prompts:'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {quickPrompts.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  disabled={sending}
                  onClick={() => handleSendQuestion(qp.prompt)}
                  className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] hover:border-[var(--accent-primary)]/50 text-xs font-medium text-start text-[var(--text-primary)] transition-colors disabled:opacity-50"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </section>

          {/* Chat Conversation */}
          <section className="space-y-2.5">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                {isFa
                  ? 'پرسش خود را درباره محموله‌ها، پکینگ لیست‌ها، کسری‌ها، موجودی جزایر یا مواد شیمیایی بپرسید.'
                  : 'Ask anything about shipments, packing lists, shortages, island stock, or chemicals.'}
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl px-3.5 py-2.5 text-xs leading-6 flex items-start gap-2.5 ${
                    m.role === 'user'
                      ? 'bg-[var(--accent-soft)] border border-[var(--accent-primary)]/25 text-[var(--text-primary)]'
                      : m.role === 'error'
                        ? 'bg-[var(--status-danger-bg)] border border-[var(--status-danger)]/35 text-[var(--status-danger)]'
                        : 'bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-primary)]'
                  }`}
                >
                  {m.role === 'user' ? (
                    <UserIcon className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-1" />
                  ) : m.role === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-1" />
                  ) : (
                    <Bot className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-1" />
                  )}
                  <div className="whitespace-pre-wrap break-words flex-1 bidi-plaintext">{m.text}</div>
                </div>
              ))
            )}
            {sending && (
              <div className="rounded-xl px-3.5 py-2.5 text-xs bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-muted)] flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
                <span>{isFa ? 'در حال بررسی داده‌های انبار...' : 'Analyzing warehouse data...'}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </section>
        </div>

        {/* Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendQuestion();
          }}
          className="p-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isFa
                ? 'پرسش درباره انبار، پکینگ، کسری یا تجهیزات...'
                : 'Ask about inventory, packings, shortages...'
            }
            className="flex-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <button
            type="submit"
            disabled={sending || !prompt.trim()}
            aria-label={isFa ? 'ارسال پرسش' : 'Send question'}
            className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isFa ? 'ارسال' : 'Send'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
