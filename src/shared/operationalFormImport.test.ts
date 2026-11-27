import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitAutoWorkbook,
  commitOperationalFormImport,
  detectCandidateScopesForSheet,
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
  assert.equal(db.detailed[0].repStatus, 'باز');
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

test('detectCandidateScopesForSheet detects multiple sections inside a single sheet and commits them selectively', () => {
  const db = makeEmptyDb();
  const combinedMatrix = [
    [
      'تاریخ ورود',
      'شماره محموله',
      'شماره نگله',
      'شماره آیتم',
      'شرح کلی',
      'شرح',
      'مقدار پکینگ',
      'مقدار واقعی',
      'شماره بالانس متریال',
      'شماره رسید مصرف',
      'تعداد رسید مصرف',
      'تحویل گیرنده',
      'وضعیت انبارگردانی',
      'تاریخ آخرین انبارگردانی',
    ],
    [
      '1404/05/01',
      'PL-MULTI-1',
      'PKG-1',
      '1',
      'Valve',
      'Globe Valve 4 Inch',
      '10',
      '10',
      'MB-100',
      'GCV-777',
      '4',
      'مهندس رضایی',
      'موجود و تایید شده',
      '1404/06/01',
    ],
  ];

  const candidates = detectCandidateScopesForSheet({
    db,
    sheet: { name: 'MasterData', matrix: combinedMatrix },
    assumedCalendar: 'jalali',
    actorName: 'admin',
  });

  const candidateScopes = candidates.map((c) => c.scope);
  assert.equal(candidates[0].scope, 'detailed');
  assert.equal(candidates[0].isPrimary, true);
  assert.ok(candidateScopes.includes('stocktake'), 'should detect stocktake inside combined sheet');
  assert.ok(candidateScopes.includes('gcvDocuments'), 'should detect gcvDocuments inside combined sheet');

  // Commit the SAME sheet into two user-confirmed sections: detailed + gcvDocuments
  const res = commitAutoWorkbook({
    db,
    sheets: [
      { name: 'MasterData', matrix: combinedMatrix, forcedScope: 'detailed' },
      { name: 'MasterData', matrix: combinedMatrix, forcedScope: 'gcvDocuments' },
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });

  assert.equal(res.sections.length, 2);
  assert.equal(db.detailed.some((d) => d.shipmentNo === 'PL-MULTI-1'), true);
  assert.equal(db.gcvDocuments?.some((g) => g.receiptNo === 'GCV-777'), true);
});

test('Multi-value cells AND repeated numbered columns extract ALL MIV/SMR/GCV documents from a single row', () => {
  const db = makeEmptyDb();

  // 1) Multi-column MIV (1 & 2) + SMR Contractor + SMR Employer in ONE master row
  const mivRes = commitOperationalFormImport({
    db,
    scope: 'mivDocuments',
    matrix: [
      [
        'شماره محموله',
        'شماره نگله',
        'شماره آیتم',
        'شرح کالا',
        'شماره حواله ۱',
        'تاریخ حواله ۱',
        'تعداد حواله ۱',
        'شماره حواله ۲',
        'تاریخ حواله ۲',
        'تعداد حواله ۲',
        'شماره برگشتی پیمانکار ۱',
        'تاریخ برگشتی پیمانکار ۱',
        'مقدار برگشتی پیمانکار ۱',
        'شماره برگشتی کارفرما ۱',
        'تاریخ برگشتی کارفرما ۱',
        'مقدار برگشتی کارفرما ۱',
      ],
      [
        'PL-2026-01',
        'PKG-01',
        '1',
        'Gate Valve 8 Inch Class 600',
        'MIV-101',
        '1404/01/10',
        '3',
        'MIV-102',
        '1404/01/15',
        '2',
        'SMR-C-50',
        '1404/01/20',
        '1',
        'SMR-E-60',
        '1404/01/22',
        '1',
      ],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });

  assert.equal(mivRes.imported, 4);
  assert.equal(db.mivDocuments?.length, 4);
  const docNos = (db.mivDocuments || []).map((d) => `${d.docType}:${d.docNo}`).sort();
  assert.deepEqual(docNos, [
    'miv_contractor:MIV-101',
    'miv_contractor:MIV-102',
    'smr_contractor:SMR-C-50',
    'smr_mapna:SMR-E-60',
  ]);
  assert.equal(db.detailed[0].mivContractorQty, 5);
  assert.equal(db.detailed[0].smrContractorQty, 1);
  assert.equal(db.detailed[0].smrMapnaQty, 1);

  // 2) Multi-value cell (newline separated) for GCV with zipped quantities
  const gcvRes = commitOperationalFormImport({
    db,
    scope: 'gcvDocuments',
    matrix: [
      ['شماره رسید مصرف', 'تاریخ رسید', 'تعداد رسید مصرف', 'تحویل گیرنده', 'شماره محموله', 'شماره نگله', 'شماره آیتم'],
      ['GCV-201\nGCV-202', '1404/02/01\n1404/02/05', '2\n4', 'واحد مکانیک', 'PL-2026-01', 'PKG-01', '1'],
    ],
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'skip',
    actorName: 'admin',
  });

  assert.equal(gcvRes.imported, 2);
  assert.equal(db.gcvDocuments?.length, 2);
  const gcv201 = db.gcvDocuments?.find((g) => g.receiptNo === 'GCV-201');
  const gcv202 = db.gcvDocuments?.find((g) => g.receiptNo === 'GCV-202');
  assert.equal(gcv201?.items[0].qty, 2);
  assert.equal(gcv202?.items[0].qty, 4);
  assert.equal(db.detailed[0].gcvDeliveredQty, 6);
});

test('Delta sync skips unchanged operational documents and updates only modified ones', () => {
  const db = makeEmptyDb();
  const matrixV1 = [
    ['شماره صورتجلسه ورود', 'تاریخ ورود', 'شماره پکینگ لیست', 'توضیحات'],
    ['SE-DELTA-1', '1404/03/01', 'PL-2026-01', 'نسخه اول'],
    ['SE-DELTA-2', '1404/03/02', 'PL-2026-01', 'بدون تغییر'],
  ];

  const first = commitOperationalFormImport({
    db,
    scope: 'siteEntryMinutes',
    matrix: matrixV1,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'delta',
    actorName: 'admin',
  });
  assert.equal(first.imported, 2);

  // Preview identical re-upload -> isIdentical should be true
  const prevIdentical = previewOperationalFormImport({
    db,
    scope: 'siteEntryMinutes',
    matrix: matrixV1,
    assumedCalendar: 'jalali',
    actorName: 'admin',
  });
  assert.equal(prevIdentical.deltaSummary?.isIdentical, true);
  assert.equal(prevIdentical.deltaSummary?.unchangedCount, 2);
  assert.equal(prevIdentical.deltaSummary?.modifiedCount, 0);
  assert.equal(prevIdentical.deltaSummary?.newCount, 0);

  // Commit modified V2 (1 modified, 1 unchanged, 1 new)
  const matrixV2 = [
    ['شماره صورتجلسه ورود', 'تاریخ ورود', 'شماره پکینگ لیست', 'توضیحات'],
    ['SE-DELTA-1', '1404/03/01', 'PL-2026-01', 'نسخه ویرایش‌شده'],
    ['SE-DELTA-2', '1404/03/02', 'PL-2026-01', 'بدون تغییر'],
    ['SE-DELTA-3', '1404/03/03', 'PL-2026-01', 'جدید'],
  ];
  const prevV2 = previewOperationalFormImport({
    db,
    scope: 'siteEntryMinutes',
    matrix: matrixV2,
    assumedCalendar: 'jalali',
    actorName: 'admin',
  });
  assert.equal(prevV2.deltaSummary?.isIdentical, false);
  assert.equal(prevV2.deltaSummary?.newCount, 1);
  assert.equal(prevV2.deltaSummary?.modifiedCount, 1);
  assert.equal(prevV2.deltaSummary?.unchangedCount, 1);

  const commitV2 = commitOperationalFormImport({
    db,
    scope: 'siteEntryMinutes',
    matrix: matrixV2,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'delta',
    actorName: 'admin',
  });
  assert.equal(commitV2.imported, 1);
  assert.equal(commitV2.replaced, 1);
  assert.equal(commitV2.unchangedSkipped, 1);
  assert.equal(db.siteEntryMinutes?.find((x) => x.minutesNo === 'SE-DELTA-1')?.notes, 'نسخه ویرایش شده');
});

test('Rule 1-7 extraction: Site Entry grouped, dual OPI Invitation+Minutes, GCV Rahkaran, MIV/SMR formula splitting, Substitutions stacked, Material Balance BMR', () => {
  const db = makeEmptyDb();

  // Rule 1: General sheet with Site Entry minutes grouped + weighbridgeWeight
  const generalSheet = [
    [
      'شماره صورتجلسه ورود به سایت',
      'شماره صورتجلسه ورود کارفرما',
      'تاریخ ورود',
      'شماره پکینگ لیست',
      'شماره نگله',
      'تامین کننده',
      'محل ارسال',
      'شرح کالا',
      'شماره بارنامه',
      'شماره خودرو',
      'وزن باسکول',
      'نام راننده',
    ],
    [
      'SE-901',
      'EMP-SE-01',
      '1404/05/10',
      'PL-2026-01',
      'PKG-01',
      'MAPNA Turbine',
      'Karaj',
      'Valve Box 1',
      'WB-101',
      '11-A-222',
      '1450',
      'Reza',
    ],
    [
      'SE-901',
      'EMP-SE-01',
      '1404/05/10',
      'PL-2026-01',
      'PKG-02',
      'MAPNA Turbine',
      'Karaj',
      'Valve Box 2',
      'WB-101',
      '11-A-222',
      '1450',
      'Reza',
    ],
  ];
  const seRes = commitOperationalFormImport({
    db,
    scope: 'siteEntryMinutes',
    matrix: generalSheet,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(seRes.imported, 1);
  assert.equal(db.siteEntryMinutes!.length, 1);
  assert.equal(db.siteEntryMinutes![0].minutesNo, 'SE-901');
  assert.equal(db.siteEntryMinutes![0].employerEntryMinutesNo, 'EMP-SE-01');
  assert.equal(db.siteEntryMinutes![0].weighbridgeWeight, 1450);
  assert.equal(db.siteEntryMinutes![0].items?.length, 2);

  // Rules 2, 3, 4, 5, 6, 7 from a single Detailed sheet with formulas!
  const detailedHeaders = [
    'شماره محموله',
    'شماره نگله',
    'ردیف قلم',
    'شرح کلی',
    'شرح کالا',
    'کد کالا',
    'سایز',
    'واحد شمارش',
    'مقدار پکینگ',
    'مقدار واقعی',
    'شماره دعوتنامه',
    'تاریخ دعوتنامه',
    'شماره کسری/مغایرت',
    'شماره رسید مصرف',
    'تعداد رسید مصرف',
    'تحویل گیرنده',
    'شماره حواله انبار کارفرما',
    'تاریخ حواله انبار کارفرما',
    'مقدار حواله انبار کارفرما',
    'شماره حواله انبار پیمانکار',
    'تاریخ حواله انبار پیمانکار',
    'مقدار حواله انبار پیمانکار',
    'شماره برگشتی به انبار پیمانکار',
    'تاریخ برگشتی به انبار پیمانکار',
    'مقدار برگشتی به انبار پیمانکار',
    'شماره جایگزینی',
    'وضعیت جایگزینی',
    'تأمین مجدد جایگزین شده',
    'توضیحات جایگزینی',
    'موازنه مواد',
    'وضعیت موازنه',
  ];
  const detailedRow1 = [
    'PL-2026-01',
    'PKG-01',
    '1',
    'Exact Raw General Desc',
    'Gate Valve 8 Inch Class 600',
    'VLV-08-600',
    '8"',
    'عدد',
    '10',
    '10',
    'OPI-700',
    '1404/05/12',
    'MER-700',
    'GCV-301\nGCV-302',
    '5',
    'Unit 1 Ops',
    'MIV-E1\nMIV-E2',
    '1404/05/15\n1404/05/16',
    '7',
    'MIV-C1\nMIV-C2\nMIV-C3',
    '1404/05/17\n1404/05/18\n1404/05/19',
    '10',
    'SMR-C1\nSMR-C2',
    '1404/05/20\n1404/05/21',
    '3',
    'REP-501\nREP-502',
    'بسته\nباز',
    'بله\nخیر',
    'First sub note\nSecond sub note',
    'BMR-88',
    'تایید شده',
  ];
  const detailedMatrix = [detailedHeaders, detailedRow1];
  // Formulas: row index 1 (0-based in cleaned matrix)
  // col 14 = تعداد رسید مصرف (=2+3), col 18 = مقدار حواله کارفرما (=3+4),
  // col 21 = مقدار حواله پیمانکار (=2+3+5), col 24 = مقدار برگشتی پیمانکار (=1+2)
  const formulaMap: Record<string, string> = {
    '1:14': '=2+3',
    '1:18': '=3+4',
    '1:21': '=2+3+5',
    '1:24': '=1+2',
  };

  // Rule 2: Shared OPI columns produce BOTH OPI Invitation AND OPI Minutes
  const invRes = commitOperationalFormImport({
    db,
    scope: 'opiInvitations',
    matrix: detailedMatrix,
    formulaMap,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  const minRes = commitOperationalFormImport({
    db,
    scope: 'opiMinutes',
    matrix: detailedMatrix,
    formulaMap,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(invRes.imported, 1);
  assert.equal(minRes.imported, 1);
  assert.equal(db.opiInvitations![0].invitationNo, 'OPI-700');
  assert.equal(db.opiMinutes![0].minutesNo, 'OPI-700');
  assert.equal(db.opiMinutes![0].merNo, 'MER-700');

  // Rule 3: GCV split via formula =2+3 into GCV-301 (qty 2) and GCV-302 (qty 3)
  const gcvRes = commitOperationalFormImport({
    db,
    scope: 'gcvDocuments',
    matrix: detailedMatrix,
    formulaMap,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(gcvRes.imported, 2);
  assert.equal(db.gcvDocuments!.find((d) => d.receiptNo === 'GCV-301')?.items[0].qty, 2);
  assert.equal(db.gcvDocuments!.find((d) => d.receiptNo === 'GCV-302')?.items[0].qty, 3);

  // Rules 4 & 5: MIV Employer (=3+4), MIV Contractor (=2+3+5), SMR Contractor (=1+2)
  const mivRes = commitOperationalFormImport({
    db,
    scope: 'mivDocuments',
    matrix: detailedMatrix,
    formulaMap,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(mivRes.imported, 7); // 2 employer MIV + 3 contractor MIV + 2 contractor SMR
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'MIV-E1')?.docType, 'miv_mapna');
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'MIV-E1')?.items[0].qty, 3);
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'MIV-E2')?.items[0].qty, 4);
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'MIV-C1')?.docType, 'miv_contractor');
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'MIV-C1')?.items[0].qty, 2);
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'MIV-C2')?.items[0].qty, 3);
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'MIV-C3')?.items[0].qty, 5);
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'SMR-C1')?.docType, 'smr_contractor');
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'SMR-C1')?.items[0].qty, 1);
  assert.equal(db.mivDocuments!.find((d) => d.docNo === 'SMR-C2')?.items[0].qty, 2);

  // Rule 6: Substitutions stacked multi-line with Open/Closed + reprocured
  const subRes = commitOperationalFormImport({
    db,
    scope: 'substitutions',
    matrix: detailedMatrix,
    formulaMap,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(subRes.imported, 2);
  const rep501 = db.substitutions!.find((s) => s.docNo === 'REP-501');
  const rep502 = db.substitutions!.find((s) => s.docNo === 'REP-502');
  assert.equal(rep501?.status, 'executed');
  assert.equal(rep501?.reprocured, 'بله');
  assert.equal(rep502?.status, 'pending');
  assert.equal(rep502?.reprocured, 'خیر');

  // Rule 7: Material Balance (BMR) updates detailed.materialBalanceNo & balanceStatus
  db.detailed.push({
    id: 'det-bmr-1',
    entryDate: '2025-08-01',
    shipmentNo: 'PL-2026-01',
    packageNo: 'PKG-01',
    itemNo: '1',
    generalDescription: 'Exact Raw General Desc',
    description: 'Gate Valve 8 Inch Class 600',
    itemCode: 'VLV-08-600',
    size: '8"',
    countingUnit: 'عدد',
    packingQty: 10,
    actualQty: 10,
    mapnaInventory: 10,
    contractorInventory: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
  const bmrRes = commitOperationalFormImport({
    db,
    scope: 'materialBalance',
    matrix: detailedMatrix,
    formulaMap,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(bmrRes.imported, 1);
  assert.equal(db.detailed[0].materialBalanceNo, 'BMR-88');
  assert.equal(db.detailed[0].balanceStatus, 'تایید شده');
});

test('previewAutoWorkbook scans 5,000 detailed rows quickly without blocking (< 1500ms)', () => {
  const db = makeEmptyDb();
  const header = ['شماره محموله', 'شماره نگله', 'ردیف قلم', 'شرح کلی', 'شرح کالا', 'کد کالا', 'مقدار پکینگ', 'مقدار واقعی'];
  const matrix: string[][] = [header];
  for (let i = 1; i <= 5000; i++) {
    matrix.push(['PL-2026-01', `PKG-${i % 50}`, String(i), 'Raw Desc', `Pipe Fitting ${i}`, `PF-${i}`, '10', '10']);
  }
  const t0 = performance.now();
  const prev = previewAutoWorkbook({
    db,
    sheets: [{ name: 'Detailed', matrix }],
    assumedCalendar: 'jalali',
    actorName: 'admin',
  });
  const elapsedMs = performance.now() - t0;
  assert.equal(prev.detectedSheets.length, 1);
  assert.equal(prev.detectedSheets[0].scope, 'detailed');
  assert.equal(prev.detectedSheets[0].rowCount, 5000);
  assert.ok(elapsedMs < 1500, `Expected 5,000-row scan under 1500ms, took ${elapsedMs.toFixed(1)}ms`);
});

test('Rules 1-7 handle Kashida/Arabic headers, exclude date/status columns from docNos, enforce OPI Invitations === OPI Minutes equal counts, and GCV arrivalDate fallback', () => {
  const db = makeEmptyDb();

  // 1) Rule 1 with Arabic ك/ي in header ("صورتجلسه ورود كالا و تجهيزات به كارگاه")
  const generalArabicMatrix = [
    ['تاريخ ورود', 'شماره پكينگ ليست', 'شماره صورتجلسه ورود كالا و تجهيزات به كارگاه', 'شماره بارنامه', 'تامين كننده'],
    ['1404/05/10', 'PL-AR-1', 'AN-1404-77', 'WB-77', 'MAPNA'],
    ['1404/05/10', 'PL-AR-2', 'AN-1404-77', 'WB-77', 'MAPNA'],
  ];
  const seRes = commitOperationalFormImport({
    db,
    scope: 'siteEntryMinutes',
    matrix: generalArabicMatrix,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(seRes.imported, 1, 'Identical AN-1404-77 rows must group into 1 Site Entry Minutes');
  assert.equal(db.siteEntryMinutes![0].minutesNo, 'AN-1404-77');
  assert.deepEqual(db.siteEntryMinutes![0].packingListNos, ['PL-AR-1', 'PL-AR-2']);

  // 2) Master detailed sheet with Kashida ("مــوازنه"), Arabic ("كنترل", "تجهيزات", "مستقيم"),
  //    date/status columns adjacent to docNo columns, and status values ("باز"/"بسته") that must NEVER become docNos!
  const masterMatrix = [
    [
      'تاريخ ورود',
      'شماره پكينگ ليست',
      'شماره نگله',
      'شماره آيتم',
      'شرح كالا',
      'شماره دعوتنامه بازرسي و گشايش بسته‌ها',
      'تاريخ دعوتنامه بازرسي',
      'شماره رسيد مصرف مستقيم راهكاران',
      'تعداد رسيد راهكاران',
      'وضعيت گزارش مــوازنه',
      'شماره گزارش مــوازنه و كنترل مصرف مواد',
      'شماره فرم جايگزيني REP',
      'وضعيت جايگزيني REP',
      'توضيحات جايگزيني',
    ],
    [
      '1404/06/01',
      'PL-AR-1',
      'P-1',
      '1',
      'Valve A',
      'OPI-1404-01',
      '1404/06/05',
      'GCV-901',
      '3',
      'تایید شده',
      'BMR-1404-11',
      'REP-801',
      'بسته',
      'تامین شد',
    ],
    [
      '1404/06/01',
      'PL-AR-2',
      'P-2',
      '2',
      'Valve B',
      'OPI-1404-01',
      '1404/06/05',
      'GCV-901',
      '5',
      'تایید شده',
      'BMR-1404-11',
      'باز', // Status accidentally placed in REP col — isLikelyDocNo must reject!
      'باز',
      '',
    ],
    [
      '1404/06/02',
      'PL-AR-3',
      'P-3',
      '1',
      'Pump C',
      'OPI-1404-02',
      '1404/06/08',
      '',
      '',
      'در دست بررسی',
      'BMR-1404-12',
      'REP-802',
      'Open',
      'در حال تامین',
    ],
  ];

  // Commit ONLY opiInvitations — commitOperationalFormImport MUST automatically sync matching opiMinutes 1-to-1!
  const invRes = commitOperationalFormImport({
    db,
    scope: 'opiInvitations',
    matrix: masterMatrix,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(invRes.imported, 2);
  assert.equal(db.opiInvitations!.length, 2);
  assert.equal(db.opiMinutes!.length, 2, 'OPI Minutes count MUST strictly equal OPI Invitations count');
  const inv1 = db.opiInvitations!.find((x) => x.invitationNo === 'OPI-1404-01');
  const min1 = db.opiMinutes!.find((x) => x.minutesNo === 'OPI-1404-01');
  assert.deepEqual(inv1?.packingNos, ['PL-AR-1', 'PL-AR-2']);
  assert.ok(min1?.packingListNo.includes('PL-AR-1') && min1?.packingListNo.includes('PL-AR-2'));

  // GCV: date falls back to arrivalDate (1404/06/01 -> 2025-08-23), and "تعداد رسید راهکاران" is NOT mistaken for a receiptNo!
  const gcvRes = commitOperationalFormImport({
    db,
    scope: 'gcvDocuments',
    matrix: masterMatrix,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(gcvRes.imported, 1, 'Only GCV-901 should be extracted (never qty column)');
  assert.equal(db.gcvDocuments![0].receiptNo, 'GCV-901');
  assert.equal(db.gcvDocuments![0].items.length, 2);
  assert.equal(db.gcvDocuments![0].date, '2025-08-23', 'GCV date must inherit arrivalDate when receipt date column is absent');

  // Rule 6 (Substitutions): must extract REP-801 and REP-802 ONLY (never "باز" or "بسته" from status col!)
  const subRes = commitOperationalFormImport({
    db,
    scope: 'substitutions',
    matrix: masterMatrix,
    assumedCalendar: 'jalali',
    duplicateRecordPolicy: 'replace',
    actorName: 'admin',
  });
  assert.equal(subRes.imported, 2);
  assert.ok(db.substitutions!.some((s) => s.docNo === 'REP-801' && s.status === 'executed'));
  assert.ok(db.substitutions!.some((s) => s.docNo === 'REP-802' && s.status === 'pending'));

  // Rule 7 (BMR): Kashida "مــوازنه" & Arabic "كنترل" matched, status in PREVIOUS column captured, status column NOT mistaken for BMR docNo!
  const bmrPreview = previewOperationalFormImport({
    db,
    scope: 'materialBalance',
    matrix: masterMatrix,
    assumedCalendar: 'jalali',
    actorName: 'admin',
  });
  assert.equal(bmrPreview.totalRows, 2);
  const bmr11 = bmrPreview.parsedRecords.find((r) => r.reportNo === 'BMR-1404-11');
  assert.equal(bmr11?.balanceStatus, 'تایید شده', 'Status from PREVIOUS column must be captured');
  assert.equal(bmr11?.itemCount, 2);
});

test('previewAutoWorkbook handles 22,000-row workbook against 22,000-row DB with BMR/MTO columns in O(N) time (< 2500ms)', () => {
  const db = makeEmptyDb();
  // Populate 22,000 existing detailed rows with BMR & MTO references to exercise the former O(N*M) bottleneck!
  db.detailed = Array.from({ length: 22000 }, (_, i) => ({
    id: `det-bench-${i}`,
    shipmentNo: `PL-${Math.floor(i / 20)}`,
    packageNo: `P-${i % 10}`,
    itemNo: String((i % 20) + 1),
    description: `Bolt ${i}`,
    itemCode: `CODE-${i}`,
    mtoRef: `MTO-${i % 1000}`,
    materialBalanceNo: `BMR-${i % 2000}`,
    packingQty: 10,
    actualQty: 10,
    countingUnit: 'عدد',
  })) as any;

  const header = [
    'شماره پکینگ لیست',
    'شماره نگله',
    'شماره آیتم',
    'شرح کالا',
    'کد کالا',
    'مقدار پکینگ',
    'مقدار واقعی',
    'شماره بالانس متریال',
    'وضعیت بالانس',
    'شماره دعوتنامه OPI',
  ];
  const matrix: string[][] = [header];
  for (let i = 0; i < 2000; i += 1) {
    matrix.push([
      `PL-${Math.floor(i / 10)}`,
      `P-${i % 10}`,
      String((i % 20) + 1),
      `Bolt ${i}`,
      `CODE-${i}`,
      '10',
      '10',
      `BMR-${i}`,
      'تایید شده',
      `OPI-${Math.floor(i / 5)}`,
    ]);
  }

  const t0 = performance.now();
  const prev = previewAutoWorkbook({
    db,
    sheets: [{ name: 'Detailed_Master', matrix }],
    assumedCalendar: 'jalali',
    actorName: 'admin',
  });
  const elapsedMs = performance.now() - t0;
  assert.equal(prev.detectedSheets.length, 1);
  assert.ok(elapsedMs < 2500, `Expected 2,000-row BMR/OPI scan against 22,000-row DB under 2500ms, took ${elapsedMs.toFixed(1)}ms`);
});






