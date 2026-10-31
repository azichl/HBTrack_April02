// components/reports/CoverPage.tsx
// Cover page rendered offscreen and captured during multi-page PDF/ZIP export.
// Includes:
// 1. Header with 2 logos and agency titles identical to single-bird reports.
// 2. Large centered title matching the collection name.
// 3. Subtitle with Issue Date ("Today").
// 4. Points / cards of included PTT IDs with ID, region, ring, and location information.
// 5. Footer matching the report design and brand maroon colors (#7a1c32).

import React from 'react';
import type { ReportBookPage, ReportBookCategory } from '../../src/types/multiReport';
import { PRESET_BOOKS } from '../../src/types/multiReport';

export interface CoverPageProps {
  title: string;
  issueDate: string;
  pageCount: number;
  pages?: ReportBookPage[];
  category?: ReportBookCategory;
  logoLeftUrl?: string;
  logoRightUrl?: string;
  logoLeftHeight?: number;
  logoRightHeight?: number;
  captureStyle?: React.CSSProperties;
}

export const CoverPage = React.forwardRef<HTMLDivElement, CoverPageProps>(
  (
    {
      title,
      issueDate,
      pageCount,
      pages = [],
      category,
      logoLeftUrl = '/qatar-houbara-center-logo.png',
      logoRightUrl = '/qatar-emblem.png',
      logoLeftHeight = 78,
      logoRightHeight = 64,
    },
    ref,
  ) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const effectiveDate = issueDate || todayIso;
    const isToday = effectiveDate === todayIso;

    const displayDate = (() => {
      try {
        return new Intl.DateTimeFormat('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(new Date(effectiveDate + 'T12:00:00Z'));
      } catch {
        return effectiveDate;
      }
    })();

    const presetAr = category && category !== 'custom' ? PRESET_BOOKS[category]?.titleAr : '';

    const defaultRegion = category === 'almaty'
      ? 'Almaty (ألماتي)'
      : category === 'zhezqazgan'
      ? 'Zhezqazgan (جيزقازغان)'
      : 'Kazakhstan (كازاخستان)';

    const totalBirds = pageCount || pages.length;

    return (
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
          visibility: 'hidden',
          position: 'fixed',
          top: -9999,
          left: -9999,
          zIndex: -1,
          backgroundColor: '#ffffff',
          fontFamily: "'IBM Plex Sans Arabic', 'Cairo', 'Inter', Arial, sans-serif",
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* ── 1. HEADER (Identical to Single Report Header) ── */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 36px 14px',
            borderBottom: '2.5px solid #7a1c32',
            backgroundColor: '#ffffff',
            direction: 'rtl',
          }}
        >
          {/* Right side: Emblem Logo + Agency Titles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img
              src={logoRightUrl}
              alt="شعار الدولة"
              style={{
                height: logoRightHeight,
                maxWidth: 180,
                objectFit: 'contain',
                display: 'block',
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/external-reserves-office-logo.png';
              }}
            />
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  color: '#1e293b',
                  fontFamily: "'Cairo', 'IBM Plex Sans Arabic', Arial, sans-serif",
                  lineHeight: 1.3,
                }}
              >
                مكتـــب محميـــات الدولـــة الخارجيـــة
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#475569',
                  fontFamily: "'Inter', Arial, sans-serif",
                  letterSpacing: '0.2px',
                }}
              >
                External Reserves Office of The State
              </div>
            </div>
          </div>

          {/* Left side: Qatar Houbara Center Logo */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src={logoLeftUrl}
              alt="Qatar Houbara Center"
              style={{
                height: logoLeftHeight,
                maxWidth: 290,
                objectFit: 'contain',
                display: 'block',
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/qatar-houbara-center-logo.png';
              }}
            />
          </div>
        </header>

        {/* ── 2. MAIN BODY ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '32px 48px 20px',
            background: 'linear-gradient(180deg, #ffffff 0%, #fbfbfc 40%, #f4f6f8 100%)',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* Accent Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 16px',
              borderRadius: 999,
              backgroundColor: '#7a1c3210',
              border: '1px solid #7a1c3225',
              color: '#7a1c32',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.5px',
              marginBottom: 12,
            }}
          >
            <span>🦅 تقرير إطلاق وتتبع طيور الحبارى</span>
            <span>•</span>
            <span>HOUBARA TRACKING COLLECTION</span>
          </div>

          {/* Big Title in Middle (Collection Name) */}
          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: '#7a1c32',
              textAlign: 'center',
              lineHeight: 1.25,
              margin: '0 0 6px 0',
              maxWidth: 950,
              fontFamily: "'Cairo', 'IBM Plex Sans Arabic', Arial, sans-serif",
            }}
          >
            {title}
          </h1>

          {/* Optional Arabic Preset Subtitle */}
          {presetAr && (
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#334155',
                textAlign: 'center',
                marginBottom: 8,
                direction: 'rtl',
              }}
            >
              {presetAr}
            </div>
          )}

          {/* Small Title with Issue Date "Today" */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              margin: '6px 0 16px',
              padding: '6px 22px',
              backgroundColor: '#ffffff',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            }}
          >
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
              Issue Date:{' '}
              <strong style={{ color: '#7a1c32', fontWeight: 800 }}>
                {isToday ? `Today (${displayDate})` : displayDate}
              </strong>
            </span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600, direction: 'rtl' }}>
              تاريخ الإصدار:{' '}
              <strong style={{ color: '#7a1c32', fontWeight: 800 }}>
                {isToday ? `اليوم (${effectiveDate})` : effectiveDate}
              </strong>
            </span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span
              style={{
                backgroundColor: '#7a1c32',
                color: '#ffffff',
                padding: '2px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {totalBirds} {totalBirds === 1 ? 'Bird' : 'Birds'}
            </span>
          </div>

          {/* Decorative Divider */}
          <div
            style={{
              width: 100,
              height: 3,
              borderRadius: 2,
              backgroundColor: '#7a1c32',
              marginBottom: 16,
            }}
          />

          {/* Points of PTT IDs with Information (ID, Ring, Region, Location) */}
          <div
            style={{
              width: '100%',
              maxWidth: 980,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 6,
                marginBottom: 10,
                borderBottom: '1.5px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#7a1c32',
                  letterSpacing: '0.3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#7a1c32' }} />
                <span>Included Transmitters & Birds • قائمة الأجهزة ومواقع الطيور المشمولة</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                Total: {pages.length} Pages
              </div>
            </div>

            {pages.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  backgroundColor: '#ffffff',
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: 13,
                }}
              >
                No bird pages added to this collection yet.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: pages.length > 4 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                  gap: 10,
                  overflow: 'hidden',
                  maxHeight: 350,
                }}
              >
                {pages.slice(0, 9).map((page, idx) => {
                  const pttDisplay = page.birdLabel || page.birdId;
                  const regionDisplay = page.region || defaultRegion;
                  const ringDisplay = page.ring || 'NA';
                  const locationDisplay = page.location || 'Kazakhstan';

                  return (
                    <div
                      key={page.id || idx}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRight: '4px solid #7a1c32',
                        borderRadius: 10,
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        direction: 'rtl',
                      }}
                    >
                      {/* Right info in RTL */}
                      <div style={{ minWidth: 0, flex: 1, textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              backgroundColor: '#7a1c32',
                              color: '#fff',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '1px 6px',
                            }}
                          >
                            #{String(idx + 1).padStart(2, '0')}
                          </span>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: 14,
                              color: '#1e293b',
                              fontFamily: 'monospace',
                            }}
                          >
                            PTT: {pttDisplay}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: '#475569',
                            marginTop: 3,
                            display: 'flex',
                            gap: 10,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>الحجل: <strong style={{ color: '#1e293b' }}>{ringDisplay}</strong></span>
                          <span>المنطقة: <strong style={{ color: '#1e293b' }}>{regionDisplay}</strong></span>
                        </div>

                        {locationDisplay && (
                          <div
                            style={{
                              fontSize: 10,
                              color: '#64748b',
                              marginTop: 2,
                              fontFamily: 'monospace',
                              direction: 'ltr',
                              textAlign: 'right',
                            }}
                          >
                            📍 {locationDisplay}
                          </div>
                        )}
                      </div>

                      {/* Left: page indicator */}
                      <div
                        style={{
                          backgroundColor: '#f1f5f9',
                          color: '#7a1c32',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '4px 8px',
                          whiteSpace: 'nowrap',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        ص {idx + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 3. FOOTER (Matching Single Report Footer & Colors) ── */}
        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 36px',
            borderTop: '2px solid #7a1c32',
            backgroundColor: '#ffffff',
            fontSize: 12,
            color: '#4b5563',
            fontFamily: "'IBM Plex Sans Arabic', 'Cairo', Arial, sans-serif",
            direction: 'rtl',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontWeight: 700, color: '#7a1c32' }}>
            المركز القطري لتكاثر الحبارى والصقور – كازاخستان
          </span>
          <span
            style={{
              direction: 'ltr',
              fontFamily: "'Inter', Arial, sans-serif",
              fontSize: 11,
              fontWeight: 600,
              color: '#6b7280',
            }}
          >
            Qatari Center for Houbara and Falcon Breeding – Kazakhstan
          </span>
        </footer>
      </div>
    );
  },
);
CoverPage.displayName = 'CoverPage';
CoverPage.displayName = 'CoverPage';
