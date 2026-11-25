import React from 'react';
import { AlertTriangle, Download, RefreshCw, Send } from 'lucide-react';
import {
  downloadDiagnosticsFile,
  recordDiagnosticEvent,
  submitErrorReportToServer,
} from '../lib/diagnostics.ts';
import { APP_VERSION } from '../shared/appVersion.ts';
import type { ErrorReportRecord } from '../shared/types.ts';

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
  sending: boolean;
  sentStatus: 'idle' | 'sent' | 'saved_offline';
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      errorStack: '',
      sending: false,
      sentStatus: 'idle',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected application error',
      errorStack: error?.stack || '',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    recordDiagnosticEvent({
      kind: 'react_crash',
      severity: 'critical',
      message: error?.message || 'React UI crash',
      stack: error?.stack,
      details: info?.componentStack?.slice(0, 1000),
    });
  }

  handleSendCrashReport = async () => {
    this.setState({ sending: true });
    const report: ErrorReportRecord = {
      id: `crash-${Date.now()}`,
      createdAt: new Date().toISOString(),
      title: `خطای غیرمنتظره برنامه: ${this.state.errorMessage.slice(0, 80)}`,
      category: 'freeze_crash',
      section: 'app_crash_boundary',
      severity: 'critical',
      description: this.state.errorMessage,
      stepsToReproduce: this.state.errorStack.slice(0, 1200),
      attachLogs: true,
      appVersion: APP_VERSION,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
      syncedToServer: false,
    };
    const res = await submitErrorReportToServer(report);
    this.setState({
      sending: false,
      sentStatus: res.synced ? 'sent' : 'saved_offline',
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isFa =
      typeof document !== 'undefined' ? (document.documentElement.getAttribute('lang') || 'fa') === 'fa' : true;

    return (
      <div
        dir={isFa ? 'rtl' : 'ltr'}
        className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
      >
        <div className="w-full max-w-lg rounded-2xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-bold">
                {isFa ? 'خطای غیرمنتظره در اجرای برنامه رخ داد' : 'An unexpected application error occurred'}
              </h1>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {isFa
                  ? 'جزئیات این خطا به صورت خودکار در لاگ عیب‌یابی ذخیره شد. می‌توانید فایل گزارش را دانلود کرده یا به سرور ارسال نمایید و سپس برنامه را مجدداً بارگذاری کنید.'
                  : 'Error details were automatically captured in the diagnostic log. You can download or send the report to the server, then reload.'}
              </p>
            </div>
          </div>

          <div
            dir="ltr"
            className="mt-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3 text-xs font-mono text-rose-700 dark:text-rose-300 max-h-36 overflow-auto whitespace-pre-wrap break-all"
          >
            {this.state.errorMessage}
          </div>

          {this.state.sentStatus !== 'idle' && (
            <div className="mt-3 rounded-lg px-3 py-2 text-xs font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {this.state.sentStatus === 'sent'
                ? isFa
                  ? 'گزارش خطا با موفقیت به سرور ارسال شد.'
                  : 'Crash report sent to server successfully.'
                : isFa
                ? 'گزارش در حافظه دستگاه ذخیره شد و به محض اتصال به سرور ارسال خواهد شد.'
                : 'Report saved locally and will sync automatically when online.'}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 text-xs font-bold"
            >
              <RefreshCw className="w-4 h-4" />
              {isFa ? 'بارگذاری مجدد برنامه' : 'Reload Application'}
            </button>
            <button
              type="button"
              onClick={() => downloadDiagnosticsFile({ format: 'json' })}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 px-3.5 py-2.5 text-xs font-semibold"
            >
              <Download className="w-4 h-4" />
              {isFa ? 'دانلود فایل لاگ' : 'Download Log'}
            </button>
            <button
              type="button"
              disabled={this.state.sending}
              onClick={() => void this.handleSendCrashReport()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white px-3.5 py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {this.state.sending
                ? isFa
                  ? 'در حال ارسال...'
                  : 'Sending...'
                : isFa
                ? 'ارسال به سرور'
                : 'Send to Server'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
