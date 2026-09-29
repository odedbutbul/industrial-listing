// שיוך אוטומטי לקטגוריות באתר — לפי מה שהמוצר *הוא* (סוג המוצר), כמו Radwell / EU Automation /
// PartnerPLC. המותג הוא ציר נפרד (עמודי מותג), ומשמש כאן רק כשסוג המוצר לא זוהה.
//
// סדר ההחלטה:
//   1. כללי סוג על הכותרת (הכלל הראשון שמתאים — מהספציפי לכללי)
//   2. אותם כללים על שם קטגוריית eBay (כשהיא לא "Other")
//   3. אותם כללים על תחילת התיאור
//   4. ברירת מחדל לפי מותג (למשל KEB → Drives)
// בנוסף: מותג של ציוד רפואי/אסתטי (Lumenis…) מוסיף גם "Medical & Aesthetic", ויצרן ציוד מוליכים
// למחצה (AMAT, TEL, ASML…) מוסיף גם "Semiconductor Equipment Parts" — קונה מחפש לפי המכונה,
// גם כשהחלק עצמו הוא כרטיס אלקטרוני.
//
// כל מוצר מקבל את תת-הקטגוריה ואת קטגוריית האב שלה (הספירות בעמוד הבית הן לפי האב).
// לא זוהה — אין קטגוריה (המוצר נשאר Uncategorized), ומופיע בתצוגה המקדימה כ"לא שויך".

export interface CategoryNode {
  slug: string
  name: string
  /** slug של האב. ריק = קטגוריה ראשית (10 הקיימות בחנות) */
  parent?: string
}

/** 10 הראשיות קיימות בחנות (מזהים 25–34). תתי-הקטגוריות נוצרות לפי הצורך. */
export const CATEGORY_TREE: CategoryNode[] = [
  { slug: 'industrial-automation', name: 'Industrial Automation' },
  { slug: 'plc-controllers', name: 'PLCs & Controllers', parent: 'industrial-automation' },
  { slug: 'drives-inverters', name: 'Drives & Inverters', parent: 'industrial-automation' },
  { slug: 'hmi-displays', name: 'HMIs & Displays', parent: 'industrial-automation' },
  { slug: 'io-communication-modules', name: 'I/O & Communication Modules', parent: 'industrial-automation' },
  { slug: 'industrial-pcs', name: 'Industrial PCs', parent: 'industrial-automation' },

  { slug: 'motors-motion', name: 'Motors & Motion' },
  { slug: 'servo-motors', name: 'Servo Motors', parent: 'motors-motion' },
  { slug: 'stepper-motors', name: 'Stepper Motors', parent: 'motors-motion' },
  { slug: 'ac-dc-motors', name: 'AC & DC Motors', parent: 'motors-motion' },
  { slug: 'encoders', name: 'Encoders', parent: 'motors-motion' },
  { slug: 'actuators-gearboxes', name: 'Actuators & Gearboxes', parent: 'motors-motion' },

  { slug: 'sensors-control', name: 'Sensors & Control' },
  { slug: 'sensors', name: 'Sensors', parent: 'sensors-control' },
  { slug: 'pressure-switches-gauges', name: 'Pressure Switches & Gauges', parent: 'sensors-control' },
  { slug: 'switches', name: 'Switches', parent: 'sensors-control' },
  { slug: 'relays', name: 'Relays', parent: 'sensors-control' },
  { slug: 'controllers-meters', name: 'Controllers & Meters', parent: 'sensors-control' },

  { slug: 'power', name: 'Power' },
  { slug: 'power-supplies', name: 'Power Supplies', parent: 'power' },
  { slug: 'transformers', name: 'Transformers', parent: 'power' },
  { slug: 'ups', name: 'UPS', parent: 'power' },
  { slug: 'heating-elements', name: 'Heating Elements', parent: 'power' },

  { slug: 'laboratory-equipment', name: 'Laboratory Equipment' },
  { slug: 'measurement-test', name: 'Measurement & Test', parent: 'laboratory-equipment' },
  { slug: 'analytical-instruments', name: 'Analytical Instruments', parent: 'laboratory-equipment' },

  { slug: 'lasers-optics', name: 'Lasers & Optics' },
  { slug: 'lenses-optical-components', name: 'Lenses & Optical Components', parent: 'lasers-optics' },
  { slug: 'optical-filters', name: 'Optical Filters', parent: 'lasers-optics' },
  { slug: 'optical-fibers', name: 'Optical Fibers', parent: 'lasers-optics' },
  { slug: 'photonics-transceivers', name: 'Photonics & Transceivers', parent: 'lasers-optics' },
  { slug: 'laser-components', name: 'Laser Components', parent: 'lasers-optics' },

  { slug: 'vacuum-technology', name: 'Vacuum Technology' },
  { slug: 'mass-flow-controllers', name: 'Mass Flow Controllers', parent: 'vacuum-technology' },
  { slug: 'vacuum-pumps', name: 'Pumps', parent: 'vacuum-technology' },
  { slug: 'pump-vacuum-controllers', name: 'Pump & Vacuum Controllers', parent: 'vacuum-technology' },
  { slug: 'vacuum-gauges', name: 'Vacuum Gauges', parent: 'vacuum-technology' },
  { slug: 'valves', name: 'Valves', parent: 'vacuum-technology' },
  { slug: 'fittings-fluid-handling', name: 'Fittings & Fluid Handling', parent: 'vacuum-technology' },

  { slug: 'medical-aesthetic', name: 'Medical & Aesthetic' },
  { slug: 'handpieces-applicators', name: 'Handpieces & Applicators', parent: 'medical-aesthetic' },
  { slug: 'aesthetic-laser-parts', name: 'Aesthetic Laser Parts', parent: 'medical-aesthetic' },

  { slug: 'robotics-semiconductor', name: 'Robotics & Semiconductor' },
  { slug: 'wafer-handling', name: 'Wafer Handling & Load Ports', parent: 'robotics-semiconductor' },
  { slug: 'robot-parts', name: 'Robot Parts', parent: 'robotics-semiconductor' },
  { slug: 'semiconductor-equipment-parts', name: 'Semiconductor Equipment Parts', parent: 'robotics-semiconductor' },

  { slug: 'electronics', name: 'Electronics' },
  { slug: 'circuit-boards', name: 'Circuit Boards', parent: 'electronics' },
  { slug: 'computers-motherboards', name: 'Computers & Motherboards', parent: 'electronics' },
  { slug: 'cables-harnesses', name: 'Cables & Harnesses', parent: 'electronics' },
  { slug: 'electronic-components', name: 'Electronic Components', parent: 'electronics' },
  { slug: 'data-storage', name: 'Data Storage', parent: 'electronics' },
]

