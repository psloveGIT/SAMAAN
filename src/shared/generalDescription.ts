const UPPERCASE_ACRONYMS = new Set([
  'IPE',
  'HBA',
  'HEA',
  'HEB',
  'HEM',
  'UPN',
  'UPE',
  'IPN',
  'RHS',
  'SHS',
  'CHS',
  'PVC',
  'UPVC',
  'CPVC',
  'HDPE',
  'LDPE',
  'MDPE',
  'PEX',
  'PPR',
  'PP',
  'PE',
  'PTFE',
  'FRP',
  'GRP',
  'GRE',
  'SS',
  'CS',
  'AS',
  'LTCS',
  'PLC',
  'DCS',
  'HMI',
  'SCADA',
  'HVAC',
  'UPS',
  'VFD',
  'VSD',
  'MCC',
  'MCB',
  'MCCB',
  'ACB',
  'VCB',
  'RCCB',
  'RCBO',
  'ELCB',
  'CT',
  'PT',
  'VT',
  'RTD',
  'LED',
  'LCD',
  'OPI',
  'MTO',
  'MER',
  'GCV',
  'MIV',
  'SMR',
  'REP',
  'OSDR',
  'NCR',
  'API',
  'ASME',
  'ANSI',
  'ASTM',
  'DIN',
  'ISO',
  'IEC',
  'NEMA',
  'DN',
  'PN',
  'SCH',
  'SMLS',
  'ERW',
  'SAW',
  'LSAW',
  'SSAW',
  'BW',
  'SW',
  'NPT',
  'BSP',
  'BSPT',
  'BSPP',
  'RF',
  'FF',
  'RTJ',
  'WN',
  'SO',
  'BL',
  'LJ',
  'SF6',
  'AC',
  'DC',
  'ID',
  'OD',
  'CNC',
  'GIS',
  'AIS',
  'HV',
  'MV',
  'LV',
  'XLPE',
  'SWA',
  'AWA',
  'UV',
  'PRV',
  'PSV',
  'PCV',
  'FCV',
  'LCV',
  'TCV',
  'XV',
  'MOV',
  'SDV',
  'BDV',
  'NRV',
  'OEM',
  'MAPNA',
]);

