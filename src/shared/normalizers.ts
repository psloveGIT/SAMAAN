import type { DetailedEntry, Language } from './types.ts';

export const DEFAULT_TRANSIT_STATUSES = [
  'در دست ارسال',
  'در دست بازرسی',
  'رسیده',
] as const;

export type DefaultTransitStatus = (typeof DEFAULT_TRANSIT_STATUSES)[number];

export const PERSIAN_COUNTING_UNIT_SUGGESTIONS: string[] = [
  'عدد',
  'ست',
  'متر',
  'سانتی‌متر',
  'میلی‌متر',
  'مترمربع',
  'سانتی‌مترمربع',
  'میلی‌مترمربع',
  'مترمکعب',
  'سانتی‌مترمکعب',
  'سی‌سی',
  'کیلوگرم',
  'گرم',
  'تن',
  'لیتر',
  'میلی‌لیتر',
  'جفت',
  'بسته',
  'جعبه',
  'کارتن',
  'رول',
  'ورق',
  'کیت',
  'شاخه',
  'بشکه',
  'قوطی',
  'بطری',
  'کیسه',
  'باندل',
  'پالت',
  'قرقره',
  'پارت',
  'سیلندر',
  'گالن',
  'سطل',
  'تیوب',
  'مجموعه',
  'بلوک',
  'سلول',
  'ماژول',
  'پنل',
  'حلقه',
  'دستگاه',
  'کپسول',
  'کارتریج',
  'دوجین',
];

