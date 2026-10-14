import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { 
  Edit, Trash2, Download, MapPin, Plus, X, Save, Map, Activity, 
  FileSpreadsheet, UploadCloud, CheckCircle2, AlertCircle, HelpCircle, 
  FileText, ChevronDown, ChevronUp, RefreshCw, Loader2 
} from 'lucide-react';
import { Bird } from '../types';
import { exportToCSV } from '../utils/csvExport';
import { useSortableTable, SortableHeader } from '../components/TableComponents';
import { BulkActionsToolbar } from '../components/BulkActionsToolbar';
import { formatDateTime, isBirdLinkedToTransmitter } from '../utils/formatting';
import { CustomSelect } from '../components/CustomSelect';
import readXlsxFile from 'read-excel-file';

type BirdTableRow = Bird & {
    associated_ptt: string | null;
    sex_label: string;
    display_ring_id: string;
};

interface ParsedUploadRow {
    ring_id: string;
    species: string;
    sex: 'M' | 'F';
    origin: string;
    darvic_number: string;
    release_date: string;
    hatch_date: string;
    release_location: string;
    release_lat: string;
    release_lon: string;
    associated_ptt: string;
    isValid: boolean;
    error?: string;
}

export const Birds = () => {
  const { 
    birds, 
    transmitters, 
    addBird, 
    updateBird, 
    deleteBird, 
    importBirds,
    bulkDeleteBirds,
    bulkUpdateBirds,
    assignTransmitterToBird,
    setSelectedMapBirdId,
    setActiveTab,
    setDatabaseActiveTab,
    timeZone,
    isBirdModalOpen: isModalOpen,
    setIsBirdModalOpen: setIsModalOpen,
    editingRecordId,
    setEditingRecordId
  } = useAppStore();
  
  const editingBird = birds.find(b => b.id === editingRecordId) || null;
  
  // Form State
  const [formData, setFormData] = useState<Partial<Bird>>({
    ring_id: '',
    species: 'Houbara Bustard',
    sex: 'M',
    origin: 'Breeding',
    darvic_number: '',
    hatch_date: '',
    release_date: new Date().toISOString().split('T')[0],
    release_location: '',
    release_lat: '',
    release_lon: ''
  });
  const [selectedTransmitterId, setSelectedTransmitterId] = useState<string>('');

  // Bulk Upload State
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedUploadRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Prepare Table Data
  const tableData = useMemo<BirdTableRow[]>(() => {
    return birds.map(bird => {
      const transmitter = transmitters.find(t => isBirdLinkedToTransmitter(bird, t));
      const rawRing = String(bird.ring_id || '').trim();
      const hasRing = rawRing !== '' && rawRing.toUpperCase() !== 'NA' && rawRing.toUpperCase() !== 'N/A';
      return {
        ...bird,
        display_ring_id: hasRing ? rawRing : 'NA',
        associated_ptt: transmitter ? transmitter.platform_id : null,
        sex_label: bird.sex === 'M' ? 'Male' : 'Female'
      };
    });
  }, [birds, transmitters]);

  // 2. Sorting Hook
  const { 
    sortedData, requestSort, sortConfig, filters, setFilter, clearFilters,
    selectedIds, toggleSelection, selectAllFiltered, clearSelection, filteredData
  } = useSortableTable<BirdTableRow>(tableData);

  const handleBulkDelete = async (ids: string[]) => {
    await bulkDeleteBirds(ids);
  };

  const handleBulkReplace = async (ids: string[], field: string, value: string) => {
    await bulkUpdateBirds(ids, { [field]: value });
  };

  const isAllSelected = sortedData.length > 0 && sortedData.every(r => selectedIds.has(r.id));
  const isSomeSelected = sortedData.some(r => selectedIds.has(r.id));

  useEffect(() => {
    if (isModalOpen) {
      if (editingRecordId) {
        const bird = birds.find(b => b.id === editingRecordId);
        if (bird) {
          setFormData({ 
            ...bird,
            ring_id: bird.ring_id && bird.ring_id !== 'NA' ? bird.ring_id : '',
            origin: bird.origin || 'Breeding',
            release_date: bird.release_date ? new Date(bird.release_date).toISOString().split('T')[0] : ''
          });
          const associatedTransmitter = transmitters.find(t => isBirdLinkedToTransmitter(bird, t));
          setSelectedTransmitterId(associatedTransmitter ? associatedTransmitter.id : '');
        }
      } else {
        setFormData({
          ring_id: '',
          species: 'Houbara Bustard',
          sex: 'M',
          origin: 'Breeding',
          darvic_number: '',
          hatch_date: '',
          release_date: new Date().toISOString().split('T')[0],
          release_location: '',
          release_lat: '',
          release_lon: ''
        });
        setSelectedTransmitterId('');
      }
    }
  }, [isModalOpen, editingRecordId, birds, transmitters]);

  const handleOpenModal = (b?: Bird) => {
    if (b) {
      setEditingRecordId(b.id || null);
      setFormData({
        ...b,
        ring_id: b.ring_id && b.ring_id !== 'NA' ? b.ring_id : '',
        origin: b.origin || 'Breeding',
        release_date: b.release_date ? new Date(b.release_date).toISOString().split('T')[0] : ''
      });
      const associatedTransmitter = transmitters.find(t => isBirdLinkedToTransmitter(b, t));
      setSelectedTransmitterId(associatedTransmitter ? associatedTransmitter.id : '');
    } else {
      setEditingRecordId(null);
      setFormData({
        ring_id: '',
        species: 'Houbara Bustard',
        sex: 'M',
        origin: 'Breeding',
        darvic_number: '',
        hatch_date: '',
        release_date: new Date().toISOString().split('T')[0],
        release_location: '',
        release_lat: '',
        release_lon: ''
      });
      setSelectedTransmitterId('');
    }
    setIsModalOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    let birdId = '';
    const rawRid = String(formData.ring_id || '').trim();
    const isNA = !rawRid || rawRid.toUpperCase() === 'NA' || rawRid.toUpperCase() === 'N/A';
    const finalRingId = isNA ? 'NA' : rawRid.replace(/^bird-/, '').trim();

    try {
      if (editingBird && editingBird.id) {
        birdId = editingBird.id;
        const { id, ...updates } = formData as Bird;
        await updateBird(birdId, {
          ...updates,
          ring_id: finalRingId,
          origin: formData.origin || 'Breeding',
          darvic_number: formData.darvic_number?.trim() || '',
          release_date: formData.release_date || new Date().toISOString().split('T')[0]
        });
      } else {
        birdId = isNA 
          ? `bird-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` 
          : `bird-${finalRingId}`;
        const newBird: Bird = {
          ...(formData as Bird),
          id: birdId,
          ring_id: finalRingId,
          origin: formData.origin || 'Breeding',
          darvic_number: formData.darvic_number?.trim() || '',
          release_date: formData.release_date || new Date().toISOString().split('T')[0]
        };
        await addBird(newBird);
      }

      // Link or unlink transmitter (selectedTransmitterId can be empty string for none)
      if (selectedTransmitterId) {
        assignTransmitterToBird(selectedTransmitterId, birdId);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('[Bird Submit Error]', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this bird record?')) {
      deleteBird(id);
    }
  };

  const handleExport = () => {
    exportToCSV(sortedData, 'Birds_Database');
  };

  const handleTrack = (birdId: string) => {
    setSelectedMapBirdId(birdId);
    setActiveTab('Live Tracking');
  };

  const handleViewStatus = () => {
      setDatabaseActiveTab('Monitoring');
  };

  // Helper to parse dates from Excel rows
  const parseDateValue = (val: any): string => {
    if (!val) return '';
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    if (!str || str.toLowerCase() === 'na' || str.toLowerCase() === 'n/a') return '';
    
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // YYYY-MM-DD
    const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymd) {
      const [, y, m, d] = ymd;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Excel serial date number
    const num = Number(str);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const jsDate = new Date(Math.round((num - 25569) * 86400 * 1000));
      return jsDate.toISOString().split('T')[0];
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return str;
  };

  // Template download function
  const downloadBirdTemplate = () => {
    const headers = [
      'Ring ID',
      'Species',
      'Sex',
      'Origin',
      'Darvic Number',
      'Release Date',
      'Hatch Date',
      'Release Site Name',
      'Latitude',
      'Longitude',
      'Assigned Transmitter'
    ];

    const sampleRows = [
      [
        'AE-2024-001',
        'Houbara Bustard',
        'Male',
        'Breeding',
        'D-101',
        '2024-03-15',
        '2023-04-10',
        'Al Reem Reserve',
        '24.1234',
        '54.5678',
        '242086'
      ],
      [
        'NA',
        'Houbara Bustard',
        'Female',
        'Wild',
        'D-102',
        '2024-03-16',
        '',
        'Baynounah Reserve',
        '23.9876',
        '53.4321',
        ''
      ],
      [
        'AE-2024-002',
        'Houbara Bustard',
        'Female',
        'Breeding',
        '',
        '2024-04-01',
        '2023-05-20',
        'Al Maha Reserve',
        '24.8123',
        '55.3456',
        '242087'
      ]
    ];

    // CSV with UTF-8 BOM for direct Microsoft Excel support
    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Houbara_Birds_Template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // File parsing for bulk upload
  const handleFileSelect = async (file: File) => {
    setUploadFile(file);
    setIsParsing(true);
    setUploadError('');
    setUploadSuccessMessage('');
    setParsedRows([]);

    try {
      let rawRows: any[] = [];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const rows = await readXlsxFile(file);
        if (rows.length < 2) {
          throw new Error('File is empty or has no data rows.');
        }
        const headers = rows[0].map(h => String(h || '').trim());
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0 || row.every(c => c === null || c === undefined || c === '')) continue;
          const obj: any = {};
          headers.forEach((h, idx) => {
            obj[h] = row[idx];
          });
          rawRows.push(obj);
        }
      } else if (fileName.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) {
          throw new Error('CSV file has no data rows.');
        }
        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          // Basic CSV quote handling
          const values: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"' || char === "'") {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());

          const obj: any = {};
          headers.forEach((h, idx) => {
            obj[h] = (values[idx] || '').replace(/^["']|["']$/g, '');
          });
          rawRows.push(obj);
        }
      } else {
        throw new Error('Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.');
      }

      // Column name matcher
      const findField = (row: any, candidates: string[]): any => {
        const keys = Object.keys(row);
        for (const cand of candidates) {
          const matched = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cand.toLowerCase().replace(/[^a-z0-9]/g, ''));
          if (matched && row[matched] !== undefined && row[matched] !== null && String(row[matched]).trim() !== '') {
            return row[matched];
          }
        }
        return '';
      };

      const mapped: ParsedUploadRow[] = rawRows.map((r, index) => {
        const rawRing = String(findField(r, ['ringid', 'ring', 'ringnumber', 'bag']) || '').trim();
        const isNA = !rawRing || rawRing.toUpperCase() === 'NA' || rawRing.toUpperCase() === 'N/A' || rawRing === '-';
        const ring_id = isNA ? 'NA' : rawRing;

        const species = String(findField(r, ['species', 'espece', 'birdspecies']) || 'Houbara Bustard').trim();
        
        const rawSex = String(findField(r, ['sex', 'gender', 'sexe']) || 'M').trim().toUpperCase();
        const sex: 'M' | 'F' = rawSex.startsWith('F') || rawSex.startsWith('W') ? 'F' : 'M';

        const rawOrigin = String(findField(r, ['origin', 'origine', 'source', 'type']) || '').trim().toLowerCase();
        const origin = rawOrigin.includes('wild') ? 'Wild' : 'Breeding';

        const darvic_number = String(findField(r, ['darvicnumber', 'darvic', 'darvicno', 'darviccode']) || '').trim();

        const rawReleaseDate = findField(r, ['releasedate', 'daterelease', 'dateofrelease', 'date']);
        const release_date = parseDateValue(rawReleaseDate);

        const rawHatchDate = findField(r, ['hatchdate', 'datehatch', 'dateofhatch']);
        const hatch_date = parseDateValue(rawHatchDate);

        const release_location = String(findField(r, ['releasesitename', 'releasesite', 'releaselocation', 'site', 'location']) || '').trim();
        const release_lat = String(findField(r, ['latitude', 'lat', 'releaselat', 'releaselatitude']) || '').trim();
        const release_lon = String(findField(r, ['longitude', 'lon', 'long', 'releaselon', 'releaselongitude']) || '').trim();

        const associated_ptt = String(findField(r, ['assignedtransmitter', 'transmitter', 'transmitterid', 'platformid', 'ptt', 'pttid', 'deviceid']) || '').replace(/^trans-/, '').trim();

        let error = '';
        if (!release_date) {
          error = 'Missing obligatory Release Date';
        }

        return {
          ring_id,
          species,
          sex,
          origin,
          darvic_number,
          release_date: release_date || new Date().toISOString().split('T')[0],
          hatch_date,
          release_location,
          release_lat,
          release_lon,
          associated_ptt,
          isValid: !error,
          error
        };
      });

      setParsedRows(mapped);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse file.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleBulkImportConfirm = async () => {
    if (parsedRows.length === 0) return;

    try {
      const birdsToImport: Bird[] = [];
      const linksToMake: { ptt: string; birdId: string }[] = [];

      parsedRows.forEach((row, i) => {
        const isNA = !row.ring_id || row.ring_id.toUpperCase() === 'NA';
        const docId = isNA 
          ? `bird-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`
          : `bird-${row.ring_id.replace(/^bird-/, '').trim()}`;

        const birdObj: Bird = {
          id: docId,
          ring_id: row.ring_id,
          species: row.species || 'Houbara Bustard',
          sex: row.sex,
          origin: row.origin,
          darvic_number: row.darvic_number,
          release_date: row.release_date,
          hatch_date: row.hatch_date,
          release_location: row.release_location || 'Unknown',
          release_lat: row.release_lat,
          release_lon: row.release_lon
        };
        birdsToImport.push(birdObj);

        if (row.associated_ptt) {
          linksToMake.push({ ptt: row.associated_ptt, birdId: docId });
        }
      });

      // Import birds into store and firestore
      importBirds(birdsToImport);

      // Link any transmitters
      let linkedCount = 0;
      linksToMake.forEach(link => {
        const tx = transmitters.find(t => String(t.platform_id).trim() === link.ptt.trim() || t.id === link.ptt);
        if (tx) {
          assignTransmitterToBird(tx.id, link.birdId);
          linkedCount++;
        }
      });

      setUploadSuccessMessage(`Successfully imported ${birdsToImport.length} birds! ${linkedCount > 0 ? `Linked ${linkedCount} birds to transmitters.` : ''}`);
      setTimeout(() => {
        setIsBulkUploadOpen(false);
        setUploadFile(null);
        setParsedRows([]);
        setUploadSuccessMessage('');
      }, 2000);
    } catch (err: any) {
      setUploadError(`Import failed: ${err.message || 'Unknown error'}`);
    }
  };

  const availableTransmitters = transmitters.filter(t => !t.bird_id || (editingBird && isBirdLinkedToTransmitter(editingBird, t)));

  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col relative">
      <BulkActionsToolbar
        selectedIds={Array.from(selectedIds)}
        onClearSelection={clearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkReplace={handleBulkReplace}
        availableFields={[
          { key: 'species', label: 'Species' },
          { key: 'sex', label: 'Sex (M/F)' },
          { key: 'origin', label: 'Origin (Wild/Breeding)' },
          { key: 'release_location', label: 'Release Location' }
        ]}
      />

      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Bird Registry</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage individual bird records, rings, origins, and PTT assignments.</p>
        </div>
        <div className="flex gap-3">
            <button 
              onClick={handleExport}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2 text-gray-600 dark:text-gray-300"
            >
              <Download size={16} /> Export CSV
            </button>
            <button 
              onClick={() => setIsBulkUploadOpen(true)}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-emerald-500/40 hover:border-emerald-500 rounded-lg text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center gap-2 text-emerald-700 dark:text-emerald-300 transition-colors"
            >
              <FileSpreadsheet size={16} className="text-emerald-600" /> Bulk Upload Excel
            </button>
            <button 
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 shadow-sm shadow-emerald-600/20"
            >
              <Plus size={16} /> Add Bird
            </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden flex-1">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-emerald-100 dark:bg-emerald-900 border-b border-emerald-200 dark:border-emerald-800">
                <th className="px-4 py-3 w-10 border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 sticky top-0 z-20">
                  <input 
                    type="checkbox" 
                    checked={isAllSelected}
                    ref={el => { if (el) el.indeterminate = isSomeSelected && !isAllSelected; }}
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectAllFiltered(true, (item) => item.id);
                      } else {
                        clearSelection();
                      }
                    }}
                    className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                  />
                </th>
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Assoc. Transmitter" sortKey="associated_ptt" currentSort={sortConfig} onSort={requestSort} filterValue={filters['associated_ptt']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Ring ID" sortKey="ring_id" currentSort={sortConfig} onSort={requestSort} filterValue={filters['ring_id']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Darvic No" sortKey="darvic_number" currentSort={sortConfig} onSort={requestSort} filterValue={filters['darvic_number']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Origin" sortKey="origin" currentSort={sortConfig} onSort={requestSort} filterValue={filters['origin']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Species" sortKey="species" currentSort={sortConfig} onSort={requestSort} filterValue={filters['species']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Sex" sortKey="sex_label" currentSort={sortConfig} onSort={requestSort} filterValue={filters['sex_label']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Release Date" sortKey="release_date" currentSort={sortConfig} onSort={requestSort} filterValue={filters['release_date']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Hatch Date" sortKey="hatch_date" currentSort={sortConfig} onSort={requestSort} filterValue={filters['hatch_date']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Release Site" sortKey="release_location" currentSort={sortConfig} onSort={requestSort} filterValue={filters['release_location']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Latitude" sortKey="release_lat" currentSort={sortConfig} onSort={requestSort} filterValue={filters['release_lat']} onFilter={setFilter} />
                <SortableHeader className="border-r border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100" label="Longitude" sortKey="release_lon" currentSort={sortConfig} onSort={requestSort} filterValue={filters['release_lon']} onFilter={setFilter} />
                <th className="px-4 py-3 text-xs font-bold text-emerald-800 dark:text-emerald-100 uppercase tracking-wider whitespace-nowrap text-center sticky top-0 bg-emerald-100 dark:bg-emerald-900 z-20 border-b border-emerald-200 dark:border-emerald-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {sortedData.map((bird) => {
                const isSelected = selectedIds.has(bird.id);
                return (
                <tr 
                  key={bird.id} 
                  onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON') { toggleSelection(bird.id); } }}
                  className={`transition-colors cursor-pointer group ${isSelected ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}
                >
                  <td className="px-4 py-3 border-r border-gray-100 dark:border-slate-700">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => toggleSelection(bird.id)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap border-r border-gray-100 dark:border-slate-700 font-mono">
                    {bird.associated_ptt ? (
                      <button 
                          onClick={handleViewStatus} 
                          className="text-brand-600 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1.5"
                          title="View Status in Monitoring"
                      >
                          {bird.associated_ptt} <Activity size={12} className="text-gray-400" />
                      </button>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 italic">Not Tagged</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap border-r border-gray-100 dark:border-slate-700 font-mono">
                    {bird.display_ring_id === 'NA' ? (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400">NA</span>
                    ) : (
                      <span className="text-gray-900 dark:text-white font-medium">{bird.display_ring_id}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700 font-mono">
                    {bird.darvic_number || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap border-r border-gray-100 dark:border-slate-700">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      bird.origin === 'Wild' 
                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-700/50' 
                        : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-700/50'
                    }`}>
                      {bird.origin || 'Breeding'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">{bird.species}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${bird.sex === 'M' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300' : 'bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300'}`}>
                      {bird.sex_label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap border-r border-gray-100 dark:border-slate-700 font-medium">
                    {bird.release_date ? formatDateTime(bird.release_date, timeZone).split(',')[0] : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700">
                    {bird.hatch_date ? formatDateTime(bird.hatch_date, timeZone).split(',')[0] : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap border-r border-gray-100 dark:border-slate-700 flex items-center gap-2">
                      <MapPin size={14} className="text-emerald-600 dark:text-emerald-400" />
                      {bird.release_location}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700 font-mono">{bird.release_lat}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-slate-700 font-mono">{bird.release_lon}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      {bird.associated_ptt && (
                          <button onClick={() => handleTrack(bird.id)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-md transition-colors" title="Track on Map">
                              <Map size={16} />
                          </button>
                      )}
                      <button onClick={() => handleOpenModal(bird)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-md transition-colors" title="Edit">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDelete(bird.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
        <div className="bg-gray-50 dark:bg-slate-900 px-6 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Showing {sortedData.length} entries</span>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editingBird ? 'Edit Bird Record' : 'Add New Bird'}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Configure bird identity, origin, release info and PTT assignment.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Quick bulk upload banner */}
            {!editingBird && (
              <div className="px-6 pt-3 pb-0">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" size={18} />
                    <div>
                      <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Have multiple birds to add?</p>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Upload in bulk via Excel (.xlsx) or CSV with sample format.</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => { setIsModalOpen(false); setIsBulkUploadOpen(true); }}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap shadow-sm"
                  >
                    Upload Excel
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Row 1: Ring ID (Optional) & Darvic Number (Optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ring ID <span className="text-gray-400 font-normal text-[11px]">(Optional, default "NA")</span>
                  </label>
                  <input 
                    type="text"
                    value={formData.ring_id || ''}
                    onChange={e => setFormData({...formData, ring_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                    placeholder="AE-2023-XXX (or leave empty)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Darvic Number <span className="text-gray-400 font-normal text-[11px]">(Optional)</span>
                  </label>
                  <input 
                    type="text"
                    value={formData.darvic_number || ''}
                    onChange={e => setFormData({...formData, darvic_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                    placeholder="e.g. D-101"
                  />
                </div>
              </div>

              {/* Row 2: Origin & Assigned Transmitter (Optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Origin <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect 
                    value={formData.origin || 'Breeding'}
                    onChange={(val) => setFormData({...formData, origin: val})}
                    className="font-sans w-full text-sm"
                    buttonClassName="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    options={[
                      { value: 'Breeding', label: 'Breeding (Captive)' },
                      { value: 'Wild', label: 'Wild' }
                    ]}
                  />
                </div>
                <div>
                   <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                     Assigned Transmitter <span className="text-gray-400 font-normal text-[11px]">(Optional)</span>
                   </label>
                   <CustomSelect 
                    value={selectedTransmitterId}
                    onChange={(val) => setSelectedTransmitterId(val)}
                    className="font-sans w-full text-sm font-mono"
                    buttonClassName="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    options={[
                      { value: '', label: '-- None (No Transmitter) --' },
                      ...availableTransmitters.map(t => ({ value: t.id, label: `${t.platform_id} (${t.status})` }))
                    ]}
                   />
                </div>
              </div>
              
              {/* Row 3: Species & Sex */}
              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Species <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" required
                    value={formData.species || 'Houbara Bustard'}
                    onChange={e => setFormData({...formData, species: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Sex <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect 
                    value={formData.sex || 'M'}
                    onChange={(val) => setFormData({...formData, sex: val as 'M'|'F'})}
                    className="font-sans w-full text-sm"
                    buttonClassName="px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                    options={[
                      { value: 'M', label: 'Male' },
                      { value: 'F', label: 'Female' }
                    ]}
                  />
                </div>
              </div>

              {/* Row 4: Release Date (Obligatory) & Hatch Date (Optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Release Date <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input 
                    type="date" required
                    value={formData.release_date || ''}
                    onChange={e => setFormData({...formData, release_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hatch Date <span className="text-gray-400 font-normal text-[11px]">(Optional)</span>
                  </label>
                  <input 
                    type="date"
                    value={formData.hatch_date ? new Date(formData.hatch_date).toISOString().split('T')[0] : ''}
                    onChange={e => setFormData({...formData, hatch_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                  />
                </div>
              </div>

              {/* Row 5: Release Site Name & Coordinates */}
              <div className="space-y-4">
                 <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Release Site Name <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" required
                    value={formData.release_location || ''}
                    onChange={e => setFormData({...formData, release_location: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm outline-none"
                    placeholder="e.g. Al Reem Reserve"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Latitude <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" required
                      value={formData.release_lat || ''}
                      onChange={e => setFormData({...formData, release_lat: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono outline-none"
                      placeholder="e.g. 24.1234"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Longitude <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" required
                      value={formData.release_lon || ''}
                      onChange={e => setFormData({...formData, release_lon: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm font-mono outline-none"
                      placeholder="e.g. 54.5678"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-slate-700">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                  {isSubmitting ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal with Example Format */}
      {isBulkUploadOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="text-emerald-600" size={20} />
                  Bulk Upload Birds (Excel / CSV)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Import multiple bird records at once. Supports optional Ring ID, origin, Darvic number, and optional transmitter assignments.
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsBulkUploadOpen(false);
                  setUploadFile(null);
                  setParsedRows([]);
                  setUploadError('');
                  setUploadSuccessMessage('');
                }} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Action Toolbar: Download Template & View Example */}
              <div className="flex flex-wrap gap-3 items-center justify-between p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                  <HelpCircle size={16} className="text-emerald-600 flex-shrink-0" />
                  <span>Need the correct columns and format?</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFormatGuide(!showFormatGuide)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    <FileText size={14} />
                    {showFormatGuide ? 'Hide Format Guide' : 'View Example Format'}
                    {showFormatGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={downloadBirdTemplate}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Download size={14} /> Download Template (.csv / Excel)
                  </button>
                </div>
              </div>

              {/* Collapsible Format Guide & Example Preview */}
              {showFormatGuide && (
                <div className="p-4 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg space-y-3 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Standard Excel / CSV Columns
                    </h4>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">Headers are case-insensitive</span>
                  </div>

                  <div className="overflow-x-auto text-xs">
                    <table className="w-full text-left border-collapse border border-gray-200 dark:border-slate-700 rounded">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300">
                          <th className="p-2 border border-gray-200 dark:border-slate-700">Column Name</th>
                          <th className="p-2 border border-gray-200 dark:border-slate-700">Required?</th>
                          <th className="p-2 border border-gray-200 dark:border-slate-700">Description / Example</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-slate-700 font-mono text-[11px]">
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Ring ID</td>
                          <td className="p-2 text-gray-500 border border-gray-200 dark:border-slate-700">Optional</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700">e.g. <span className="font-mono">AE-2024-001</span>. Leave empty or "NA" if not ringed.</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Release Date</td>
                          <td className="p-2 text-red-600 font-bold border border-gray-200 dark:border-slate-700">Obligatory</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700">Format: <span className="font-mono">YYYY-MM-DD</span> (e.g. 2024-03-15) or DD/MM/YYYY</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Origin</td>
                          <td className="p-2 text-emerald-700 border border-gray-200 dark:border-slate-700">Recommended</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700"><span className="font-mono">Breeding</span> or <span className="font-mono">Wild</span></td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Darvic Number</td>
                          <td className="p-2 text-gray-500 border border-gray-200 dark:border-slate-700">Optional</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700">e.g. <span className="font-mono">D-101</span></td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Species</td>
                          <td className="p-2 text-gray-700 border border-gray-200 dark:border-slate-700">Default</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700">Defaults to "Houbara Bustard" if empty</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Sex</td>
                          <td className="p-2 text-gray-700 border border-gray-200 dark:border-slate-700">Default M</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700"><span className="font-mono">M</span> (Male) or <span className="font-mono">F</span> (Female)</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Hatch Date</td>
                          <td className="p-2 text-gray-500 border border-gray-200 dark:border-slate-700">Optional</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700">Format: <span className="font-mono">YYYY-MM-DD</span> or empty</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Release Site Name</td>
                          <td className="p-2 text-red-600 font-bold border border-gray-200 dark:border-slate-700">Required</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700">e.g. Al Reem Reserve</td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Latitude / Longitude</td>
                          <td className="p-2 text-red-600 font-bold border border-gray-200 dark:border-slate-700">Required</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700">e.g. <span className="font-mono">24.1234</span>, <span className="font-mono">54.5678</span></td>
                        </tr>
                        <tr>
                          <td className="p-2 font-semibold text-emerald-700 dark:text-emerald-400 border border-gray-200 dark:border-slate-700">Assigned Transmitter</td>
                          <td className="p-2 text-gray-500 border border-gray-200 dark:border-slate-700">Optional</td>
                          <td className="p-2 font-sans border border-gray-200 dark:border-slate-700">PTT platform ID (e.g. <span className="font-mono">242086</span>) or leave empty if released without transmitter</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Upload Dropzone */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-slate-600 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-gray-50/50 dark:bg-slate-900/50"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                />
                <UploadCloud className="mx-auto text-emerald-600 dark:text-emerald-400 mb-2" size={36} />
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {uploadFile ? uploadFile.name : 'Click to select or drop Excel (.xlsx, .xls) or CSV file'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Supports modern Excel spreadsheets and comma-separated CSV files
                </p>
              </div>

              {/* Parsing Indicator */}
              {isParsing && (
                <div className="flex items-center justify-center gap-2 py-4 text-emerald-600 text-sm">
                  <RefreshCw className="animate-spin" size={18} />
                  <span>Analyzing and validating file rows...</span>
                </div>
              )}

              {/* Error Alert */}
              {uploadError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Success Alert */}
              {uploadSuccessMessage && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={16} className="flex-shrink-0" />
                  <span>{uploadSuccessMessage}</span>
                </div>
              )}

              {/* Preview Table of Parsed Rows */}
              {parsedRows.length > 0 && !uploadSuccessMessage && (
                <div className="space-y-2 border border-gray-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                      Parsed Records Preview ({parsedRows.length} rows)
                    </span>
                    <div className="flex gap-2 text-[11px]">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {parsedRows.filter(r => r.associated_ptt).length} with PTT
                      </span>
                      <span>•</span>
                      <span className="text-gray-500">
                        {parsedRows.filter(r => r.ring_id === 'NA').length} without Ring (NA)
                      </span>
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto border border-gray-100 dark:border-slate-800 rounded">
                    <table className="w-full text-left text-xs border-collapse font-sans">
                      <thead className="bg-gray-100 dark:bg-slate-800 text-[11px] text-gray-600 dark:text-gray-300 sticky top-0">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">Ring ID</th>
                          <th className="p-2">Darvic</th>
                          <th className="p-2">Origin</th>
                          <th className="p-2">Sex</th>
                          <th className="p-2">Release Date</th>
                          <th className="p-2">Site</th>
                          <th className="p-2">PTT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-[11px]">
                        {parsedRows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                            <td className="p-2 text-gray-400 font-mono">{i + 1}</td>
                            <td className="p-2 font-mono font-medium">
                              {r.ring_id === 'NA' ? <span className="text-gray-400">NA</span> : r.ring_id}
                            </td>
                            <td className="p-2 font-mono">{r.darvic_number || '-'}</td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.origin === 'Wild' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                {r.origin}
                              </span>
                            </td>
                            <td className="p-2">{r.sex}</td>
                            <td className="p-2 font-mono">{r.release_date || '-'}</td>
                            <td className="p-2 truncate max-w-[120px]">{r.release_location || '-'}</td>
                            <td className="p-2 font-mono text-emerald-600 dark:text-emerald-400">
                              {r.associated_ptt || <span className="text-gray-400 font-sans italic">None</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedRows.length > 50 && (
                    <p className="text-[11px] text-gray-400 text-center italic">
                      Showing first 50 of {parsedRows.length} rows...
                    </p>
                  )}
                </div>
              )}

              <div className="pt-3 flex justify-end gap-3 border-t border-gray-100 dark:border-slate-700">
                <button 
                  type="button" 
                  onClick={() => {
                    setIsBulkUploadOpen(false);
                    setUploadFile(null);
                    setParsedRows([]);
                  }} 
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  disabled={parsedRows.length === 0 || !!uploadSuccessMessage}
                  onClick={handleBulkImportConfirm}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-emerald-600/20"
                >
                  <Save size={16} /> Import {parsedRows.length > 0 ? `${parsedRows.length} Birds` : 'Records'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};