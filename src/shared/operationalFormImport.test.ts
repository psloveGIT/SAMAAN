import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitAutoWorkbook,
  commitOperationalFormImport,
  detectExtendedScope,
  previewAutoWorkbook,
  previewOperationalFormImport,
} from './operationalFormImport';
import type { DatabaseSnapshot } from './types';

function makeEmptyDb(): DatabaseSnapshot {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    version: 1,
    exportedAt: now,
    general: [
      {
        id: 'gen-1',
        rowNo: '1',
        arrivalDate: '2026-03-10',
        releaseNo: 'RN-100',
        releaseDate: '2026-03-01',
        supplier: 'MAPNA Turbine',
        dispatchLocation: 'Karaj',
        employerEntryMinutesNo: '',
        mapnaEntryMinutesNo: '',
        packingListNo: 'PL-2026-01',
        packageNo: 'PKG-01',
        itemDescription: 'Main Steam Valve Assembly',
        island: 'Turbine Island',
        system: 'Steam',
        subSystem: 'HP',
        unit: 'Unit 1',
        grossWeight: 1200,
        netWeight: 1100,
        lengthCm: 2.5,
        widthCm: 1.5,
        heightCm: 1.4,
        billOfLadingNo: 'WB-55',
        vehicleNo: '11-A-222',
        weighbridgeWeight: 1210,
        freightCost: 5000000,
        opiInvitationNo: '',
        opiInvitationDate: '',
        driverName: 'Ali Rezaei',
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin',
      },
    ],
    detailed: [
      {
        id: 'det-1',
        rowNo: '1',
        arrivalDate: '2026-03-10',
        supplier: 'MAPNA Turbine',
        origin: 'Karaj',
        shipmentNo: 'PL-2026-01',
        packageNo: 'PKG-01',
        itemNo: '1',
        generalDescription: 'Valve',
        description: 'Gate Valve 8 Inch Class 600',
        size: '8"',
        itemCode: 'VLV-08-600',
        packingQty: 10,
        actualQty: 10,
        damagedQty: 0,
        mtoRef: '',
        repNo: '',
        repStatus: '',
        repDescription: '',
        countingUnit: 'عدد',
        island: 'Turbine Island',
        system: 'Steam',
        subSystem: 'HP',
        unit: 'Unit 1',
        opiNo: '',
        opiDate: '',
        merNo: '',
        merStatus: '',
        notes: '',
        materialBalanceNo: '',
        balanceStatus: '',
        storageLocation: 'Yard A',
        gcvReceiptNo: '',
        receiver: '',
        gcvDeliveredQty: null,
        mivContractorNo: '',
        mivContractorDate: '',
        mivContractorQty: null,
        smrContractorNo: '',
        smrContractorDate: '',
        smrContractorQty: null,
        smrContractorNote: '',
        smrMapnaNo: '',
        smrMapnaDate: '',
        smrMapnaQty: null,
        smrMapnaNote: '',
        mivMapnaNo: '',
        mivMapnaDate: '',
        mivMapnaQty: null,
        stocktakeInfo: '',
        shortageBackfills: [],
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin',
      },
    ],
    transit: [
      {
        id: 'tr-1',
        rowNo: '1',
        arrivalDate: '',
        overallStatus: 'در دست حمل',
        inspectionRequest: '',
        releaseNetNo: 'RN-100',
        releaseNetDate: '2026-03-01',
        mapnaShippingNotice: '',
        interimNo: '',
        interimDate: '',
        supplier: 'MAPNA Turbine',
        dispatchLocation: 'Karaj',
        packingListNo: 'PL-2026-01',
        packageNo: 'PKG-01',
        itemDescription: 'Main Steam Valve Assembly',
        system: 'Steam',
        subSystem: 'HP',
        unit: 'Unit 1',
        equipmentSupplyCode: 'ESC-1',
        carrierContractor: 'Pars Freight',
        billOfLadingNo: 'WB-55',
        amount: 5000000,
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin',
      },
    ],
    categories: {
      supplier: ['MAPNA Turbine'],
      dispatchLocation: ['Karaj'],
      origin: ['Karaj'],
      storageLocation: ['Yard A'],
      receiver: [],
      island: ['Turbine Island'],
      system: ['Steam'],
      subSystem: ['HP'],
      unit: ['Unit 1'],
      packageType: ['Crate'],
      countingUnit: ['عدد'],
      transitStatus: ['در دست حمل', 'رسیده'],
      carrierContractor: ['Pars Freight'],
      merStatus: ['باز', 'بسته'],
      repStatus: ['باز', 'تکمیل'],
      balanceStatus: [],
      generalDescription: ['Valve'],
      stocktakeStatus: ['تطابق کامل', 'دارای مغایرت'],
      chemicalType: [],
    },
    packingMeta: {},
    opiInvitations: [],
    gcvDocuments: [],
    mivDocuments: [],
    siteEntryMinutes: [],
    opiMinutes: [],
    osdrReports: [],
    substitutions: [],
    materialEstimates: [],
    periodicInspections: [],
    customFormSubmissions: [],
    trash: [],
    auditLogs: [],
  };
}

