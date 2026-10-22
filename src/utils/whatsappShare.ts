// src/utils/whatsappShare.ts  (v2 — replaces v1; fixes the "Preparing PDF for WhatsApp share…" hang)
//
// Root causes this version removes:
//  1. No timeout anywhere → any stalled step (PDF render, Storage upload) looks like an endless hang.
//     Firebase Storage's default maxUploadRetryTime is 10 MINUTES, so a blocked upload "hangs" silently.
//  2. Nothing told the user which stage was running → every stage now reports progress to the modal log.
//  3. Double clicks started two parallel runs (log showed two "Preparing…" lines) → single-flight guard.
//  4. Everything depended on the upload. Now WhatsApp ALWAYS opens: if PDF/upload fails or times out,
//     WhatsApp Web opens with the text summary and the PDF is downloaded so it can be attached by hand.

import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

export type ShareStage = 'pdf' | 'upload' | 'open';
export type ShareLog = (stage: ShareStage | 'info' | 'warn' | 'error', message: string) => void;

export interface WhatsAppShareInput {
  /** Existing PDF generator. MUST resolve to a Blob. Receives an AbortSignal it should honour if possible. */
  generatePdf: (signal: AbortSignal) => Promise<Blob>;
  fileName: string;
  birdId: string;
  title: string;                // "Houbara Tracking Report – 244289"
  summary?: string;             // coordinates / KPI text lines appended to the message
  phone?: string;               // optional recipient, international digits
  log?: ShareLog;               // writes to the black log box in the modal
  timeouts?: { pdfMs?: number; uploadMs?: number };
}

export type WhatsAppShareResult =
  | { method: 'native' }
  | { method: 'cancelled' }
  | { method: 'link'; url: string; waUrl: string }          // PDF link inside the message
  | { method: 'text-only'; waUrl: string; pdfDownloaded: boolean } // fallback
  | { method: 'blocked'; waUrl: string; url?: string };     // popup blocked → show manual button

/* ------------------------------ helpers ------------------------------ */

const isTouchDevice = () =>
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class StageTimeout extends Error {
  constructor(public stage: string, ms: number) { super(`${stage} timed out after ${Math.round(ms / 1000)}s`); }
}

function withTimeout<T>(stage: string, p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => { onTimeout?.(); reject(new StageTimeout(stage, ms)); }, ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export const buildWhatsAppUrl = (text: string, phone?: string) => {
  const q = new URLSearchParams();
  const digits = phone?.replace(/\D/g, '');
  if (digits) q.set('phone', digits);
  q.set('text', text);
  return `https://web.whatsapp.com/send?${q.toString()}`;
};

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function uploadPdf(blob: Blob, fileName: string, birdId: string, ms: number, log: ShareLog): Promise<string> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const storage = getStorage();
  storage.maxUploadRetryTime = ms;                            // fail fast instead of retrying for 10 min
  const r = ref(storage, `shared-reports/${uid}/${birdId}/${Date.now()}_${fileName}`);
  const task = uploadBytesResumable(r, blob, { contentType: 'application/pdf' });

  const done = new Promise<void>((resolve, reject) => {
    let lastPct = -1;
    task.on('state_changed',
      s => {
        const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
        if (pct !== lastPct && pct % 25 === 0) { lastPct = pct; log('upload', `Uploading PDF… ${pct}%`); }
      },
      err => reject(err),                                      // surfaces storage/unauthorized, storage/retry-limit-exceeded…
      () => resolve());
  });
  await withTimeout('Upload', done, ms, () => task.cancel());
  return getDownloadURL(r);
}

/* single-flight guard: ignore double clicks */
let running = false;

/**
 * Call DIRECTLY from the click handler (no await before it).
 * The WhatsApp tab is opened synchronously, then navigated when ready.
 */
export async function shareReportViaWhatsApp(input: WhatsAppShareInput): Promise<WhatsAppShareResult> {
  if (running) throw new Error('A share is already in progress');
  running = true;

  const log: ShareLog = input.log ?? (() => {});
  const pdfMs = input.timeouts?.pdfMs ?? 30_000;
  const uploadMs = input.timeouts?.uploadMs ?? 25_000;
  const { fileName, birdId, title, summary, phone } = input;

  // Open the tab NOW (user gesture) on desktop. Phones go through navigator.share instead.
  const touch = isTouchDevice();
  const win = touch ? null : window.open('', '_blank');
  if (win) {
    win.document.title = 'WhatsApp';
    win.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">Preparing report… / جارٍ تجهيز التقرير…</p>';
  }
  const openWa = (waUrl: string): boolean => {
    if (win && !win.closed) { win.location.href = waUrl; return true; }
    return false;
  };

  const ac = new AbortController();
  let blob: Blob | null = null;

  try {
    /* ---------- stage 1: PDF ---------- */
    log('pdf', '⏳ Rendering PDF…');
    const t0 = performance.now();
    try {
      blob = await withTimeout('PDF generation', input.generatePdf(ac.signal), pdfMs, () => ac.abort());
      log('pdf', `✅ PDF ready (${(blob.size / 1024).toFixed(0)} KB, ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      log('error', `❌ PDF failed: ${(e as Error).message}`);
      console.error('[WhatsApp share] PDF stage', e);
    }

    /* ---------- phones: native share with the real file ---------- */
    if (blob && touch) {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title, text: title });
          return { method: 'native' };
        } catch (e) {
          if ((e as DOMException).name === 'AbortError') return { method: 'cancelled' };
          log('warn', `⚠️ Native share failed (${(e as Error).message}); using link flow`);
        }
      }
    }

    /* ---------- stage 2: upload (only if we have a PDF) ---------- */
    let url: string | undefined;
    if (blob) {
      try {
        log('upload', '⏳ Uploading PDF…');
        url = await uploadPdf(blob, fileName, birdId, uploadMs, log);
        log('upload', '✅ Link created');
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        log('error', `❌ Upload failed: ${code || (e as Error).message}`);
        console.error('[WhatsApp share] upload stage', e);
      }
    }

    /* ---------- stage 3: open WhatsApp (always) ---------- */
    const lines = [title, summary, url].filter(Boolean) as string[];
    const waUrl = buildWhatsAppUrl(lines.join('\n'), phone);
    log('open', '⏳ Opening WhatsApp Web…');
    const opened = openWa(waUrl);

    if (url) {
      log('open', opened ? '✅ WhatsApp opened with the PDF link' : '⚠️ Popup blocked — use the button below');
      return opened ? { method: 'link', url, waUrl } : { method: 'blocked', waUrl, url };
    }

    // Fallback: text only + local download so the PDF can be attached manually
    let pdfDownloaded = false;
    if (blob) { downloadBlob(blob, fileName); pdfDownloaded = true; log('warn', '⬇️ PDF saved to Downloads — attach it manually in WhatsApp'); }
    log('open', opened ? '✅ WhatsApp opened with text summary' : '⚠️ Popup blocked — use the button below');
    return opened ? { method: 'text-only', waUrl, pdfDownloaded } : { method: 'blocked', waUrl };
  } finally {
    running = false;
  }
}
