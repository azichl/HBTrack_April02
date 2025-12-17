import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { RefreshCw, LayoutGrid, FileText, ChevronDown } from 'lucide-react';
import { ReportTemplateCard } from '../components/reports/ReportTemplateCard';
import { ReportConfiguration } from '../components/reports/ReportConfiguration';
import { format } from 'date-fns';
import { formatDateTime, formatBattery } from '../utils/formatting';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const reportTemplates = [
  {
    id: "executive",
    title: "Executive Summary",
    description: "High-level overview of transmitter network performance",
    icon: "BarChart3",
    format: "MULTI", 
    category: "summary",
    sections: 3,
    color: "blue"
  },
  {
    id: "activity",
    title: "Activity Analysis",
    description: "Detailed analysis of bird movement and behavior patterns",
    icon: "Activity",
    format: "MULTI",
    category: "analysis",
    sections: 3,
    color: "purple"
  },
  {
    id: "health",
    title: "Transmitter Health",
    description: "Technical status and performance of all transmitters",
    icon: "Radio",
    format: "MULTI",
    category: "detailed",
    sections: 3,
    color: "green"
  },
  {
    id: "migration",
    title: "Migration Tracking",
    description: "GPS tracking data and movement analysis",
    icon: "MapPin",
    format: "MULTI",
    category: "analysis",
    sections: 3,
    color: "purple"
  },
  {
    id: "network",
    title: "Network Performance",
    description: "Overall network statistics and connectivity metrics",
    icon: "TrendingUp",
    format: "MULTI",
    category: "summary",
    sections: 3,
    color: "blue"
  },
  {
    id: "raw",
    title: "Raw Data Export",
    description: "Complete dataset export for external analysis",
    icon: "FileText",
    format: "MULTI",
    category: "detailed",
    sections: 3,
    color: "green"
  }
];

