// services/multiReportService.ts
// Firestore + Storage CRUD for ReportBooks.
// All writes use the signed-in user's UID so rules can be:
//   match /users/{uid}/reportBooks/{bookId} { allow read, write: if request.auth.uid == uid; }
//   match /users/{uid}/reportBooks/{bookId}/pages/{pageId} { allow read, write: if request.auth.uid == uid; }

import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc,
  query, orderBy,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
  getStorage,
} from 'firebase/storage';
import { db, auth } from '../firebase';
import type { ReportBook, ReportBookMeta, ReportBookPage, ReportBookCategory } from '../src/types/multiReport';
import { PRESET_BOOKS } from '../src/types/multiReport';

const storage = getStorage();

// ── helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in');
  return u.uid;
}

function nanoId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function booksCol(userId: string) {
  return collection(db, 'users', userId, 'reportBooks');
}
function bookDoc(userId: string, bookId: string) {
  return doc(db, 'users', userId, 'reportBooks', bookId);
}
function pagesCol(userId: string, bookId: string) {
  return collection(db, 'users', userId, 'reportBooks', bookId, 'pages');
}
function pageDoc(userId: string, bookId: string, pageId: string) {
  return doc(db, 'users', userId, 'reportBooks', bookId, 'pages', pageId);
}

// ── books ─────────────────────────────────────────────────────────────────────

export async function createReportBook(
  category: ReportBookCategory,
  customTitle?: string,
): Promise<ReportBookMeta> {
  const userId = uid();
  const id = nanoId();
  const now = Date.now();
  const title = customTitle
    ?? (category !== 'custom' ? PRESET_BOOKS[category].title : 'Custom Report');
  const meta: ReportBookMeta = {
    id,
    uid: userId,
    category,
    title,
    issueDate: new Date().toISOString().slice(0, 10),
    createdAt: now,
    updatedAt: now,
    pageCount: 0,
    logoLeftUrl: '/qatar-houbara-center-logo.png',
    logoRightUrl: '/qatar-emblem.png',
    logoLeftHeight: 78,
    logoRightHeight: 64,
  };
  await setDoc(bookDoc(userId, id), meta);
  return meta;
}

export async function listReportBooks(): Promise<ReportBookMeta[]> {
  const userId = uid();
  const snap = await getDocs(query(booksCol(userId), orderBy('updatedAt', 'desc')));
  return snap.docs.map(d => d.data() as ReportBookMeta);
}

export async function updateReportBookMeta(
  bookId: string,
  patch: Partial<Pick<ReportBookMeta, 'title' | 'issueDate' | 'logoLeftUrl' | 'logoRightUrl' | 'logoLeftHeight' | 'logoRightHeight'>>,
): Promise<void> {
  const userId = uid();
  await updateDoc(bookDoc(userId, bookId), { ...patch, updatedAt: Date.now() });
}

export async function deleteReportBook(bookId: string): Promise<void> {
  const userId = uid();
  // delete pages sub-collection then the book doc
  const pSnap = await getDocs(pagesCol(userId, bookId));
  await Promise.all(pSnap.docs.map(async pd => {
    const page = pd.data() as ReportBookPage;
    try { await deleteObject(storageRef(storage, page.storagePath)); } catch { /* already gone */ }
    await deleteDoc(pd.ref);
  }));
  await deleteDoc(bookDoc(userId, bookId));
}

// ── pages ─────────────────────────────────────────────────────────────────────

export async function addPageToBook(
  bookId: string,
  pdfBlob: Blob,
  birdId: string,
  birdLabel: string,
  currentPageCount: number,
): Promise<ReportBookPage> {
  const userId = uid();
  const pageId = nanoId();
  const storagePath = `reportBooks/${userId}/${bookId}/pages/${pageId}.pdf`;

  // upload the PDF
  const sRef = storageRef(storage, storagePath);
  await uploadBytes(sRef, pdfBlob, { contentType: 'application/pdf' });
  const downloadUrl = await getDownloadURL(sRef);

  const page: ReportBookPage = {
    id: pageId,
    bookId,
    order: currentPageCount,      // appended at the end; user can reorder in the UI
    birdId,
    birdLabel,
    storagePath,
    downloadUrl,
    addedAt: Date.now(),
  };

  await setDoc(pageDoc(userId, bookId, pageId), page);
  await updateDoc(bookDoc(userId, bookId), {
    pageCount: currentPageCount + 1,
    updatedAt: Date.now(),
  });
  return page;
}

export async function listPages(bookId: string): Promise<ReportBookPage[]> {
  const userId = uid();
  const snap = await getDocs(query(pagesCol(userId, bookId), orderBy('order', 'asc')));
  return snap.docs.map(d => d.data() as ReportBookPage);
}

