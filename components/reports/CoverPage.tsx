// components/reports/CoverPage.tsx
// Multi-bird collection report cover page.
// Design requirements:
// 1. Two logos identical to single report header (Emblem + Agency titles on right, Houbara Center logo on left).
// 2. Maroon horizontal rule (#7a1c32) separating header from body.
// 3. Large centered title in the middle (name of collection).
// 4. Subtitle directly under it with Issue Date "Today".
// 5. Section with points / cards of included PTT IDs with their ID, region, location, ring, and page.
// 6. Footer matching the report footer with identical agency names and colors (#7a1c32, #4b5563).

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
      ? 'Almaty Region (منطقة ألماتي)'
      : category === 'zhezqazgan'
      ? 'Zhezqazgan Region (منطقة جيزقازغان)'
      : 'Kazakhstan (كازاخستان)';

    const totalBirds = pageCount || pages.length;

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
          {/* Right side: Emblem Logo + Agency Titles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
                مكـــتـــب مــحــمــيـــات الـــدولــــة الخـــارجيــــة
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
            padding: '28px 44px 18px',
            background: 'linear-gradient(180deg, #ffffff 0%, #fafbfc 45%, #f4f6f8 100%)',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* Decorative Collection Tag */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 16px',
              borderRadius: 999,
              backgroundColor: '#7a1c320d',
              border: '1px solid #7a1c3230',
              color: '#7a1c32',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.5px',
              marginBottom: 10,
            }}
          >
            <span>🦅 تقرير إطلاق وتتبع طيور الحبارى</span>
            <span>•</span>
            <span>HOUBARA TRACKING COLLECTION</span>
          </div>

          {/* Big Title in Middle (as the name of collection) */}
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: '#7a1c32',
              textAlign: 'center',
              lineHeight: 1.25,
              margin: '0 0 6px 0',
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
                fontSize: 18,
                fontWeight: 700,
                color: '#334155',
                textAlign: 'center',
                marginBottom: 6,
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
              gap: 14,
              margin: '4px 0 16px',
              padding: '6px 20px',
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
            {/* Points Section Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 14px',
                backgroundColor: '#7a1c320d',
                border: '1px solid #7a1c3225',
                borderRight: '5px solid #7a1c32',
                borderRadius: 8,
                marginBottom: 12,
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
                Total: {pages.length} Pages
              </div>
            </div>

            {pages.length === 0 ? (
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
                  display: 'grid',
                  gridTemplateColumns: pages.length <= 2 ? 'repeat(2, 1fr)' : pages.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                  gap: 12,
                  overflow: 'hidden',
                  maxHeight: 390,
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
                        borderRadius: 8,
                        padding: '10px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        direction: 'rtl',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Top Row: Point # + PTT ID + Page Number */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderBottom: '1px solid #f1f5f9',
                          paddingBottom: 5,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              backgroundColor: '#7a1c32',
                              color: '#ffffff',
                              fontSize: 10,
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
                              fontSize: 14,
                              color: '#1e293b',
                              fontFamily: 'monospace',
                            }}
                          >
                            PTT: {pttDisplay}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            backgroundColor: '#f1f5f9',
                            color: '#7a1c32',
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          ص {idx + 2}
                        </span>
                      </div>

                      {/* Detail points */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#475569' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>رقم الحجل (Ring):</span>
                          <strong style={{ color: '#1e293b' }}>{ringDisplay}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>المنطقة (Region):</span>
                          <strong style={{ color: '#1e293b' }}>{regionDisplay}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ color: '#64748b' }}>الموقع (Location):</span>
                          <strong style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 10, direction: 'ltr' }}>
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