export const Reports = () => {
  const { transmitters, birds, positions, generateLivePositions, timeZone } = useAppStore();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [selectedTransmitters, setSelectedTransmitters] = useState("all");
  
  // Dropdown state
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);

  useEffect(() => {
    generateLivePositions();
  }, [generateLivePositions]);

  const handleRefresh = () => {
    generateLivePositions();
    alert('Data refreshed');
  };

  const prepareData = () => {
      let filteredTransmitters = transmitters;
      if (selectedTransmitters === 'active') {
          filteredTransmitters = transmitters.filter(t => t.status === 'active');
      } else if (selectedTransmitters === 'inactive') {
          filteredTransmitters = transmitters.filter(t => t.status !== 'active');
      }

      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59);

      const filteredSightings = positions.filter(p => {
          const sightingDate = new Date(p.timestamp);
          const isTransmitterIncluded = filteredTransmitters.some(t => t.platform_id === p.transmitter_id);
          return sightingDate >= startDate && sightingDate <= endDate && isTransmitterIncluded;
      }).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return { filteredTransmitters, filteredSightings };
  };

  const getReportData = (type: string) => {
      const { filteredTransmitters, filteredSightings } = prepareData();

      switch (type) {
          case 'executive':
              return [{
                  'Total Transmitters': filteredTransmitters.length,
                  'Active Transmitters': filteredTransmitters.filter(t => t.status === 'active').length,
                  'Total Positions': filteredSightings.length,
                  'Date Range': `${dateRange.start} to ${dateRange.end}`,
                  'Average Battery': formatBattery(
                      filteredTransmitters.reduce((sum, t) => sum + (t.battery_voltage || 0), 0) / (filteredTransmitters.length || 1)
                  ),
                  'Network Health': 'Good'
              }];
          case 'activity':
              return filteredSightings.slice(0, 1000).map(s => {
                const bird = birds.find(b => {
                    const t = filteredTransmitters.find(tr => tr.platform_id === s.transmitter_id);
                    return t && t.bird_id === b.id;
                });
                return {
                    'Species': bird?.species || 'Unknown',
                    'Ring ID': bird?.ring_id || 'Unassigned',
                    'Transmitter': s.transmitter_id,
                    'Date': formatDateTime(s.timestamp, timeZone),
                    'Speed': s.speed_kmh.toFixed(1) + ' km/h',
                    'Course': s.course + '°',
                    'Latitude': s.lat.toFixed(4),
                    'Longitude': s.lon.toFixed(4)
                };
              });
          case 'health':
              return filteredTransmitters.map(t => {
                const bird = birds.find(b => b.id === t.bird_id);
                return {
                    'Transmitter ID': t.platform_id,
                    'Bird Ring ID': bird?.ring_id || 'Unassigned',
                    'Model': t.model,
                    'Status': t.status,
                    'Battery Level': formatBattery(t.battery_voltage),
                    'Last Fix': formatDateTime(t.last_fix, timeZone),
                    'Region': t.program_region || 'Unknown'
                };
              });
          case 'migration':
              return filteredSightings.slice(0, 1000).map(s => {
                const bird = birds.find(b => {
                    const t = filteredTransmitters.find(tr => tr.platform_id === s.transmitter_id);
                    return t && t.bird_id === b.id;
                });
                return {
                    'Species': bird?.species || 'Unknown',
                    'Bird ID': bird?.ring_id || 'Unassigned',
                    'Date': formatDateTime(s.timestamp, timeZone),
                    'Latitude': s.lat.toFixed(5),
                    'Longitude': s.lon.toFixed(5),
                    'Speed': s.speed_kmh.toFixed(1),
                    'Altitude': '-' 
                };
              });
          case 'network':
              const activeCount = filteredTransmitters.filter(t => t.status === 'active').length;
              const avgBattery = filteredTransmitters.reduce((sum, t) => sum + (t.battery_voltage || 0), 0) / (filteredTransmitters.length || 1);
              return [{
                  'Total Network Size': filteredTransmitters.length,
                  'Active Devices': activeCount,
                  'Inactive Devices': filteredTransmitters.filter(t => t.status === 'inactive').length,
                  'Maintenance Devices': filteredTransmitters.filter(t => t.status === 'maintenance').length,
                  'Average Battery': formatBattery(avgBattery),
                  'Report Date': formatDateTime(new Date().toISOString(), timeZone)
              }];
          case 'raw':
              return filteredSightings.slice(0, 2000).map(s => ({
                'Type': 'Position',
                'ID': s.id,
                'Transmitter': s.transmitter_id,
                'Timestamp': formatDateTime(s.timestamp, timeZone),
                'Lat': s.lat,
                'Lon': s.lon,
                'Speed': s.speed_kmh,
                'Course': s.course,
                'Quality': s.lc
            }));
          default:
              return [];
      }
  };

  const generateCSV = () => {
      if (!selectedReport) return;
      const data = getReportData(selectedReport.id);
      if (data.length === 0) {
          alert('No data to export.');
          return;
      }
      
      const headers = Object.keys(data[0]);
      const rows = data.map(item => headers.map(header => {
          const value = (item as any)[header];
          return `"${String(value ?? '').replace(/"/g, '""')}"`;
      }));

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedReport.id}_report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
  };

  const generatePDF = () => {
      if (!selectedReport) return;
      const data = getReportData(selectedReport.id);
       if (data.length === 0) {
          alert('No data to export.');
          return;
      }

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("HoubaraTracker Report", 14, 22);
      doc.setFontSize(12);
      doc.text(selectedReport.title, 14, 32);
      doc.setFontSize(10);
      doc.text(`Generated: ${formatDateTime(new Date().toISOString(), timeZone)}`, 14, 40);
      
      const headers = Object.keys(data[0]);
      const rows = data.map(obj => Object.values(obj as any));
      
      autoTable(doc, {
          startY: 45,
          head: [headers],
          body: rows,
          theme: 'striped',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [183, 147, 85] }
      });
      
      doc.save(`${selectedReport.id}_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const filteredReports = categoryFilter === "all" 
    ? reportTemplates 
    : reportTemplates.filter(r => r.category === categoryFilter);

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'summary', label: 'Summary' },
    { value: 'analysis', label: 'Analysis' },
    { value: 'detailed', label: 'Detailed' }
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports & Analytics</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400">Generate comprehensive reports and export data</p>
        </div>
        <button 
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Report Templates (Left Column) */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-sm h-full">
            <div className="flex items-start gap-3 mb-4">
              <div className="mt-0.5 text-gray-700 dark:text-gray-300">
                <LayoutGrid size={18} />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Templates</h2>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Select a template to configure your report
                </p>
              </div>
            </div>

            {/* Category Filter - Custom Dropdown for Font Enforcement */}
            <div className="mb-4 relative">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 block">Category Filter</label>
              
              <button
                onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                className="w-48 px-2 py-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-md text-xs text-gray-900 dark:text-gray-200 outline-none focus:ring-1 focus:ring-brand-500 flex items-center justify-between"
                style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
              >
                <span>{categories.find(c => c.value === categoryFilter)?.label}</span>
                <ChevronDown size={14} className="text-gray-500" />
              </button>

              {isCategoryOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsCategoryOpen(false)} />
                  <div className="absolute top-full left-0 w-48 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md shadow-lg z-20 overflow-hidden">
                    {categories.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => {
                          setCategoryFilter(cat.value);
                          setIsCategoryOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                          categoryFilter === cat.value 
                            ? 'bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-brand-400 font-bold' 
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Report Cards Grid */}
            <div className="grid md:grid-cols-2 gap-3">
              {filteredReports.map((report) => (
                <ReportTemplateCard
                  key={report.id}
                  report={report}
                  isSelected={selectedReport?.id === report.id}
                  onSelect={() => setSelectedReport(report)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Report Configuration & Export Actions (Right Column) */}
        <div>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-sm sticky top-4">
             <ReportConfiguration
                selectedReport={selectedReport}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                selectedTransmitters={selectedTransmitters}
                onTransmittersChange={setSelectedTransmitters}
                transmittersCount={transmitters.length}
                onGenerate={() => {}} 
             />
             
             <div className="mt-3 space-y-2 pt-3 border-t border-gray-100 dark:border-slate-700">
                 <button 
                    onClick={generatePDF}
                    disabled={!selectedReport}
                    className={`w-full py-2 px-4 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm ${
                        selectedReport 
                        ? 'bg-red-600 text-white hover:bg-red-700' 
                        : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                 >
                    <FileText size={14} /> Export PDF
                 </button>
                 
                 <button 
                    onClick={generateCSV}
                    disabled={!selectedReport}
                    className={`w-full py-2 px-4 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm ${
                        selectedReport 
                        ? 'bg-green-600 text-white hover:bg-green-700' 
                        : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                 >
                    <FileText size={14} /> Export CSV
                 </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};