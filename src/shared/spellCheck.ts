/**
 * Bilingual (Persian + English) offline spell-checking and orthography assistant
 * tailored for general text and industrial / power-plant warehouse terminology.
 */

export interface SpellIssue {
  id: string;
  word: string;
  start: number;
  end: number;
  lang: 'fa' | 'en';
  suggestions: string[];
  reason: 'spelling' | 'spacing';
}

const CUSTOM_DICT_KEY = 'samaan_custom_spell_dict_v1';

// Direct common Persian misspellings & half-space / orthography fixes
const FA_DIRECT_FIXES: Record<string, string[]> = {
  // Common orthography & half-space (نیم‌فاصله)
  'میباشد': ['می‌باشد'],
  'میشود': ['می‌شود'],
  'نمیشود': ['نمی‌شود'],
  'میکند': ['می‌کند'],
  'نمیکند': ['نمی‌کند'],
  'میکنند': ['می‌کنند'],
  'میکنم': ['می‌کنم'],
  'میکنید': ['می‌کنید'],
  'میگردد': ['می‌گردد'],
  'نمیگردد': ['نمی‌گردد'],
  'میدهد': ['می‌دهد'],
  'نمیدهد': ['نمی‌دهد'],
  'میگیرد': ['می‌گیرد'],
  'نمیگیرد': ['نمی‌گیرد'],
  'میتوان': ['می‌توان'],
  'نمیتوان': ['نمی‌توان'],
  'میتواند': ['می‌تواند'],
  'نمیتواند': ['نمی‌تواند'],
  'میبایست': ['می‌بایست'],
  'میآید': ['می‌آید'],
  'میرود': ['می‌رود'],
  'میرسد': ['می‌رسد'],
  'میبیند': ['می‌بیند'],
  'میسازد': ['می‌سازد'],
  'میگذارد': ['می‌گذارد'],
  'میبرد': ['می‌برد'],
  'میخواست': ['می‌خواست'],
  'میخواهد': ['می‌خواهد'],
  'نمیخواهد': ['نمی‌خواهد'],
  'بستهبندی': ['بسته‌بندی'],
  'آسیبدیده': ['آسیب‌دیده'],
  'اسیبدیده': ['آسیب‌دیده'],
  'اسیب': ['آسیب'],
  'آسیب‌دیدگ': ['آسیب‌دیدگی'],
  'جایگزینشده': ['جایگزین‌شده'],
  'تحویلگیرنده': ['تحویل‌گیرنده'],
  'تامینکننده': ['تامین‌کننده', 'تأمین‌کننده'],
  'تأمینکننده': ['تأمین‌کننده'],
  'درخواستکننده': ['درخواست‌کننده'],
  'ثبتشده': ['ثبت‌شده'],
  'حذفشده': ['حذف‌شده'],
  'بستهشده': ['بسته‌شده'],
  'انتخابشده': ['انتخاب‌شده'],
  'جبرانشده': ['جبران‌شده'],
  'پشتیبانگیری': ['پشتیبان‌گیری'],
  'انبارگردانی': ['انبارگردانی'],
  'صورتجلسه': ['صورتجلسه'],
  'صورت‌جلسه': ['صورتجلسه'],
  // Frequent Persian typos in general & warehouse writing
  'تجهزات': ['تجهیزات'],
  'تحهیزات': ['تجهیزات'],
  'تجیهزات': ['تجهیزات'],
  'تجهیرات': ['تجهیزات'],
  'پکنگ': ['پکینگ'],
  'پیکنگ': ['پکینگ'],
  'پکینک': ['پکینگ'],
  'لیتس': ['لیست'],
  'لسیت': ['لیست'],
  'انباردرای': ['انبارداری'],
  'انباردای': ['انبارداری'],
  'انبا': ['انبار'],
  'مغایر': ['مغایرت'],
  'مغایت': ['مغایرت'],
  'مغایررت': ['مغایرت'],
  'کسزی': ['کسری'],
  'کسر': ['کسری'],
  'اضاقی': ['اضافی'],
  'اضاف': ['اضافی'],
  'شیمیای': ['شیمیایی'],
  'شیمیائی': ['شیمیایی'],
  'شیمیاایی': ['شیمیایی'],
  'انقظا': ['انقضا', 'انقضاء'],
  'انقضاع': ['انقضا', 'انقضاء'],
  'گزاراش': ['گزارش'],
  'گرازش': ['گزارش'],
  'گزارشات': ['گزارش‌ها'],
  'توضحات': ['توضیحات'],
  'توضیجات': ['توضیحات'],
  'توظیحات': ['توضیحات'],
  'درخاست': ['درخواست'],
  'درخواس': ['درخواست'],
  'برسی': ['بررسی'],
  'برررسی': ['بررسی'],
  'بزرسی': ['بازرسی'],
  'بازسی': ['بازرسی'],
  'تائید': ['تأیید', 'تایید'],
  'تایئد': ['تأیید', 'تایید'],
  'تاید': ['تایید', 'تأیید'],
  'تحول': ['تحویل'],
  'تحویا': ['تحویل'],
  'موجوی': ['موجودی'],
  'موجدی': ['موجودی'],
  'پیمانکر': ['پیمانکار'],
  'پیماکار': ['پیمانکار'],
  'کارفرم': ['کارفرما'],
  'بارنمه': ['بارنامه'],
  'بارناهم': ['بارنامه'],
  'باسکل': ['باسکول'],
  'کرای': ['کرایه'],
  'خسار': ['خسارت'],
  'جایگزن': ['جایگزین'],
  'حایگزین': ['جایگزین'],
  'نگهل': ['نگله'],
  'محملوه': ['محموله'],
  'محمول': ['محموله'],
  'شمار': ['شماره'],
  'شمراه': ['شماره'],
  'تارخ': ['تاریخ'],
  'تاریح': ['تاریخ'],
  'تامیین': ['تامین', 'تأمین'],
  'تامن': ['تامین', 'تأمین'],
  'تعمرات': ['تعمیرات'],
  'نگهدای': ['نگهداری'],
  'نگهدرای': ['نگهداری'],
  'اطلاعت': ['اطلاعات'],
  'اطلعات': ['اطلاعات'],
  'مسول': ['مسئول', 'مسؤول'],
  'مسیول': ['مسئول'],
  'موسسه': ['مؤسسه'],
  'هیت': ['هیئت'],
  'هیأت': ['هیئت'],
  'صنعتی': ['صنعتی'],
  'نیروگای': ['نیروگاهی'],
  'نیروگاعی': ['نیروگاهی'],
  'توربن': ['توربین'],
  'ژنراتو': ['ژنراتور'],
  'بویل': ['بویلر'],
  'ترانسفورماتو': ['ترانسفورماتور'],
  'کمپرسو': ['کمپرسور'],
  'پمب': ['پمپ'],
  'شیرالات': ['شیرآلات'],
  'اتصلات': ['اتصالات'],
  'ابزارالات': ['ابزارآلات'],
  'مخصو': ['مخصوص'],
  'یدک': ['یدکی'],
  'لوازم': ['لوازم'],
  'لوزام': ['لوازم'],
  'قظعات': ['قطعات'],
  'قطعت': ['قطعات'],
  'قظعه': ['قطعه'],
  'کال': ['کالا'],
  'سیست': ['سیستم'],
  'سیتم': ['سیستم'],
  'جزیر': ['جزیره'],
  'وحد': ['واحد'],
  'مقادر': ['مقدار'],
  'مقدرا': ['مقدار'],
  'تعدا': ['تعداد'],
  'تعااد': ['تعداد'],
  'واقع': ['واقعی'],
  'بزودی': ['به‌زودی'],
  'بخصوص': ['به‌خصوص'],
  'بطور': ['به‌طور'],
  'بعنوان': ['به‌عنوان'],
  'بهمراه': ['به‌همراه'],
  'بصورت': ['به‌صورت'],
  'بمنظور': ['به‌منظور'],
  'بعلت': ['به‌علت'],
  'بشکل': ['به‌شکل'],
  'لطفا': ['لطفاً'],
  'حتما': ['حتماً'],
  'تقریبا': ['تقریباً'],
  'معمولا': ['معمولاً'],
  'کاملا': ['کاملاً'],
  'فعلا': ['فعلاً'],
  'قبلا': ['قبلاً'],
  'بعدا': ['بعداً'],
  'مثلا': ['مثلاً'],
  'اصلا': ['اصلاً'],
  'دقیقا': ['دقیقاً'],
  'مستقیما': ['مستقیماً'],
  'مجددا': ['مجدداً'],
  'ضمنا': ['ضمناً'],
  'نهایتا': ['نهایتاً'],
  'احتمالا': ['احتمالاً'],
  'قطعا': ['قطعاً'],
  'مخصوصا': ['مخصوصاً'],
  'عموما': ['عموماً'],
  'اساسا': ['اساساً'],
  'صرفا': ['صرفاً'],
  'الزاما': ['الزاماً'],
};