test('detectExtendedScope accurately classifies all 10 operational/custom forms from Persian headers and sheet names', () => {
  assert.equal(
    detectExtendedScope([['شماره صورتجلسه ورود', 'تاریخ ورود', 'شماره پکینگ لیست', 'نوع ورود', 'کاربری کالا', 'نگهبانی مپنا']]),
    'siteEntryMinutes',
  );
  assert.equal(
    detectExtendedScope([['شماره دعوتنامه OPI', 'تاریخ بازرسی', 'ساعت بازرسی', 'شماره پکینگ لیست', 'محل بازرسی']]),
    'opiInvitations',
  );
  assert.equal(
    detectExtendedScope([['شماره صورتجلسه OPI', 'تاریخ بازرسی', 'شماره پکینگ لیست', 'نتیجه بازرسی', 'بازرس مپنا', 'بازرس کارفرما']]),
    'opiMinutes',
  );
  assert.equal(
    detectExtendedScope([['شماره گزارش مغایرت', 'تاریخ', 'شماره پکینگ لیست', 'شماره آیتم', 'نوع مغایرت', 'مقدار مغایرت']]),
    'osdrReports',
  );
  assert.equal(
    detectExtendedScope([['شماره رسید GCV', 'تاریخ', 'تحویل گیرنده', 'شماره درخواست خرید', 'شماره محموله', 'تعداد']]),
    'gcvDocuments',
  );
  assert.equal(
    detectExtendedScope([['نوع سند', 'شماره حواله', 'تاریخ', 'شماره محموله', 'شماره آیتم', 'مقدار درخواستی', 'تعداد']]),
    'mivDocuments',
  );
  assert.equal(
    detectExtendedScope([['شماره سند جایگزینی', 'تاریخ', 'شماره محموله', 'شماره آیتم', 'شرح کالای جایگزین', 'دلیل جایگزینی']]),
    'substitutions',
  );
  assert.equal(
    detectExtendedScope([['کد MTO', 'شرح کالا', 'کد کالا', 'سایز', 'مقدار برآورد', 'اولویت']]),
    'materialEstimates',
  );
  assert.equal(
    detectExtendedScope([['تاریخ بازدید ادواری', 'نام پروژه', 'نام سرپرست', 'کد سوال', 'وضعیت', 'توضیحات']]),
    'periodicInspections',
  );
  assert.equal(
    detectExtendedScope([['شماره محموله', 'شماره نگله', 'شماره آیتم', 'وضعیت انبارگردانی', 'تاریخ انبارگردانی']]),
    'stocktake',
  );
  assert.equal(
    detectExtendedScope([['شناسه فرم', 'عنوان فرم', 'شماره سند', 'تاریخ', 'شماره پکینگ لیست', 'مقادیر فیلدها']]),
    'customFormSubmissions',
  );
});

