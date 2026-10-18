/**
 * Registry + help text for the "Endpoint Operation" list in Data Ingestion > API Integration.
 * The UI renders: the select (labels), a one-paragraph description under it, and an (i) popover with `details`.
 * Descriptions of the 5 EXISTING operations are verified against the current code (what endpoint it calls, what it writes).
 */
export type OpId = 'positions' | 'bulkMessages' | 'realtimeCheckpoint' | 'deviceInventory' | 'dopplerData' | 'messageCountCheck';
export type OpRole = 'primary' | 'supporting' | 'fallback' | 'diagnostic';

export interface ApiOperation {
  id: OpId;
  order: number;
  role: OpRole;
  label: { en: string; ar: string };
  summary: { en: string; ar: string };        // 1–2 sentences under the select
  details: { en: string[]; ar: string[] };    // bullets in the (i) popover
  returns: 'positions' | 'messages' | 'devices' | 'count';
  windowBy: 'locationDate' | 'messageDate' | 'none';
  usesCheckpoint: boolean;
  writesTo: string[];                          // Firestore targets
  badge?: { en: string; ar: string };
}

export const API_OPERATIONS: ApiOperation[] = [
  {
    id: 'positions', order: 1, role: 'primary', returns: 'positions', windowBy: 'locationDate', usesCheckpoint: false,
    writesTo: ['argos_positions (one doc per fix)', 'transmitters.live.*'],
    badge: { en: 'Recommended', ar: 'موصى به' },
    label: { en: 'Positions (GPS + Doppler)', ar: 'المواقع (GPS + دوبلر)' },
    summary: {
      en: 'Positions exactly as organised by CLS: one row per position, with its own Location date, class and error radius. Feeds Argos Data, the Live Map history path and reports.',
      ar: 'المواقع كما ينظمها CLS: صف واحد لكل موقع مع تاريخ الموقع الخاص به ودرجة الدقة ونصف قطر الخطأ. هي مصدر جدول Argos Data ومسار التاريخ في الخريطة الحية والتقارير.',
    },
    details: {
      en: [
        'One row = one position (GPS or Doppler). No repeated rows.',
        'Date range and ordering use LOCATION date (when the position was acquired), never message date.',
        'Columns: Device ID, Unit type, Location class, Location type, Error radius (m), Location date, Longitude, Latitude.',
        'GPS: class empty, error 0. Doppler: class 0/1/2/3/A/B/Z and error radius.',
        'Safe to re-run: the same position is never stored twice. Overlapping date ranges are fine.',
      ],
      ar: [
        'الصف = موقع واحد (GPS أو دوبلر) دون تكرار.',
        'النطاق الزمني والترتيب يعتمدان على تاريخ الموقع (وقت الحصول على الموقع) وليس تاريخ الرسالة.',
        'الأعمدة: رقم الجهاز، نوع الوحدة، درجة الموقع، نوع الموقع، نصف قطر الخطأ، تاريخ الموقع، خط الطول، خط العرض.',
        'GPS: بدون درجة والخطأ 0. دوبلر: درجة 0/1/2/3/A/B/Z مع نصف قطر الخطأ.',
        'آمن عند إعادة التشغيل: لا يُخزَّن الموقع نفسه مرتين، ويمكن تداخل النطاقات الزمنية.',
      ],
    },
  },
  {
    id: 'bulkMessages', order: 2, role: 'supporting', returns: 'messages', windowBy: 'messageDate', usesCheckpoint: false,
    writesTo: ['argos_messages (payload, sensors, delivery stats)'],
    label: { en: 'Bulk Message Retrieval', ar: 'استرجاع الرسائل بالجملة' },
    summary: {
      en: 'Downloads satellite messages for a date range (history / back-fill). One row = one message, with its raw payload. Not used to draw tracks.',
      ar: 'يحمّل رسائل الأقمار الصناعية لنطاق زمني (تعبئة السجل التاريخي). الصف = رسالة واحدة مع بياناتها الخام. لا يُستخدم لرسم المسارات.',
    },
    details: {
      en: [
        'One row = one message (raw data, size, program, GPS date of position, Doppler values).',
        'The tag re-sends its stored GPS fixes many times: e.g. 1,885 messages carried only 95 GPS positions (≈ 20 messages per position).',
        'Date range = MESSAGE date, so old positions can appear in a recent range.',
        'Use for sensor/battery payload and delivery statistics. Positions come from "Positions".',
      ],
      ar: [
        'الصف = رسالة واحدة (البيانات الخام، الحجم، البرنامج، تاريخ موقع GPS، قيم دوبلر).',
        'الجهاز يعيد إرسال مواقع GPS المخزنة عدة مرات: مثلاً 1,885 رسالة حملت 95 موقع GPS فقط (حوالي 20 رسالة لكل موقع).',
        'النطاق الزمني = تاريخ الرسالة، لذلك قد تظهر مواقع قديمة ضمن نطاق حديث.',
        'استخدمها لبيانات المستشعرات والبطارية وإحصاءات الاستلام. أما المواقع فمن خيار «المواقع».',
      ],
    },
  },
  {
    id: 'realtimeCheckpoint', order: 3, role: 'supporting', returns: 'messages', windowBy: 'messageDate', usesCheckpoint: true,
    writesTo: ['argos_messages', 'ingest checkpoint doc'],
    label: { en: 'Realtime Stream (Checkpoint)', ar: 'البث المباشر (نقطة تحقق)' },
    summary: {
      en: 'Fetches only the messages that arrived since the last saved checkpoint, for continuous updates. Messages only; positions come from "Positions".',
      ar: 'يجلب فقط الرسائل التي وصلت بعد آخر نقطة تحقق محفوظة للتحديث المستمر. رسائل فقط؛ أما المواقع فمن خيار «المواقع».',
    },
    details: {
      en: [
        'Each call returns only what is new since the stored checkpoint, then moves the checkpoint forward.',
        'If the checkpoint is lost or reset you get duplicates or gaps.',
        'Because it follows arrival time, it cannot recover old positions delivered late: that is why positions are pulled with "Positions" (by location date).',
      ],
      ar: [
        'كل استدعاء يعيد فقط الجديد منذ نقطة التحقق المخزنة ثم يحرّكها للأمام.',
        'إذا فُقدت نقطة التحقق أو أُعيد ضبطها ستظهر تكرارات أو فجوات.',
        'لأنه يتبع وقت الوصول فلا يستطيع استرجاع المواقع القديمة التي وصلت متأخرة، ولهذا تُجلب المواقع عبر «المواقع» (حسب تاريخ الموقع).',
      ],
    },
  },
  {
    id: 'deviceInventory', order: 4, role: 'supporting', returns: 'devices', windowBy: 'none', usesCheckpoint: false,
    writesTo: ['transmitters (create / refresh identity fields only)'],
    label: { en: 'Device Inventory List', ar: 'قائمة الأجهزة' },
    summary: {
      en: 'Lists the devices (PTTs) on your CLS account: Device ID, program, unit type. Use it to create or refresh the Transmitters table. No positions.',
      ar: 'يعرض الأجهزة (PTT) في حسابك على CLS: رقم الجهاز والبرنامج ونوع الوحدة. يُستخدم لإنشاء أو تحديث جدول أجهزة الإرسال. لا يحتوي مواقع.',
    },
    details: {
      en: ['One row = one device.', 'Does not overwrite human-managed fields (status, bird link, notes).', 'Run after new tags are added to the CLS account.'],
      ar: ['الصف = جهاز واحد.', 'لا يستبدل الحقول المُدارة يدوياً (الحالة، ربط الطائر، الملاحظات).', 'شغّله بعد إضافة أجهزة جديدة إلى حساب CLS.'],
    },
  },
  {
    id: 'dopplerData', order: 5, role: 'fallback', returns: 'positions', windowBy: 'locationDate', usesCheckpoint: false,
    writesTo: ['argos_positions (type DOPPLER only)'],
    label: { en: 'Doppler Data', ar: 'بيانات دوبلر' },
    summary: {
      en: 'Doppler-only locations with class and error radius. Already included in "Positions"; keep it as a cross-check or fallback.',
      ar: 'مواقع دوبلر فقط مع الدرجة ونصف قطر الخطأ. مشمولة أصلاً في «المواقع»؛ تُستخدم للمقارنة أو كخيار احتياطي.',
    },
    details: {
      en: ['Doppler positions come from the satellite pass, so their date is almost the message time.', 'Less accurate than GPS (error from hundreds of metres to several km).', 'Never used to override a GPS fix.'],
      ar: ['مواقع دوبلر تُحسب أثناء مرور القمر فتاريخها قريب من وقت الرسالة.', 'أقل دقة من GPS (خطأ من مئات الأمتار إلى عدة كيلومترات).', 'لا تُستخدم أبداً لتجاوز موقع GPS.'],
    },
  },
  {
    id: 'messageCountCheck', order: 6, role: 'diagnostic', returns: 'count', windowBy: 'messageDate', usesCheckpoint: false,
    writesTo: [],
    label: { en: 'Message Count Check', ar: 'فحص عدد الرسائل' },
    summary: {
      en: 'Returns only the number of messages for a device and period. Stores nothing. Use it to test the connection and to check nothing was missed.',
      ar: 'يعيد عدد الرسائل فقط لجهاز وفترة محددة دون تخزين أي بيانات. يُستخدم لاختبار الاتصال والتأكد من عدم فقدان رسائل.',
    },
    details: {
      en: ['Fast and lightweight.', 'Compare with the number of messages stored in the app for the same period.'],
      ar: ['سريع وخفيف.', 'قارن النتيجة بعدد الرسائل المخزنة في التطبيق لنفس الفترة.'],
    },
  },
];

export const opById = (id: OpId) => API_OPERATIONS.find((o) => o.id === id)!;
