import { toCanvas, getFontEmbedCSS } from 'html-to-image';
import { jsPDF } from 'jspdf';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitForImages(root: HTMLElement, timeoutMs = 8000) {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.race([
    Promise.all(
      imgs.map(img =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>(res => {
              img.addEventListener('load', () => res(), { once: true });
              img.addEventListener('error', () => res(), { once: true });
            })
      )
    ),
    sleep(timeoutMs)
  ]);
}

export async function generateReportPdfBlob(
  node: HTMLElement,
  waitForMap?: () => Promise<void>,
  pixelRatio = 2
): Promise<Blob> {
  await document.fonts.ready;
  await waitForImages(node);
  if (waitForMap) await waitForMap();
  await sleep(200);

  const width = Math.round(node.scrollWidth);
  const height = Math.round(node.scrollHeight);

  node.classList.add('trk-exporting');
  try {
    let fontEmbedCSS: string | undefined;
    try {
      fontEmbedCSS = await getFontEmbedCSS(node);
    } catch {
      fontEmbedCSS = undefined;
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
      }
    };

    await toCanvas(node, { ...options, pixelRatio: 1 });
    const canvas = await toCanvas(node, options);

    const pdf = new jsPDF({
      orientation: width >= height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [width, height],
      hotfixes: ['px_scaling'],
      compress: true
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, width, height, undefined, 'FAST');
    return pdf.output('blob');
  } finally {
    node.classList.remove('trk-exporting');
  }
}