const PARENT = new Map(CATEGORY_TREE.filter((c) => c.parent).map((c) => [c.slug, c.parent as string]))

interface Rule {
  cat: string
  re: RegExp
  /** הכלל לא חל כשזה מופיע (למשל "Attenuator Board" הוא כרטיס, לא רכיב אופטי) */
  not?: RegExp
}

// סדר = עדיפות. ספציפי לפני כללי: "servo motor" לפני "motor", "tape drive" לפני "drive",
// "mass flow controller" לפני "controller", "harness" לפני "board".
export const RULES: Rule[] = [
  // תנועה
  { cat: 'servo-motors', re: /\bservo ?motor|\bac servo\b|\bsgm[a-z]{2}-|\bhc-(kfs|mfs|sfs|ufs)|\bhf-(kp|mp|sp)\b|\bmsmd|\bmhmd/ },
  { cat: 'stepper-motors', re: /\bstepp(er|ing) ?motor/ },
  { cat: 'encoders', re: /\bencoder/ },
  { cat: 'actuators-gearboxes', re: /\bactuator|\bgear ?(box|head)|\breducer\b|\blinear (stage|slide|actuator)/ },
  // אחסון מידע לפני "drive"
  { cat: 'data-storage', re: /\btape drive|\bhard (disk|drive)|\bhdd\b|\bssd\b|\blto-?\d/ },
  { cat: 'drives-inverters', re: /\bservo ?(drive|amplifier|pack)|\bservopack|\binverter|\bmicromaster|\bmovidrive|\bmdx6\d|\bvfd\b|\bfrequency (converter|drive)|\bsoft ?start|\bdsa-\d|\bac drive|\bdc drive|\bdrive\b/, not: /\bdrive board|tape|disk/ },
  { cat: 'ac-dc-motors', re: /\bmotor\b/ },
  // ואקום וזרימה — לפני "controller" / "module" / "interface"
  { cat: 'mass-flow-controllers', re: /\bmass ?flow|\bmfc\b|\bflow (controller|module)|\bsec-z\d|\bfcsp\d|\bmc-2\d{3}/ },
  { cat: 'pump-vacuum-controllers', re: /\bpump controller|\bvacuum controller|\bgauge controller/ },
  { cat: 'vacuum-gauges', re: /\bvacuum gauge|\bpirani|\bbaratron|\bion gauge|\bmanometer\b(?!.*differ)/ },
  { cat: 'vacuum-pumps', re: /\bpump\b/ },
  { cat: 'valves', re: /\bvalve/ },
  { cat: 'fittings-fluid-handling', re: /\bfilter housing|\bhose\b|\bbarb\b|\bfitting|\btubing\b|\bcoupling/ },
  // מוליכים למחצה
  { cat: 'wafer-handling', re: /\bload ?port|\bwafer|\bfixload|\bend effector|\bstocker\b/, not: /\bboard\b|\bpcb\b/ },
  { cat: 'robot-parts', re: /\brobot/ },
  // כבלים לפני כרטיסים
  { cat: 'cables-harnesses', re: /\bharness|\bcable\b|\bwire (assy|assembly)/ },
  // רפואי / אסתטי
  { cat: 'handpieces-applicators', re: /\bhand ?piece|\bapplicator|\bhandpiece tip|\btips?\b/ },
  // אופטיקה
  { cat: 'photonics-transceivers', re: /\bphotonics|\btransceiver|\bqsfp|\bsfp\b|\b100g\b/ },
  { cat: 'optical-fibers', re: /\bfib(er|re)\b/ },
  { cat: 'optical-filters', re: /\bfilter\b/, not: /\bhousing|\bboard|\bemi\b|\bline filter|\bair filter/ },
  { cat: 'lenses-optical-components', re: /\blens\b|\blenses\b|\boptic|\bmirror\b|\bznse\b|\bfresnel|\bpolarizer|\bprism\b|\bbeam (splitter|expander)|\bphotop\b|\bophir\b|\battenuator\b/, not: /\bboard\b/ },
  { cat: 'laser-components', re: /\blaser (head|tube|diode|module|cavity|crystal)|\bflash ?lamp|\bq-?switch|\bscanner\b|\bgalvo\b|\bupgrade hasp\b|\buhp\b/ },
  // אוטומציה
  { cat: 'plc-controllers', re: /\bplc\b|\bcpu\d*\b|\bcqm1|\bsimatic|\b6es7|\bprogrammable (logic )?controller|\bcompact controller/ },
  { cat: 'hmi-displays', re: /\bhmi\b|\btouch ?(panel|screen)|\boperator panel|\bdisplay\b|\blcd\b|\bmonitor\b|\bgraphics terminal/ },
  { cat: 'industrial-pcs', re: /\bindustrial pc|\bpanel pc|\bbox pc\b/ },
  { cat: 'io-communication-modules', re: /\bi\/o (module|board|panel)|\binput module|\boutput module|\bcommunication module|\bprofibus|\bdevicenet module|\bethernet module|\bgateway\b/ },
  // חשמל
  { cat: 'power-supplies', re: /\bpower supply|\bpsu\b|\bdc power|\bpower module|\bcondor\b/ },
  { cat: 'transformers', re: /\btransformer/ },
  { cat: 'ups', re: /\bups\b/ },
  { cat: 'heating-elements', re: /\bheater|\bheating element|\bheater rod/ },
  // חיישנים ובקרה
  { cat: 'pressure-switches-gauges', re: /\bpressure (switch|gauge|sensor|transducer)|\bdifferen?tinal pressure|\bdifferential pressure|\bgauge\b|\bdg\d{2,3}u\b/ },
  { cat: 'sensors', re: /\bsensor|\bphotoelectric|\bproximity|\bdetector|\bthermocouple|\btransducer|\be3x-|\bwt\d{3}-/ },
  { cat: 'relays', re: /\brelay/ },
  { cat: 'switches', re: /\bswitch\b|\bpush ?button|\blimit switch/, not: /\bboard\b/ },
  // מעבדה
  { cat: 'analytical-instruments', re: /\bchemical instrument|\banaly[sz]er|\bspectrometer|\bchromatograph|\bph meter/ },
  { cat: 'measurement-test', re: /\boscilloscope|\bmultimeter|\bpower meter|\bcalibrator\b|\bmeasuring/ },
  { cat: 'controllers-meters', re: /\btemperature controller|\bprocess controller|\bpanel meter|\btimer\b|\bcounter\b/ },
  // אלקטרוניקה — כללי, אחרון
  { cat: 'computers-motherboards', re: /\bmotherboard|\bcomputer\b|\bsingle board|\bsbc\b|\bkontron\b|\badvantech\b|\bpcm-\d|\bgui ?pc\b|\bguipc\b/ },
  { cat: 'electronic-components', re: /\bpotentiometer|\bcapacitor|\bresistor|\bigbt\b|\bthyristor|\bdiode\b|\btransistor|\bconnector\b|\bfuse\b/, not: /\bboard\b/ },
  { cat: 'circuit-boards', re: /\bboard\b|\bpcb\b|\bpca\b|\bpcba\b|\bassy\b|\bassembly\b|\bmmcu\b|\bcontroller\b|\binterface\b/ },
]

