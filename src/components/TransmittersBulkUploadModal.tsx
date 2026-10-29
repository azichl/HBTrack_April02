import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, 
  X, Loader2, ArrowRight, RefreshCw, FileText, ChevronDown, ChevronUp, HelpCircle 
} from 'lucide-react';
import { 
  bulkUploadTransmitters, 
  BulkResult 
} from '../data/repository/bulkUploadTransmitters';
import { useAppStore } from '../../store/appStore';
import { notifySuccess, notifyError } from '../data/repository/toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const TransmittersBulkUploadModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const { fetchAllTransmitters } = useAppStore() as any;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [dryRunResult, setDryRunResult] = useState<BulkResult | null>(null);
  const [finalResult, setFinalResult] = useState<BulkResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  const downloadTransmitterTemplate = () => {
    const headers = [
      'ptt_id *', 'frequency', 'hex_id', 'transmitter_model *', 'manufacturer',
      'reception_date *', 'status *', 'deployed', 'site_location', 'program_region',
      'satellite_time', 'radio_time', 'duty_cycle', 'weight_g', 'bird_ring_number',
      'darvic_number', 'species', 'sex', 'origin', 'hatch_date', 'release_date',
      'release_lat', 'release_lon', 'notes'
    ];
    const exampleRow = [
      '244289', '401.650', '112A3F', 'Solar Argos/GPS PTT', 'Microwave Telemetry',
      '2024', 'Active', 'Yes', 'Al Ain Desert', 'UAE East',
      '10h ON / 24h OFF', '12:00 - 18:00', '10h ON / 24h OFF', 22, 'UA-9982',
      'DV-104', 'Houbara Bustard', 'M', 'Breeding', '2023-05-10', '2024-03-15',
      24.12345, 54.54321, 'Example row - replace with your data'
    ];
    const instructions = [
      ['HBTrack — Transmitters & Birds Bulk Upload Instructions'],
      ['Column Name', 'Required', 'Format / Allowed Values', 'Description'],
      ['ptt_id', 'YES', '3-10 digits (e.g. 244289)', 'Unique platform ID of the transmitter.'],
      ['frequency', 'No', 'Number/Text (e.g. 401.650)', 'Transmission frequency in MHz.'],
      ['hex_id', 'No', 'Hexadecimal (e.g. 112A3F)', 'Argos Hex ID (optional, replaces serial number).'],
      ['transmitter_model', 'YES', 'Text (e.g. Solar Argos/GPS PTT)', 'Model of the transmitter.'],
      ['manufacturer', 'No', 'Text (e.g. Microwave Telemetry)', 'Origin company / manufacturer.'],
      ['reception_date', 'YES (Obligatory)', 'Year (e.g. 2024) or YYYY-MM-DD (e.g. 2024-01-15)', 'Reception date: accepts year only (e.g. 2024) or full date.'],
      ['status', 'YES', 'Active | Inactive | Dead | Static test | Potential Mortality', 'Operational status of transmitter.'],
      ['deployed', 'No', 'Yes | No', 'Whether the device is currently deployed on a bird.'],
      ['site_location', 'No', 'Text', 'Deployment site location.'],
      ['program_region', 'No', 'Text', 'Operational program region.'],
      ['satellite_time', 'No', 'Text', 'Satellite transmission schedule/cycle.'],
      ['radio_time', 'No', 'Text', 'VHF radio beacon transmission time.'],
      ['duty_cycle', 'No', 'Text', 'Transmission schedule duty cycle.'],
      ['weight_g', 'No', 'Number', 'Weight in grams.'],
      ['bird_ring_number', 'No', 'Text', 'Ring ID of bird to link or register.'],
      ['darvic_number', 'No', 'Text', 'Colored darvic ring/band code.'],
      ['species', 'No', 'Text', 'Bird species (defaults to Houbara Bustard).'],
      ['sex', 'No', 'M | F', 'Bird gender/sex.'],
      ['origin', 'No', 'Wild | Breeding', 'Bird origin.'],
      ['hatch_date', 'No', 'YYYY-MM-DD', 'Hatch date of bird.'],
      ['release_date', 'No', 'YYYY-MM-DD', 'Release date of bird / deployment date.'],
      ['release_lat', 'No', 'Decimal (-90 to 90)', 'Release site latitude.'],
      ['release_lon', 'No', 'Decimal (-180 to 180)', 'Release site longitude.'],
      ['notes', 'No', 'Text', 'Comments and notes.']
    ];

    const wb = XLSX.utils.book_new();
    const wsTx = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    const wsInst = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsTx, 'Transmitters');
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instructions');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HBTrack_Transmitters_Bulk_Upload_Template_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      notifyError(new Error('Please upload an Excel (.xlsx or .xls) file.'));
      return;
    }
    setFile(selectedFile);
    setFinalResult(null);
    setIsProcessing(true);
    setProgressMsg('Analyzing workbook...');

    try {
      const preview = await bulkUploadTransmitters(selectedFile, {
        updateExisting,
        dryRun: true,
        onProgress: setProgressMsg,
      });
      setDryRunResult(preview);
    } catch (e: any) {
      notifyError(e, 'Failed to parse template');
      setFile(null);
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmUpload = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgressMsg('Uploading transmitters to Firebase...');

    try {
      const res = await bulkUploadTransmitters(file, {
        updateExisting,
        dryRun: false,
        onProgress: setProgressMsg,
      });
      setFinalResult(res);
      notifySuccess(`Bulk upload finished: ${res.created} created, ${res.updated} updated.`);
      
      // Refresh local store transmitters if method available
      const store = useAppStore.getState();
      if (store.initializeFromFirestore) {
        store.initializeFromFirestore().catch(console.warn);
      }
      onSuccess?.();
    } catch (e: any) {
      notifyError(e, 'Bulk upload failed');
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  const downloadErrorReport = () => {
    if (!finalResult && !dryRunResult) return;
    const errors = (finalResult || dryRunResult)!.errors;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Row,PTT ID,Error Details', ...errors.map((e) => `${e.row},"${e.ptt_id || ''}","${e.messages.join('; ')}"`)]
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Transmitter_Upload_Errors_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setFile(null);
    setDryRunResult(null);
    setFinalResult(null);
    setProgressMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-100 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-brand-50/50 dark:bg-slate-900/50 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Bulk Upload Transmitters
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Import PTT devices & bird info via Excel template (.xlsx)
              </p>
            </div>
          </div>
          <button
            onClick={() => { reset(); onClose(); }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Step 1: Download Template & Column Format Guide */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between p-4 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 gap-3">
              <div>
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  1. Standard Template & Columns
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Transmitters info (Reception date accepts year, Hex ID) & Birds table info.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFormatGuide(!showFormatGuide)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileText size={14} />
                  {showFormatGuide ? 'Hide Format Guide' : 'View Format & Columns'}
                  {showFormatGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  type="button"
                  onClick={downloadTransmitterTemplate}
                  className="flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0"
                >
                  <Download size={14} /> Download Template (.xlsx)
                </button>
              </div>
            </div>

            {/* Collapsible Format Guide */}
            {showFormatGuide && (
              <div className="p-4 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl space-y-3 animate-in fade-in duration-200">
                <div className="flex justify-between items-center">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Excel Template Model Columns
                  </h5>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">Headers are case-insensitive</span>
                </div>
                <div className="overflow-x-auto max-h-56 overflow-y-auto text-xs border border-gray-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 sticky top-0">
                      <tr>
                        <th className="p-2 border-b border-gray-200 dark:border-slate-700 font-bold">Column Name</th>
                        <th className="p-2 border-b border-gray-200 dark:border-slate-700 font-bold">Requirement</th>
                        <th className="p-2 border-b border-gray-200 dark:border-slate-700 font-bold">Format / Description</th>
                        <th className="p-2 border-b border-gray-200 dark:border-slate-700 font-bold">Example</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-800 text-[11px]">
                      <tr className="bg-emerald-50/40 dark:bg-emerald-950/20">
                        <td className="p-2 font-mono font-bold text-brand-700 dark:text-brand-300">ptt_id *</td>
                        <td className="p-2 font-bold text-red-600 dark:text-red-400">Obligatory</td>
                        <td className="p-2">Platform / PTT device ID (3-10 digits)</td>
                        <td className="p-2 font-mono">244289</td>
                      </tr>
                      <tr className="bg-emerald-50/40 dark:bg-emerald-950/20">
                        <td className="p-2 font-mono font-bold text-brand-700 dark:text-brand-300">reception_date *</td>
                        <td className="p-2 font-bold text-red-600 dark:text-red-400">Obligatory</td>
                        <td className="p-2">Reception date: <strong>can accept year only</strong> (e.g. 2024) or full date</td>
                        <td className="p-2 font-mono text-emerald-700 dark:text-emerald-300 font-bold">2024 or 2024-01-15</td>
                      </tr>
                      <tr className="bg-emerald-50/40 dark:bg-emerald-950/20">
                        <td className="p-2 font-mono font-bold text-brand-700 dark:text-brand-300">transmitter_model *</td>
                        <td className="p-2 font-bold text-red-600 dark:text-red-400">Obligatory</td>
                        <td className="p-2">Device model name</td>
                        <td className="p-2 font-mono">Solar Argos/GPS PTT</td>
                      </tr>
                      <tr className="bg-emerald-50/40 dark:bg-emerald-950/20">
                        <td className="p-2 font-mono font-bold text-brand-700 dark:text-brand-300">status *</td>
                        <td className="p-2 font-bold text-red-600 dark:text-red-400">Obligatory</td>
                        <td className="p-2">Active | Inactive | Dead | Static test | Potential Mortality</td>
                        <td className="p-2 font-mono">Active</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">hex_id</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2"><strong>Replaces serial number</strong> (Argos Hex ID)</td>
                        <td className="p-2 font-mono">112A3F</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">frequency</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Transmission frequency in MHz</td>
                        <td className="p-2 font-mono">401.650</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">manufacturer</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Origin company / maker</td>
                        <td className="p-2 font-mono">Microwave Telemetry</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">deployed</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Yes | No</td>
                        <td className="p-2 font-mono">Yes</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">site_location</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Site / deployment location</td>
                        <td className="p-2 font-mono">Al Ain Desert</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">program_region</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Program operational region</td>
                        <td className="p-2 font-mono">UAE East</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">satellite_time</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Satellite transmission schedule / duty cycle</td>
                        <td className="p-2 font-mono">10h ON / 24h OFF</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">radio_time</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">VHF radio beacon transmission hours</td>
                        <td className="p-2 font-mono">12:00 - 18:00</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">bird_ring_number</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Ring ID to link with existing bird, or register new bird</td>
                        <td className="p-2 font-mono">UA-9982</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">darvic_number</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Colored darvic leg band</td>
                        <td className="p-2 font-mono">DV-104</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">species</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Bird species (defaults to Houbara Bustard)</td>
                        <td className="p-2 font-mono">Houbara Bustard</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">sex / origin</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">M | F and Wild | Breeding</td>
                        <td className="p-2 font-mono">M / Breeding</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">release_date</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Date of bird release / deployment</td>
                        <td className="p-2 font-mono">2024-03-15</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-mono font-bold">release_lat / release_lon</td>
                        <td className="p-2 text-gray-500">Optional</td>
                        <td className="p-2">Release coordinates</td>
                        <td className="p-2 font-mono">24.12345 / 54.54321</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Upload File / Dropzone */}
          {!finalResult && (
            <div>
              <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">
                2. Choose Excel File
              </h4>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-900/20'
                    : 'border-gray-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-500 bg-gray-50/50 dark:bg-slate-900/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
                <UploadCloud className="text-brand-500 mb-3" size={36} />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {file ? file.name : 'Click to browse or drag and drop your completed template'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Supports .xlsx and .xls (Max 500 rows)</p>
              </div>
            </div>
          )}

          {/* Step 3: Options */}
          {file && !finalResult && (
            <div className="flex items-center justify-between p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/40">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                Update existing PTTs if already in database (otherwise skip them)
              </label>
            </div>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-3 py-6 text-brand-600 dark:text-brand-400">
              <Loader2 className="animate-spin" size={24} />
              <span className="text-sm font-semibold">{progressMsg}</span>
            </div>
          )}

          {/* Step 4: Dry Run Preview */}
          {dryRunResult && !finalResult && !isProcessing && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                3. Verification Preview
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-center">
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {dryRunResult.created}
                  </div>
                  <div className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                    New Transmitters
                  </div>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 rounded-xl text-center">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {dryRunResult.updated}
                  </div>
                  <div className="text-[11px] font-medium text-blue-800 dark:text-blue-300">
                    Will Update
                  </div>
                </div>
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/40 rounded-xl text-center">
                  <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {dryRunResult.linkedBirds}
                  </div>
                  <div className="text-[11px] font-medium text-indigo-800 dark:text-indigo-300">
                    Linked Birds
                  </div>
                </div>
                <div className="p-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/40 rounded-xl text-center">
                  <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                    {dryRunResult.createdBirds}
                  </div>
                  <div className="text-[11px] font-medium text-teal-800 dark:text-teal-300">
                    New Birds
                  </div>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 rounded-xl text-center">
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                    {dryRunResult.skippedDuplicates}
                  </div>
                  <div className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                    Skipped (Existing)
                  </div>
                </div>
              </div>

              {dryRunResult.linkedBirds > 0 && (
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg text-xs text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  <span>{dryRunResult.linkedBirds} transmitter(s) matched existing bird rings and will be linked automatically.</span>
                </div>
              )}

              {dryRunResult.createdBirds > 0 && (
                <div className="p-2.5 bg-teal-50 dark:bg-teal-950/20 rounded-lg text-xs text-teal-800 dark:text-teal-300 flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  <span>{dryRunResult.createdBirds} new bird profile(s) will be created and linked to their transmitters.</span>
                </div>
              )}

              {dryRunResult.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-red-600 dark:text-red-400">
                    <span>Validation Errors ({dryRunResult.errors.length}):</span>
                    <button onClick={downloadErrorReport} className="hover:underline flex items-center gap-1">
                      <Download size={12} /> Download Error CSV
                    </button>
                  </div>
                  <div className="max-h-28 overflow-y-auto bg-red-50 dark:bg-red-950/20 p-2 rounded-lg border border-red-200 dark:border-red-900 text-xs space-y-1">
                    {dryRunResult.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="text-red-700 dark:text-red-300">
                        Row {err.row} {err.ptt_id ? `(PTT ${err.ptt_id})` : ''}: {err.messages.join(', ')}
                      </div>
                    ))}
                    {dryRunResult.errors.length > 10 && (
                      <div className="text-gray-500 text-[11px]">
                        + {dryRunResult.errors.length - 10} more errors...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Final Result Report */}
          {finalResult && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-center space-y-1">
                <CheckCircle2 className="mx-auto text-emerald-600 dark:text-emerald-400" size={32} />
                <h4 className="text-base font-bold text-emerald-900 dark:text-emerald-100">
                  Bulk Upload Completed!
                </h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Transmitters: {finalResult.created} created · {finalResult.updated} updated · {finalResult.skippedDuplicates} skipped
                </p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300">
                  Birds: {finalResult.linkedBirds} linked · {finalResult.createdBirds} created
                </p>
              </div>

              {finalResult.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl flex items-center justify-between text-xs text-red-800 dark:text-red-300">
                  <span>{finalResult.errors.length} rows encountered errors during commit.</span>
                  <button onClick={downloadErrorReport} className="font-bold underline flex items-center gap-1">
                    <Download size={12} /> Export Errors
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center">
          {finalResult ? (
            <button
              onClick={() => { reset(); onClose(); }}
              className="ml-auto px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { reset(); onClose(); }}
                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>

              {dryRunResult && (
                <button
                  type="button"
                  disabled={isProcessing || (dryRunResult.created === 0 && dryRunResult.updated === 0)}
                  onClick={handleConfirmUpload}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                  Commit Upload ({dryRunResult.created + dryRunResult.updated} Transmitters)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