// Direct common English misspellings (general + industrial/warehouse)
const EN_DIRECT_FIXES: Record<string, string[]> = {
  equipemnt: ['equipment'],
  equpment: ['equipment'],
  equiptment: ['equipment'],
  equiment: ['equipment'],
  packng: ['packing'],
  pakcing: ['packing'],
  pakage: ['package'],
  packge: ['package'],
  shipemnt: ['shipment'],
  shipmnet: ['shipment'],
  suplier: ['supplier'],
  suppler: ['supplier'],
  suppiler: ['supplier'],
  warehose: ['warehouse'],
  warhouse: ['warehouse'],
  warehosue: ['warehouse'],
  invnetory: ['inventory'],
  inventroy: ['inventory'],
  inventry: ['inventory'],
  shoratge: ['shortage'],
  shortge: ['shortage'],
  surpluss: ['surplus'],
  damged: ['damaged'],
  dammaged: ['damaged'],
  damge: ['damage'],
  discrepency: ['discrepancy'],
  discrepnacy: ['discrepancy'],
  inspeciton: ['inspection'],
  insepction: ['inspection'],
  inspction: ['inspection'],
  maintenace: ['maintenance'],
  maintainance: ['maintenance'],
  maintanance: ['maintenance'],
  reciept: ['receipt'],
  recipt: ['receipt'],
  recieve: ['receive'],
  recieved: ['received'],
  reciever: ['receiver'],
  temprature: ['temperature'],
  tempature: ['temperature'],
  presure: ['pressure'],
  pressue: ['pressure'],
  hydralic: ['hydraulic'],
  hydrualic: ['hydraulic'],
  pnumatic: ['pneumatic'],
  pnuematic: ['pneumatic'],
  lubrcant: ['lubricant'],
  lubircant: ['lubricant'],
  cheimcal: ['chemical'],
  chemcial: ['chemical'],
  chemcals: ['chemicals'],
  calibraton: ['calibration'],
  calbration: ['calibration'],
  turbne: ['turbine'],
  turbin: ['turbine'],
  genrator: ['generator'],
  generater: ['generator'],
  transfromer: ['transformer'],
  tranformer: ['transformer'],
  comresor: ['compressor'],
  compresor: ['compressor'],
  condensor: ['condenser'],
  valv: ['valve'],
  valvs: ['valves'],
  gaskt: ['gasket'],
  gaskts: ['gaskets'],
  flang: ['flange'],
  flangs: ['flanges'],
  bering: ['bearing'],
  baering: ['bearing'],
  cabel: ['cable'],
  cabels: ['cables'],
  filtr: ['filter'],
  fliter: ['filter'],
  actuater: ['actuator'],
  senser: ['sensor'],
  transmiter: ['transmitter'],
  thermocople: ['thermocouple'],
  stainles: ['stainless'],
  stianless: ['stainless'],
  aluminuim: ['aluminum', 'aluminium'],
  insulaton: ['insulation'],
  swtichgear: ['switchgear'],
  swichgear: ['switchgear'],
  breker: ['breaker'],
  controllr: ['controller'],
  moniter: ['monitor'],
  guage: ['gauge'],
  gague: ['gauge'],
  nozel: ['nozzle'],
  nozle: ['nozzle'],
  impeler: ['impeller'],
  couplng: ['coupling'],
  manfold: ['manifold'],
  fastner: ['fastener'],
  braket: ['bracket'],
  conatiner: ['container'],
  contianer: ['container'],
  palet: ['pallet'],
  woodn: ['wooden'],
  weigth: ['weight'],
  wieght: ['weight'],
  lenght: ['length'],
  widht: ['width'],
  heigth: ['height'],
  hieght: ['height'],
  dimesion: ['dimension'],
  dimesions: ['dimensions'],
  quantiy: ['quantity'],
  qunatity: ['quantity'],
  quantty: ['quantity'],
  descripton: ['description'],
  descrption: ['description'],
  desciption: ['description'],
  cateogry: ['category'],
  catagory: ['category'],
  materail: ['material'],
  matrial: ['material'],
  balnce: ['balance'],
  substituion: ['substitution'],
  substition: ['substitution'],
  reqisition: ['requisition'],
  requistion: ['requisition'],
  contracter: ['contractor'],
  contractr: ['contractor'],
  emplopyer: ['employer'],
  delivry: ['delivery'],
  delievery: ['delivery'],
  arrvial: ['arrival'],
  arival: ['arrival'],
  locaton: ['location'],
  loaction: ['location'],
  storge: ['storage'],
  storag: ['storage'],
  expiraton: ['expiration'],
  expriation: ['expiration'],
  prodction: ['production'],
  produciton: ['production'],
  docuemnt: ['document'],
  documnet: ['document'],
  certifcate: ['certificate'],
  certficate: ['certificate'],
  complian: ['compliant'],
  comliant: ['compliant'],
  teh: ['the'],
  hte: ['the'],
  adn: ['and'],
  taht: ['that'],
  wiht: ['with'],
  fro: ['for'],
  form: ['from'],
  seperate: ['separate'],
  seperated: ['separated'],
  occured: ['occurred'],
  occuring: ['occurring'],
  untill: ['until'],
  definately: ['definitely'],
  accomodate: ['accommodate'],
  adress: ['address'],
  calender: ['calendar'],
  commitee: ['committee'],
  enviroment: ['environment'],
  goverment: ['government'],
  independant: ['independent'],
  necesary: ['necessary'],
  neccessary: ['necessary'],
  ocassion: ['occasion'],
  persistant: ['persistent'],
  refered: ['referred'],
  succesful: ['successful'],
  sucessful: ['successful'],
  tommorow: ['tomorrow'],
  writting: ['writing'],
  availabe: ['available'],
  avaliable: ['available'],
  immediatly: ['immediately'],
  completly: ['completely'],
  differnt: ['different'],
  aproved: ['approved'],
  aprove: ['approve'],
  requierd: ['required'],
  requried: ['required'],
  standrad: ['standard'],
  stnadard: ['standard'],
  specail: ['special'],
  spares: ['spare'],
  repalce: ['replace'],
  repalced: ['replaced'],
  replcement: ['replacement'],
  includng: ['including'],
  inlcuding: ['including'],
  pendng: ['pending'],
  comleted: ['completed'],
  completd: ['completed'],
  verifed: ['verified'],
  cheked: ['checked'],
  chekc: ['check'],
  transprot: ['transport'],
  trasport: ['transport'],
  shiping: ['shipping'],
  shippment: ['shipment'],
  waybil: ['waybill'],
  invocie: ['invoice'],
  invoce: ['invoice'],
  proejct: ['project'],
  porject: ['project'],
  sytem: ['system'],
  systme: ['system'],
  subsytem: ['subsystem'],
  islnad: ['island'],
  comissioning: ['commissioning'],
  commisioning: ['commissioning'],
  instalation: ['installation'],
  installaton: ['installation'],
  operaton: ['operation'],
  opertion: ['operation'],
  electrcial: ['electrical'],
  electical: ['electrical'],
  mechancial: ['mechanical'],
  mechnical: ['mechanical'],
  instrumetation: ['instrumentation'],
  instrumentaton: ['instrumentation'],
  protecton: ['protection'],
  saftey: ['safety'],
  satefy: ['safety'],
  emergncy: ['emergency'],
  warnng: ['warning'],
  critcal: ['critical'],
  priorty: ['priority'],
  stauts: ['status'],
  remakrs: ['remarks'],
  remraks: ['remarks'],
  coments: ['comments'],
  attachement: ['attachment'],
  attchment: ['attachment'],
};