function normalizePersianChars(raw: string): string {
  return raw
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COUNTING_UNIT_EN_TO_FA: Record<string, string> = {
  // Pieces / Each / Numbers
  pc: 'عدد',
  pcs: 'عدد',
  pce: 'عدد',
  pces: 'عدد',
  piece: 'عدد',
  pieces: 'عدد',
  ea: 'عدد',
  each: 'عدد',
  no: 'عدد',
  nos: 'عدد',
  num: 'عدد',
  number: 'عدد',
  numbers: 'عدد',
  unit: 'عدد',
  units: 'عدد',
  un: 'عدد',
  unt: 'عدد',
  item: 'عدد',
  items: 'عدد',
  itm: 'عدد',
  qty: 'عدد',
  cnt: 'عدد',
  count: 'عدد',
  one: 'عدد',
  single: 'عدد',
  comp: 'قطعه',
  component: 'قطعه',
  components: 'قطعه',
  part: 'قطعه',
  parts: 'قطعه',
  prt: 'قطعه',
  spare: 'قطعه یدکی',
  spares: 'قطعه یدکی',
  doz: 'دوجین',
  dz: 'دوجین',
  dozen: 'دوجین',
  dozens: 'دوجین',
  gross: 'قراص',

  // Sets / Kits / Assemblies / Groups / Systems
  set: 'ست',
  sets: 'ست',
  st: 'ست',
  kit: 'کیت',
  kits: 'کیت',
  kt: 'کیت',
  assy: 'مجموعه',
  assem: 'مجموعه',
  assembly: 'مجموعه',
  assemblies: 'مجموعه',
  group: 'گروه',
  groups: 'گروه',
  grp: 'گروه',
  sys: 'سیستم',
  system: 'سیستم',
  systems: 'سیستم',
  subsys: 'ساب‌سیستم',
  subsystem: 'ساب‌سیستم',
  module: 'ماژول',
  modules: 'ماژول',
  mod: 'ماژول',
  panel: 'پنل',
  panels: 'پنل',
  pnl: 'پنل',
  cabinet: 'کابینت',
  cabinets: 'کابینت',
  cab: 'کابینت',
  rack: 'رک',
  racks: 'رک',
  skid: 'اسکید',
  skids: 'اسکید',
  frame: 'فریم',
  frames: 'فریم',
  bank: 'بانک',
  banks: 'بانک',
  bay: 'بی',
  bays: 'بی',
  stack: 'استک',
  stacks: 'استک',
  stage: 'مرحله',
  stages: 'مرحله',
  section: 'بخش',
  sections: 'بخش',
  sec: 'بخش',
  block: 'بلوک',
  blocks: 'بلوک',
  blk: 'بلوک',
  cell: 'سلول',
  cells: 'سلول',
  eq: 'دستگاه',
  equip: 'دستگاه',
  equipment: 'دستگاه',
  mach: 'دستگاه',
  machine: 'دستگاه',
  machines: 'دستگاه',
  dev: 'دستگاه',
  device: 'دستگاه',
  devices: 'دستگاه',
  inst: 'تجهیز',
  instrument: 'تجهیز',
  instruments: 'تجهیز',
  tool: 'ابزار',
  tools: 'ابزار',

  // Length
  m: 'متر',
  mt: 'متر',
  mtr: 'متر',
  mtrs: 'متر',
  meter: 'متر',
  meters: 'متر',
  metre: 'متر',
  metres: 'متر',
  rm: 'متر طول',
  lm: 'متر طول',
  linm: 'متر طول',
  cm: 'سانتی‌متر',
  centimeter: 'سانتی‌متر',
  centimeters: 'سانتی‌متر',
  centimetre: 'سانتی‌متر',
  mm: 'میلی‌متر',
  millimeter: 'میلی‌متر',
  millimeters: 'میلی‌متر',
  millimetre: 'میلی‌متر',
  um: 'میکرومتر',
  micron: 'میکرون',
  microns: 'میکرون',
  km: 'کیلومتر',
  kilometer: 'کیلومتر',
  kilometers: 'کیلومتر',
  ft: 'فوت',
  feet: 'فوت',
  foot: 'فوت',
  lf: 'فوت طول',
  in: 'اینچ',
  inch: 'اینچ',
  inches: 'اینچ',
  yd: 'یارد',
  yds: 'یارد',
  yard: 'یارد',
  yards: 'یارد',
  mi: 'مایل',
  mile: 'مایل',
  miles: 'مایل',
  length: 'شاخه',
  lengths: 'شاخه',
  len: 'شاخه',
  lng: 'شاخه',
  bar: 'شاخه',
  bars: 'شاخه',
  rod: 'شاخه',
  rods: 'شاخه',
  pipe: 'شاخه',
  pipes: 'شاخه',
  branch: 'شاخه',
  branches: 'شاخه',
  beam: 'شاخه',
  beams: 'شاخه',
  joint: 'شاخه',
  joints: 'شاخه',
  jnt: 'شاخه',
  span: 'دهانه',
  spans: 'دهانه',
  line: 'خط',
  lines: 'خط',
  run: 'مسیر',
  runs: 'مسیر',

  // Area (including mm2, cm2, m2, sqft, in2)
  m2: 'مترمربع',
  sqm: 'مترمربع',
  'sq.m': 'مترمربع',
  sqmt: 'مترمربع',
  sqmtr: 'مترمربع',
  squaremeter: 'مترمربع',
  squaremeters: 'مترمربع',
  cm2: 'سانتی‌مترمربع',
  sqcm: 'سانتی‌مترمربع',
  'sq.cm': 'سانتی‌مترمربع',
  mm2: 'میلی‌مترمربع',
  sqmm: 'میلی‌مترمربع',
  'sq.mm': 'میلی‌مترمربع',
  ft2: 'فوت‌مربع',
  sqft: 'فوت‌مربع',
  'sq.ft': 'فوت‌مربع',
  sf: 'فوت‌مربع',
  in2: 'اینچ‌مربع',
  sqin: 'اینچ‌مربع',
  'sq.in': 'اینچ‌مربع',
  yd2: 'یاردمربع',
  sqyd: 'یاردمربع',
  'sq.yd': 'یاردمربع',
  ha: 'هکتار',
  hectare: 'هکتار',

  // Volume (including cc, cm3, mm3, m3, nm3, ft3)
  m3: 'مترمکعب',
  cbm: 'مترمکعب',
  cum: 'مترمکعب',
  'cu.m': 'مترمکعب',
  cubicmeter: 'مترمکعب',
  cubicmeters: 'مترمکعب',
  nm3: 'نرمال مترمکعب',
  sm3: 'استاندارد مترمکعب',
  cm3: 'سانتی‌مترمکعب',
  cucm: 'سانتی‌مترمکعب',
  'cu.cm': 'سانتی‌مترمکعب',
  cc: 'سی‌سی',
  ccs: 'سی‌سی',
  mm3: 'میلی‌مترمکعب',
  cumm: 'میلی‌مترمکعب',
  ft3: 'فوت‌مکعب',
  cuft: 'فوت‌مکعب',
  cft: 'فوت‌مکعب',
  cf: 'فوت‌مکعب',
  in3: 'اینچ‌مکعب',
  cuin: 'اینچ‌مکعب',
  yd3: 'یاردمکعب',
  cuyd: 'یاردمکعب',

  // Weight / Mass
  kg: 'کیلوگرم',
  kgs: 'کیلوگرم',
  kilo: 'کیلوگرم',
  kilos: 'کیلوگرم',
  kilogram: 'کیلوگرم',
  kilograms: 'کیلوگرم',
  g: 'گرم',
  gr: 'گرم',
  gm: 'گرم',
  gms: 'گرم',
  gram: 'گرم',
  grams: 'گرم',
  mg: 'میلی‌گرم',
  milligram: 'میلی‌گرم',
  ug: 'میکروگرم',
  ton: 'تن',
  tons: 'تن',
  tonne: 'تن',
  tonnes: 'تن',
  t: 'تن',
  tn: 'تن',
  mton: 'تن',
  metricton: 'تن',
  metrictons: 'تن',
  lb: 'پوند',
  lbs: 'پوند',
  pound: 'پوند',
  pounds: 'پوند',
  oz: 'اونس',
  ounce: 'اونس',
  ounces: 'اونس',

  // Liquids / Containers / Chemical Packaging
  l: 'لیتر',
  lt: 'لیتر',
  lts: 'لیتر',
  ltr: 'لیتر',
  ltrs: 'لیتر',
  liter: 'لیتر',
  liters: 'لیتر',
  litre: 'لیتر',
  litres: 'لیتر',
  ml: 'میلی‌لیتر',
  mls: 'میلی‌لیتر',
  milliliter: 'میلی‌لیتر',
  milliliters: 'میلی‌لیتر',
  cl: 'سانتی‌لیتر',
  dl: 'دسی‌لیتر',
  kl: 'کیلولیتر',
  gal: 'گالن',
  gals: 'گالن',
  gallon: 'گالن',
  gallons: 'گالن',
  jerrycan: 'گالن',
  jerrycans: 'گالن',
  jcan: 'گالن',
  qt: 'کوارت',
  quart: 'کوارت',
  pt: 'پینت',
  pint: 'پینت',
  drum: 'بشکه',
  drums: 'بشکه',
  dr: 'بشکه',
  drm: 'بشکه',
  dm: 'بشکه',
  barrel: 'بشکه',
  barrels: 'بشکه',
  bbl: 'بشکه',
  can: 'قوطی',
  cans: 'قوطی',
  cn: 'قوطی',
  tin: 'قوطی',
  tins: 'قوطی',
  canister: 'قوطی',
  bottle: 'بطری',
  bottles: 'بطری',
  btl: 'بطری',
  btls: 'بطری',
  flask: 'فلاسک',
  jar: 'شیشه',
  jars: 'شیشه',
  vial: 'ویال',
  vials: 'ویال',
  ampoule: 'آمپول',
  ampoules: 'آمپول',
  amp: 'آمپول',
  syringe: 'سرنگ',
  syringes: 'سرنگ',
  tube: 'تیوب',
  tubes: 'تیوب',
  tb: 'تیوب',
  cartridge: 'کارتریج',
  cartridges: 'کارتریج',
  ctg: 'کارتریج',
  capsule: 'کپسول',
  capsules: 'کپسول',
  cap: 'کپسول',
  bucket: 'سطل',
  buckets: 'سطل',
  bkt: 'سطل',
  pail: 'سطل',
  pails: 'سطل',
  cyl: 'سیلندر',
  cyls: 'سیلندر',
  cylinder: 'سیلندر',
  cylinders: 'سیلندر',
  tank: 'مخزن',
  tanks: 'مخزن',
  vessel: 'مخزن',
  vessels: 'مخزن',
  ibc: 'مخزن IBC',
  tote: 'مخزن',
  spray: 'اسپری',
  aerosol: 'اسپری',

  // Pairs / Packaging / Bulk / Hardware Forms
  pair: 'جفت',
  pairs: 'جفت',
  pr: 'جفت',
  prs: 'جفت',
  triple: 'سه‌تایی',
  quad: 'چهارتایی',
  box: 'جعبه',
  boxes: 'جعبه',
  bx: 'جعبه',
  bxs: 'جعبه',
  case: 'جعبه',
  cases: 'جعبه',
  cs: 'جعبه',
  crate: 'صندوق',
  crates: 'صندوق',
  crt: 'صندوق',
  chest: 'صندوق',
  container: 'کانتینر',
  containers: 'کانتینر',
  cntr: 'کانتینر',
  pack: 'بسته',
  packs: 'بسته',
  pk: 'بسته',
  pks: 'بسته',
  pkg: 'بسته',
  pkgs: 'بسته',
  pkt: 'بسته',
  packet: 'بسته',
  packets: 'بسته',
  package: 'بسته',
  packages: 'بسته',
  pouch: 'بسته',
  sachet: 'ساشه',
  sachets: 'ساشه',
  ctn: 'کارتن',
  ctns: 'کارتن',
  carton: 'کارتن',
  cartons: 'کارتن',
  bag: 'کیسه',
  bags: 'کیسه',
  bg: 'کیسه',
  bgs: 'کیسه',
  sack: 'کیسه',
  sacks: 'کیسه',
  bale: 'عدل',
  bales: 'عدل',
  roll: 'رول',
  rolls: 'رول',
  rl: 'رول',
  rls: 'رول',
  coil: 'کلاف',
  coils: 'کلاف',
  hank: 'کلاف',
  reel: 'قرقره',
  reels: 'قرقره',
  spool: 'قرقره',
  spools: 'قرقره',
  bobbin: 'قرقره',
  ring: 'حلقه',
  rings: 'حلقه',
  loop: 'حلقه',
  loops: 'حلقه',
  sheet: 'ورق',
  sheets: 'ورق',
  sh: 'ورق',
  sht: 'ورق',
  shts: 'ورق',
  plate: 'ورق',
  plates: 'ورق',
  plt: 'پالت',
  plts: 'پالت',
  pallet: 'پالت',
  pallets: 'پالت',
  pal: 'پالت',
  bundle: 'باندل',
  bundles: 'باندل',
  bdl: 'باندل',
  bdls: 'باندل',
  bun: 'باندل',
  lot: 'پارت',
  lots: 'پارت',
  batch: 'بچ',
  batches: 'بچ',
  strip: 'نوار',
  strips: 'نوار',
  tape: 'نوار',
  tapes: 'نوار',
  ribbon: 'نوار',
  disc: 'دیسک',
  discs: 'دیسک',
  disk: 'دیسک',
  disks: 'دیسک',
  pad: 'پد',
  pads: 'پد',
  mat: 'پد',
  tile: 'کاشی',
  tiles: 'کاشی',
  brick: 'آجر',
  bricks: 'آجر',
  slab: 'اسلب',
  slabs: 'اسلب',
  board: 'تخته',
  boards: 'تخته',
  plank: 'الوار',
  leaf: 'برگ',
  leaves: 'برگ',
  blade: 'تیغه',
  blades: 'تیغه',
  sleeve: 'غلاف',
  sleeves: 'غلاف',
  jacket: 'غلاف',
  element: 'المنت',
  elements: 'المنت',
  elem: 'المنت',
  core: 'رشته',
  cores: 'رشته',
  strand: 'رشته',
  strands: 'رشته',
  string: 'رشته',
  strings: 'رشته',
  pole: 'قطب',
  poles: 'قطب',
  pin: 'پین',
  pins: 'پین',
  port: 'پورت',
  ports: 'پورت',
  channel: 'کانال',
  channels: 'کانال',
  ch: 'کانال',
  point: 'نقطه',
  points: 'نقطه',
  link: 'لینک',
  links: 'لینک',
  tray: 'سینی',
  trays: 'سینی',
  head: 'هد',
  body: 'بدنه',
  shell: 'پوسته',
  shaft: 'شفت',
  plug: 'پلاگ',
  cone: 'مخروط',
  ream: 'بند',

  // Electrical / Power / Pressure / Engineering Units
  kw: 'کیلووات',
  mw: 'مگاوات',
  w: 'وات',
  watt: 'وات',
  kva: 'کیلوولت‌آمپر',
  mva: 'مگاولت‌آمپر',
  va: 'ولت‌آمپر',
  kv: 'کیلوولت',
  v: 'ولت',
  volt: 'ولت',
  volts: 'ولت',
  mv: 'میلی‌ولت',
  a: 'آمپر',
  ampere: 'آمپر',
  amperes: 'آمپر',
  ma: 'میلی‌آمپر',
  ah: 'آمپرساعت',
  kwh: 'کیلووات‌ساعت',
  mwh: 'مگاوات‌ساعت',
  hz: 'هرتز',
  khz: 'کیلوهرتز',
  mhz: 'مگاهرتز',
  ohm: 'اهم',
  kohm: 'کیلوهم',
  mohm: 'مگااهم',
  psi: 'پوند بر اینچ مربع',
  pa: 'پاسکال',
  kpa: 'کیلوپاسکال',
  mpa: 'مگاپاسکال',
  rpm: 'دور بر دقیقه',
  gpm: 'گالن بر دقیقه',
  cfm: 'فوت مکعب بر دقیقه',
  scfm: 'فوت مکعب استاندارد بر دقیقه',
  deg: 'درجه',
  pct: 'درصد',
  percent: 'درصد',
  ppm: 'پی‌پی‌ام',
  ppb: 'پی‌پی‌بی',

  // Time / Service / Documents
  hr: 'ساعت',
  hrs: 'ساعت',
  hour: 'ساعت',
  hours: 'ساعت',
  min: 'دقیقه',
  mins: 'دقیقه',
  day: 'روز',
  days: 'روز',
  wk: 'هفته',
  week: 'هفته',
  weeks: 'هفته',
  mo: 'ماه',
  month: 'ماه',
  months: 'ماه',
  yr: 'سال',
  year: 'سال',
  years: 'سال',
  ls: 'مقطوع',
  lumpsum: 'مقطوع',
  job: 'کار',
  srv: 'سرویس',
  service: 'سرویس',
  trip: 'سرویس حمل',
  load: 'بار',
  sample: 'نمونه',
  samples: 'نمونه',
  test: 'تست',
  tests: 'تست',
  copy: 'نسخه',
  copies: 'نسخه',
  book: 'جلد',
  books: 'جلد',
  vol: 'جلد',
  volume: 'جلد',
  doc: 'سند',
  docs: 'سند',
  dwg: 'نقشه',
  drawing: 'نقشه',
  manual: 'دفترچه',
  manuals: 'دفترچه',

  // Persian spacing/spelling variants
  'کیلو گرم': 'کیلوگرم',
  'متر مربع': 'مترمربع',
  'متر مکعب': 'مترمکعب',
  'سانتی متر': 'سانتی‌متر',
  'سانتی متر مربع': 'سانتی‌مترمربع',
  'سانتی متر مکعب': 'سانتی‌مترمکعب',
  'میلی متر': 'میلی‌متر',
  'میلی متر مربع': 'میلی‌مترمربع',
  'میلی مترمربع': 'میلی‌مترمربع',
  'میلی متر مکعب': 'میلی‌مترمکعب',
  'میلی لیتر': 'میلی‌لیتر',
  'میلی گرم': 'میلی‌گرم',
  'سی سی': 'سی‌سی',
  دستگاه: 'دستگاه',
  حلقه: 'حلقه',
  عددی: 'عدد',
  بلوک: 'بلوک',
  سلول: 'سلول',
};

const COUNTING_UNIT_FA_TO_EN: Record<string, string> = {
  عدد: 'PC',
  قطعه: 'PART',
  'قطعه یدکی': 'SPARE',
  دوجین: 'DOZ',
  قراص: 'GROSS',
  ست: 'SET',
  کیت: 'KIT',
  مجموعه: 'ASSY',
  گروه: 'GRP',
  سیستم: 'SYS',
  'ساب‌سیستم': 'SUBSYS',
  ماژول: 'MOD',
  پنل: 'PANEL',
  کابینت: 'CAB',
  رک: 'RACK',
  اسکید: 'SKID',
  فریم: 'FRAME',
  بانک: 'BANK',
  بی: 'BAY',
  استک: 'STACK',
  مرحله: 'STAGE',
  بخش: 'SEC',
  بلوک: 'BLOCK',
  سلول: 'CELL',
  دستگاه: 'UNIT',
  تجهیز: 'INST',
  ابزار: 'TOOL',
  متر: 'M',
  'متر طول': 'LM',
  'سانتی‌متر': 'CM',
  'میلی‌متر': 'MM',
  میکرومتر: 'µm',
  میکرون: 'MICRON',
  کیلومتر: 'KM',
  فوت: 'FT',
  'فوت طول': 'LF',
  اینچ: 'IN',
  یارد: 'YD',
  مایل: 'MI',
  شاخه: 'LEN',
  دهانه: 'SPAN',
  خط: 'LINE',
  مسیر: 'RUN',
  مترمربع: 'm²',
  'سانتی‌مترمربع': 'cm²',
  'میلی‌مترمربع': 'mm²',
  'فوت‌مربع': 'ft²',
  'اینچ‌مربع': 'in²',
  یاردمربع: 'yd²',
  هکتار: 'HA',
  مترمکعب: 'm³',
  'نرمال مترمکعب': 'Nm³',
  'استاندارد مترمکعب': 'Sm³',
  'سانتی‌مترمکعب': 'cm³',
  'سی‌سی': 'CC',
  'میلی‌مترمکعب': 'mm³',
  'فوت‌مکعب': 'ft³',
  'اینچ‌مکعب': 'in³',
  یاردمکعب: 'yd³',
  کیلوگرم: 'KG',
  گرم: 'G',
  'میلی‌گرم': 'MG',
  میکروگرم: 'µg',
  تن: 'TON',
  پوند: 'LB',
  اونس: 'OZ',
  لیتر: 'L',
  'میلی‌لیتر': 'ML',
  'سانتی‌لیتر': 'CL',
  'دسی‌لیتر': 'DL',
  کیلولیتر: 'KL',
  گالن: 'GAL',
  کوارت: 'QT',
  پینت: 'PT',
  بشکه: 'DRUM',
  قوطی: 'CAN',
  بطری: 'BTL',
  فلاسک: 'FLASK',
  شیشه: 'JAR',
  ویال: 'VIAL',
  آمپول: 'AMP',
  سرنگ: 'SYRINGE',
  تیوب: 'TUBE',
  کارتریج: 'CTG',
  کپسول: 'CAP',
  سطل: 'PAIL',
  سیلندر: 'CYL',
  مخزن: 'TANK',
  'مخزن IBC': 'IBC',
  اسپری: 'SPRAY',
  جفت: 'PAIR',
  جعبه: 'BOX',
  صندوق: 'CRATE',
  کانتینر: 'CNTR',
  بسته: 'PKG',
  ساشه: 'SACHET',
  کارتن: 'CTN',
  کیسه: 'BAG',
  عدل: 'BALE',
  رول: 'ROLL',
  کلاف: 'COIL',
  قرقره: 'REEL',
  حلقه: 'RING',
  ورق: 'SHEET',
  پالت: 'PLT',
  باندل: 'BDL',
  پارت: 'LOT',
  بچ: 'BATCH',
  نوار: 'STRIP',
  دیسک: 'DISC',
  پد: 'PAD',
  کاشی: 'TILE',
  آجر: 'BRICK',
  اسلب: 'SLAB',
  تخته: 'BOARD',
  الوار: 'PLANK',
  برگ: 'LEAF',
  تیغه: 'BLADE',
  غلاف: 'SLEEVE',
  المنت: 'ELEM',
  رشته: 'CORE',
  قطب: 'POLE',
  پین: 'PIN',
  پورت: 'PORT',
  کانال: 'CH',
  نقطه: 'PT',
  لینک: 'LINK',
  سینی: 'TRAY',
  هد: 'HEAD',
  بدنه: 'BODY',
  پوسته: 'SHELL',
  شفت: 'SHAFT',
  پلاگ: 'PLUG',
  مخروط: 'CONE',
  بند: 'REAM',
  کیلووات: 'KW',
  مگاوات: 'MW',
  وات: 'W',
  'کیلوولت‌آمپر': 'KVA',
  'مگاولت‌آمپر': 'MVA',
  'ولت‌آمپر': 'VA',
  کیلوولت: 'KV',
  ولت: 'V',
  'میلی‌ولت': 'MV',
  آمپر: 'A',
  'میلی‌آمپر': 'mA',
  آمپرساعت: 'Ah',
  'کیلووات‌ساعت': 'kWh',
  'مگاوات‌ساعت': 'MWh',
  هرتز: 'Hz',
  کیلوهرتز: 'kHz',
  مگاهرتز: 'MHz',
  اهم: 'Ω',
  کیلوهم: 'kΩ',
  مگااهم: 'MΩ',
  'پوند بر اینچ مربع': 'PSI',
  پاسکال: 'Pa',
  کیلوپاسکال: 'kPa',
  مگاپاسکال: 'MPa',
  'دور بر دقیقه': 'RPM',
  'گالن بر دقیقه': 'GPM',
  'فوت مکعب بر دقیقه': 'CFM',
  'فوت مکعب استاندارد بر دقیقه': 'SCFM',
  درجه: 'DEG',
  درصد: '%',
  'پی‌پی‌ام': 'PPM',
  'پی‌پی‌بی': 'PPB',
  ساعت: 'HR',
  دقیقه: 'MIN',
  روز: 'DAY',
  هفته: 'WK',
  ماه: 'MO',
  سال: 'YR',
  مقطوع: 'LS',
  کار: 'JOB',
  سرویس: 'SRV',
  'سرویس حمل': 'TRIP',
  بار: 'LOAD',
  نمونه: 'SAMPLE',
  تست: 'TEST',
  نسخه: 'COPY',
  جلد: 'VOL',
  سند: 'DOC',
  نقشه: 'DWG',
  دفترچه: 'MANUAL',
};

/**
 * Converts English/abbreviated counting units (PC, PCs, EA, M, MTR, SET, KG, L, BLOCK, CC, CELL, MM2, ...)
 * to their standard Persian warehouse unit names. Preserves already-Persian or unknown units.
 */
export function normalizeCountingUnitToFa(raw: string | undefined | null): string {
  const cleaned = normalizePersianChars(String(raw ?? ''));
  if (!cleaned || cleaned === '-' || cleaned === '—') return '';

  const exactKey = cleaned.toLowerCase().replace(/\.+$/, '').trim();
  if (COUNTING_UNIT_EN_TO_FA[exactKey]) {
    return COUNTING_UNIT_EN_TO_FA[exactKey];
  }

  // Try normalizing superscripts/powers/punctuation (e.g. "P.C.S", "SQ. M", "M^2", "M²", "MM²", "CM³", "m/m2")
  const compact = exactKey
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\^/g, '')
    .replace(/[.\s_-]+/g, '');
  if (COUNTING_UNIT_EN_TO_FA[compact]) {
    return COUNTING_UNIT_EN_TO_FA[compact];
  }

  // Try removing trailing "(s)" or "(es)" e.g. "PC(s)", "Box(es)", "Block(s)"
  const withoutParenS = exactKey.replace(/\((?:e?s)\)$/i, '').replace(/[.\s_-]+/g, '');
  if (COUNTING_UNIT_EN_TO_FA[withoutParenS]) {
    return COUNTING_UNIT_EN_TO_FA[withoutParenS];
  }

  // Handle compound slash units like "PC/SET" or "SET/BOX"
  if (cleaned.includes('/') && !cleaned.includes(' ')) {
    const parts = cleaned.split('/').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const p1 = COUNTING_UNIT_EN_TO_FA[parts[0].toLowerCase().replace(/²/g, '2').replace(/³/g, '3')];
      const p2 = COUNTING_UNIT_EN_TO_FA[parts[1].toLowerCase().replace(/²/g, '2').replace(/³/g, '3')];
      if (p1 && p2) return `${p1}/${p2}`;
    }
  }

  return cleaned;
}

