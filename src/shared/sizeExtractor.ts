/**
 * Deterministic extractor for equipment "اندازه" (Size / Technical Dimension)
 * inferred automatically from an item's "شرح" (Description) during registration.
 * Users can freely override the extracted value at any time.
 */

function toAsciiDigits(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[×✕✖]/g, 'x')
    .replace(/[″“”]/g, '"')
    .replace(/[′’]/g, "'");
}

function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts the most relevant industrial/engineering size specification from a
 * free-text equipment description (Persian or English).
 * Returns empty string if no clear size/dimension pattern is present.
 */
export function inferSizeFromDescription(description: string | undefined | null): string {
  const raw = cleanSpaces(toAsciiDigits(String(description ?? '')));
  if (!raw) return '';

  // 1) Structural steel profiles (e.g. IPE200, HEB 240, HEA180, UNP 120, UPN 100, IPB 200, L50x50x5)
  const steelProfile = raw.match(
    /\b((?:IPE|IPN|IPB|HEB|HEA|HEM|UNP|UPN|PFC|CHS|SHS|RHS|UPE|INP)\s*\d+(?:\s*x\s*\d+(?:\s*x\s*\d+(?:\.\d+)?)?)?(?:\s*mm)?)\b/i,
  );
  if (steelProfile) {
    return cleanSpaces(steelProfile[1].replace(/\s*x\s*/gi, 'x')).toUpperCase().replace(/MM$/, 'mm');
  }

  // Angle / Equal / Unequal L-profile (e.g. L50x50x5, L 80x80x8)
  const angleProfile = raw.match(/\b(L\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?)?)\b/i);
  if (angleProfile) {
    return angleProfile[1].replace(/\s+/g, '').toUpperCase();
  }

  // 2) Metric bolts / studs / threaded fasteners (e.g. M12x40, M16 x 80, M24)
  const metricBolt = raw.match(/\b(M\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?){0,2}(?:\s*mm)?)\b/i);
  if (metricBolt) {
    return metricBolt[1].replace(/\s+/g, '').replace(/^m/, 'M').replace(/MM$/i, 'mm');
  }

  // 3) Electrical / Instrument cables (e.g. 3x2.5mm2, 4x16 mm², 3x4+1x2.5mm2, 2x1.5 sq.mm)
  const cableSize = raw.match(
    /\b(\d+\s*x\s*\d+(?:\.\d+)?(?:\s*\+\s*\d+\s*x\s*\d+(?:\.\d+)?)?\s*(?:mm2|mm²|sq\.?\s*mm))\b/i,
  );
  if (cableSize) {
    return cleanSpaces(cableSize[1].replace(/\s*x\s*/gi, 'x').replace(/\s*\+\s*/g, '+')).replace(/sq\.?\s*mm/i, 'mm2');
  }

  // 4) Piping / Valve nominal sizes: DN / NB / NPS (with optional reducer x DN and PN/SCH/Class)
  const dnMatch = raw.match(
    /\b((?:DN|NB|NPS)\s*\d+(?:\.\d+)?(?:\s*x\s*(?:DN|NB|NPS)?\s*\d+(?:\.\d+)?)?(?:\s*(?:PN\s*\d+|SCH\.?\s*(?:\d+[A-Z]?|STD|XS|XXS)|CL(?:ASS)?\.?\s*\d+|#\d+|\d+#))?)\b/i,
  );
  if (dnMatch) {
    return cleanSpaces(dnMatch[1])
      .replace(/^(dn|nb|nps)\s+/i, (_, p: string) => `${p.toUpperCase()}`)
      .replace(/\s*x\s*/gi, 'x')
      .replace(/\b(pn|sch)\s+/gi, (_, p: string) => p.toUpperCase())
      .toUpperCase()
      .replace(/(\d)X(?=\d|DN|NB|NPS)/g, '$1x');
  }

  // 5) Inch sizes (e.g. 2", 1/2", 1-1/2", 2"x1", 4" SCH80, 6" 150#, 3/4 INCH)
  const inchMatch = raw.match(
    /(?:^|[\s,(/-])((?:\d+\s*[- ]\s*)?\d+(?:\/\d+)?(?:\.\d+)?\s*(?:"|inch(?:es)?|in\.)(?:\s*x\s*(?:\d+\s*[- ]\s*)?\d+(?:\/\d+)?(?:\.\d+)?\s*(?:"|inch(?:es)?|in\.|mm)?)?(?:\s*(?:SCH\.?\s*(?:\d+[A-Z]?|STD|XS|XXS)|PN\s*\d+|CL(?:ASS)?\.?\s*\d+|\d+#))?)/i,
  );
  if (inchMatch) {
    return cleanSpaces(inchMatch[1])
      .replace(/\s*"/g, '"')
      .replace(/\s*(?:inches|inch|in\.)/gi, '"')
      .replace(/\s*x\s*/gi, 'x')
      .replace(/\b(pn|sch)\s+/gi, (_, p: string) => p.toUpperCase());
  }

  // 6) Multi-dimensional sizes (e.g. 100x50x5 mm, 1200x2400x10mm, 60x60x4)
  const multiDim = raw.match(
    /\b(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?(?:\s*x\s*\d+(?:\.\d+)?)?(?:\s*(?:mm|cm|m|in|"))?)\b/i,
  );
  if (multiDim) {
    const val = multiDim[1].replace(/\s*x\s*/gi, 'x').replace(/\s+(mm|cm|m|in)$/i, '$1');
    return val;
  }

  // 7) Diameter / Thickness / Single explicit dimension with unit (e.g. Ø50mm, OD 60.3mm, THK 10mm, 25mm, 150 cm, 50 میلیمتر)
  const explicitUnit = raw.match(
    /(?:^|[\s,(])((?:(?:Ø|Φ|OD|ID|THK|T=|D=|L=|W=|H=)\s*)?\d+(?:\.\d+)?\s*(?:mm|cm|m|میلی\s*متر|میلیمتر|سانتی\s*متر|سانتیمتر|اینچ))(?=$|[\s,)/-])/i,
  );
  if (explicitUnit) {
    return cleanSpaces(explicitUnit[1]).replace(/\s+(mm|cm|m)$/i, '$1');
  }

  // 8) Persian inch phrasing (e.g. "2 اینچ" or "1/2 اینچ")
  const faInch = raw.match(/(\d+(?:\/\d+)?(?:\.\d+)?\s*اینچ)/);
  if (faInch) {
    return cleanSpaces(faInch[1]);
  }

  // 9) Standalone Ø / Φ diameter (e.g. Ø50, Ø12.5)
  const diaOnly = raw.match(/([ØΦ]\s*\d+(?:\.\d+)?)/);
  if (diaOnly) {
    return diaOnly[1].replace(/\s+/g, '');
  }

  return '';
}