// Core Persian dictionary (general + industrial/power plant/warehouse)
const FA_DICTIONARY_WORDS = `
از در به با برای تا بر روی زیر پیش پس بین میان بدون جهت درباره هنگام ضمن توسط طبق براساس
که این آن اینها آنها همه تمام هر هیچ برخی بعضی چند دیگر سایر خود خویش ما شما ایشان او من تو
است هست بود شد شده شدن شود شوند باشد باشند دارد دارند داشت داشته نیست نبود نشد نشده
می‌باشد می‌شود نمی‌شود می‌کند نمی‌کند می‌کنند می‌کنم می‌کنید می‌گردد نمی‌گردد می‌دهد نمی‌دهد می‌گیرد نمی‌گیرد
می‌توان نمی‌توان می‌تواند نمی‌تواند می‌بایست می‌آید می‌رود می‌رسد می‌بیند می‌سازد می‌گذارد می‌برد می‌خواهد نمی‌خواهد
باید نباید شاید بایدها نبایدها اگر اما ولی بلکه یا همچنین نیز هم حتی فقط تنها هنوز اکنون حالا
همیشه هرگز بسیار خیلی کم زیاد بیشتر کمتر بیشترین کمترین بهتر بهترین بدتر جدید قدیم اول دوم سوم چهارم پنجم
بزرگ کوچک بلند کوتاه سنگین سبک سریع کند سالم خراب کامل ناقص آماده باز بسته فعال غیرفعال تایید تأیید رد
سامانه سیستم ساب‌سیستم جزیره واحد پروژه نیروگاه نیروگاهی انبار انباردار انبارداری انبارگردانی انبارش
پکینگ لیست نگله بسته بسته‌بندی محموله ردیف آیتم شماره کد کالا شرح کلی دقیق سایز ابعاد طول عرض ارتفاع
وزن خالص ناخالص باسکول تن کیلوگرم گرم متر سانتی‌متر میلی‌متر لیتر سی‌سی عدد جفت دست ست حلقه کلاف رول
ورق شاخه شلنگ لوله کابل سیم پیچ مهره واشر فلنج گسکت واشرآب‌بندی بلبرینگ رولبرینگ یاتاقان کوپلینگ شفت
پمپ الکتروموتور موتور توربین بویلر ژنراتور ترانسفورماتور کمپرسور کندانسور مبدل حرارتی دیگ بخار برج خنک‌کننده
شیر شیرآلات اکچویتور عملگر سنسور ترانسمیتر ترموکوپل گیج فشارسنج دماسنج فلومتر مانومتر کنترلر تابلو برق
کلید فیوز رله کنتاکتور اینورتر یکسوساز باتری شارژر چراغ روشنایی داکت سینی کابل گلند ترمینال کلکتور منیفولد
فیلتر کارتریج صافی نازل پروانه روتور استاتور بوشینگ پین خار فنر زنجیر تسمه قرقره جرثقیل بالابر لیفتراک
ماده مواد شیمیایی روغن گریس روانکار حلال رنگ پرایمر اپوکسی رزین چسب درزگیر سیلیکون ضدزنگ ضدیخ اسید باز
آهک کلر کاتالیست بازدارنده رسوب‌زدا شوینده تمیزکننده گاز نیتروژن آرگون اکسیژن هیدروژن دی‌اکسیدکربن
ابزار ابزارآلات مخصوص تخصصی آچار بکس انبردست پیچ‌گوشتی متر تراز کولیس میکرومتر مولتی‌متر کالیبراتور گشتاورسنج
لوازم یدکی قطعه قطعات مصرفی استاندارد اصلی فرعی یدک کیت تعمیر تعمیرات نگهداری بهره‌برداری راه‌اندازی نصب اجرا
تامین تأمین تامین‌کننده تأمین‌کننده فروشنده سازنده تولیدکننده کارخانه شرکت پیمانکار کارفرما مشاور ناظر بازرس
ارسال محل مبدا مبدأ مقصد حمل حمل‌ونقل بارنامه خودرو کامیون تریلی پلاک راننده کرایه مبلغ ریال تومان
ورود خروج تحویل تحویل‌گیرنده درخواست حواله رسید برگشت ارجاع مرجوعی مصرف مستقیم بالانس موازنه برآورد
صورتجلسه دعوتنامه گشایش بازرسی بررسی کنترل کیفیت فنی مهندسی دفتر کارگاه سایت محوطه سوله فضای باز مسقف
مقدار تعداد واقعی کسری اضافی آسیب آسیب‌دیده خسارت مغایرت جایگزین جایگزین‌شده جایگزینی جبران تکمیل
موجودی باقیمانده مانده کل جمع مجموع میانگین درصد تاریخ زمان سال ماه روز ساعت امروز دیروز فردا تولید انقضا انقضاء
وضعیت در دست ارسال رسیده منتظر انجام تکمیل‌شده بازگشایی بسته‌شده ثبت ویرایش حذف بازیابی سطل بازیافت
جستجو فیلتر مرتب‌سازی چاپ گزارش خروجی اکسل فایل پشتیبان پشتیبان‌گیری بازیابی کاربر کاربران مدیر اپراتور
توضیحات یادداشت ملاحظات پیوست تصویر سند مدرک گواهینامه استاندارد مشخصات فنی نقشه برچسب
به‌زودی به‌خصوص به‌طور به‌عنوان به‌همراه به‌صورت به‌منظور به‌علت به‌شکل
لطفاً حتماً تقریباً معمولاً کاملاً فعلاً قبلاً بعداً مثلاً اصلاً دقیقاً مستقیماً مجدداً ضمناً نهایتاً احتمالاً قطعاً مخصوصاً عموماً اساساً صرفاً الزاماً
اطلاعات مسئول مسؤول مؤسسه هیئت تغییر تغییرات اصلاح بررسی‌شده تاییدشده تأییدشده معتبر نامعتبر صحیح غلط خطا هشدار
بلوک سلول میلی‌مترمربع سانتی‌مترمربع مترمربع مترمکعب کارتن جعبه پالت بشکه گالن قوطی بطری تیوب اسپری کیسه گونی سطل شیشه ویال آمپول
توزیع انتقال تخلیه بارگیری چیدمان قفسه راهرو طبقه ردیف‌گذاری شماره‌گذاری کدگذاری برچسب‌گذاری
سلامت ایمنی محیط زیست آتش‌نشانی حفاظتی عایق عایق‌بندی ضدآب ضدحریق مقاوم فولاد استیل کربن مس آلومینیوم برنج پلاستیک لاستیک
فشار دما جریان ولتاژ توان فرکانس دور سرعت ظرفیت حجم سطح مقطع ضخامت قطر شعاع زاویه
پاسخ سوال سؤال راهنما دستیار هوشمند تحلیل خلاصه جزئیات کلیات دسته‌بندی گروه زیرگروه
`.trim().split(/\s+/);