/**
 * Formats a counting unit for display according to the active UI language.
 * - In Persian ('fa'): automatically renders English abbreviations in Persian.
 * - In English ('en'): keeps English tokens intact and maps stored Persian units to crisp English abbreviations.
 */
export function formatCountingUnit(raw: string | undefined | null, lang: Language): string {
  const cleaned = normalizePersianChars(String(raw ?? ''));
  if (!cleaned || cleaned === '-' || cleaned === '—') return '';
  if (lang === 'fa') {
    return normalizeCountingUnitToFa(cleaned);
  }
  if (COUNTING_UNIT_FA_TO_EN[cleaned]) {
    return COUNTING_UNIT_FA_TO_EN[cleaned];
  }
  const normalizedFa = normalizeCountingUnitToFa(cleaned);
  if (/[\u0600-\u06FF]/.test(cleaned) && COUNTING_UNIT_FA_TO_EN[normalizedFa]) {
    return COUNTING_UNIT_FA_TO_EN[normalizedFa];
  }
  return cleaned;
}

export interface InferredItemClassification {
  itemCategory: '' | 'special_tools' | 'chemicals' | 'spare_parts';
  chemicalType: string;
}

const CHEMICAL_TYPE_RULES: Array<{ pattern: RegExp; labelFa: string }> = [
  { pattern: /\b(turbine\s+oil|lube\s+oil|lubricating\s+oil|hydraulic\s+oil|gear\s+oil|transformer\s+oil|compressor\s+oil|insulating\s+oil|mineral\s+oil|synthetic\s+oil|iso\s*vg)\b|روغن\s*(?:توربین|هیدرولیک|ترانس|کمپرسور|صنعتی|موتور|گیربکس)/i, labelFa: 'روغن صنعتی / روان‌کار' },
  { pattern: /\b(grease|lubricant|anti[\s-]*seize|molykote|vaseline)\b|گریس|روان[\s‌]*کار/i, labelFa: 'گریس و روان‌کار' },
  { pattern: /\b(resin|epoxy|hardener|catalyst|polymer|curing\s+agent|grout|mortar)\b|رزین|اپوکسی|هاردنر|کاتالیست|گروت/i, labelFa: 'رزین و اپوکسی' },
  { pattern: /\b(paint|primer|enamel|coating|varnish|lacquer|thinner|zinc\s+rich|topcoat|undercoat)\b|رنگ\s*(?:صنعتی|اپوکسی|پلی|ضد\s*زنگ)|تینر|پرایمر|پوشش\s*ضد\s*خوردگی/i, labelFa: 'رنگ، پرایمر و تینر' },
  { pattern: /\b(adhesive|glue|sealant|silicone|loctite|threadlocker|cement|paste|compound|putty|mastic)\b|چسب|درزگیر|سیلیکون|خمیر\s*آب[\s‌]*بندی|لاکتایت/i, labelFa: 'چسب و درزگیر شیمیایی' },
  { pattern: /\b(acid|sulfuric|sulphuric|hydrochloric|nitric|phosphoric|citric|hcl|h2so4|alkali|caustic|naoh|sodium\s+hydroxide|ammonia|hydrazine|phosphate|trisodium)\b|اسید|قلیا|سود\s*سوزآور|آمونیاک|هیدرازین|فسفات/i, labelFa: 'اسید، باز و مواد تصفیه آب' },
  { pattern: /\b(solvent|degreaser|cleaner|detergent|acetone|alcohol|ethanol|methanol|isopropyl|xylene|toluene|naphtha|cleaner\s+spray|contact\s+cleaner|wd[\s-]*40)\b|حلال|چربی[\s‌]*زدا|شستشو\s*دهنده|الکل|استون|تولوئن|اسپری\s*تمیز/i, labelFa: 'حلال و پاک‌کننده صنعتی' },
  { pattern: /\b(inhibitor|biocide|flocculant|coagulant|antiscalant|anti[\s-]*scalant|scale\s+inhibitor|corrosion\s+inhibitor|oxygen\s+scavenger|defouler|antifoam|defoamer|coolant|antifreeze|glycol|ethylene\s+glycol)\b|ضد\s*خوردگی|ضد\s*رسوب|ضد\s*یخ|کولانت|گلیکول|بایوساید|فلوکولانت/i, labelFa: 'بازدارنده و افزودنی شیمیایی' },
  { pattern: /\b(sf6|nitrogen|argon|helium|oxygen|acetylene|co2|refrigerant|freon|r134a|r410a|r407c|r22|compressed\s+gas|calibration\s+gas|halon|fm200)\b|گاز\s*(?:صنعتی|کالیبراسیون|مبرد|آرگون|ازت|نیتروژن|استیلن|اکسیژن)|مبرد|فریون/i, labelFa: 'گاز صنعتی / مبرد' },
  { pattern: /\b(silica\s+gel|desiccant|activated\s+carbon|molecular\s+sieve|ion\s+exchange|electrolyte|battery\s+water|distilled\s+water|demineralized|reagent|buffer\s+solution|chemical|chemicals|msds|powder\s+extinguishing)\b|سیلیکاژل|رطوبت[\s‌]*گیر|کربن\s*فعال|الکترولیت|ماده\s*شیمیایی|مواد\s*شیمیایی|معرف\s*آزمایشگاهی/i, labelFa: 'ماده شیمیایی و مصرفی' },
];

