/**
 * Pixel-faithful export of the Tracking Report (PNG / PDF).
 *
 * Why this exists: html2canvas re-implements CSS layout/text drawing itself, so
 * text baselines, flex-centred pills and icon/text rows come out shifted a few
 * px vs. what the browser shows. html-to-image serialises the live DOM into an
 * SVG <foreignObject> and lets the browser render it, so layout is identical.
 *
 * npm i html-to-image jspdf
 */
import { toCanvas, getFontEmbedCSS } from 'html-to-image';
import { jsPDF } from 'jspdf';

export interface ExportOptions {
  fileName: string; // without extension
  format: 'pdf' | 'png';
  pixelRatio?: number; // default 2 (use 3 for print-grade PNG)
  /** Resolve when the map has finished loading tiles (see usage below). */
  waitForMap?: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForImages(root: HTMLElement, timeoutMs = 8000) {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.race([
    Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((res) => {
              img.addEventListener('load', () => res(), { once: true });
              img.addEventListener('error', () => res(), { once: true });
            }),
      ),
    ),
    sleep(timeoutMs),
  ]);
}

export async function exportReport(node: HTMLElement, opts: ExportOptions): Promise<void> {
  const { fileName, format, pixelRatio = 2, waitForMap } = opts;

  // 1. Everything that affects layout must be ready BEFORE capture.
  await document.fonts.ready;
  await waitForImages(node);
  if (waitForMap) await waitForMap();
  await sleep(150); // let the final paint settle

  // 2. Freeze the capture size to the on-screen page size.
  const width = Math.round(node.scrollWidth);
  const height = Math.round(node.scrollHeight);

  node.classList.add('trk-exporting');
  try {
    // Embed web fonts once (cross-origin stylesheets are the usual reason fonts fall back).
    let fontEmbedCSS: string | undefined;
    try {
      fontEmbedCSS = await getFontEmbedCSS(node);
    } catch {
      fontEmbedCSS = undefined; // fall back to the library default
    }

    const options = {
      pixelRatio,
      width,
      height,
      cacheBust: true,
      backgroundColor: '#ffffff',
      fontEmbedCSS,
      style: { margin: '0', boxShadow: 'none', transform: 'none' } as Partial<CSSStyleDeclaration>,
      filter: (el: HTMLElement) => {
        if (!el || !el.classList) return true;
        return !(
          el.classList.contains('no-export') ||
          el.classList.contains('no-print') ||
          el.classList.contains('no-export-snapshot') ||
          el.classList.contains('drag-handle') ||
          el.classList.contains('logo-control-popover')
        );
      },
    };

    // Safari/WebKit quirk: the first foreignObject render can miss images/fonts.
    // A throw-away warm-up render makes the second one reliable on every browser.
    await toCanvas(node, { ...options, pixelRatio: 1 });
    const canvas = await toCanvas(node, options);

    if (format === 'png') {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${fileName}.png`;
      a.click();
      return;
    }

    // PDF: page = exactly the captured size (landscape A4 ratio), no re-scaling blur.
    const pdf = new jsPDF({
      orientation: width >= height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
      hotfixes: ['px_scaling'],
      compress: true,
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, width, height, undefined, 'FAST');
    pdf.save(`${fileName}.pdf`);
  } finally {
    node.classList.remove('trk-exporting');
  }
}

/** Leaflet helper: resolves when all visible tile layers are loaded. */
export function leafletIdle(map: import('leaflet').Map, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const layers: any[] = [];
    map.eachLayer((l: any) => { if (l._url && l._tiles) layers.push(l); });
    const loading = layers.filter((l) => l._loading);
    if (loading.length === 0) return finish();
    let left = loading.length;
    loading.forEach((l) => l.once('load', () => { if (--left === 0) finish(); }));
    setTimeout(finish, timeoutMs);
  });
}