// Core English dictionary (general + industrial/power plant/warehouse)
const EN_DICTIONARY_WORDS = `
the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us
is are was were been being am has had having does did done doing may might must shall should could would can cannot
warehouse inventory equipment packing package packages list shipment shipments supplier suppliers vendor origin dispatch location site plant power turbine generator boiler transformer compressor condenser exchanger cooling tower pump motor engine
valve valves actuator actuators sensor sensors transmitter transmitters thermocouple gauge gauges meter meters monitor controller inverter rectifier battery charger cabinet enclosure panel module breaker switchgear relay fuse contactor terminal gland conduit tray cable cables wire wires
flange flanges gasket gaskets bolt bolts nut nuts stud studs screw screws washer washers fastener fasteners clamp clamps bracket brackets support hanger elbow tee reducer nipple union coupling coupler shaft sleeve bushing bearing bearings seal seals ring rings spring pin chain belt pulley crane hoist forklift
pipe pipes piping tube tubes hose hoses fitting fittings manifold nozzle orifice strainer filter filters cartridge cartridges impeller rotor stator casing housing frame cover plate sheet bar rod beam channel angle steel stainless carbon alloy copper brass aluminum plastic rubber insulation thermal acoustic
chemical chemicals oil grease lubricant lubricants solvent paint primer epoxy resin adhesive sealant silicone rust anticorrosive antifreeze acid alkali lime chlorine catalyst inhibitor descaler cleaner detergent gas nitrogen argon oxygen hydrogen
tool tools special wrench spanner socket plier screwdriver hammer caliper micrometer multimeter calibrator torque puller extractor kit set spare spares part parts component components assembly subassembly consumable consumables standard main auxiliary
item items row rows number code description general detailed size dimensions length width height diameter thickness capacity volume area weight gross net weighbridge ton tons kilogram gram liter litre meter metre centimeter millimeter block cell pair roll coil sheet drum gallon barrel can bottle tube spray bag sack bucket box crate pallet container bundle
quantity qty actual packed packing shortage surplus damaged damage discrepancy mismatch missing extra broken defective compliant noncompliant approved rejected pending open closed completed verified checked inspected
arrival arrived transit shipping inspection request release note notice minutes invitation opening direct consumption receipt requisition issue return substitution replacement balance control estimation stocktake periodic audit label tag storage rack shelf aisle bay outdoor indoor covered
project contract employer client contractor subcontractor consultant supervisor inspector engineer storekeeper operator admin viewer user account role permission
date time year month day today production manufacture manufacturing expiry expiration expired remaining active inactive normal critical high medium low priority status remark remarks note notes comment comments summary report export import backup restore delete deleted trash recycle bin search filter sort select print view edit update create add remove clear cancel confirm save close
freight cost amount price total sum average count unique linked related attached document file certificate drawing specification manual procedure safety quality health environment emergency warning error alert notice message help assistant analysis
separate separated occurred occurring until definitely accommodate address calendar committee environment government independent necessary occasion persistent referred successful tomorrow writing available immediately completely different approve required replace replaced replacement including check transport waybill invoice system subsystem island unit commissioning installation operation maintenance repair electrical mechanical instrumentation civil structural protection
`.trim().split(/\s+/);