/** קטגוריית eBay (כשהיא ספציפית) → תת-קטגוריה. נבדק רק כשהכותרת לא הכריעה. */
const EBAY_CATEGORY_RULES: Rule[] = [
  { cat: 'plc-controllers', re: /plcs? & hmis?|plc processors|programmable logic/ },
  { cat: 'servo-motors', re: /servo motors/ },
  { cat: 'drives-inverters', re: /drives & starters|variable frequency|servo drives/ },
  { cat: 'sensors', re: /sensors/ },
  { cat: 'power-supplies', re: /power supplies/ },
  { cat: 'mass-flow-controllers', re: /flow meters & controllers/ },
  { cat: 'vacuum-pumps', re: /vacuum pumps/ },
  { cat: 'semiconductor-equipment-parts', re: /semiconductor & pcb manufacturing/ },
  { cat: 'aesthetic-laser-parts', re: /medical, lab & dental|cosmetic lasers|laser hair removal/ },
]

/** כשסוג המוצר לא זוהה בכלל — ברירת מחדל לפי המותג (מה שהיצרן מייצר בעיקר) */
const BRAND_DEFAULT: Record<string, string> = {
  keb: 'drives-inverters',
  'krom schroder': 'pressure-switches-gauges',
  kromschroder: 'pressure-switches-gauges',
  'mks astex': 'semiconductor-equipment-parts',
  'applied materials': 'semiconductor-equipment-parts',
  'tokyo electron': 'semiconductor-equipment-parts',
  asml: 'semiconductor-equipment-parts',
  'lam research': 'semiconductor-equipment-parts',
  'brooks automation': 'wafer-handling',
  lumenis: 'aesthetic-laser-parts',
}

