// components/reports/CoverPage.tsx
// Multi-bird collection report cover page.
// Design requirements:
// 1. Two logos identical to single report header (State Emblem on right, Houbara Center logo on left).
//    No duplicated HTML text next to the emblem logo.
// 2. Maroon horizontal rule (#7a1c32) separating header from body.
// 3. Large centered title in the middle (name of collection).
// 4. Clean subtitle directly under it with Issue Date "Today" (no extra tags or bird count pills).
// 5. Section with points / cards of included PTT IDs (de-duplicated so each PTT ID appears only once).
// 6. Each card displays PTT ID, Ring Number, Region (from report subtitle, e.g. Lebap Region – Turkmenistan), and Location coordinates.
// 7. Footer matching the report footer with identical agency names and colors (#6b7280, #4b5563, #d9dbe1).

import React, { useMemo } from 'react';
import type { ReportBookPage, ReportBookCategory } from '../../src/types/multiReport';
import { PRESET_BOOKS } from '../../src/types/multiReport';

export interface CoverPageProps {
  title: string;
  issueDate: string;
  pageCount: number;
  pages?: ReportBookPage[];
  category?: ReportBookCategory;
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
      ? 'Almaty Region'
      : category === 'zhezqazgan'
      ? 'Zhezqazgan Region'
      : 'Kazakhstan';

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
            direction: 'rtl',
            boxSizing: 'border-box',
          }}
        >
          {/* Right side: State Emblem Logo (Contains Emblem + Office Names just like the report) */}
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

          {/* Left side: Qatar Houbara Center Logo */}
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
          {/* Big Title in Middle (as the name of collection) */}
          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: '#7a1c32',
              textAlign: 'center',
              lineHeight: 1.25,
              margin: '10px 0 6px 0',
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
                direction: 'rtl',
              }}
            >
              {presetAr}
            </div>
          )}

          {/* Small Title with Issue Date "Today" (Clean, no extra badges) */}
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
                borderRight: '5px solid #7a1c32',
                borderRadius: 8,
                marginBottom: 14,
                direction: 'rtl',
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
                <span>بيانات أجهزة التتبع والطيور المشمولة • Included Transmitters & Locations</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, direction: 'ltr' }}>
                Total: {uniqueBirds.length} {uniqueBirds.length === 1 ? 'Transmitter' : 'Transmitters'}
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
                No bird pages added to this collection yet.
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
                        borderRight: '4px solid #7a1c32',
                        borderRadius: 10,
                        padding: '12px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 7,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        direction: 'rtl',
                        boxSizing: 'border-box',
                        width: uniqueBirds.length === 1 ? '560px' : 'auto',
                      }}
                    >
                      {/* Top Row: Point # + PTT ID + Page Number */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #f1f5f9',
                          paddingBottom: 7,
                        }}
                      >
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
                            }}
                          >
                            PTT: {pttDisplay}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: '#f1f5f9',
                            color: '#7a1c32',
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          ص {idx + 2}
                        </span>
                      </div>

                      {/* Detail points */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>رقم الحجل (Ring):</span>
                          <strong style={{ color: '#1e293b' }}>{ringDisplay}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>المنطقة (Region):</span>
                          <strong style={{ color: '#7a1c32', fontWeight: 700 }}>{regionDisplay}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ color: '#64748b' }}>الموقع (Location):</span>
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
            direction: 'rtl',
            boxSizing: 'border-box',
          }}
        >
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
        </footer>
      </div>
    );
  },
);
CoverPage.displayName = 'CoverPage';
