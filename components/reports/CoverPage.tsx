// components/reports/CoverPage.tsx
// Multi-bird collection report cover page.
// Design updates:
// 1. Two logos identical to single report header (State Emblem on right, Houbara Center logo on left).
// 2. Removed "Today" and "اليوم" from the issue date display.
// 3. Page number indicator displayed on the same line without breaking (e.g., "ص 2" or "Page 2").
// 4. Directional layout:
//    - In Arabic mode: All tables and cards start from right to left (RTL), PTT ID on right, page number on left.
//    - In English mode: All tables and cards start from left to right (LTR), PTT ID on left, page number on right.
// 5. De-duplicated PTT IDs so each bird transmitter appears only once.
// 6. Region accurately populated from report subtitle (e.g. Lebap Region – Turkmenistan).
// 7. Report footer matching the single report footer colors (#6b7280, #4b5563, #d9dbe1).

import React, { useMemo } from 'react';
import type { ReportBookPage, ReportBookCategory } from '../../src/types/multiReport';
import { PRESET_BOOKS } from '../../src/types/multiReport';

export interface CoverPageProps {
  title: string;
  issueDate: string;
  pageCount: number;
  pages?: ReportBookPage[];
  category?: ReportBookCategory;
  language?: 'ar' | 'en';
  activeBirdId?: string;
  activeBirdRegion?: string;
  activeBirdLocation?: string;
  logoLeftUrl?: string;
  logoRightUrl?: string;
  logoLeftHeight?: number;
  logoLeftWidth?: number;
  logoRightHeight?: number;
  logoRightWidth?: number;
}