/** מותגי ציוד רפואי/אסתטי: המוצר נכנס גם ל-Medical & Aesthetic, בנוסף לסוג שלו */
const MEDICAL_BRANDS = new Set(['lumenis', 'coherent medical', 'candela', 'cynosure', 'syneron', 'alma lasers', 'cutera', 'palomar', 'quanta system'])

/** יצרני ציוד מוליכים למחצה: המוצר נכנס גם ל-Semiconductor Equipment Parts, בנוסף לסוג שלו */
const SEMI_BRANDS = new Set(['applied materials', 'amat', 'tokyo electron', 'asml', 'lam research', 'brooks automation', 'mks astex', 'kla', 'kla-tencor', 'novellus'])

export interface CategorizeInput {
  title: string
  brand?: string | null
  ebayCategoryName?: string | null
  /** תיאור אחרי ניקוי (HTML או טקסט) */
  description?: string | null
}

export interface CategorizeResult {
  /** slugs לשיוך: תת-קטגוריה + אב, ואולי גם Medical & Aesthetic. ריק = לא שויך */
  slugs: string[]
  /** תת-הקטגוריה הראשית (לפירורי לחם) */
  primary: string | null
  /** מאיפה ההחלטה — לתצוגה מקדימה ולבדיקה */
  source: 'title' | 'ebay-category' | 'description' | 'brand' | 'none'
}

const norm = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const brandNorm = (s: string) =>
  norm(s)
    .replace(/[,.]?\s+(inc|ltd|co|corp|gmbh|llc)\.?$/, '')
    .replace(/ö/g, 'o')

function firstMatch(rules: Rule[], text: string): string | null {
  if (!text) return null
  for (const r of rules) if (r.re.test(text) && !(r.not && r.not.test(text))) return r.cat
  return null
}

export function categorize(p: CategorizeInput): CategorizeResult {
  const brand = p.brand ? brandNorm(p.brand) : ''
  const ebayCat = p.ebayCategoryName && !/:other[^:]*$/i.test(p.ebayCategoryName) ? norm(p.ebayCategoryName) : ''
  const desc = p.description ? norm(p.description).slice(0, 600) : ''

  let primary: string | null = null
  let source: CategorizeResult['source'] = 'none'
  const tries: [CategorizeResult['source'], () => string | null][] = [
    ['title', () => firstMatch(RULES, norm(p.title))],
    ['ebay-category', () => firstMatch(EBAY_CATEGORY_RULES, ebayCat)],
    ['description', () => firstMatch(RULES, desc)],
    ['brand', () => BRAND_DEFAULT[brand] ?? null],
  ]
  for (const [src, fn] of tries) {
    const hit = fn()
    if (hit) {
      primary = hit
      source = src
      break
    }
  }

  const slugs = new Set<string>()
  const add = (slug: string) => {
    slugs.add(slug)
    const parent = PARENT.get(slug)
    if (parent) slugs.add(parent)
  }
  if (primary) add(primary)
  if (MEDICAL_BRANDS.has(brand) && !(primary && PARENT.get(primary) === 'medical-aesthetic')) add('aesthetic-laser-parts')
  if (SEMI_BRANDS.has(brand) && !(primary && PARENT.get(primary) === 'robotics-semiconductor')) add('semiconductor-equipment-parts')
  return { slugs: Array.from(slugs), primary, source }
}