test('Site Entry Minutes import links to general, detailed, and marks transit as arrived', () => {
  const db = makeEmptyDb();
  const matrix = [
    ['شماره صورتجلسه ورود', 'تاریخ ورود', 'شماره پکینگ لیست', 'نوع ورود', 'کاربری کالا', 'نگهبانی مپنا'],
    ['SE-1404-01', '1404/12/20', 'PL-2026-01', 'دائم', 'پروژه', 'احمدی'],
  ];
  const res = commitOperationalFormImport({
    db,
    scope: 'siteEntryMinutes',
    matrix,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(res.imported, 1);
  assert.equal(res.linkedGeneral, 1);
  assert.equal(res.linkedTransit, 1);
  assert.equal(db.siteEntryMinutes?.length, 1);
  assert.equal(db.siteEntryMinutes?.[0].supplier, 'MAPNA Turbine');
  assert.equal(db.general[0].mapnaEntryMinutesNo, 'SE-1404-01');
  assert.equal(db.transit[0].overallStatus, 'رسیده');
  assert.equal(db.transit[0].linkedGeneralPackingNo, 'PL-2026-01');
});

test('OPI Invitation + OPI Minutes + MER/OSDR cross-link with General and Detailed accurately', () => {
  const db = makeEmptyDb();
  const invRes = commitOperationalFormImport({
    db,
    scope: 'opiInvitations',
    matrix: [
      ['شماره دعوتنامه OPI', 'تاریخ بازرسی', 'ساعت بازرسی', 'شماره پکینگ لیست', 'محل بازرسی'],
      ['INV-01', '1404/12/21', '10:00', 'PL-2026-01', 'انبار مرکزی'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(invRes.imported, 1);
  assert.equal(invRes.linkedGeneral, 1);
  assert.equal(db.general[0].opiInvitationNo, 'INV-01');
  assert.equal(db.opiInvitations?.[0].items?.length, 1);

  const minRes = commitOperationalFormImport({
    db,
    scope: 'opiMinutes',
    matrix: [
      ['شماره صورتجلسه OPI', 'شماره دعوتنامه', 'تاریخ بازرسی', 'شماره پکینگ لیست', 'شماره نگله', 'نتیجه بازرسی', 'شماره MER'],
      ['OPI-501', 'INV-01', '1404/12/22', 'PL-2026-01', 'PKG-01', 'دارای مغایرت', 'MER-09'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(minRes.imported, 1);
  assert.equal(minRes.linkedDetailed, 1);
  assert.equal(db.opiInvitations?.[0].status, 'completed');
  assert.equal(db.detailed[0].opiNo, 'OPI-501');

  const merRes = commitOperationalFormImport({
    db,
    scope: 'osdrReports',
    matrix: [
      ['شماره گزارش مغایرت', 'تاریخ', 'شماره پکینگ لیست', 'شماره نگله', 'شماره آیتم', 'مقدار پکینگ', 'مقدار واقعی', 'نوع مغایرت', 'مقدار مغایرت'],
      ['MER-09', '1404/12/22', 'PL-2026-01', 'PKG-01', '1', '10', '8', 'آسیب دیده', '2'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(merRes.imported, 1);
  assert.equal(merRes.linkedDetailed, 1);
  assert.equal(db.osdrReports?.[0].items[0].detailedId, 'det-1');
  assert.equal(db.detailed[0].merNo, 'MER-09');
  assert.equal(db.detailed[0].actualQty, 8);
  assert.equal(db.detailed[0].damagedQty, 2);
});

test('GCV + MIV/SMR group multi-line rows, update Detailed quantities accurately, and never double-count on replace', () => {
  const db = makeEmptyDb();

  const gcvRes = commitOperationalFormImport({
    db,
    scope: 'gcvDocuments',
    matrix: [
      ['شماره رسید GCV', 'تاریخ', 'تحویل گیرنده', 'شماره محموله', 'شماره نگله', 'شماره آیتم', 'تعداد'],
      ['GCV-10', '1404/12/23', 'پیمانکار لوله‌کشی', 'PL-2026-01', 'PKG-01', '1', '3'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(gcvRes.imported, 1);
  assert.equal(gcvRes.linkedDetailed, 1);
  assert.equal(db.detailed[0].gcvReceiptNo, 'GCV-10');
  assert.equal(db.detailed[0].gcvDeliveredQty, 3);

  // Replace GCV-10 with qty=4 -> detailed should become 4, NOT 7!
  const gcvReplace = commitOperationalFormImport({
    db,
    scope: 'gcvDocuments',
    matrix: [
      ['شماره رسید GCV', 'تاریخ', 'تحویل گیرنده', 'شماره محموله', 'شماره نگله', 'شماره آیتم', 'تعداد'],
      ['GCV-10', '1404/12/23', 'پیمانکار لوله‌کشی', 'PL-2026-01', 'PKG-01', '1', '4'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(gcvReplace.replaced, 1);
  assert.equal(db.detailed[0].gcvDeliveredQty, 4);

  // MIV Mapna + MIV Contractor + SMR Contractor
  const mivRes = commitOperationalFormImport({
    db,
    scope: 'mivDocuments',
    matrix: [
      ['نوع سند', 'شماره حواله', 'تاریخ', 'پیمانکار', 'شماره محموله', 'شماره نگله', 'شماره آیتم', 'تعداد'],
      ['حواله مپنا', 'MIV-M-01', '1404/12/24', 'واحد نصب', 'PL-2026-01', 'PKG-01', '1', '5'],
      ['حواله پیمانکار', 'MIV-C-01', '1404/12/25', 'پیمانکار الف', 'PL-2026-01', 'PKG-01', '1', '2'],
      ['ارجاع پیمانکار', 'SMR-C-01', '1404/12/26', 'پیمانکار الف', 'PL-2026-01', 'PKG-01', '1', '1'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(mivRes.imported, 3);
  assert.equal(db.detailed[0].mivMapnaNo, 'MIV-M-01');
  assert.equal(db.detailed[0].mivMapnaQty, 5);
  assert.equal(db.detailed[0].mivContractorNo, 'MIV-C-01');
  assert.equal(db.detailed[0].mivContractorQty, 2);
  assert.equal(db.detailed[0].smrContractorNo, 'SMR-C-01');
  assert.equal(db.detailed[0].smrContractorQty, 1);
});

test('Substitution, MTO Estimate, Stocktake, Periodic Inspection, and Custom Forms all import and cross-link', () => {
  const db = makeEmptyDb();

  // Substitution
  const subRes = commitOperationalFormImport({
    db,
    scope: 'substitutions',
    matrix: [
      ['شماره سند جایگزینی', 'تاریخ', 'شماره محموله', 'شماره نگله', 'شماره آیتم', 'شرح کالای جایگزین', 'دلیل جایگزینی', 'تعداد', 'وضعیت'],
      ['REP-77', '1404/12/24', 'PL-2026-01', 'PKG-01', '1', 'Gate Valve 8 Inch Forged', 'آسیب‌دیدگی فلنج', '1', 'تایید شده'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(subRes.imported, 1);
  assert.equal(subRes.linkedDetailed, 1);
  assert.equal(db.detailed[0].repNo, 'REP-77');
  assert.equal(db.detailed[0].repStatus, 'تایید شده');
  assert.equal(db.substitutions?.[0].detailedId, 'det-1');

  // MTO Estimate
  const mtoRes = commitOperationalFormImport({
    db,
    scope: 'materialEstimates',
    matrix: [
      ['کد MTO', 'کد کالا', 'شرح کالا', 'سایز', 'مقدار برآورد', 'واحد شمارش', 'اولویت'],
      ['MTO-ST-01', 'VLV-08-600', 'Gate Valve 8 Inch Class 600', '8"', '12', 'PCS', 'حیاتی'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(mtoRes.imported, 1);
  assert.equal(mtoRes.linkedDetailed, 1);
  assert.equal(db.detailed[0].mtoRef, 'MTO-ST-01');
  assert.equal(db.materialEstimates?.[0].countingUnit, 'عدد');
  assert.equal(db.materialEstimates?.[0].priority, 'critical');

  // Stocktake
  const stRes = commitOperationalFormImport({
    db,
    scope: 'stocktake',
    matrix: [
      ['شماره محموله', 'شماره نگله', 'شماره آیتم', 'وضعیت انبارگردانی', 'تاریخ انبارگردانی', 'محل نگهداری'],
      ['PL-2026-01', 'PKG-01', '1', 'موجود و تایید شده', '1404/12/28', 'Rack B-04'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(stRes.imported, 1);
  assert.equal(stRes.linkedDetailed, 1);
  assert.equal(db.detailed[0].stocktakeStatus, 'موجود و تایید شده');
  assert.equal(db.detailed[0].storageLocation, 'Rack B-04');

  // Periodic Inspection Checklist (multi-row grouped by date+project)
  const piRes = commitOperationalFormImport({
    db,
    scope: 'periodicInspections',
    matrix: [
      ['تاریخ بازدید ادواری', 'نام پروژه', 'نام سرپرست', 'کد سوال', 'وضعیت', 'توضیحات'],
      ['1404/12/28', 'نیروگاه رودشور', 'مهندس کریمی', 'q1', '+', 'چیدمان مناسب'],
      ['1404/12/28', 'نیروگاه رودشور', 'مهندس کریمی', 'q2', '-', 'نیاز به برچسب‌گذاری'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(piRes.imported, 1);
  assert.equal(db.periodicInspections?.[0].answers.length, 2);

  // Custom Employer Form (structured JSON with fieldValues & rows)
  const cfPreview = previewOperationalFormImport({
    db,
    scope: 'customFormSubmissions',
    structuredRecords: [
      {
        formId: 'emp-qc-release',
        formTitle: 'فرم تاییدیه QC کارفرما',
        docNo: 'EMP-QC-09',
        date: '2026-03-18',
        packingListNo: 'PL-2026-01',
        fieldValues: { inspector: 'مهندس رضایی', result: 'تایید نهایی' },
        rows: [{ item: 'Gate Valve 8"', status: 'OK' }],
      },
    ],
    assumedCalendar: 'gregorian',
    actorName: 'admin',
  });
  assert.equal(cfPreview.estimatedLinks.general, 1);
  assert.equal(cfPreview.estimatedLinks.detailed, 1);
  assert.equal(cfPreview.estimatedLinks.transit, 1);

  const cfRes = commitOperationalFormImport({
    db,
    scope: 'customFormSubmissions',
    structuredRecords: cfPreview.parsedRecords,
    assumedCalendar: 'gregorian',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(cfRes.imported, 1);
  assert.equal(cfRes.linkedGeneral, 1);
  assert.equal(cfRes.linkedDetailed, 1);
  assert.equal(cfRes.linkedTransit, 1);
  assert.equal(db.customFormSubmissions?.length, 1);
  assert.equal(db.customFormSubmissions?.[0].fieldValues.inspector, 'مهندس رضایی');
});

test('commitAutoWorkbook processes out-of-order sheets in dependency order so operational forms link to newly imported core rows', () => {
  const db = makeEmptyDb();
  db.general = [];
  db.detailed = [];
  db.transit = [];

  // Intentionally pass operational forms BEFORE core tables!
  const sheets = [
    {
      name: 'حواله انبار MIV',
      matrix: [
        ['نوع سند', 'شماره حواله', 'تاریخ', 'پیمانکار', 'شماره محموله', 'شماره نگله', 'شماره آیتم', 'تعداد'],
        ['حواله مپنا', 'MIV-AUTO-1', '1404/12/25', 'نصب توربین', 'PL-NEW-99', 'P-1', '1', '4'],
      ],
    },
    {
      name: 'صورتجلسه ورود کالا',
      matrix: [
        ['شماره صورتجلسه ورود', 'تاریخ ورود', 'شماره پکینگ لیست', 'نوع ورود'],
        ['SE-NEW-99', '1404/12/20', 'PL-NEW-99', 'دائم'],
      ],
    },
    {
      name: 'ثبت جزئیات',
      structuredRecords: [
        {
          shipmentNo: 'PL-NEW-99',
          packageNo: 'P-1',
          itemNo: '1',
          description: 'Turbine Coupling Bolt',
          itemCode: 'BLT-99',
          packingQty: 20,
          actualQty: 20,
          countingUnit: 'PCS',
        },
      ],
    },
    {
      name: 'ثبت کلی',
      structuredRecords: [
        {
          packingListNo: 'PL-NEW-99',
          packageNo: 'P-1',
          itemDescription: 'Turbine Coupling Kit',
          supplier: 'MAPNA',
          dispatchLocation: 'Karaj',
        },
      ],
    },
    {
      name: 'در راه',
      structuredRecords: [
        {
          packingListNo: 'PL-NEW-99',
          packageNo: 'P-1',
          itemDescription: 'Turbine Coupling Kit',
          overallStatus: 'در دست حمل',
        },
      ],
    },
  ];

  const preview = previewAutoWorkbook({
    db,
    sheets,
    assumedCalendar: 'jalali',
    actorName: 'admin',
  });
  assert.equal(preview.detectedSheets.length, 5);
  assert.equal(preview.detectedSheets[0].scope, 'transit');
  assert.equal(preview.detectedSheets[1].scope, 'general');
  assert.equal(preview.detectedSheets[2].scope, 'detailed');
  assert.equal(preview.detectedSheets[3].scope, 'siteEntryMinutes');
  assert.equal(preview.detectedSheets[4].scope, 'mivDocuments');

  const commit = commitAutoWorkbook({
    db,
    sheets,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });
  assert.equal(commit.totals.imported, 5);
  assert.equal(db.transit[0].overallStatus, 'رسیده');
  assert.equal(db.general[0].mapnaEntryMinutesNo, 'SE-NEW-99');
  assert.equal(db.detailed[0].mivMapnaNo, 'MIV-AUTO-1');
  assert.equal(db.detailed[0].mivMapnaQty, 4);
  assert.equal(db.mivDocuments?.[0].items[0].detailedId, db.detailed[0].id);
});

test('Combined MIV/SMR sheet, compact General sheet, Substitution headers, and Stocktake storageLocation all cross-link accurately', () => {
  const db = makeEmptyDb();
  db.general = [];
  db.detailed = [];
  db.transit = [];

  const res = commitAutoWorkbook({
    db,
    sheets: [
      {
        name: 'صورتجلسه ورود کالا',
        matrix: [
          ['شماره صورتجلسه ورود', 'تاریخ ورود', 'شماره پکینگ لیست', 'وضعیت بسته'],
          ['SE-REG-1', '1404/12/15', 'PL-REG-1', 'سالم'],
        ],
      },
      {
        name: 'حواله MIV و SMR',
        matrix: [
          ['شماره حواله', 'نوع سند', 'تاریخ', 'تحویل گیرنده', 'شماره پکینگ لیست', 'شماره نگله', 'شماره آیتم', 'کد کالا', 'تعداد'],
          ['MIV-M-1', 'miv_mapna', '1404/12/20', 'تیم مکانیک', 'PL-REG-1', 'PKG-1', '1', 'VLV-1', '4'],
          ['MIV-C-1', 'miv_contractor', '1404/12/20', 'پیمانکار', 'PL-REG-1', 'PKG-1', '1', 'VLV-1', '2'],
        ],
      },
      {
        name: 'فرم جایگزینی',
        matrix: [
          ['شماره فرم جایگزینی', 'تاریخ', 'وضعیت جایگزینی', 'پکینگ لیست مبدا', 'شماره نگله', 'کد کالا', 'واحد مبدا', 'تعداد جایگزینی', 'دلیل جایگزینی'],
          ['REP-REG-1', '1404/12/22', 'اجرا شده', 'PL-REG-1', 'PKG-1', 'VLV-1', 'Unit 1', '1', 'اضطراری'],
        ],
      },
      {
        name: 'انبارگردانی',
        matrix: [
          ['شماره پکینگ لیست', 'شماره نگله', 'شماره آیتم', 'کد کالا', 'وضعیت انبارگردانی', 'محل دپو'],
          ['PL-REG-1', 'PKG-1', '1', 'VLV-1', 'تطابق کامل', 'سوله B-04'],
        ],
      },
      {
        name: 'ثبت کلی',
        matrix: [
          ['تاریخ ورود', 'شماره پکینگ لیست', 'شماره نگله', 'نوع بسته بندی', 'شرح کالا', 'تامین کننده', 'سیستم', 'واحد', 'تعداد اقلام'],
          ['1404/12/15', 'PL-REG-1', 'PKG-1', 'Crate', 'Main Valve', 'MAPNA', 'Steam', 'Unit 1', '1'],
        ],
      },
      {
        name: 'ثبت جزئیات',
        matrix: [
          ['تاریخ ورود', 'شماره پکینگ لیست', 'شماره نگله', 'شماره آیتم', 'شرح کالا', 'کد کالا', 'مقدار پکینگ', 'واحد شمارش'],
          ['1404/12/15', 'PL-REG-1', 'PKG-1', '1', 'Gate Valve', 'VLV-1', '20', 'EA'],
        ],
      },
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });

  assert.equal(db.general[0].mapnaEntryMinutesNo, 'SE-REG-1');
  assert.equal(db.general[0].employerEntryMinutesNo, '');
  assert.equal(db.detailed[0].mivMapnaNo, 'MIV-M-1');
  assert.equal(db.detailed[0].mivMapnaQty, 4);
  assert.equal(db.detailed[0].mivContractorNo, 'MIV-C-1');
  assert.equal(db.detailed[0].mivContractorQty, 2);
  assert.equal(db.substitutions?.length, 1);
  assert.equal(db.detailed[0].repNo, 'REP-REG-1');
  assert.equal(db.detailed[0].storageLocation, 'سوله B-04');
  assert.equal(res.totals.imported, 7);
});