export const CoverPage = React.forwardRef<HTMLDivElement, CoverPageProps>(
  (
    {
      title,
      issueDate,
      pageCount,
      pages = [],
      category,
      language = 'ar',
      activeBirdId,
      activeBirdRegion,
      activeBirdLocation,
      logoLeftUrl = '/qatar-houbara-center-logo.png',
      logoRightUrl = '/qatar-emblem.png',
      logoLeftHeight = 78,
      logoLeftWidth = 260,
      logoRightHeight = 64,
      logoRightWidth = 240,
    },
    ref,
  ) => {
    const isAr = language === 'ar';
    const effectiveDate = issueDate || new Date().toISOString().slice(0, 10);

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
      ? (isAr ? 'منطقة ألماتي' : 'Almaty Region')
      : category === 'zhezqazgan'
      ? (isAr ? 'منطقة جيزقازغان' : 'Zhezqazgan Region')
      : (isAr ? 'كازاخستان' : 'Kazakhstan');

    // ── De-duplicate pages by unique PTT ID / birdLabel so each PTT ID appears only once ──
    const uniqueBirds = useMemo(() => {
      const seen = new Set<string>();
      const list: ReportBookPage[] = [];
      for (const p of pages) {
        const idKey = String(p.birdLabel || p.birdId || '').trim();
        if (idKey && !seen.has(idKey)) {
          seen.add(idKey);
          list.push(p);
        }
      }
      return list;
    }, [pages]);

    return (
      <div
        ref={ref}
        id="houbara-cover-page"
        style={{
          width: 1122,
          height: 885,
          minWidth: 1122,
          minHeight: 885,
          maxWidth: 1122,
          maxHeight: 885,
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          fontFamily: "'IBM Plex Sans Arabic', 'Cairo', 'Inter', Arial, sans-serif",
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          position: 'relative',
          top: 0,
          left: 0,
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
            direction: isAr ? 'rtl' : 'ltr',
            boxSizing: 'border-box',
          }}
        >
          {/* Emblem Logo */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src={logoRightUrl}
              alt="شعار الدولة"
              style={{
                height: `${logoRightHeight}px`,
                maxWidth: `${logoRightWidth}px`,
                width: 'auto',
                objectFit: 'contain',
                display: 'block',
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/qatar-emblem.png';
              }}
            />
          </div>

          {/* Qatar Houbara Center Logo */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src={logoLeftUrl}
              alt="المركز القطري لتكاثر الحبارى والصقور"
              style={{
                height: `${logoLeftHeight}px`,
                maxWidth: `${logoLeftWidth}px`,
                width: 'auto',
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
            padding: '36px 48px 24px',
            background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 45%, #f4f6f8 100%)',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* Big Title in Middle (Collection Name) */}
          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: '#7a1c32',
              textAlign: 'center',
              lineHeight: 1.25,
              margin: '12px 0 6px 0',
              maxWidth: 960,
              fontFamily: "'Cairo', 'IBM Plex Sans Arabic', Arial, sans-serif",
            }}
          >
            {title}
          </h1>

          {/* Optional Arabic Preset Title */}
          {presetAr && (
            <div
              style={{
                fontSize: 19,
                fontWeight: 700,
                color: '#334155',
                textAlign: 'center',
                marginBottom: 8,
                direction: isAr ? 'rtl' : 'ltr',
              }}
            >
              {presetAr}
            </div>
          )}

          {/* Small Title with Issue Date (NO "Today" and NO "اليوم") */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              margin: '8px 0 24px',
              padding: '7px 26px',
              backgroundColor: '#ffffff',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              direction: isAr ? 'rtl' : 'ltr',
            }}
          >
            {isAr ? (
              <>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
                  تاريخ الإصدار:{' '}
                  <strong style={{ color: '#7a1c32', fontWeight: 800 }}>{effectiveDate}</strong>
                </span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 600, direction: 'ltr' }}>
                  Issue Date:{' '}
                  <strong style={{ color: '#7a1c32', fontWeight: 800 }}>{displayDate}</strong>
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>
                  Issue Date:{' '}
                  <strong style={{ color: '#7a1c32', fontWeight: 800 }}>{displayDate}</strong>
                </span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 600, direction: 'rtl' }}>
                  تاريخ الإصدار:{' '}
                  <strong style={{ color: '#7a1c32', fontWeight: 800 }}>{effectiveDate}</strong>
                </span>
              </>
            )}
          </div>

          {/* Points of PTT IDs with Information (ID, Region, Location) */}
          <div
            style={{
              width: '100%',
              maxWidth: 1030,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              minHeight: 0,
            }}
          >
            {/* Points Section Header Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px',
                backgroundColor: '#7a1c320d',
                border: '1px solid #7a1c3225',
                borderRight: isAr ? '5px solid #7a1c32' : undefined,
                borderLeft: !isAr ? '5px solid #7a1c32' : undefined,
                borderRadius: 8,
                marginBottom: 14,
                direction: isAr ? 'rtl' : 'ltr',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#7a1c32',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#7a1c32', display: 'inline-block' }} />
                <span>
                  {isAr
                    ? 'بيانات أجهزة التتبع والطيور المشمولة'
                    : 'Included Transmitters & Locations'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
                {isAr
                  ? `المجموع: ${uniqueBirds.length} ${uniqueBirds.length === 1 ? 'جهاز' : 'أجهزة'}`
                  : `Total: ${uniqueBirds.length} ${uniqueBirds.length === 1 ? 'Transmitter' : 'Transmitters'}`}
              </div>
            </div>

            {uniqueBirds.length === 0 ? (
              <div
                style={{
                  padding: 28,
                  backgroundColor: '#ffffff',
                  borderRadius: 10,
                  border: '1.5px dashed #cbd5e1',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: 13,
                }}
              >
                {isAr ? 'لم تتم إضافة أي أجهزة إلى هذه المجموعة بعد.' : 'No bird pages added to this collection yet.'}
              </div>
            ) : (
              <div
                style={{
                  display: uniqueBirds.length === 1 ? 'flex' : 'grid',
                  justifyContent: uniqueBirds.length === 1 ? 'center' : undefined,
                  gridTemplateColumns: uniqueBirds.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                  gap: 14,
                  overflow: 'hidden',
                  maxHeight: 390,
                  width: '100%',
                }}
              >
                {uniqueBirds.slice(0, 9).map((page, idx) => {
                  const pttDisplay = page.birdLabel || page.birdId;

                  // Use active bird region if this card matches active bird, or stored page region
                  const isCurrentActive = Boolean(
                    (activeBirdId && (page.birdLabel === activeBirdId || page.birdId === activeBirdId)) ||
                    uniqueBirds.length === 1
                  );

                  const regionDisplay = (isCurrentActive && activeBirdRegion)
                    ? activeBirdRegion
                    : (page.region && page.region !== 'Kazakhstan')
                    ? page.region
                    : activeBirdRegion || page.region || defaultRegion;

                  const locationDisplay = (isCurrentActive && activeBirdLocation)
                    ? activeBirdLocation
                    : page.location || 'Kazakhstan';

                  const ringDisplay = page.ring || 'NA';

                  return (
                    <div
                      key={page.id || idx}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRight: isAr ? '4px solid #7a1c32' : undefined,
                        borderLeft: !isAr ? '4px solid #7a1c32' : undefined,
                        borderRadius: 10,
                        padding: '12px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 7,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        direction: isAr ? 'rtl' : 'ltr',
                        textAlign: isAr ? 'right' : 'left',
                        boxSizing: 'border-box',
                        width: uniqueBirds.length === 1 ? '560px' : 'auto',
                      }}
                    >
                      {/* Top Row:
                          In English: PTT ID on Left, Page number on Right
                          In Arabic:  PTT ID on Right, Page number on Left
                          (handled naturally by flex container under direction: rtl/ltr)
                      */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #f1f5f9',
                          paddingBottom: 7,
                          direction: isAr ? 'rtl' : 'ltr',
                        }}
                      >
                        {/* PTT ID + Point badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              backgroundColor: '#7a1c32',
                              color: '#ffffff',
                              fontSize: 11,
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: 15,
                              color: '#1e293b',
                              fontFamily: 'monospace',
                              letterSpacing: '0.2px',
                            }}
                          >
                            PTT: {pttDisplay}
                          </span>
                        </div>

                        {/* Page Number (STRICTLY ON THE SAME LINE, NEVER BREAKS) */}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: '#f1f5f9',
                            color: '#7a1c32',
                            padding: '3px 10px',
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            flexShrink: 0,
                            lineHeight: 1,
                          }}
                        >
                          {isAr ? `ص ${idx + 2}` : `Page ${idx + 2}`}
                        </span>
                      </div>

                      {/* Detail points */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          fontSize: 12,
                          color: '#475569',
                          direction: isAr ? 'rtl' : 'ltr',
                        }}
                      >
                        {/* Ring */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#64748b' }}>
                            {isAr ? 'رقم الحجل (Ring):' : 'Ring Number:'}
                          </span>
                          <strong style={{ color: '#1e293b' }}>{ringDisplay}</strong>
                        </div>

                        {/* Region */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#64748b' }}>
                            {isAr ? 'المنطقة (Region):' : 'Region:'}
                          </span>
                          <strong style={{ color: '#7a1c32', fontWeight: 700 }}>{regionDisplay}</strong>
                        </div>

                        {/* Location */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ color: '#64748b' }}>
                            {isAr ? 'الموقع (Location):' : 'Location:'}
                          </span>
                          <strong style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 11, direction: 'ltr' }}>
                            📍 {locationDisplay}
                          </strong>
                        </div>
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
            borderTop: '1.5px solid #d9dbe1',
            backgroundColor: '#ffffff',
            fontSize: 12,
            color: '#6b7280',
            fontFamily: "'IBM Plex Sans Arabic', 'Cairo', Arial, sans-serif",
            direction: isAr ? 'rtl' : 'ltr',
            boxSizing: 'border-box',
          }}
        >
          {isAr ? (
            <>
              <span style={{ fontWeight: 600, color: '#4b5563' }}>
                المركز القطري لتكاثر الحبارى والصقور – كازاخستان
              </span>
              <span
                style={{
                  direction: 'ltr',
                  fontFamily: "'Inter', Arial, sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#6b7280',
                }}
              >
                Qatari Center for Houbara and Falcon Breeding - Kazakhstan
              </span>
            </>
          ) : (
            <>
              <span
                style={{
                  direction: 'ltr',
                  fontFamily: "'Inter', Arial, sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                  color: '#6b7280',
                }}
              >
                Qatari Center for Houbara and Falcon Breeding - Kazakhstan
              </span>
              <span style={{ fontWeight: 600, color: '#4b5563', direction: 'rtl' }}>
                المركز القطري لتكاثر الحبارى والصقور – كازاخستان
              </span>
            </>
          )}
        </footer>
      </div>
    );
  },
);
CoverPage.displayName = 'CoverPage';