const SPECIAL_TOOLS_PATTERN =
  /\b(special\s+tool|special\s+tools|tool\s*kit|toolkit|tool\s*box|tool\s*set|torque\s+wrench|hydraulic\s+wrench|impact\s+wrench|spanner|wrench|ratchet|socket\s+set|allen\s+key|hex\s+key|screwdriver|pliers|cutter|crimper|crimping\s+tool|stripper|puller|extractor|jacking\s+tool|hydraulic\s+jack|lifting\s+beam|lifting\s+lug|lifting\s+tackle|lifting\s+device|spreader\s+beam|chain\s+block|hoist|sling|shackle|eyebolt|alignment\s+tool|laser\s+alignment|feeler\s+gauge|micrometer|vernier|caliper|dial\s+indicator|multimeter|megger|clamp\s+meter|calibrator|oscilloscope|borescope|thermometer\s+gun|pyrometer|tachometer|stroboscope|test\s+bench|test\s+kit|testing\s+device|calibration\s+kit|maintenance\s+tool|erection\s+tool|commissioning\s+tool|assembly\s+tool|disassembly\s+tool|mounting\s+tool|dismounting\s+tool|overhaul\s+tool|grinder|drill\s+machine|welding\s+machine|hand\s+tool|power\s+tool|fixture|jig|mandrel|template\s+gauge|turnbuckle\s+tool|grease\s+gun|oil\s+pump\s+hand)\b|ابزار\s*(?:مخصوص|تخصصی|دقیق|نصب|تعمیر|تعمیرات|نگهداری|مونتاژ|دمونتاژ|اندازه[\s‌]*گیری|تست|کالیبراسیون|دستی|برقی|بادی|هیدرولیک)|آچار\s*(?:ترک|گشتاور|بکس|تخت|رینگ|آلن|مخصوص|هیدرولیک)|ترکمتر|جعبه\s*ابزار|ست\s*ابزار|کیت\s*ابزار|پولی[\s‌]*کش|بلبرینگ[\s‌]*کش|جک\s*هیدرولیک|جرثقیل\s*زنجیری|تیر\s*بلندکننده|قید\s*و\s*بند|میکرومتر|کولیس|ساعت\s*اندیکاتور|مولتی[\s‌]*متر|میگر|کالیبراتور|دستگاه\s*تست|تراز\s*لیزری/i;