export async function reorderPages(bookId: string, orderedPageIds: string[]): Promise<void> {
  const userId = uid();
  await Promise.all(
    orderedPageIds.map((pageId, idx) =>
      updateDoc(pageDoc(userId, bookId, pageId), { order: idx }),
    ),
  );
  await updateDoc(bookDoc(userId, bookId), { updatedAt: Date.now() });
}

export async function removePageFromBook(bookId: string, page: ReportBookPage): Promise<void> {
  const userId = uid();
  try { await deleteObject(storageRef(storage, page.storagePath)); } catch { /* ok */ }
  await deleteDoc(pageDoc(userId, bookId, page.id));
  // renumber remaining pages
  const remaining = await listPages(bookId);
  await Promise.all(remaining.map((p, idx) =>
    updateDoc(pageDoc(userId, bookId, p.id), { order: idx }),
  ));
  await updateDoc(bookDoc(userId, bookId), {
    pageCount: Math.max(0, remaining.length),
    updatedAt: Date.now(),
  });
}

// ── final multi-page PDF export ───────────────────────────────────────────────

/**
 * Downloads every page PDF from Storage, builds a cover-page canvas from the provided DOM node
 * (rendered offscreen), and combines everything into one high-fidelity multi-page PDF using pdf-lib.
 */
export async function exportBookAsPdf(
  book: ReportBookMeta,
  pages: ReportBookPage[],
  coverNode: HTMLElement,
  onProgress?: (step: string, pct: number) => void,
): Promise<void> {
  const { PDFDocument } = await import('pdf-lib');
  const { toCanvas, getFontEmbedCSS } = await import('html-to-image');

  const PAGE_W = 841.5;
  const PAGE_H = 663.75;

  const mergedDoc = await PDFDocument.create();

  // 1. Cover page
  onProgress?.('Rendering cover', 5);
  coverNode.style.visibility = 'visible';
  await document.fonts.ready;
  let fontCss: string | undefined;
  try { fontCss = await getFontEmbedCSS(coverNode); } catch { /* ok */ }
  const coverCanvas = await toCanvas(coverNode, {
    pixelRatio: 2, width: 1122, height: 885,
    cacheBust: true, backgroundColor: '#ffffff', fontEmbedCSS: fontCss,
  });
  coverNode.style.visibility = 'hidden';

  const coverJpgData = coverCanvas.toDataURL('image/jpeg', 0.94);
  const coverImage = await mergedDoc.embedJpg(coverJpgData);
  const coverPage = mergedDoc.addPage([PAGE_W, PAGE_H]);
  coverPage.drawImage(coverImage, {
    x: 0,
    y: 0,
    width: PAGE_W,
    height: PAGE_H,
  });

  // 2. Each bird report page (fetch the pre-rendered PDFs from Storage and merge)
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.(`Adding page ${i + 1} / ${pages.length} (${page.birdLabel})`, 10 + Math.round((i / pages.length) * 85));

    try {
      const resp = await fetch(page.downloadUrl);
      const pdfBytes = await resp.arrayBuffer();
      const srcPdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedDoc.copyPages(srcPdf, srcPdf.getPageIndices());
      copiedPages.forEach(p => mergedDoc.addPage(p));
    } catch (err) {
      console.error(`Failed to merge page ${page.birdLabel}:`, err);
    }
  }

  onProgress?.('Saving PDF', 98);
  const mergedPdfBytes = await mergedDoc.save();
  const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${book.title.replace(/\s+/g, '_')}_${book.issueDate}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  onProgress?.('Done', 100);
}

// PNG strip export (one image per page, zipped)
export async function exportBookAsPngZip(
  book: ReportBookMeta,
  pages: ReportBookPage[],
  coverNode: HTMLElement,
  onProgress?: (step: string, pct: number) => void,
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const { toCanvas, getFontEmbedCSS } = await import('html-to-image');
  const zip = new JSZip();

  onProgress?.('Rendering cover', 5);
  coverNode.style.visibility = 'visible';
  await document.fonts.ready;
  let fontCss: string | undefined;
  try { fontCss = await getFontEmbedCSS(coverNode); } catch { /* ok */ }
  const coverCanvas = await toCanvas(coverNode, {
    pixelRatio: 2, width: 1122, height: 885, cacheBust: true, backgroundColor: '#ffffff', fontEmbedCSS: fontCss,
  });
  coverNode.style.visibility = 'hidden';
  zip.file(`00_cover.png`, await canvasToBlob(coverCanvas));

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.(`Page ${i + 1}/${pages.length}`, 10 + Math.round((i / pages.length) * 85));
    const resp = await fetch(page.downloadUrl);
    zip.file(`${String(i + 1).padStart(2, '0')}_${page.birdLabel.replace(/\W+/g, '_')}.pdf`, await resp.blob());
  }

  onProgress?.('Zipping', 97);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${book.title.replace(/\s+/g, '_')}_${book.issueDate}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  onProgress?.('Done', 100);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('canvasToBlob failed')), 'image/png'));
}
