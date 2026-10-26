import { ReportLanguage } from '../types/report';

export const REPORT_DICTIONARY: Record<string, { ar: string; en: string }> = {
  'report.title': {
    ar: 'تقرير متابعة طائر حبارى مزود بجهاز تتبع',
    en: 'Houbara Bustard Tracking Report'
  },
  'report.birdId': {
    ar: 'معرّف الطائر',
    en: 'Bird ID'
  },
  'report.issueDate': {
    ar: 'تاريخ الإصدار',
    en: 'Issue Date'
  },
  'report.transmitter': {
    ar: 'جهاز التتبع',
    en: 'Transmitter'
  },
  'report.ring': {
    ar: 'رقم الحجل',
    en: 'Ring Number'
  },
  'report.species': {
    ar: 'النوعية',
    en: 'Species'
  },
  'report.gender': {
    ar: 'الجنس',
    en: 'Gender'
  },
  'report.status': {
    ar: 'حالة الطائر',
    en: 'Bird Status'
  },
  'report.frequency': {
    ar: 'التردد',
    en: 'Frequency'
  },
  'report.region': {
    ar: 'المنطقة',
    en: 'Region'
  },
  'report.camp': {
    ar: 'المخيم',
    en: 'Camp'
  },
  'report.release': {
    ar: 'تركيب الجهاز',
    en: 'Release'
  },
  'report.latest': {
    ar: 'آخر موقع',
    en: 'Latest Location'
  },
  'report.date': {
    ar: 'التاريخ',
    en: 'Date'
  },
  'report.lat': {
    ar: 'خط العرض (N)',
    en: 'Latitude (N)'
  },
  'report.lon': {
    ar: 'خط الطول (E)',
    en: 'Longitude (E)'
  },
  'report.distRelease': {
    ar: 'المسافة من موقع الإطلاق',
    en: 'Distance from Release'
  },
  'report.distCamp': {
    ar: 'المسافة إلى المخيم',
    en: 'Distance to Camp'
  },
  'report.direction': {
    ar: 'الاتجاه الجغرافي',
    en: 'Direction'
  },
  'report.duration': {
    ar: 'مدة التتبع',
    en: 'Duration'
  },
  'report.track': {
    ar: 'مسار الطيران',
    en: 'Flight Track'
  },
  'report.temperature': {
    ar: 'درجات الحرارة لـ 7 أيام (الصغرى / القصوى)',
    en: '7-Day Temperature (Min / Max)'
  },
  'report.agencyName': {
    ar: 'مكتب محميات الدولة الخارجية',
    en: 'External Reserves Office of The State'
  },
  'report.centerName': {
    ar: 'المركز القطري لتكاثر الحبارى والصقور – كازاخستان',
    en: 'Qatari Center for Houbara & Falcon Breeding – Kazakhstan'
  }
};

export function getReportString(
  key: string,
  lang: ReportLanguage = 'ar',
  userOverrides?: Record<string, any>
): string {
  // 1. Check user override first
  const userVal = userOverrides?.[key];
  if (userVal) {
    if (typeof userVal === 'string') return userVal;
    if (lang === 'ar' && userVal.ar) return userVal.ar;
    if (lang === 'en' && userVal.en) return userVal.en;
    if (lang === 'ar+en') {
      if (userVal.en && userVal.ar) return `${userVal.en} / ${userVal.ar}`;
      return userVal.ar || userVal.en;
    }
  }

  // 2. Fallback to dictionary
  const dict = REPORT_DICTIONARY[key];
  if (!dict) return key;

  if (lang === 'ar') return dict.ar;
  if (lang === 'en') return dict.en;
  // ar+en bilingual
  return `${dict.en} / ${dict.ar}`;
}