const SPARE_PARTS_PATTERN =
  /\b(spare\s+part|spare\s+parts|spares|operational\s+spare|commissioning\s+spare|start[\s-]*up\s+spare|2[\s-]*year\s+spare|two[\s-]*year\s+spare|mandatory\s+spare|recommended\s+spare|capital\s+spare|strategic\s+spare|insurance\s+spare|consumable\s+spare|repair\s+kit|seal\s+kit|gasket\s+kit|o[\s-]*ring\s+kit|overhaul\s+kit|maintenance\s+kit|service\s+kit|rebuild\s+kit|replacement\s+part|replacement\s+kit|wear\s+part|wearing\s+part|backup\s+module|spare\s+module|spare\s+card|spare\s+fuse|spare\s+filter|spare\s+seal|spare\s+bearing|spare\s+coil|spare\s+lamp|spare\s+relay|spare\s+sensor|spare\s+valve|spare\s+gasket|spare\s+kit|for\s+2\s+years|2\s+years\s+operation|for\s+commissioning|start[\s-]*up\s+and\s+commissioning)\b|لوازم\s*یدکی|قطعات\s*یدکی|قطعه\s*یدکی|یدکی\s*(?:دوساله|دو\s*ساله|بهره[\s‌]*برداری|راه[\s‌]*اندازی|اضطراری|استراتژیک|تعمیراتی|مصرفی)|کیت\s*(?:تعمیر|تعمیرات|آب[\s‌]*بندی|سیل|اورینگ|گسکت|سرویس|اورهال|جایگزین)|پک\s*یدکی|رزرو\s*یدکی|قطعات\s*مصرفی\s*یدکی/i;