const FA_DICT_SET = new Set<string>(FA_DICTIONARY_WORDS.map(normalizeFaWord));
const EN_DICT_SET = new Set<string>(EN_DICTIONARY_WORDS.map((w) => w.toLowerCase()));

// Ensure all targets of direct fixes are also recognized as valid dictionary words
for (const targets of Object.values(FA_DIRECT_FIXES)) {
  for (const t of targets) FA_DICT_SET.add(normalizeFaWord(t));
}
for (const targets of Object.values(EN_DIRECT_FIXES)) {
  for (const t of targets) EN_DICT_SET.add(t.toLowerCase());
}

const FA_WORD_LIST = Array.from(FA_DICT_SET);
const EN_WORD_LIST = Array.from(EN_DICT_SET);

// Index words by length for fast Damerau-Levenshtein lookup
const FA_BY_LEN = new Map<number, string[]>();
for (const w of FA_WORD_LIST) {
  const arr = FA_BY_LEN.get(w.length) || [];
  arr.push(w);
  FA_BY_LEN.set(w.length, arr);
}

const EN_BY_LEN = new Map<number, string[]>();
for (const w of EN_WORD_LIST) {
  const arr = EN_BY_LEN.get(w.length) || [];
  arr.push(w);
  EN_BY_LEN.set(w.length, arr);
}

