// src/utils/whatsappShare.ts  (v3 — replaces v1/v2)
//
// Goal: ONE fast click → WhatsApp Mac app opens directly with the message + PDF link,
// and (optionally) the report IMAGE is already in the clipboard, so ⌘V pastes it into the chat.
//
// How it becomes fast: all slow work (PDF render, PNG render, Storage upload) is done in the
// background BEFORE the click (when the share modal / Export menu opens, and again 1.5 s after
// the report changes). The click handler itself does zero awaits.
//
// Hard browser limits (cannot be worked around from a web page):
//  • WhatsApp links (whatsapp://, wa.me, web.whatsapp.com) carry text + optional phone only.
//  • The async Clipboard API accepts text/html/plain and image/png, NOT application/pdf or files.
//  So: the PDF travels as a link inside the message; the PNG image can be pasted with ⌘V.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

/* ------------------------------- types ------------------------------- */

export type LogKind = 'pdf' | 'upload' | 'open' | 'info' | 'ok' | 'warn' | 'error';
export type ShareLog = (kind: LogKind, message: string) => void;
export type PrepareStatus = 'idle' | 'working' | 'ready' | 'error';
export type WaTarget = 'app' | 'web';

export interface PrepareInput {
  key: string;                                            // hash of report document + bird + data version
  birdId: string;
  fileName: string;
  generatePdf: (signal: AbortSignal) => Promise<Blob>;    // EXISTING "Export PDF (A4)" pipeline
  generatePng?: (signal: AbortSignal) => Promise<Blob>;   // EXISTING "Export PNG" pipeline (optional)
  log?: ShareLog;
  timeouts?: { pdfMs?: number; pngMs?: number; uploadMs?: number };
}

export interface Prepared {
  key: string;
  pdf: Blob;
  png?: Blob;
  url?: string;           // Storage download URL (undefined if upload failed/timed out)
  fileName: string;
}

/* ------------------------------ helpers ------------------------------ */

export class StageTimeout extends Error {
  constructor(public stage: string, ms: number) { super(`${stage} timed out after ${Math.round(ms / 1000)}s`); }
}