/**
 * Intelligently infers `itemCategory` ('chemicals' | 'special_tools' | 'spare_parts' | '')
 * and `chemicalType` (when chemical) from item description, notes, and generalDescription.
 * Designed to automatically fill "مشخصات تخصصی قلم" during CSV/Excel import, restore, and smart intake.
 */
export function inferItemClassification(
  description?: string | null,
  notes?: string | null,
  generalDescription?: string | null,
): InferredItemClassification {
  const combined = normalizePersianChars(
    [description || '', notes || '', generalDescription || ''].filter(Boolean).join(' '),
  );
  if (!combined) {
    return { itemCategory: '', chemicalType: '' };
  }

  // 1. Check explicit note/description override tags first (e.g., notes explicitly says "لوازم یدکی" or "ابزار مخصوص" or "مواد شیمیایی")
  const notesClean = normalizePersianChars(notes || '');
  if (notesClean) {
    if (/(?:^|\s)(?:مواد\s*شیمیایی|ماده\s*شیمیایی|chemical(?:s)?)(?:\s|$|[،,.;:-])/i.test(notesClean)) {
      const chemMatch = CHEMICAL_TYPE_RULES.find((r) => r.pattern.test(combined));
      return { itemCategory: 'chemicals', chemicalType: chemMatch?.labelFa || '' };
    }
    if (/(?:^|\s)(?:ابزار(?:های)?\s*مخصوص|special\s*tools?)(?:\s|$|[،,.;:-])/i.test(notesClean)) {
      return { itemCategory: 'special_tools', chemicalType: '' };
    }
    if (/(?:^|\s)(?:لوازم\s*یدکی|قطعات?\s*یدکی|spare\s*parts?|spares)(?:\s|$|[،,.;:-])/i.test(notesClean)) {
      return { itemCategory: 'spare_parts', chemicalType: '' };
    }
  }

  // 2. Spare parts check (e.g. "Spare Oil Filter", "2-Year Spare Parts", "Seal Kit for Pump")
  // Priority over chemicals when explicitly marked as spare/repair kit unless it's pure chemical liquid/resin
  const isExplicitSpare = SPARE_PARTS_PATTERN.test(combined);
  const isSpecialTool = SPECIAL_TOOLS_PATTERN.test(combined);
  const chemRule = CHEMICAL_TYPE_RULES.find((r) => r.pattern.test(combined));

  // Avoid false chemical hit on "Oil Filter", "Oil Pump", "Oil Cooler", "Oil Seal", "Gas Turbine", "Paint Brush", "Grease Nipple", "Acid Resistant"
  const isHardwareWithChemicalWord =
    /\b(oil\s+(?:filter|pump|cooler|heater|tank|seal|ring|gauge|level|switch|sensor|pipe|line|hose|strainer|separator|skimmer|mist|pan|sump|drain|nozzle|burner|valve)|grease\s+(?:nipple|fitting|gun|cup|trap|pipe|line)|gas\s+(?:turbine|valve|meter|detector|analyzer|sensor|filter|burner|pipe|line|cooler|compressor|hood|mask)|chemical\s+(?:pump|tank|dosing|injection|valve|hose|suit|gloves)|acid\s+(?:resistant|proof|pump|tank|valve)|paint\s+(?:brush|roller|gun|spray\s+gun|booth)|epoxy\s+(?:coated|lined|painted|insulated)|silicone\s+(?:cable|wire|hose|gasket|o[\s-]*ring|rubber|tube|sleeve)|resin\s+(?:bonded|impregnated|cast|transformer)|water\s+(?:pump|tank|valve|pipe|filter|cooler))\b|فیلتر\s*روغن|پمپ\s*(?:روغن|گاز|اسید|تزریق\s*مواد)|مبدل\s*روغن|مخزن\s*(?:روغن|گاز|اسید|مواد\s*شیمیایی)|شیر\s*(?:گاز|روغن)|توربین\s*گاز|کابل\s*سیلیکون|گسکت\s*سیلیکون|شیلنگ\s*سیلیکون|گریس[\s‌]*خور|قلم[\s‌]*مو/i.test(
      combined,
    );

  if (isSpecialTool) {
    return { itemCategory: 'special_tools', chemicalType: '' };
  }

  if (chemRule && !isHardwareWithChemicalWord) {
    return { itemCategory: 'chemicals', chemicalType: chemRule.labelFa };
  }

  if (isExplicitSpare) {
    return { itemCategory: 'spare_parts', chemicalType: '' };
  }

  return { itemCategory: '', chemicalType: '' };
}