export function normalizeFaWord(raw: string): string {
  return (raw || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u0652\u0670]/g, '') // strip Arabic diacritics except tanvin on explicit forms
    .trim();
}

export function loadCustomDictionary(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(CUSTOM_DICT_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((w) => String(w).trim().toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export function addWordToCustomDictionary(word: string): Set<string> {
  const clean = word.trim();
  const current = loadCustomDictionary();
  if (!clean) return current;
  current.add(clean.toLowerCase());
  current.add(normalizeFaWord(clean));
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(CUSTOM_DICT_KEY, JSON.stringify(Array.from(current)));
    } catch {
      // Ignore storage errors
    }
  }
  return current;
}

/**
 * Optimal string alignment (Damerau-Levenshtein) distance with early exit threshold.
 */
function damerauLevenshtein(a: string, b: string, maxDist = 2): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > maxDist) return maxDist + 1;
  if (a === b) return 0;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[m][n];
}

function matchCase(source: string, suggestion: string): string {
  if (!source || !suggestion) return suggestion;
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    return suggestion.toUpperCase();
  }
  if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase()) {
    return suggestion[0].toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

function isKnownEnglishWord(lower: string, customDict: Set<string>): boolean {
  if (EN_DICT_SET.has(lower) || customDict.has(lower)) return true;
  // Regular plural / verb / adverb inflections
  const stems: string[] = [];
  if (lower.endsWith('ies') && lower.length > 4) stems.push(`${lower.slice(0, -3)}y`);
  if (lower.endsWith('es') && lower.length > 3) stems.push(lower.slice(0, -2));
  if (lower.endsWith('s') && lower.length > 3) stems.push(lower.slice(0, -1));
  if (lower.endsWith('ied') && lower.length > 4) stems.push(`${lower.slice(0, -3)}y`);
  if (lower.endsWith('ed') && lower.length > 4) {
    stems.push(lower.slice(0, -2), lower.slice(0, -1));
  }
  if (lower.endsWith('ing') && lower.length > 5) {
    stems.push(lower.slice(0, -3), `${lower.slice(0, -3)}e`);
  }
  if (lower.endsWith('ly') && lower.length > 4) stems.push(lower.slice(0, -2));
  return stems.some((s) => EN_DICT_SET.has(s) || customDict.has(s));
}

function isKnownPersianWord(norm: string, customDict: Set<string>): boolean {
  if (FA_DICT_SET.has(norm) || customDict.has(norm)) return true;
  // Common Persian suffixes (plural, comparative, possessive, indefinite)
  const suffixes = ['های', 'ها', '‌تر', '‌ترین', 'تر', 'ترین', 'ام', 'ات', 'اش', 'ای', 'یی', 'ی', 'ان', 'گان'];
  for (const suf of suffixes) {
    if (norm.length > suf.length + 2 && norm.endsWith(suf)) {
      const base = norm.slice(0, -suf.length).replace(/\u200c$/, '');
      if (FA_DICT_SET.has(base) || customDict.has(base)) return true;
    }
  }
  return false;
}

function findFuzzySuggestions(
  word: string,
  byLen: Map<number, string[]>,
  maxDist: number,
  maxSuggestions = 4,
): string[] {
  const candidates: Array<{ word: string; dist: number }> = [];
  const len = word.length;
  for (let l = Math.max(2, len - maxDist); l <= len + maxDist; l += 1) {
    const bucket = byLen.get(l);
    if (!bucket) continue;
    for (let i = 0; i < bucket.length; i += 1) {
      const cand = bucket[i];
      if (cand === word) continue;
      // Fast first-char filter for longer words when dist === 1 isn't likely
      const dist = damerauLevenshtein(word, cand, maxDist);
      if (dist <= maxDist) {
        candidates.push({ word: cand, dist });
      }
    }
  }
  candidates.sort((a, b) => a.dist - b.dist || Math.abs(a.word.length - len) - Math.abs(b.word.length - len));
  return candidates.slice(0, maxSuggestions).map((c) => c.word);
}

/**
 * Checks a Persian, English, or mixed text string and returns actionable spelling /
 * half-space issues without flagging technical codes, serials, numbers, or acronyms.
 */
export function checkTextSpelling(
  text: string,
  customDict: Set<string> = loadCustomDictionary(),
): SpellIssue[] {
  if (!text || text.trim().length < 2) return [];
  const issues: SpellIssue[] = [];
  const seenSpan = new Set<string>();

  // Pass 1: Persian two-word half-space patterns ("می شود", "بسته بندی", "آسیب دیده", "تامین کننده")
  const faTwoWordPatterns: Array<{ re: RegExp; replacement: string }> = [
    { re: /(^|[\s،؛.(])(می)\s+(باشد|شود|شوند|کند|کنند|کنم|کنید|گردد|دهد|گیرد|توان|تواند|بایست|آید|رود|رسد|خواهد)/g, replacement: 'می‌$3' },
    { re: /(^|[\s،؛.(])(نمی)\s+(باشد|شود|شوند|کند|کنند|گردد|دهد|گیرد|توان|تواند|خواهد)/g, replacement: 'نمی‌$3' },
    { re: /(^|[\s،؛.(])(بسته)\s+(بندی)/g, replacement: 'بسته‌بندی' },
    { re: /(^|[\s،؛.(])(آسیب)\s+(دیده|دیدگی)/g, replacement: 'آسیب‌$3' },
    { re: /(^|[\s،؛.(])(تامین|تأمین)\s+(کننده)/g, replacement: '$2‌کننده' },
    { re: /(^|[\s،؛.(])(تحویل)\s+(گیرنده)/g, replacement: 'تحویل‌گیرنده' },
    { re: /(^|[\s،؛.(])(جایگزین)\s+(شده)/g, replacement: 'جایگزین‌شده' },
    { re: /(^|[\s،؛.(])(پشتیبان)\s+(گیری)/g, replacement: 'پشتیبان‌گیری' },
  ];

  for (const pat of faTwoWordPatterns) {
    let m: RegExpExecArray | null = pat.re.exec(text);
    while (m) {
      const prefixLen = m[1].length;
      const start = m.index + prefixLen;
      const matchedPhrase = m[0].slice(prefixLen);
      const end = start + matchedPhrase.length;
      const suggestion = pat.replacement
        .replace('$2', m[2] || '')
        .replace('$3', m[3] || '');
      const spanKey = `${start}:${end}`;
      if (!seenSpan.has(spanKey)) {
        seenSpan.add(spanKey);
        issues.push({
          id: `sp-${start}-${end}`,
          word: matchedPhrase,
          start,
          end,
          lang: 'fa',
          suggestions: [suggestion],
          reason: 'spacing',
        });
      }
      m = pat.re.exec(text);
    }
  }

  // Pass 2: Individual Persian & English tokens (exclude Arabic/Persian punctuation ؟ ، ؛ and digits)
  const tokenRe = /[A-Za-z0-9_-]+|[\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\u06C0\u064B-\u065F\u200C]+/g;
  let match: RegExpExecArray | null = tokenRe.exec(text);
  while (match) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;

    // Skip if overlapping with a detected two-word spacing issue
    const overlaps = issues.some((it) => start < it.end && end > it.start);
    if (!overlaps) {
      if (/^[A-Za-z]+$/.test(token)) {
        // English word check: skip short codes (<=2), ALL CAPS acronyms (OPI, MER, HVAC), mixed codes
        const isAllCaps = token === token.toUpperCase() && token.length <= 6;
        if (token.length >= 3 && !isAllCaps) {
          const lower = token.toLowerCase();
          if (EN_DIRECT_FIXES[lower] && !customDict.has(lower)) {
            issues.push({
              id: `en-${start}-${end}`,
              word: token,
              start,
              end,
              lang: 'en',
              suggestions: EN_DIRECT_FIXES[lower].map((s) => matchCase(token, s)),
              reason: 'spelling',
            });
          } else if (!isKnownEnglishWord(lower, customDict) && lower.length >= 4) {
            // Only flag unknown English words when we have a high-confidence dictionary match (dist <= 2)
            const maxDist = lower.length <= 5 ? 1 : 2;
            const fuzzy = findFuzzySuggestions(lower, EN_BY_LEN, maxDist, 3);
            if (fuzzy.length > 0) {
              issues.push({
                id: `en-${start}-${end}`,
                word: token,
                start,
                end,
                lang: 'en',
                suggestions: fuzzy.map((s) => matchCase(token, s)),
                reason: 'spelling',
              });
            }
          }
        }
      } else if (/^[\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\u06C0\u064B-\u065F\u200C]+$/.test(token)) {
        const cleanFa = normalizeFaWord(token);
        const directTarget = FA_DIRECT_FIXES[token] || FA_DIRECT_FIXES[cleanFa];
        if (directTarget && !customDict.has(token) && !customDict.has(cleanFa)) {
          issues.push({
            id: `fa-${start}-${end}`,
            word: token,
            start,
            end,
            lang: 'fa',
            suggestions: directTarget,
            reason: directTarget[0].includes('\u200c') && !token.includes('\u200c') ? 'spacing' : 'spelling',
          });
        } else if (cleanFa.length >= 4 && !isKnownPersianWord(cleanFa, customDict)) {
          // Only suggest when close (dist === 1) to avoid false positives on Persian proper names/brands
          const fuzzy = findFuzzySuggestions(cleanFa, FA_BY_LEN, 1, 3);
          if (fuzzy.length > 0) {
            issues.push({
              id: `fa-${start}-${end}`,
              word: token,
              start,
              end,
              lang: 'fa',
              suggestions: fuzzy,
              reason: 'spelling',
            });
          }
        }
      }
    }
    match = tokenRe.exec(text);
  }

  issues.sort((a, b) => a.start - b.start);
  return issues;
}

export function applySpellCorrection(text: string, issue: SpellIssue, replacement: string): string {
  return text.slice(0, issue.start) + replacement + text.slice(issue.end);
}

export function applyAllSpellCorrections(text: string, issues: SpellIssue[]): string {
  if (issues.length === 0) return text;
  // Apply from end to start so indices remain valid
  const sorted = [...issues].sort((a, b) => b.start - a.start);
  let out = text;
  for (const issue of sorted) {
    if (issue.suggestions.length > 0) {
      out = out.slice(0, issue.start) + issue.suggestions[0] + out.slice(issue.end);
    }
  }
  return out;
}
