import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_EMPLOYERS,
  DEFAULT_EMPLOYER_ID,
  ensureDefaultEmployers,
  isBuiltInEmployerId,
  isValidEmployerLogoUrl,
  resolveEmployerProfile,
  sanitizeEmployerLogo,
  sanitizeEmployerProfile,
} from './employers';
import { validateAndFormatIranPhone } from './iranPhone';

test('BUILT_IN_EMPLOYERS defines MD1, MD2, MD3 with exact user metadata and logo mappings', () => {
  assert.equal(BUILT_IN_EMPLOYERS.length, 3);
  assert.equal(DEFAULT_EMPLOYER_ID, 'mapna-md1');

  const [md1, md2, md3] = BUILT_IN_EMPLOYERS;

  // MD1
  assert.equal(md1.id, 'mapna-md1');
  assert.equal(md1.isBuiltIn, true);
  assert.equal(md1.nameFa, 'مپنا توسعه یک');
  assert.equal(md1.nameEn, 'Mapna Power Plants Construction & Development Co.');
  assert.equal(md1.shortName, 'MD1');
  assert.equal(md1.companyFullName, 'شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)');
  assert.equal(md1.docCodePrefix, 'MD1EX-FQP02');
  assert.equal(md1.imsSubtitle, 'سیستم مدیریت یکپارچه');
  assert.equal(md1.address, 'تهران - بزرگراه نلسون ماندلا - جنوب چهارراه حقانی - نبش کوچه کیان - پلاک 13');
  assert.equal(md1.phone, '+98-21-82980000');
  assert.equal(md1.secondaryPhone, '+98-21-82980001');
  assert.equal(md1.postalCode, '1518614111');
  assert.equal(md1.fax, '+98-21-82986623');
  assert.equal(md1.email, 'Info@MD1.MapnaGroup.com');
  assert.equal(md1.instagram, 'Mapna_md1');
  assert.equal(md1.linkedin, 'Mapna_md1');
  assert.equal(md1.logos[0]?.dataUrl, './assets/aistudio/______________8a639368.png');

  // MD2
  assert.equal(md2.id, 'mapna-md2');
  assert.equal(md2.isBuiltIn, true);
  assert.equal(md2.nameFa, 'مپنا توسعه دو');
  assert.equal(md2.shortName, 'MD2');
  assert.equal(md2.companyFullName, 'شرکت احداث و توسعه نیروگاه‌های حرارتی مپنا – توسعه دو (MD2)');
  assert.equal(md2.docCodePrefix, 'MD2EX-FQP02');
  assert.equal(md2.address, 'تهران - بزرگراه آفریقا - جنوب چهارراه حقانی - شماره 15');
  assert.equal(md2.phone, '+98-21-45357000');
  assert.equal(md2.postalCode, '1518614411');
  assert.equal(md2.fax, '+98-21-8879547');
  assert.equal(md2.email, 'Info@MD2.MapnaGroup.com');
  assert.equal(md2.instagram, 'Mapna_md2');
  assert.equal(md2.linkedin, 'Mapnamd2');
  assert.equal(md2.logos[0]?.dataUrl, './assets/aistudio/______________16d5c0f7.png');

  // MD3
  assert.equal(md3.id, 'mapna-md3');
  assert.equal(md3.isBuiltIn, true);
  assert.equal(md3.nameFa, 'مپنا توسعه سه');
  assert.equal(md3.shortName, 'MD3');
  assert.equal(md3.companyFullName, 'شرکت احداث و توسعه پروژه‌های ویژه مپنا – توسعه سه (MD3)');
  assert.equal(md3.docCodePrefix, 'MD3EX-FQP02');
  assert.equal(md3.address, 'تهران - بزرگراه نلسون ماندلا - جنوب چهار راه حقانی - نبش کوچه ژوبین - پلاک 15');
  assert.equal(md3.phone, '+98-21-84620000');
  assert.equal(md3.secondaryPhone, '+98-21-84620001');
  assert.equal(md3.postalCode, '1518614411');
  assert.equal(md3.fax, '+98-21-88857450');
  assert.equal(md3.email, 'info@mapnamd3.com');
  assert.equal(md3.instagram, 'Mapna_md3');
  assert.equal(md3.linkedin, 'Mapnamd3');
  assert.equal(md3.logos[0]?.dataUrl, './assets/aistudio/______________5185c558.png');
});

