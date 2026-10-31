// components/reports/CoverPage.tsx
// The cover page rendered offscreen and captured during multi-page PDF/ZIP export.
// Mount it once in CustomMapProductionReport, keep it hidden, pass its ref to the exporter.

import React from 'react';

export interface CoverPageProps {
  title: string;               // e.g. "Almaty Houbara Release Report"
  issueDate: string;           // yyyy-mm-dd, displayed as e.g. "2026-10-31"
  pageCount: number;
  logoLeftUrl?: string;
  logoRightUrl?: string;
  logoLeftHeight?: number;
  logoRightHeight?: number;
  /** Applied while visibility is toggled for capture; keep display:none style outside. */
  captureStyle?: React.CSSProperties;
}

export const CoverPage = React.forwardRef<HTMLDivElement, CoverPageProps>(
  (
    {
      title,
      issueDate,
      pageCount,
      logoLeftUrl = '/qatar-houbara-center-logo.png',
      logoRightUrl = '/qatar-emblem.png',
      logoLeftHeight = 78,
      logoRightHeight = 64,
    },
    ref,
  ) => {
    const displayDate = (() => {
      try { return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(issueDate + 'T12:00:00Z')); }
      catch { return issueDate; }
    })();

    return (
      // Design-lock: 1122 × 885 CSS px — identical to the single-report frame
      <div
        ref={ref}
        style={{
          width: 1122,
          height: 885,
          minWidth: 1122,
          minHeight: 885,
          maxWidth: 1122,
          maxHeight: 885,
          overflow: 'hidden',
          visibility: 'hidden',   // toggled to visible just before capture
          position: 'fixed',
          top: -9999,
          left: -9999,
          zIndex: -1,
          backgroundColor: '#ffffff',
          fontFamily: "'Cairo', 'Inter', Arial, sans-serif",
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── header bar (identical to the single report) ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px 12px',
          borderBottom: '2px solid #7a1c32',
        }}>
          {/* left logo */}
          <img
            src={logoLeftUrl}
            alt="Qatar Houbara Center"
            style={{ height: logoLeftHeight, maxWidth: 280, objectFit: 'contain', display: 'block' }}
          />

          {/* right block: Arabic name + English name + emblem */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', direction: 'rtl', fontFamily: "'Cairo', Arial, sans-serif" }}>
                مكتـــب محميـــات الدولـــة الخارجيـــة
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>
                External Reserves Office of The State
              </div>
            </div>
            <img
              src={logoRightUrl}
              alt="Qatar Emblem"
              style={{ height: logoRightHeight, maxWidth: 160, objectFit: 'contain', display: 'block' }}
            />
          </div>
        </div>

        {/* ── main body ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 64px',
          gap: 24,
          background: 'linear-gradient(160deg, #fafafa 0%, #f1f5f9 100%)',
        }}>
          {/* decorative accent line */}
          <div style={{ width: 80, height: 4, borderRadius: 2, background: '#7a1c32' }} />

          {/* main title */}
          <h1 style={{
            fontSize: 40,
            fontWeight: 800,
            color: '#1e293b',
            textAlign: 'center',
            lineHeight: 1.2,
            margin: 0,
            maxWidth: 800,
          }}>
            {title}
          </h1>

          {/* issue date */}
          <p style={{ fontSize: 18, color: '#475569', fontWeight: 500, margin: 0 }}>
            Issue Date: <strong style={{ color: '#7a1c32' }}>{displayDate}</strong>
          </p>

          {/* page count badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            padding: '8px 20px',
            borderRadius: 999,
            background: '#7a1c32',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
          }}>
            {pageCount} Bird Report{pageCount !== 1 ? 's' : ''} Included
          </div>
        </div>

        {/* ── footer (identical to single report) ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 32px',
          borderTop: '1px solid #e2e8f0',
          fontSize: 11,
          color: '#64748b',
        }}>
          <span>Qatari Center for Houbara and Falcon Breeding – Kazakhstan</span>
          <span style={{ direction: 'rtl', fontFamily: "'Cairo', Arial, sans-serif" }}>
            المركز القطري لتكاثر الحباري والصقور – كازاخستان
          </span>
        </div>
      </div>
    );
  },
);
CoverPage.displayName = 'CoverPage';
