import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ClipboardList, Pencil, Printer, RotateCcw, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { MD1_STACKED_LOGO } from '../lib/assets.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type { PeriodicInspectionAnswer, PeriodicInspectionRecord } from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';

interface ChecklistQuestionDef {
  key: string;
  rowNo: string;
  text: string;
}

interface ChecklistPageDef {
  pageNumber: number;
  sectionTitle: string;
  questions: ChecklistQuestionDef[];
  hasSignaturesAndFootnotes?: boolean;
}

const PERIODIC_INSPECTION_PAGES: ChecklistPageDef[] = [
  {
    pageNumber: 1,
    sectionTitle: 'کنترل مستندات انبارش',
    questions: [
      {
        key: 'doc-1',
        rowNo: '1',
        text: 'در دسترس بودن ویرایش معتبر روش اجرایی انبارش و نگهداری کالا و تجهیزات و دستورالعمل آماده‌سازی انبار موقت پروژه',
      },
      {
        key: 'doc-2',
        rowNo: '2',
        text: 'آشنایی و رعایت روش اجرایی انبارش و نگهداری کالا و تجهیزات و دستورالعمل آماده‌سازی انبار موقت پروژه',
      },
      {
        key: 'doc-3',
        rowNo: '3',
        text: 'در دسترس بودن مدارک و دستورالعمل‌های نگهداری کالاها و تجهیزات (بویژه تجهیزات خاص همچون توربین، بویلر و ...)',
      },
      {
        key: 'doc-4',
        rowNo: '4',
        text: 'آشنایی با مدارک و دستورالعمل‌های نگهداری کالاها و تجهیزات (بویژه تجهیزات خاص همچون توربین)',
      },
      {
        key: 'doc-5',
        rowNo: '5',
        text: 'ثبت اطلاعات در بانک اطلاعاتی',
      },
      {
        key: 'doc-6',
        rowNo: '6',
        text: 'بکارگیری فرم گزارش آسیب‌دیدگی حین حمل و نقل در مواقع لزوم (MD1EX-FQP02-01)',
      },
      {
        key: 'doc-7',
        rowNo: '7',
        text: 'بکارگیری صورتجلسه ورود کالا و تجهیزات به کارگاه (MD1EX-FQP02-15)',
      },
      {
        key: 'doc-8',
        rowNo: '8',
        text: 'بکارگیری فرم دعوتنامه گشایش و بازرسی بسته‌ها (OPI) (MD1EX-FQP02-02)',
      },
    ],
  },
  {
    pageNumber: 2,
    sectionTitle: 'کنترل مستندات انبارش',
    questions: [
      {
        key: 'doc-9',
        rowNo: '9',
        text: 'بکارگیری فرم صورتجلسه گشایش و بازرسی بسته‌ها (OPI) (MD1EX-FQP02-06)',
      },
      {
        key: 'doc-10',
        rowNo: '10',
        text: 'بکارگیری درخواست خرید کالای پروژه در کارگاه (MD1EX-FQW15-01)',
      },
      {
        key: 'doc-11',
        rowNo: '11',
        text: 'بکارگیری فرم رسید مصرف مستقیم کالا (MD1EX-FQP02-11) در مواقع لزوم',
      },
      {
        key: 'doc-12',
        rowNo: '12',
        text: 'بکارگیری فرم گزارش خسارت‌ها پس از OPI (MD1EX-FQP02-13) در مواقع لزوم',
      },
      {
        key: 'doc-13',
        rowNo: '13',
        text: 'بکارگیری فرم جایگزینی (MD1EX-FQP02-10) در مواقع لزوم',
      },
      {
        key: 'doc-14',
        rowNo: '14',
        text: 'بکارگیری فرم درخواست کالا از انبار و حواله انبار (MD1EX-FQP02-05)',
      },
      {
        key: 'doc-15',
        rowNo: '15',
        text: 'بکارگیری فرم ارجاع قطعات، کالا و تجهیزات مازاد (MD1EX-FQP02-08)',
      },
    ],
  },
  {
    pageNumber: 3,
    sectionTitle: 'کنترل فیزیکی انبار',
    questions: [
      {
        key: 'phy-1',
        rowNo: '1',
        text: 'سلامت بسته‌ها و اقلام موجود در آن (و ارائه گزارش خسارت حمل در صورت عدم سلامت)',
      },
      {
        key: 'phy-2',
        rowNo: '2',
        text: 'نوع چیدمان و آرایش به ترتیب نوع اقلام',
      },
      {
        key: 'phy-3',
        rowNo: '3',
        text: 'آدرس‌گذاری اقلام و قفسه‌ها در محوطه‌های روباز و انبار سرپوشیده و ثبت در بانک اطلاعاتی انبار',
      },
      {
        key: 'phy-4',
        rowNo: '4',
        text: 'رعایت شرایط نگهداری اقلام آسیب‌پذیر',
      },
      {
        key: 'phy-5',
        rowNo: '5',
        text: 'رعایت فاصله نگهداری بین اقلامی که روی اقلام دیگر تأثیر می‌گذارند',
      },
      {
        key: 'phy-6',
        rowNo: '6',
        text: 'وضعیت نگهداری اقلام فاسدشدنی و ارائه لیست این اقلام با تاریخ انقضا',
      },
      {
        key: 'phy-7',
        rowNo: '7',
        text: 'وضعیت نگهداری اقلام آتش‌زا و ارائه لیست این اقلام به همراه آدرس نگهداری آنها',
      },
      {
        key: 'phy-8',
        rowNo: '8',
        text: 'درج علائم و نوشته‌های مخصوص اقلام خطرناک و ارائه لیست این اقلام به همراه آدرس نگهداری آنها',
      },
      {
        key: 'phy-9',
        rowNo: '9',
        text: 'علامت‌گذاری محل‌های نگهداری اقلام بلاتکلیف و ...',
      },
    ],
  },
  {
    pageNumber: 4,
    sectionTitle: 'کنترل فیزیکی انبار',
    questions: [
      {
        key: 'phy-10',
        rowNo: '10',
        text: 'مناسب بودن ظروف نگهداری',
      },
      {
        key: 'phy-11',
        rowNo: '11',
        text: 'زیرسازی و استفاده از پالت و تراورز جهت تخلیه تجهیزات',
      },
      {
        key: 'phy-12',
        rowNo: '12',
        text: 'فضای نگهداری مناسب و ایمن',
      },
      {
        key: 'phy-13',
        rowNo: '13',
        text: 'وضعیت نگهداری اقلام موجود در فضای باز',
      },
      {
        key: 'phy-14',
        rowNo: '14',
        text: 'رعایت علامت‌گذاری و شرایط ایمنی انبار (آژیر اعلام حریق ، کپسول اطفاء حریق و ...)',
      },
      {
        key: 'phy-15',
        rowNo: '15',
        text: 'رعایت شرایط نگهداری در فضای انبار به تناسب طبقه‌بندی (فضای باز ، مسقف و ...)',
      },
      {
        key: 'phy-16',
        rowNo: '16',
        text: 'رعایت مسیر و جاده دسترسی و امکان حمل اقلام توسط وسائل قابل حمل (امکان حمل دستی، لیفت‌تراک برقی / دستی ، ماشینی ، جرثقیل و ...)',
      },
      {
        key: 'phy-17',
        rowNo: '17',
        text: 'علائم و نشانه‌های مربوط به PRESERVATION جهت اقلامی که نیاز به نگهداری ویژه داشته باشند.',
      },
      {
        key: 'phy-18',
        rowNo: '18',
        text: 'مشخص نمودن اقلام دارای تاریخ انقضاء',
      },
    ],
  },
  {
    pageNumber: 5,
    sectionTitle: 'کنترل فیزیکی انبار',
    hasSignaturesAndFootnotes: true,
    questions: [
      {
        key: 'phy-19',
        rowNo: '19',
        text: 'مشخص نمودن اقلام فاسد شدنی و تغییر یافتنی',
      },
      {
        key: 'phy-20',
        rowNo: '20',
        text: 'مشخص بودن اقلام آسیب دیده در انبار (جداسازی ، تفکیک و پیگیری بعدی)',
      },
    ],
  },
];

