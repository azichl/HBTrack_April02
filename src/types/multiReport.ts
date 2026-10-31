// src/types/multiReport.ts
// Types for the "Multi-bird Report Collection" feature.
// A ReportBook holds an ordered list of saved single-bird report pages (each already rendered
// to a PDF blob at save time), a cover page, and metadata.
// Persistence: Firestore users/{uid}/reportBooks/{bookId}

export type ReportBookCategory = 'almaty' | 'zhezqazgan' | 'custom';

export interface ReportBookMeta {
  id: string;
  uid: string;                      // owner
  category: ReportBookCategory;
  title: string;                    // editable, e.g. "Almaty Houbara Release Report"
  issueDate: string;                // yyyy-mm-dd, editable, defaults to today
  createdAt: number;                // epoch ms
  updatedAt: number;
  pageCount: number;
  logoLeftUrl: string;              // same defaults as the single report
  logoRightUrl: string;
  logoLeftHeight: number;
  logoRightHeight: number;
}

export interface ReportBookPage {
  id: string;                       // nanoid
  bookId: string;
  order: number;                    // 0-based
  birdId: string;                   // PTT / ring / darvic label (for display)
  birdLabel: string;
  storagePath: string;              // Firebase Storage path: reportBooks/{bookId}/pages/{pageId}.pdf
  downloadUrl: string;              // tokenised URL
  addedAt: number;
}

export interface ReportBook {
  meta: ReportBookMeta;
  pages: ReportBookPage[];
}

export const PRESET_BOOKS: Record<Exclude<ReportBookCategory, 'custom'>, { title: string; titleAr: string }> = {
  almaty:    { title: 'Almaty Houbara Release Report',    titleAr: 'تقرير إطلاق حبارى ألماتي' },
  zhezqazgan:{ title: 'Zhezqazgan Houbara Release Report', titleAr: 'تقرير إطلاق حبارى جيزقازغان' },
};