/**
 * Normalizes any In-Transit overall status text to one of the 3 canonical statuses:
 * - 'در دست ارسال'
 * - 'در دست بازرسی'
 * - 'رسیده'
 *
 * If `allowedCustomStatuses` includes an exact normalized match for a user-added
 * custom category from Category Management, that custom category is preserved.
 */
export function normalizeTransitStatus(
  raw: string | undefined | null,
  allowedCustomStatuses?: string[],
): string {
  const cleaned = normalizePersianChars(String(raw ?? ''));
  if (!cleaned || cleaned === '-' || cleaned === '—') {
    return 'در دست ارسال';
  }

  // 1. Exact match against the 3 canonical statuses
  if (cleaned === 'رسیده') return 'رسیده';
  if (cleaned === 'در دست بازرسی') return 'در دست بازرسی';
  if (cleaned === 'در دست ارسال') return 'در دست ارسال';

  // 2. Preserve explicitly configured custom categories (excluding legacy 'پایان' which maps to 'رسیده')
  if (Array.isArray(allowedCustomStatuses) && allowedCustomStatuses.length > 0) {
    const lowerCleaned = cleaned.toLowerCase();
    for (const custom of allowedCustomStatuses) {
      const cNorm = normalizePersianChars(custom);
      if (!cNorm || cNorm === 'پایان') continue;
      if (cNorm.toLowerCase() === lowerCleaned) {
        return cNorm;
      }
    }
  }

  const lower = cleaned.toLowerCase();

  // 3. Map arrived / completed / finished synonyms -> 'رسیده'
  if (
    cleaned.includes('رسید') ||
    cleaned.includes('پایان') ||
    cleaned.includes('تکمیل') ||
    cleaned.includes('تحویل') ||
    cleaned.includes('ورود') ||
    cleaned.includes('وارد') ||
    cleaned.includes('انبار') ||
    cleaned.includes('تخلیه') ||
    cleaned.includes('بسته') ||
    lower.includes('arrived') ||
    lower.includes('deliver') ||
    lower.includes('done') ||
    lower.includes('finish') ||
    lower.includes('complet') ||
    lower.includes('receiv') ||
    lower.includes('closed')
  ) {
    return 'رسیده';
  }

  // 4. Map inspection synonyms -> 'در دست بازرسی'
  if (
    cleaned.includes('بازرس') ||
    cleaned.includes('ممیزی') ||
    cleaned.includes('کنترل') ||
    cleaned.includes('تست') ||
    cleaned.includes('آزمون') ||
    cleaned.includes('رلیز') ||
    lower.includes('inspect') ||
    lower.includes('qc') ||
    lower.includes('test') ||
    lower.includes('audit')
  ) {
    return 'در دست بازرسی';
  }

  // 5. Map dispatch / shipping / in-transit / fallback -> 'در دست ارسال'
  return 'در دست ارسال';
}

export function isTransitArrivedStatus(raw: string | undefined | null): boolean {
  return normalizeTransitStatus(raw) === 'رسیده';
}

export function getTransitStatusOptions(configured?: string[]): string[] {
  const result: string[] = [...DEFAULT_TRANSIT_STATUSES];
  if (Array.isArray(configured)) {
    for (const raw of configured) {
      const clean = normalizePersianChars(raw);
      if (!clean || clean === 'پایان' || result.includes(clean)) continue;
      result.push(clean);
    }
  }
  return result;
}