const ALL_QUESTIONS: ChecklistQuestionDef[] = PERIODIC_INSPECTION_PAGES.flatMap((p) => p.questions);

function createEmptyAnswersMap(): Record<string, { status: '+' | '-' | ''; remarks: string }> {
  const map: Record<string, { status: '+' | '-' | ''; remarks: string }> = {};
  for (const q of ALL_QUESTIONS) {
    map[q.key] = { status: '', remarks: '' };
  }
  return map;
}

interface OfficialPeriodicInspectionSheetProps {
  record: PeriodicInspectionRecord;
  formatDate: (iso: string) => string;
}

const OfficialPeriodicInspectionSheet: React.FC<OfficialPeriodicInspectionSheetProps> = ({
  record,
  formatDate,
}) => {
  const answerByKey = useMemo(() => {
    const map = new Map<string, PeriodicInspectionAnswer>();
    for (const a of record.answers || []) {
      map.set(a.questionKey, a);
    }
    return map;
  }, [record.answers]);

  return (
    <div
      dir="rtl"
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {PERIODIC_INSPECTION_PAGES.map((page, pageIdx) => {
        const isLastPage = pageIdx === PERIODIC_INSPECTION_PAGES.length - 1;
        const rowMinHeight = page.questions.length <= 7 ? '50px' : page.questions.length === 8 ? '46px' : '42px';

        return (
          <div
            key={page.pageNumber}
            className="samaan-periodic-page"
            style={{
              pageBreakAfter: isLastPage ? 'auto' : 'always',
              breakAfter: isLastPage ? 'auto' : 'page',
              marginBottom: isLastPage ? 0 : '20px',
            }}
          >
            {/* Main Form Frame */}
            <div style={{ border: '1.8px solid #000000', backgroundColor: '#ffffff' }}>
              {/* Header Strip (No vertical lines, matching PDF) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '125px 1fr 225px',
                  alignItems: 'stretch',
                  borderBottom: '1.5px solid #000000',
                  padding: '5px 10px',
                }}
              >
                {/* Right: Stacked MAPNA MD1 Logo */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                  }}
                >
                  <img
                    src={MD1_STACKED_LOGO}
                    alt="گروه مپنا - توسعه یک"
                    style={{ height: '54px', width: 'auto', objectFit: 'contain', display: 'block' }}
                  />
                  <div
                    style={{
                      fontSize: '7.5px',
                      fontWeight: 700,
                      color: '#334155',
                      marginTop: '2px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    مستندات سیستم مدیریت یکپارچه
                  </div>
                </div>

                {/* Center: Titles */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    lineHeight: 1.55,
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700 }}>
                    شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)
                  </div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>
                    پروژه {record.projectName?.trim() || '........'}
                  </div>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, marginTop: '3px' }}>
                    چک لیست بازدید ادواری انبار
                  </div>
                </div>

                {/* Left: Supervisor & Date */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textAlign: 'right',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                    <span>سرپرست/مسئول تأمین تجهیزات:</span>
                    <span className="bidi-plaintext" style={{ fontWeight: 600 }}>
                      {record.supervisorName || ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                    <span>تاریخ:</span>
                    <span dir="ltr" className="tabular-nums" style={{ fontWeight: 600 }}>
                      {record.inspectionDate ? formatDate(record.inspectionDate) : '/    /'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Main 4-Column Checklist Table */}
              <table
                dir="rtl"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                  fontSize: '10.5px',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#ffffff', fontWeight: 700 }}>
                    <th
                      style={{
                        width: '5.5%',
                        borderBottom: '1px solid #000000',
                        borderLeft: '1px dotted #000000',
                        padding: '6px 4px',
                      }}
                    >
                      ردیف
                    </th>
                    <th
                      style={{
                        width: '44.5%',
                        borderBottom: '1px solid #000000',
                        borderLeft: '1px solid #000000',
                        padding: '6px 6px',
                      }}
                    >
                      پرسش
                    </th>
                    <th
                      style={{
                        width: '8.5%',
                        borderBottom: '1px solid #000000',
                        borderLeft: '1px solid #000000',
                        padding: '4px 4px',
                        lineHeight: 1.4,
                      }}
                    >
                      <div>وضعیت*</div>
                      <div dir="ltr">(-/+)</div>
                    </th>
                    <th
                      style={{
                        width: '41.5%',
                        borderBottom: '1px solid #000000',
                        padding: '6px 6px',
                      }}
                    >
                      توضیحات **
                    </th>
                  </tr>
                  {/* Gray Section Banner Row */}
                  <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 700 }}>
                    <td
                      colSpan={4}
                      style={{
                        borderBottom: '1px solid #000000',
                        padding: '5px 8px',
                        fontSize: '11.5px',
                        textAlign: 'center',
                      }}
                    >
                      {page.sectionTitle}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {page.questions.map((q) => {
                    const ans = answerByKey.get(q.key);
                    return (
                      <tr key={q.key} style={{ height: rowMinHeight }}>
                        <td
                          className="tabular-nums"
                          style={{
                            borderBottom: '1px solid #000000',
                            borderLeft: '1px dotted #000000',
                            padding: '5px 4px',
                            fontWeight: 700,
                            textAlign: 'center',
                          }}
                        >
                          {q.rowNo}
                        </td>
                        <td
                          style={{
                            borderBottom: '1px solid #000000',
                            borderLeft: '1px solid #000000',
                            padding: '5px 8px',
                            textAlign: 'right',
                            lineHeight: 1.45,
                            fontWeight: 600,
                          }}
                        >
                          {q.text}
                        </td>
                        <td
                          dir="ltr"
                          style={{
                            borderBottom: '1px solid #000000',
                            borderLeft: '1px solid #000000',
                            padding: '5px 4px',
                            fontWeight: 800,
                            fontSize: '14px',
                            textAlign: 'center',
                          }}
                        >
                          {ans?.status === '+' ? '+' : ans?.status === '-' ? '−' : ''}
                        </td>
                        <td
                          className="bidi-plaintext"
                          style={{
                            borderBottom: '1px solid #000000',
                            padding: '5px 8px',
                            textAlign: 'center',
                            wordBreak: 'break-word',
                            lineHeight: 1.4,
                          }}
                        >
                          {ans?.remarks || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Page 5 Only: 3-Column Signatures & Legend Footnotes */}
              {page.hasSignaturesAndFootnotes && (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      borderBottom: '1px solid #000000',
                      minHeight: '88px',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}
                  >
                    <div
                      style={{
                        borderLeft: '1px solid #000000',
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>نام و امضاء اعضاء گروه بازدیدکننده :</div>
                      <div className="bidi-plaintext" style={{ fontWeight: 600, textAlign: 'center', paddingBottom: '6px' }}>
                        {record.inspectorsSignatory || ''}
                      </div>
                    </div>
                    <div
                      style={{
                        borderLeft: '1px solid #000000',
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>نام و امضاء سرپرست/مسئول تأمین تجهیزات کارگاه :</div>
                      <div className="bidi-plaintext" style={{ fontWeight: 600, textAlign: 'center', paddingBottom: '6px' }}>
                        {record.siteSupervisorSignatory || record.supervisorName || ''}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '6px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>نام و امضاء مدیر پروژه:</div>
                      <div className="bidi-plaintext" style={{ fontWeight: 600, textAlign: 'center', paddingBottom: '6px' }}>
                        {record.projectManagerSignatory || ''}
                      </div>
                    </div>
                  </div>

                  {/* Legend Footnotes (* and **) */}
                  <div
                    style={{
                      borderBottom: '1px solid #000000',
                      padding: '4px 8px',
                      fontSize: '9.5px',
                      fontWeight: 600,
                      lineHeight: 1.65,
                      textAlign: 'right',
                    }}
                  >
                    <div>* + (وضعیت مناسب) ، - (وضعیت نامناسب)</div>
                    <div>
                      ** در صورتیکه وضعیت نامناسب (-) باشد لازم است توضیحات کافی در مورد وضعیت موجود نوشته شود.
                    </div>
                  </div>
                </>
              )}

              {/* QA Notice Strip (All 5 Pages) */}
              <div
                style={{
                  borderBottom: '1px solid #000000',
                  padding: '3px 8px',
                  fontSize: '9px',
                  fontWeight: 600,
                  textAlign: 'right',
                }}
              >
                توجه : این فرم تحت کنترل واحد QA می‌باشد و هرگونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA می‌باشد.
              </div>

              {/* Bottom Strip: رونوشت & Form Code MD1EX-FQP02/07-03 (All 5 Pages) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                }}
              >
                <div>
                  رونوشت :{' '}
                  <span className="bidi-plaintext" style={{ fontWeight: 600 }}>
                    {record.copyTo || ''}
                  </span>
                </div>
                <div dir="ltr" className="tabular-nums">
                  MD1EX-FQP02/07-03
                </div>
              </div>
            </div>

            {/* External Centered Page Number Footer */}
            <div
              style={{
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 700,
                marginTop: '6px',
              }}
            >
              صفحه {page.pageNumber} از {PERIODIC_INSPECTION_PAGES.length}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface PeriodicInspectionPanelProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

export const PeriodicInspectionPanel: React.FC<PeriodicInspectionPanelProps> = ({
  refreshSignal,
  onDataChanged,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [records, setRecords] = useState<PeriodicInspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [projectName, setProjectName] = useState('');
  const [inspectionDate, setInspectionDate] = useState(getTodayIso());
  const [supervisorName, setSupervisorName] = useState('');
  const [inspectorsSignatory, setInspectorsSignatory] = useState('');
  const [siteSupervisorSignatory, setSiteSupervisorSignatory] = useState('');
  const [projectManagerSignatory, setProjectManagerSignatory] = useState('');
  const [copyTo, setCopyTo] = useState('');
  const [answersMap, setAnswersMap] = useState<
    Record<string, { status: '+' | '-' | ''; remarks: string }>
  >(createEmptyAnswersMap);

  const [printRec, setPrintRec] = useState<PeriodicInspectionRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<PeriodicInspectionRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PeriodicInspectionRecord | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ records: PeriodicInspectionRecord[] }>('/api/periodic-inspections');
      setRecords(res.records || []);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords, refreshSignal]);

  const setQuestionStatus = (key: string, next: '+' | '-' | '') => {
    setAnswersMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        status: prev[key]?.status === next ? '' : next,
      },
    }));
  };

  const setQuestionRemarks = (key: string, remarks: string) => {
    setAnswersMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        remarks,
      },
    }));
  };

  const handleSetAllPositive = () => {
    setAnswersMap((prev) => {
      const next = { ...prev };
      for (const q of ALL_QUESTIONS) {
        next[q.key] = { ...next[q.key], status: '+' };
      }
      return next;
    });
  };

  const handleResetChecklist = () => {
    setAnswersMap(createEmptyAnswersMap());
  };

  const resetForm = () => {
    setEditingRecord(null);
    setProjectName('');
    setInspectionDate(getTodayIso());
    setSupervisorName('');
    setInspectorsSignatory('');
    setSiteSupervisorSignatory('');
    setProjectManagerSignatory('');
    setCopyTo('');
    setAnswersMap(createEmptyAnswersMap());
  };

  const startEdit = (rec: PeriodicInspectionRecord) => {
    setEditingRecord(rec);
    setProjectName(rec.projectName || '');
    setInspectionDate(rec.inspectionDate);
    setSupervisorName(rec.supervisorName || '');
    setInspectorsSignatory(rec.inspectorsSignatory || '');
    setSiteSupervisorSignatory(rec.siteSupervisorSignatory || '');
    setProjectManagerSignatory(rec.projectManagerSignatory || '');
    setCopyTo(rec.copyTo || '');
    const nextMap = createEmptyAnswersMap();
    for (const ans of rec.answers || []) {
      if (nextMap[ans.questionKey] !== undefined) {
        nextMap[ans.questionKey] = {
          status: ans.status || '',
          remarks: ans.remarks || '',
        };
      }
    }
    setAnswersMap(nextMap);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectionDate.trim()) {
      notify('warning', isFa ? 'تاریخ بازدید ادواری الزامی است.' : 'Inspection date is required.');
      return;
    }

    // Warn if any '-' item lacks remarks (** rule in the form)
    const missingNegativeRemark = ALL_QUESTIONS.find((q) => {
      const a = answersMap[q.key];
      return a?.status === '-' && !a.remarks.trim();
    });
    if (missingNegativeRemark) {
      notify(
        'warning',
        isFa
          ? `برای ردیف «${missingNegativeRemark.text.slice(0, 40)}...» که وضعیت (-) دارد، توضیحات را وارد کنید.`
          : 'Please enter remarks for every item marked (-).',
      );
      return;
    }

    setSaving(true);
    try {
      const answers: PeriodicInspectionAnswer[] = ALL_QUESTIONS.map((q) => ({
        questionKey: q.key,
        status: answersMap[q.key]?.status || '',
        remarks: answersMap[q.key]?.remarks || '',
      }));

      const payload = {
        projectName,
        inspectionDate,
        supervisorName,
        inspectorsSignatory,
        siteSupervisorSignatory: siteSupervisorSignatory || supervisorName,
        projectManagerSignatory,
        copyTo,
        answers,
      };

      const res = editingRecord
        ? await apiRequest<{ record: PeriodicInspectionRecord }>(
            `/api/periodic-inspections/${editingRecord.id}`,
            {
              method: 'PATCH',
              body: JSON.stringify(payload),
            },
          )
        : await apiRequest<{ record: PeriodicInspectionRecord }>('/api/periodic-inspections', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      notify(
        'success',
        editingRecord
          ? isFa
            ? 'چک‌لیست بازدید ادواری انبار ویرایش شد.'
            : 'Periodic inspection checklist updated.'
          : isFa
            ? 'چک‌لیست بازدید ادواری انبار ثبت شد.'
            : 'Periodic inspection checklist saved.',
      );
      const wasEditing = Boolean(editingRecord);
      resetForm();
      setPrintRec(res.record);
      triggerAutoSnapshot(`${wasEditing ? 'Edit ' : ''}Periodic Inspection ${res.record.inspectionDate}`);
      onDataChanged();
      loadRecords();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/periodic-inspections/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', isFa ? 'سابقه چک‌لیست حذف شد.' : 'Checklist record deleted.');
      if (editingRecord?.id === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      onDataChanged();
      loadRecords();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const statsSummary = useMemo(() => {
    let ok = 0;
    let ng = 0;
    for (const q of ALL_QUESTIONS) {
      if (answersMap[q.key]?.status === '+') ok += 1;
      else if (answersMap[q.key]?.status === '-') ng += 1;
    }
    return { ok, ng, total: ALL_QUESTIONS.length };
  }, [answersMap]);

  return (
    <div className="space-y-6">
      {/* Dedicated A4 Landscape 5-Page Print Portal */}
      {printRec
        ? createPortal(
            <div id="samaan-periodic-print-root" dir="rtl">
              <style>{`
                @media screen {
                  #samaan-periodic-print-root { display: none !important; }
                }
                @media print {
                  @page {
                    size: A4 landscape;
                    margin: 6mm;
                  }
                  body > *:not(#samaan-periodic-print-root) {
                    display: none !important;
                  }
                  #samaan-periodic-print-root {
                    display: block !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    width: 100%;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                  #samaan-periodic-print-root .samaan-periodic-page {
                    margin-bottom: 0 !important;
                  }
                  #samaan-periodic-print-root table th {
                    text-align: center;
                    vertical-align: middle;
                  }
                }
              `}</style>
              <OfficialPeriodicInspectionSheet record={printRec} formatDate={formatDate} />
            </div>,
            document.body,
          )
        : null}

      {/* New Checklist Entry Form */}
      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ClipboardList className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>
                {editingRecord
                  ? isFa
                    ? `ویرایش چک‌لیست بازدید ادواری (${formatDate(editingRecord.inspectionDate)})`
                    : `Edit Periodic Inspection (${formatDate(editingRecord.inspectionDate)})`
                  : isFa
                    ? 'چک‌لیست بازدید ادواری انبار (کنترل مستندات و فیزیکی)'
                    : 'Periodic Warehouse Inspection Checklist'}
              </span>
              <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
                (MD1EX-FQP02/07-03)
              </span>
              {editingRecord && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-medium text-[var(--status-danger)] hover:underline"
                >
                  {t.controls.cancel}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-md bg-[var(--status-success-bg)] text-[var(--status-success)] font-semibold tabular-nums">
                + {isFa ? 'مناسب:' : 'OK:'} {statsSummary.ok}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-[var(--status-danger-bg)] text-[var(--status-danger)] font-semibold tabular-nums">
                − {isFa ? 'نامناسب:' : 'NG:'} {statsSummary.ng}
              </span>
              <button
                type="button"
                onClick={handleSetAllPositive}
                className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium"
              >
                {isFa ? 'علامت (+) برای همه' : 'Mark All (+)'}
              </button>
              <button
                type="button"
                onClick={handleResetChecklist}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isFa ? 'پاک‌سازی' : 'Reset'}</span>
              </button>
            </div>
          </div>

          {/* Header Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'پروژه' : 'Project'}
              </label>
              <input
                type="text"
                dir={!projectName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={isFa ? 'نام پروژه...' : 'Project name...'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <JalaliDateInput
              label={`${isFa ? 'تاریخ بازدید' : 'Inspection Date'} *`}
              value={inspectionDate}
              onChange={setInspectionDate}
            />

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'سرپرست/مسئول تأمین تجهیزات' : 'Equipment Supply Supervisor'}
              </label>
              <input
                type="text"
                dir={!supervisorName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'رونوشت' : 'Copy To'}
              </label>
              <input
                type="text"
                dir={!copyTo ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={copyTo}
                onChange={(e) => setCopyTo(e.target.value)}
                placeholder={isFa ? 'اختیاری' : 'Optional'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Interactive 35-Question Checklist Grouped by Section */}
          <div className="space-y-4">
            {[
              {
                title: 'بخش اول: کنترل مستندات انبارش (صفحات ۱ و ۲ — ردیف‌های ۱ تا ۱۵)',
                questions: ALL_QUESTIONS.filter((q) => q.key.startsWith('doc-')),
              },
              {
                title: 'بخش دوم: کنترل فیزیکی انبار (صفحات ۳ تا ۵ — ردیف‌های ۱ تا ۲۰)',
                questions: ALL_QUESTIONS.filter((q) => q.key.startsWith('phy-')),
              },
            ].map((group) => (
              <div
                key={group.title}
                className="rounded-xl border border-[var(--border-subtle)] overflow-hidden"
              >
                <div className="px-4 py-2.5 bg-[var(--bg-subtle)] text-xs font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)]">
                  {group.title}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
                      <tr>
                        <th className="py-2 px-2 w-12">ردیف</th>
                        <th className="py-2 px-3">پرسش</th>
                        <th className="py-2 px-2 w-28">وضعیت* (-/+)</th>
                        <th className="py-2 px-3 w-72">توضیحات **</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {group.questions.map((q) => {
                        const ans = answersMap[q.key] || { status: '', remarks: '' };
                        const needsRemark = ans.status === '-' && !ans.remarks.trim();
                        return (
                          <tr
                            key={q.key}
                            className={
                              ans.status === '-'
                                ? 'bg-[var(--status-danger-bg)]/35'
                                : ans.status === '+'
                                  ? 'bg-[var(--status-success-bg)]/25'
                                  : ''
                            }
                          >
                            <td className="py-2 px-2 font-bold tabular-nums">{q.rowNo}</td>
                            <td className="py-2 px-3 text-right leading-relaxed">{q.text}</td>
                            <td className="py-2 px-2">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setQuestionStatus(q.key, '+')}
                                  className={`w-8 h-7 rounded-md border text-sm font-bold transition-colors ${
                                    ans.status === '+'
                                      ? 'border-[var(--status-success)] bg-[var(--status-success)] text-white'
                                      : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                                  }`}
                                  title="مناسب (+)"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQuestionStatus(q.key, '-')}
                                  className={`w-8 h-7 rounded-md border text-sm font-bold transition-colors ${
                                    ans.status === '-'
                                      ? 'border-[var(--status-danger)] bg-[var(--status-danger)] text-white'
                                      : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                                  }`}
                                  title="نامناسب (-)"
                                >
                                  −
                                </button>
                              </div>
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                dir="auto"
                                value={ans.remarks}
                                onChange={(e) => setQuestionRemarks(q.key, e.target.value)}
                                placeholder={
                                  needsRemark
                                    ? isFa
                                      ? 'توضیحات وضعیت نامناسب الزامی است...'
                                      : 'Required for (-)...'
                                    : isFa
                                      ? 'توضیحات...'
                                      : 'Remarks...'
                                }
                                className={`w-full h-8 px-2.5 rounded-lg border text-xs bidi-plaintext focus:outline-none ${
                                  needsRemark
                                    ? 'border-[var(--status-danger)] bg-[var(--bg-surface)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] focus:border-[var(--accent-primary)]'
                                }`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Signatories (Page 5 Footer) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نام و امضاء اعضاء گروه بازدیدکننده' : 'Inspection Team Members'}
              </label>
              <input
                type="text"
                dir={!inspectorsSignatory ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={inspectorsSignatory}
                onChange={(e) => setInspectorsSignatory(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'سرپرست/مسئول تأمین تجهیزات کارگاه' : 'Site Equipment Supply Supervisor'}
              </label>
              <input
                type="text"
                dir={!siteSupervisorSignatory ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={siteSupervisorSignatory}
                onChange={(e) => setSiteSupervisorSignatory(e.target.value)}
                placeholder={supervisorName || ''}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نام و امضاء مدیر پروژه' : 'Project Manager'}
              </label>
              <input
                type="text"
                dir={!projectManagerSignatory ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={projectManagerSignatory}
                onChange={(e) => setProjectManagerSignatory(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-muted)]">
              * + (وضعیت مناسب) ، - (وضعیت نامناسب) · ** در صورت نامناسب (-) بودن، ثبت توضیحات الزامی است.
            </div>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {editingRecord
                  ? isFa
                    ? 'ذخیره تغییرات چک‌لیست و پیش‌نمایش چاپ'
                    : 'Save Changes & Preview Checklist'
                  : isFa
                    ? 'ثبت چک‌لیست بازدید ادواری و پیش‌نمایش چاپ'
                    : 'Save & Preview Checklist'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Saved Inspections History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق چک‌لیست‌های بازدید ادواری انبار' : 'Periodic Warehouse Inspection History'}
          </h3>
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {isFa
              ? `${records.length.toLocaleString('fa-IR')} مورد`
              : `${records.length} records`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-3">{isFa ? 'تاریخ بازدید' : 'Date'}</th>
                <th className="py-2.5 px-3">{isFa ? 'پروژه' : 'Project'}</th>
                <th className="py-2.5 px-3">{isFa ? 'سرپرست تأمین تجهیزات' : 'Supervisor'}</th>
                <th className="py-2.5 px-3">{isFa ? 'موارد مناسب (+)' : 'OK (+)'}</th>
                <th className="py-2.5 px-3">{isFa ? 'موارد نامناسب (-)' : 'NG (-)'}</th>
                <th className="py-2.5 px-3">{isFa ? 'ثبت‌کننده' : 'Created By'}</th>
                <th className="py-2.5 px-3">{isFa ? 'عملیات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                records.map((rec) => {
                  const okCount = (rec.answers || []).filter((a) => a.status === '+').length;
                  const ngCount = (rec.answers || []).filter((a) => a.status === '-').length;
                  return (
                    <tr key={rec.id} className="hover:bg-[var(--bg-subtle)]/40">
                      <td className="py-2.5 px-3 tabular-nums" dir="ltr">
                        {formatDate(rec.inspectionDate)}
                      </td>
                      <td className="py-2.5 px-3 bidi-plaintext font-medium">
                        {rec.projectName || '—'}
                      </td>
                      <td className="py-2.5 px-3 bidi-plaintext">
                        {rec.supervisorName || '—'}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums font-bold text-[var(--status-success)]">
                        {isFa ? okCount.toLocaleString('fa-IR') : okCount}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums font-bold text-[var(--status-danger)]">
                        {isFa ? ngCount.toLocaleString('fa-IR') : ngCount}
                      </td>
                      <td className="py-2.5 px-3">{rec.createdBy}</td>
                      <td className="py-2.5 px-3">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPrintRec(rec)}
                            className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>{t.controls.print}</span>
                          </button>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(rec)}
                                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)]"
                                title={t.controls.edit}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(rec)}
                                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger)]"
                                title={t.controls.delete}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5-Page Official A4 Landscape Print Preview Modal */}
      {printRec && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">
                  {isFa
                    ? 'فرم رسمی چک‌لیست بازدید ادواری انبار (۵ صفحه A4 افقی)'
                    : 'Official Periodic Warehouse Inspection Checklist (5 Pages A4 Landscape)'}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/07-03 · {formatDate(printRec.inspectionDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ ۵ صفحه (A4 افقی)' : 'Print 5 Pages (A4 Landscape)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintRec(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 bg-neutral-200/70 dark:bg-neutral-900/60 p-4 rounded-xl">
              <div className="mx-auto max-w-[1060px] space-y-6">
                <div className="bg-white p-5 shadow-lg rounded-sm">
                  <OfficialPeriodicInspectionSheet record={printRec} formatDate={formatDate} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'تأیید حذف چک‌لیست بازدید ادواری' : 'Confirm Checklist Deletion'}
        message={
          deleteTarget
            ? isFa
              ? `آیا از حذف سابقه بازدید ادواری تاریخ ${formatDate(deleteTarget.inspectionDate)} اطمینان دارید؟`
              : `Delete periodic inspection checklist dated ${formatDate(deleteTarget.inspectionDate)}?`
            : ''
        }
        confirmLabel={t.controls.delete}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