function withTimeout<T>(stage: string, p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => { onTimeout?.(); reject(new StageTimeout(stage, ms)); }, ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

/** Fast non-crypto string hash (cyrb53) for cache keys. */
export function hashKey(...parts: unknown[]): string {
  const s = parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join('|');
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const isTouchDevice = () =>
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isDesktopMac = () => /Mac/i.test(navigator.platform) && !isTouchDevice();

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function uploadPdf(blob: Blob, fileName: string, birdId: string, ms: number, log?: ShareLog): Promise<string> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const storage = getStorage();
  (storage as any).maxUploadRetryTime = ms;                       // never "hang" for the 10-min default
  const r = ref(storage, `shared-reports/${uid}/${birdId}/${Date.now()}_${fileName}`);
  const task = uploadBytesResumable(r, blob, { contentType: 'application/pdf' });
  const done = new Promise<void>((resolve, reject) => {
    let lastPct = -1;
    task.on('state_changed',
      s => {
        const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
        if (pct !== lastPct && pct % 25 === 0 && log) { lastPct = pct; log('upload', `⏳ Uploading PDF… ${pct}%`); }
      },
      reject,
      () => resolve());
  });
  await withTimeout('Upload', done, ms, () => task.cancel());
  return getDownloadURL(r);
}

/* --------------------------- prepare + cache -------------------------- */
// Only the latest key is kept. A new key aborts the previous run.

let current: { key: string; promise: Promise<Prepared>; abort: AbortController } | null = null;

export function prepareShare(input: PrepareInput): Promise<Prepared> {
  if (current?.key === input.key) return current.promise;
  current?.abort.abort();

  const abort = new AbortController();
  const log = input.log ?? (() => {});
  const pdfMs = input.timeouts?.pdfMs ?? 30_000;
  const pngMs = input.timeouts?.pngMs ?? 20_000;
  const upMs = input.timeouts?.uploadMs ?? 25_000;

  const promise = (async (): Promise<Prepared> => {
    const t0 = performance.now();
    log('info', '⏳ Preparing report in background…');

    // PDF (required) and PNG (optional) in parallel
    const pdfP = withTimeout('PDF generation', input.generatePdf(abort.signal), pdfMs, () => abort.abort());
    const pngP = input.generatePng
      ? withTimeout('PNG generation', input.generatePng(abort.signal), pngMs).catch(e => {
          log('warn', `⚠️ Image copy unavailable: ${(e as Error).message}`);
          return undefined;
        })
      : Promise.resolve(undefined);

    const pdf = await pdfP;                                 // throws → status 'error'
    log('ok', `✅ PDF ready (${(pdf.size / 1024).toFixed(0)} KB, ${((performance.now() - t0) / 1000).toFixed(1)}s)`);

    // Upload (non-fatal)
    let url: string | undefined;
    try {
      url = await uploadPdf(pdf, input.fileName, input.birdId, upMs, log);
      log('ok', '✅ PDF link ready');
    } catch (e) {
      log('warn', `⚠️ Upload failed (${(e as { code?: string }).code ?? (e as Error).message}) — link will be omitted`);
      console.error('[share] upload', e);
    }
    const png = await pngP;
    return { key: input.key, pdf, png, url, fileName: input.fileName };
  })();

  current = { key: input.key, promise, abort };
  promise.catch(() => { if (current?.promise === promise) current = null; });   // allow retry
  return promise;
}

/* ------------------------------ the click ----------------------------- */

export interface SendOptions {
  prepared: Prepared;
  title: string;
  summary?: string;
  phone?: string;                 // international digits
  target?: WaTarget;              // default: 'app' on desktop Mac, 'web' elsewhere
  copyImage?: boolean;            // default true when a PNG exists
  log?: ShareLog;
}

export interface SendResult { target: WaTarget; imageCopied: boolean; pdfDownloaded: boolean; waUrl: string }

/**
 * MUST be called synchronously from a click handler. No awaits in here by design.
 */
export function sendToWhatsApp(o: SendOptions): SendResult {
  const log = o.log ?? (() => {});
  const target: WaTarget = o.target ?? (isDesktopMac() ? 'app' : 'web');
  const digits = o.phone?.replace(/\D/g, '');

  // 1) message text (PDF link inside)
  const text = [o.title, o.summary, o.prepared.url].filter(Boolean).join('\n');
  const q = new URLSearchParams();
  if (digits) q.set('phone', digits);
  q.set('text', text);
  const waUrl = target === 'app'
    ? `whatsapp://send?${q.toString()}`
    : `https://web.whatsapp.com/send?${q.toString()}`;

  // 2) clipboard image (⌘V in the chat). Must start inside the gesture; do not await.
  let imageCopied = false;
  if ((o.copyImage ?? true) && o.prepared.png && navigator.clipboard && 'ClipboardItem' in window) {
    try {
      navigator.clipboard
        .write([new ClipboardItem({ 'image/png': o.prepared.png })])
        .then(() => log('ok', '📋 Report image copied — press ⌘V in the chat to paste it'))
        .catch(e => log('warn', `⚠️ Could not copy image: ${(e as Error).message}`));
      imageCopied = true;
    } catch (e) {
      log('warn', `⚠️ Could not copy image: ${(e as Error).message}`);
    }
  }

  // 3) no link available (upload failed) → save the PDF so it can be attached manually
  let pdfDownloaded = false;
  if (!o.prepared.url) {
    downloadBlob(o.prepared.pdf, o.prepared.fileName);
    pdfDownloaded = true;
    log('warn', '⬇️ PDF saved to Downloads — attach it manually in WhatsApp');
  }

  // 4) open WhatsApp
  if (target === 'app') {
    window.location.href = waUrl;                           // custom scheme → Mac app (browser may ask once)
    log('ok', '🚀 Opening WhatsApp app…');
  } else {
    const w = window.open(waUrl, '_blank', 'noopener');
    log(w ? 'ok' : 'warn', w ? '🚀 Opening WhatsApp Web…' : '⚠️ Popup blocked — use "Open WhatsApp Web"');
  }
  return { target, imageCopied, pdfDownloaded, waUrl };
}

/** Optional secondary action: system share sheet with the real PDF file (also sync-friendly). */
export async function shareNative(p: Prepared, title: string): Promise<boolean> {
  const file = new File([p.pdf], p.fileName, { type: 'application/pdf' });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try { await navigator.share({ files: [file], title, text: title }); return true; }
  catch (e) { if ((e as DOMException).name === 'AbortError') return true; return false; }
}

/* ------------------------------ React hook ---------------------------- */

export function useWhatsAppShare(input: PrepareInput | null, enabled: boolean) {
  const [status, setStatus] = useState<PrepareStatus>('idle');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const key = input?.key;

  const run = useCallback(() => {
    const inp = inputRef.current;
    if (!inp) return () => {};
    let alive = true;
    setStatus('working'); setError(null);
    prepareShare(inp)
      .then(p => { if (alive) { setPrepared(p); setStatus('ready'); } })
      .catch(e => { if (alive) { setError((e as Error).message); setStatus('error'); } });
    return () => { alive = false; };
  }, []);

  // pre-warm when enabled, and re-prepare 1.5 s after the report changes
  useEffect(() => {
    if (!enabled || !key) return;
    setPrepared(p => (p?.key === key ? p : null));
    setStatus('working');
    let cancel = () => {};
    const t = setTimeout(() => { cancel = run(); }, 1500);
    return () => { clearTimeout(t); cancel(); };
  }, [enabled, key, run]);

  const ready = status === 'ready' && prepared?.key === key;
  return { status, ready, prepared: ready ? prepared : null, error, retry: run };
}

export type WhatsAppShareResult =
  | { method: 'app' | 'web'; waUrl: string }
  | { method: 'native' }
  | { method: 'blocked'; waUrl: string };

/** Backwards-compatible one-call wrapper */
export async function shareReportViaWhatsApp(options: {
  generatePdf: (signal?: AbortSignal) => Promise<Blob>;
  fileName: string;
  birdId: string;
  title: string;
  summary?: string;
  phone?: string;
  target?: WaTarget;
  log?: ShareLog;
  timeouts?: { pdfMs?: number; uploadMs?: number };
}): Promise<WhatsAppShareResult> {
  const log = options.log ?? (() => {});
  const prepared = await prepareShare({
    key: `${options.birdId}_${Date.now()}`,
    birdId: options.birdId,
    fileName: options.fileName,
    generatePdf: (signal) => options.generatePdf(signal),
    log,
    timeouts: options.timeouts
  });
  const res = sendToWhatsApp({
    prepared,
    title: options.title,
    summary: options.summary,
    phone: options.phone,
    target: options.target,
    log
  });
  return { method: res.target, waUrl: res.waUrl };
}
