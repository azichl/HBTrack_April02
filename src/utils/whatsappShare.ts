// src/utils/whatsappShare.ts
// Share the generated PDF report through WhatsApp.
//
// Why this exists: WhatsApp Web / wa.me / whatsapp:// links accept ONLY text (+ optional phone).
// They cannot attach a file. So on desktop we upload the PDF to Firebase Storage and open
// WhatsApp Web with a ready message containing the download link. On phones we use the native
// share sheet (which lists WhatsApp and attaches the real PDF).

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

export interface WhatsAppShareInput {
  blob: Blob;            // the PDF, ideally pre-generated when the share modal opens
  fileName: string;      // e.g. Houbara_Tracking_Report_244292_2026-10-22.pdf
  birdId: string;
  title: string;         // e.g. "Houbara Tracking Report – 244292"
  phone?: string;        // optional, international format, digits only or with +
}

export type WhatsAppShareResult =
  | { method: 'native' }
  | { method: 'cancelled' }
  | { method: 'web'; url: string; waUrl: string }
  | { method: 'blocked'; url: string; waUrl: string }; // popup blocked → show manual button

const isTouchDevice = (): boolean =>
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS

const cleanPhone = (p?: string) => (p ? p.replace(/\D/g, '') : '');

export const buildWhatsAppUrl = (text: string, phone?: string): string => {
  const params = new URLSearchParams();
  const digits = cleanPhone(phone);
  if (digits) params.set('phone', digits);
  params.set('text', text);
  // Desktop → WhatsApp Web directly (it hands off to the desktop app if installed).
  return `https://web.whatsapp.com/send?${params.toString()}`;
};

async function uploadReport(blob: Blob, fileName: string, birdId: string): Promise<string> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const path = `shared-reports/${uid}/${birdId}/${Date.now()}_${fileName}`;
  const r = ref(getStorage(), path);
  await uploadBytes(r, blob, { contentType: 'application/pdf', contentDisposition: `inline; filename="${fileName}"` });
  return getDownloadURL(r); // tokenised URL, opens without login
}

/**
 * IMPORTANT: call this DIRECTLY from the click handler. Do not `await` anything before it
 * (generate the PDF blob earlier, e.g. when the modal opens). Safari/Chrome only allow
 * window.open() inside the user-gesture call stack, so the tab is opened first and
 * navigated after the upload finishes.
 */
export async function shareReportViaWhatsApp(input: WhatsAppShareInput): Promise<WhatsAppShareResult> {
  const { blob, fileName, birdId, title, phone } = input;
  const file = new File([blob], fileName, { type: 'application/pdf' });

  // 1) Phones / tablets: real file attachment through the native share sheet.
  if (isTouchDevice() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: title });
      return { method: 'native' };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return { method: 'cancelled' };
      // otherwise fall through to the link-based flow
    }
  }

  // 2) Desktop (or share failed): upload + WhatsApp Web with link.
  //    Do NOT use navigator.share here — on macOS it opens the system sheet (AirDrop, Messages…)
  //    which does not include WhatsApp Web.
  const win = window.open('', '_blank');           // must be synchronous
  if (win) {
    win.document.title = 'WhatsApp';
    win.document.body.innerHTML =
      '<p style="font:16px system-ui;padding:24px">Preparing report… / جارٍ تجهيز التقرير…</p>';
  }

  try {
    const url = await uploadReport(blob, fileName, birdId);
    const waUrl = buildWhatsAppUrl(`${title}\n${url}`, phone);
    if (win && !win.closed) {
      win.location.href = waUrl;
      return { method: 'web', url, waUrl };
    }
    return { method: 'blocked', url, waUrl };
  } catch (err) {
    win?.close();
    throw err;
  }
}

/** Optional helper: also save the PDF locally so the user can drag it into WhatsApp manually. */
export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
