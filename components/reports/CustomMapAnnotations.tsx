import React from 'react';
import L from 'leaflet';

export type AnnotationShape = 'pill' | 'rect' | 'circle' | 'callout' | 'flag' | 'text-only';

export interface CustomMapAnnotation {
  id: string;
  text: string;
  shape: AnnotationShape;
  bgColor: string;
  textColor: string;
  borderColor: string;
  fontSize: number;
  lat: number;
  lon: number;
  xPercent: number;
  yPercent: number;
}

export function renderCustomAnnotationSvg(ann: CustomMapAnnotation): {
  svgHtml: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
} {
  const fontSize = ann.fontSize || 12;
  const text = ann.text || 'Label';
  const charW = fontSize * 0.65;
  const textW = Math.max(44, Math.ceil(text.length * charW));

  if (ann.shape === 'circle') {
    const diameter = Math.max(42, Math.min(96, textW + 16));
    const r = diameter / 2;
    return {
      width: diameter,
      height: diameter,
      anchorX: r,
      anchorY: r,
      svgHtml: `
        <svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block;">
          <circle cx="${r}" cy="${r}" r="${r - 2}" fill="${ann.bgColor}" stroke="${ann.borderColor}" stroke-width="2.2" />
          <text x="${r}" y="${r + 1}" text-anchor="middle" dominant-baseline="middle" font-family="'IBM Plex Sans Arabic', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${ann.textColor}">
            ${text}
          </text>
        </svg>
      `
    };
  }

  if (ann.shape === 'text-only') {
    const w = textW + 24;
    const h = fontSize + 14;
    return {
      width: w,
      height: h,
      anchorX: w / 2,
      anchorY: h / 2,
      svgHtml: `
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block;">
          <text x="${w / 2}" y="${h / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="'IBM Plex Sans Arabic', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${ann.textColor}" stroke="${ann.bgColor}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke fill">
            ${text}
          </text>
        </svg>
      `
    };
  }

  if (ann.shape === 'callout') {
    const boxW = textW + 24;
    const boxH = fontSize + 14;
    const totalH = boxH + 10;
    return {
      width: boxW,
      height: totalH,
      anchorX: boxW / 2,
      anchorY: totalH,
      svgHtml: `
        <svg width="${boxW}" height="${totalH}" viewBox="0 0 ${boxW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block;">
          <path d="M 6 1 H ${boxW - 6} Q ${boxW - 1} 1 ${boxW - 1} 6 V ${boxH - 5} Q ${boxW - 1} ${boxH} ${boxW - 6} ${boxH} H ${boxW / 2 + 7} L ${boxW / 2} ${totalH - 1} L ${boxW / 2 - 7} ${boxH} H 6 Q 1 ${boxH} 1 ${boxH - 5} V 6 Q 1 1 6 1 Z" fill="${ann.bgColor}" stroke="${ann.borderColor}" stroke-width="2" />
          <text x="${boxW / 2}" y="${boxH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="'IBM Plex Sans Arabic', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${ann.textColor}">
            ${text}
          </text>
        </svg>
      `
    };
  }

  if (ann.shape === 'flag') {
    const boxW = textW + 22;
    const boxH = fontSize + 12;
    const totalH = boxH + 16;
    return {
      width: boxW + 6,
      height: totalH,
      anchorX: 3,
      anchorY: totalH,
      svgHtml: `
        <svg width="${boxW + 6}" height="${totalH}" viewBox="0 0 ${boxW + 6} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block;">
          <line x1="3" y1="2" x2="3" y2="${totalH}" stroke="${ann.borderColor}" stroke-width="2.5" stroke-linecap="round" />
          <circle cx="3" cy="${totalH - 2}" r="3" fill="${ann.borderColor}" />
          <rect x="3" y="2" width="${boxW}" height="${boxH}" rx="4" fill="${ann.bgColor}" stroke="${ann.borderColor}" stroke-width="1.8" />
          <text x="${3 + boxW / 2}" y="${2 + boxH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="'IBM Plex Sans Arabic', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${ann.textColor}">
            ${text}
          </text>
        </svg>
      `
    };
  }

  const w = textW + 24;
  const h = fontSize + 14;
  const rx = ann.shape === 'pill' ? h / 2 : 4;
  return {
    width: w,
    height: h,
    anchorX: w / 2,
    anchorY: h / 2,
    svgHtml: `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block;">
        <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${rx}" fill="${ann.bgColor}" stroke="${ann.borderColor}" stroke-width="2" />
        <text x="${w / 2}" y="${h / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="'IBM Plex Sans Arabic', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${ann.textColor}">
          ${text}
        </text>
      </svg>
    `
  };
}

export function createCustomAnnotationDivIcon(ann: CustomMapAnnotation): L.DivIcon {
  const { svgHtml, width, height, anchorX, anchorY } = renderCustomAnnotationSvg(ann);
  return L.divIcon({
    className: 'bg-transparent cursor-grab active:cursor-grabbing',
    html: svgHtml,
    iconSize: [width, height],
    iconAnchor: [anchorX, anchorY]
  });
}