function formatWord(word: string): string {
  const clean = word.trim();
  if (!clean) return '';
  if (clean === '&' || clean === '/' || clean === '-') return clean;

  // Handle hyphenated words like O-Ring, Non-Return, Multi-Core
  if (clean.includes('-')) {
    return clean
      .split('-')
      .map((part) => formatWord(part))
      .join('-');
  }

  const upper = clean.toUpperCase();
  if (UPPERCASE_ACRONYMS.has(upper)) {
    return upper;
  }

  // Strip punctuation check for acronyms like (IPE)
  const alphaOnly = upper.replace(/[^A-Z0-9]/g, '');
  if (alphaOnly && UPPERCASE_ACRONYMS.has(alphaOnly)) {
    return upper;
  }

  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

/**
 * Formats a general description using Title Case while preserving known uppercase acronyms (e.g., IPE, HBA, HDPE).
 */
export function formatGeneralDescriptionCase(raw: string): string {
  const trimmed = (raw || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return trimmed
    .split(' ')
    .map((token) => formatWord(token))
    .filter(Boolean)
    .join(' ');
}

interface MaterialRule {
  pattern: RegExp;
  label: string;
}

const MATERIAL_RULES: MaterialRule[] = [
  // Valves (specific types first)
  { pattern: /\b(safety\s+relief\s+valve|psv|prv)\b/i, label: 'Safety Relief Valve' },
  { pattern: /\b(safety\s+valve)\b/i, label: 'Safety Valve' },
  { pattern: /\b(relief\s+valve)\b/i, label: 'Relief Valve' },
  { pattern: /\b(control\s+valve|fcv|pcv|lcv|tcv)\b/i, label: 'Control Valve' },
  { pattern: /\b(solenoid\s+valve)\b/i, label: 'Solenoid Valve' },
  { pattern: /\b(butterfly\s+valve)\b/i, label: 'Butterfly Valve' },
  { pattern: /\b(ball\s+valve)\b/i, label: 'Ball Valve' },
  { pattern: /\b(gate\s+valve)\b/i, label: 'Gate Valve' },
  { pattern: /\b(globe\s+valve)\b/i, label: 'Globe Valve' },
  { pattern: /\b(check\s+valve|non[\s-]*return\s+valve|nrv)\b/i, label: 'Check Valve' },
  { pattern: /\b(needle\s+valve)\b/i, label: 'Needle Valve' },
  { pattern: /\b(plug\s+valve)\b/i, label: 'Plug Valve' },
  { pattern: /\b(diaphragm\s+valve)\b/i, label: 'Diaphragm Valve' },
  { pattern: /\b(pinch\s+valve)\b/i, label: 'Pinch Valve' },
  { pattern: /\b(relief|shut[\s-]*off|isolation|drain|vent|bleed)\s+valve\b/i, label: 'Valve' },
  { pattern: /\bvalve\b|شیر/i, label: 'Valve' },

  // Steel profiles & structural acronyms (keep acronyms uppercase!)
  { pattern: /\bipe[\s\-_]*\d*\b/i, label: 'IPE Beam' },
  { pattern: /\bhba[\s\-_]*\d*\b/i, label: 'HBA Beam' },
  { pattern: /\bheb[\s\-_]*\d*\b/i, label: 'HEB Beam' },
  { pattern: /\bhea[\s\-_]*\d*\b/i, label: 'HEA Beam' },
  { pattern: /\bhem[\s\-_]*\d*\b/i, label: 'HEM Beam' },
  { pattern: /\bupn[\s\-_]*\d*\b/i, label: 'UPN Channel' },
  { pattern: /\bupe[\s\-_]*\d*\b/i, label: 'UPE Channel' },
  { pattern: /\bipn[\s\-_]*\d*\b/i, label: 'IPN Beam' },
  { pattern: /\bh[\s-]*beam\b/i, label: 'H-Beam' },
  { pattern: /\bi[\s-]*beam\b/i, label: 'I-Beam' },
  { pattern: /\b(u[\s-]*channel|c[\s-]*channel|channel\s+bar)\b|ناودانی/i, label: 'Channel' },
  { pattern: /\b(angle\s+bar|equal\s+angle|unequal\s+angle|l[\s-]*angle)\b|نبشی/i, label: 'Angle' },
  { pattern: /\b(grating)\b|گریتینگ/i, label: 'Grating' },
  { pattern: /\b(steel\s+plate|chequered\s+plate|plate)\b|ورق/i, label: 'Plate' },
  { pattern: /\b(sheet)\b/i, label: 'Sheet' },
  { pattern: /\b(rebar|deformed\s+bar|round\s+bar|flat\s+bar)\b|میلگرد|تسمه/i, label: 'Steel Bar' },

  // Flanges, Fittings, Piping
  { pattern: /\b(blind\s+flange)\b/i, label: 'Blind Flange' },
  { pattern: /\b(spectacle\s+blind)\b/i, label: 'Spectacle Blind' },
  { pattern: /\b(weld\s*neck\s+flange|wn\s+flange|wnrf|slip[\s-]*on\s+flange|flange|flanges)\b|فلنج/i, label: 'Flange' },
  { pattern: /\b(concentric\s+reducer|eccentric\s+reducer|reducer)\b|تبدیل/i, label: 'Reducer' },
  { pattern: /\b(elbow|90\s*deg|45\s*deg|bend)\b|زانو/i, label: 'Elbow' },
  { pattern: /\b(equal\s+tee|reducing\s+tee|tee)\b|سه‌راهی|سه راهی/i, label: 'Tee' },
  { pattern: /\b(weldolet|sockolet|threadolet|latrolet|elbolet|olet)\b/i, label: 'Olet' },
  { pattern: /\b(coupling|full\s+coupling|half\s+coupling)\b|بوشن/i, label: 'Coupling' },
  { pattern: /\b(union)\b|مهره ماسوره/i, label: 'Union' },
  { pattern: /\b(nipple)\b|مغزی/i, label: 'Nipple' },
  { pattern: /\b(pipe\s+cap|end\s+cap|cap)\b|درپوش/i, label: 'Cap' },
  { pattern: /\b(bushing)\b/i, label: 'Bushing' },
  { pattern: /\b(saddle)\b/i, label: 'Saddle' },
  { pattern: /\b(expansion\s+joint|bellows)\b|لرزه‌گیر|لرزه گیر/i, label: 'Expansion Joint' },
  { pattern: /\b(steam\s+trap)\b|تله بخار/i, label: 'Steam Trap' },
  { pattern: /\b(y[\s-]*strainer|basket\s+strainer|strainer)\b|صافی/i, label: 'Strainer' },
  { pattern: /\b(manifold)\b|منیفولد/i, label: 'Manifold' },
  { pattern: /\b(hdpe\s+pipe)\b/i, label: 'HDPE Pipe' },
  { pattern: /\b(upvc\s+pipe)\b/i, label: 'UPVC Pipe' },
  { pattern: /\b(cpvc\s+pipe)\b/i, label: 'CPVC Pipe' },
  { pattern: /\b(pvc\s+pipe)\b/i, label: 'PVC Pipe' },
  { pattern: /\b(ss\s+pipe|stainless\s+steel\s+pipe)\b/i, label: 'SS Pipe' },
  { pattern: /\b(pipe|piping|spool)\b|لوله/i, label: 'Pipe' },
  { pattern: /\b(tubing|tube)\b|تیوب/i, label: 'Tube' },
  { pattern: /\b(flexible\s+hose|hydraulic\s+hose|hose)\b|شلنگ/i, label: 'Hose' },

  // Gaskets, Seals, Fasteners, Supports
  { pattern: /\b(spiral\s+wound\s+gasket|ring\s+joint\s+gasket|gasket)\b|گسکت|واشر آب‌بندی/i, label: 'Gasket' },
  { pattern: /\b(o[\s-]*ring)\b/i, label: 'O-Ring' },
  { pattern: /\b(mechanical\s+seal|oil\s+seal|seal)\b|سیل/i, label: 'Seal' },
  { pattern: /\b(stud\s+bolt|studbolt)\b|استاد بولت/i, label: 'Stud Bolt' },
  { pattern: /\b(anchor\s+bolt)\b|انکر بولت/i, label: 'Anchor Bolt' },
  { pattern: /\b(u[\s-]*bolt)\b/i, label: 'U-Bolt' },
  { pattern: /\b(hex\s+bolt|bolt\s*&\s*nut|bolt)\b|پیچ/i, label: 'Bolt & Nut' },
  { pattern: /\b(hex\s+nut|lock\s+nut|nut)\b|مهره/i, label: 'Nut' },
  { pattern: /\b(spring\s+washer|flat\s+washer|washer)\b|واشر/i, label: 'Washer' },
  { pattern: /\b(pipe\s+clamp|clamp|clip)\b|بست/i, label: 'Clamp' },
  { pattern: /\b(pipe\s+support|spring\s+hanger|support|hanger|bracket)\b|ساپورت|براکت/i, label: 'Support' },

  // Electrical & Cable
  { pattern: /\b(cable\s+tray|ladder\s+tray)\b|سینی کابل/i, label: 'Cable Tray' },
  { pattern: /\b(cable\s+gland|gland)\b|گلند/i, label: 'Cable Gland' },
  { pattern: /\b(cable\s+lug|lug)\b|کابلشو/i, label: 'Cable Lug' },
  { pattern: /\b(fiber\s+optic|foc)\b|فیبر نوری/i, label: 'Fiber Optic Cable' },
  { pattern: /\b(power\s+cable|control\s+cable|instrument\s+cable|xlpe|cable)\b|کابل/i, label: 'Cable' },
  { pattern: /\b(wire)\b|سیم/i, label: 'Wire' },
  { pattern: /\b(conduit)\b|کاندوئیت/i, label: 'Conduit' },
  { pattern: /\b(junction\s+box|terminal\s+box|pull\s+box)\b|جعبه تقسیم/i, label: 'Junction Box' },
  { pattern: /\b(terminal\s+block|terminal)\b|ترمینال/i, label: 'Terminal Block' },
  { pattern: /\b(mccb)\b/i, label: 'MCCB Breaker' },
  { pattern: /\b(mcb)\b/i, label: 'MCB Breaker' },
  { pattern: /\b(acb)\b/i, label: 'ACB Breaker' },
  { pattern: /\b(vcb)\b/i, label: 'VCB Breaker' },
  { pattern: /\b(circuit\s+breaker|breaker)\b|کلید اتوماتیک|بریکر/i, label: 'Circuit Breaker' },
  { pattern: /\b(contactor)\b|کنتاکتور/i, label: 'Contactor' },
  { pattern: /\b(relay)\b|رله/i, label: 'Relay' },
  { pattern: /\b(fuse)\b|فیوز/i, label: 'Fuse' },
  { pattern: /\b(switchgear|panel|cabinet|enclosure)\b|تابلو/i, label: 'Panel & Switchgear' },
  { pattern: /\b(transformer)\b|ترانسفورماتور/i, label: 'Transformer' },
  { pattern: /\b(busbar)\b|باسبار/i, label: 'Busbar' },
  { pattern: /\b(earthing|grounding)\b|ارت/i, label: 'Earthing Material' },
  { pattern: /\b(ups)\b/i, label: 'UPS' },
  { pattern: /\b(vfd|inverter|frequency\s+drive)\b|اینورتر|درایو/i, label: 'VFD Drive' },
  { pattern: /\b(battery|charger)\b|باتری/i, label: 'Battery' },
  { pattern: /\b(lighting|luminaire|floodlight|lamp)\b|چراغ|روشنایی/i, label: 'Lighting Fixture' },

  // Instrumentation & Control
  { pattern: /\b(pressure\s+transmitter|dp\s+transmitter|temperature\s+transmitter|level\s+transmitter|flow\s+transmitter|transmitter)\b|ترانسمیتر/i, label: 'Transmitter' },
  { pattern: /\b(pressure\s+gauge|temperature\s+gauge|level\s+gauge|gauge|manometer)\b|گیج|مانومتر/i, label: 'Gauge' },
  { pattern: /\b(pressure\s+switch|temperature\s+switch|level\s+switch|flow\s+switch|limit\s+switch)\b/i, label: 'Instrument Switch' },
  { pattern: /\b(thermocouple)\b|ترموکوپل/i, label: 'Thermocouple' },
  { pattern: /\b(rtd|pt100)\b/i, label: 'RTD Sensor' },
  { pattern: /\b(thermowell)\b|ترمووِل/i, label: 'Thermowell' },
  { pattern: /\b(flow\s*meter|flowmeter)\b|فلومتر/i, label: 'Flowmeter' },
  { pattern: /\b(orifice\s+plate|orifice)\b|اوریفیس/i, label: 'Orifice' },
  { pattern: /\b(sensor|detector|analyzer)\b|سنسور/i, label: 'Sensor' },
  { pattern: /\b(plc)\b/i, label: 'PLC' },
  { pattern: /\b(dcs)\b/i, label: 'DCS' },
  { pattern: /\b(hmi)\b/i, label: 'HMI' },
  { pattern: /\b(actuator)\b|عملگر|اکچویتور/i, label: 'Actuator' },

  // Rotating & Mechanical Equipment
  { pattern: /\b(centrifugal\s+pump|dosing\s+pump|metering\s+pump|pump)\b|پمپ/i, label: 'Pump' },
  { pattern: /\b(electric\s+motor|induction\s+motor|motor)\b|الکتروموتور|موتور/i, label: 'Motor' },
  { pattern: /\b(compressor)\b|کمپرسور/i, label: 'Compressor' },
  { pattern: /\b(blower|fan|ventilator)\b|فن|دمنده/i, label: 'Fan & Blower' },
  { pattern: /\b(gearbox|reducer\s+gear)\b|گیربکس/i, label: 'Gearbox' },
  { pattern: /\b(bearing)\b|بلبرینگ|یاتاقان/i, label: 'Bearing' },
  { pattern: /\b(filter\s+element|cartridge\s+filter|air\s+filter|oil\s+filter|filter)\b|فیلتر/i, label: 'Filter' },
  { pattern: /\b(heat\s+exchanger|exchanger|cooler|condenser|radiator)\b|مبدل/i, label: 'Heat Exchanger' },
  { pattern: /\b(hvac|ahu|chiller|damper)\b|دمپر/i, label: 'HVAC Equipment' },
  { pattern: /\b(tank|vessel|drum|separator)\b|مخزن/i, label: 'Vessel & Tank' },

  // Consumables & Insulation
  { pattern: /\b(electrode|welding\s+rod|welding\s+wire|filler\s+metal)\b|الکترود/i, label: 'Welding Consumable' },
  { pattern: /\b(rock\s+wool|mineral\s+wool|glass\s+wool|insulation|cladding)\b|عایق/i, label: 'Insulation' },
  { pattern: /\b(paint|primer|coating|thinner)\b|رنگ/i, label: 'Paint & Coating' },
  { pattern: /\b(lubricant|grease|hydraulic\s+oil|turbine\s+oil|oil)\b|روغن|گریس/i, label: 'Lubricant & Oil' },
];

/**
 * Infers the General Description (`شرح کلی`) purely from the Detailed item `description` (`شرح`),
 * applying Title Case while preserving uppercase engineering acronyms (e.g. IPE, HBA, HDPE).
 */
export function inferGeneralDescription(description: string): string {
  const clean = (description || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  for (const rule of MATERIAL_RULES) {
    if (rule.pattern.test(clean)) {
      return formatGeneralDescriptionCase(rule.label);
    }
  }

  // Fallback: inspect leading meaningful token(s) if purely Latin technical spec
  const firstTokens = clean
    .replace(/["""'(),:;]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok && !/^\d+(\.\d+)?$/.test(tok) && !/^\d+["']$/.test(tok));

  if (firstTokens.length > 0) {
    const first = firstTokens[0];
    // If first token is an uppercase acronym like IPE200 or HBA160, extract prefix
    const acronymMatch = first.match(/^([A-Za-z]+)\d+$/);
    if (acronymMatch && UPPERCASE_ACRONYMS.has(acronymMatch[1].toUpperCase())) {
      return acronymMatch[1].toUpperCase();
    }
    return formatGeneralDescriptionCase(firstTokens.slice(0, 2).join(' '));
  }

  return '';
}
