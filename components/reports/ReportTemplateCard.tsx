import React from 'react';
import { BarChart3, Activity, Radio, MapPin, TrendingUp, FileText, CheckCircle2 } from 'lucide-react';

const IconMap: Record<string, React.ElementType> = {
  BarChart3,
  Activity,
  Radio,
  MapPin,
  TrendingUp,
  FileText
};

const ColorMap: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-600',
  purple: 'bg-purple-100 text-purple-600',
  green: 'bg-emerald-100 text-emerald-600',
  orange: 'bg-orange-100 text-orange-600',
};

interface ReportTemplateCardProps {
  report: {
    id: string;
    title: string;
    description: string;
    icon: string;
    format: string;
    color: string;
    category: string;
    sections: number;
  };
  isSelected: boolean;
  onSelect: () => void;
}

export const ReportTemplateCard: React.FC<ReportTemplateCardProps> = ({ report, isSelected, onSelect }) => {
  const Icon = IconMap[report.icon] || FileText;
  const colorClass = ColorMap[report.color] || 'bg-gray-100 text-gray-600';

  return (
    <div 
      onClick={onSelect}
      className={`relative p-3 rounded-lg border cursor-pointer transition-all duration-200 flex flex-col justify-between h-full ${
        isSelected 
          ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500 shadow-sm' 
          : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand-200 dark:hover:border-slate-600 hover:shadow-md'
      }`}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 text-brand-600">
          <CheckCircle2 size={16} fill="currentColor" className="text-white" />
        </div>
      )}

      <div className="flex items-start justify-between mb-2">
        <div className={`p-2 rounded-md ${colorClass}`}>
          <Icon size={18} />
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${
          report.format === 'PDF' ? 'bg-red-100 text-red-700' :
          report.format === 'CSV' ? 'bg-blue-100 text-blue-700' :
          'bg-green-100 text-green-700'
        }`}>
          {report.format}
        </span>
      </div>

      <div>
        <h3 className="font-bold text-gray-900 dark:text-white mb-0.5 text-sm">{report.title}</h3>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">{report.description}</p>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-400 font-medium pt-2 border-t border-gray-100 dark:border-slate-700">
        <span className="capitalize">{report.category}</span>
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        <span>{report.sections} sections</span>
      </div>
    </div>
  );
};