test('isValidEmployerLogoUrl and sanitizeEmployerLogo allow both data URLs and safe local static assets', () => {
  assert.equal(isValidEmployerLogoUrl('./assets/aistudio/______________8a639368.png'), true);
  assert.equal(isValidEmployerLogoUrl('/assets/aistudio/test.png'), true);
  assert.equal(isValidEmployerLogoUrl('data:image/png;base64,abc'), true);
  assert.equal(isValidEmployerLogoUrl('./assets/../secret.png'), false);
  assert.equal(isValidEmployerLogoUrl('javascript:alert(1)'), false);
  assert.equal(isValidEmployerLogoUrl('https://evil.example/logo.png'), false);

  const sanitized = sanitizeEmployerLogo({
    id: 'md1-logo',
    label: 'MD1',
    dataUrl: './assets/aistudio/______________8a639368.png',
    isDefault: true,
  });
  assert.ok(sanitized);
  assert.equal(sanitized.dataUrl, './assets/aistudio/______________8a639368.png');
});

test('ensureDefaultEmployers locks canonical MD1/MD2/MD3 profile fields while preserving uploadedForms and custom employers', () => {
  const fromEmpty = ensureDefaultEmployers([]);
  assert.deepEqual(
    fromEmpty.map((e) => e.id),
    ['mapna-md1', 'mapna-md2', 'mapna-md3'],
  );

  const custom = sanitizeEmployerProfile({
    id: 'emp-custom1',
    nameFa: 'کارفرمای سفارشی نکا',
    shortName: 'NEKA',
    companyFullName: 'شرکت تولید نیروی برق نکا',
    postalCode: '4841111111',
    email: 'info@neka-power.ir',
  });
  assert.ok(custom);
  assert.equal(custom.isBuiltIn, false);

  const tamperedMd2 = sanitizeEmployerProfile({
    ...BUILT_IN_EMPLOYERS[1],
    docCodePrefix: 'MD2EX-FQP99',
    address: 'آدرس تغییر یافته غیرمجاز',
    uploadedForms: [
      {
        id: 'uf-1',
        titleFa: 'فرم تست',
        fileName: 'test.xlsx',
        fileType: 'excel',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileDataBase64: 'AAAA',
        dataSource: 'general',
        printSettings: {
          orientation: 'portrait',
          marginTopMm: 10,
          marginRightMm: 10,
          marginBottomMm: 10,
          marginLeftMm: 10,
          fontSizePt: 10,
          scalePercent: 100,
          showGridlines: true,
          autoRowHeight: true,
          minRowHeightPx: 24,
          fitToPageWidth: true,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });
  assert.ok(tamperedMd2);

  const merged = ensureDefaultEmployers([tamperedMd2, custom]);
  assert.deepEqual(
    merged.map((e) => e.id),
    ['mapna-md1', 'mapna-md2', 'mapna-md3', 'emp-custom1'],
  );
  // Canonical locked fields are enforced
  assert.equal(merged[1].docCodePrefix, 'MD2EX-FQP02');
  assert.equal(merged[1].address, 'تهران - بزرگراه آفریقا - جنوب چهارراه حقانی - شماره 15');
  // Uploaded forms are preserved
  assert.equal(merged[1].uploadedForms?.length, 1);
  assert.equal(merged[1].isBuiltIn, true);
  assert.equal(merged[3].nameFa, 'کارفرمای سفارشی نکا');
  assert.equal(isBuiltInEmployerId('mapna-md1'), true);
  assert.equal(isBuiltInEmployerId('emp-custom1'), false);
});

test('resolveEmployerProfile cascades project-level optional contractRef cleanly', () => {
  const resolvedWithContract = resolveEmployerProfile(
    { employerId: 'mapna-md1', contractRef: 'CNT-NEKA-1404' },
    ensureDefaultEmployers([]),
  );
  assert.equal(resolvedWithContract.isConfigured, true);
  assert.equal(resolvedWithContract.isBuiltIn, true);
  assert.equal(resolvedWithContract.shortName, 'MD1');
  assert.equal(resolvedWithContract.contractRef, 'CNT-NEKA-1404');
  assert.equal(resolvedWithContract.email, 'Info@MD1.MapnaGroup.com');

  const resolvedWithoutContract = resolveEmployerProfile(
    { employerId: 'mapna-md2' },
    ensureDefaultEmployers([]),
  );
  assert.equal(resolvedWithoutContract.contractRef, undefined);
  assert.equal(resolvedWithoutContract.shortName, 'MD2');
});

test('validateAndFormatIranPhone accepts all 3 MAPNA phone styles cleanly', () => {
  const md1Phone = validateAndFormatIranPhone('0۲۱۸۲۹۸۰۰۰۰ و 0۲۱۸۲۹۸۰۰۰1');
  assert.equal(md1Phone.valid, true);
  assert.equal(md1Phone.kind, 'multi');

  const md2Phone = validateAndFormatIranPhone('۴۵۳۵۷۰۰۰–۰۲۱');
  assert.equal(md2Phone.valid, true);
  assert.equal(md2Phone.formatted, '021-45357000');

  const md3Phone = validateAndFormatIranPhone('02184620000 و 02184620001');
  assert.equal(md3Phone.valid, true);
  assert.equal(md3Phone.kind, 'multi');
});
