import React, { useState, useRef, useEffect } from 'react';
import { 
  FileUp, Download, Layers, Trash2, Eye, EyeOff, 
  MapPin, Globe, Settings, Upload, RefreshCw, 
  ChevronDown, AlertCircle, CheckCircle, Loader2, 
  Palette, FileCode, ArrowLeft
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { 
  parseFileToGeoJSON, extractMetadata, uploadGeoJSONToStorage, 
  saveLayerMetadata, fetchAllLayers, deleteLayer, 
  updateLayerStyle as updateLayerStyleInDB, 
  updateLayerVisibility as updateLayerVisibilityInDB, 
  fetchWMSCapabilities, exportTrackingDataAsGeoJSON,
  getLayerGeoJSON
} from '../services/qgisLayerService';
import { getHistoricalPositions } from '../services/firestoreService';
import { saveAs } from 'file-saver';
import type { QGISLayer, QGISLayerStyle } from '../types';

export const QGISConnect = ({ onBack }: { onBack?: () => void }) => {
  const { 
    transmitters, 
    birds, 
    qgisLayers = [], 
    addQGISLayer, 
    removeQGISLayer, 
    updateQGISLayerVisibility, 
    updateQGISLayerStyle, 
    setQGISLayers,
    setSharedMapCenter,
    setSharedMapZoom,
    setActiveTab: setGlobalActiveTab
  } = useAppStore();

  useEffect(() => {
    fetchAllLayers()
      .then(layers => {
        if (layers && layers.length > 0 && setQGISLayers) {
          setQGISLayers(layers);
        }
      })
      .catch(err => console.warn('Could not load QGIS layers from Firestore:', err));
  }, [setQGISLayers]);

  const [activeTab, setActiveTab] = useState<'import-layers' | 'wms-wfs' | 'export-data' | 'layer-manager'>('import-layers');

  // --- Tab 1: Import Layers State ---
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [layerName, setLayerName] = useState('');
  const [layerDescription, setLayerDescription] = useState('');
  const [layerStyle, setLayerStyle] = useState({
    strokeColor: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.5,
    strokeWeight: 2,
    pointRadius: 5
  });
  const [importStatus, setImportStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Tab 2: WMS/WFS State ---
  const [wmsUrl, setWmsUrl] = useState('');
  const [serviceType, setServiceType] = useState<'WMS' | 'WFS'>('WMS');
  const [isConnecting, setIsConnecting] = useState(false);
  const [wmsCapabilities, setWmsCapabilities] = useState<any[]>([]);
  const [selectedWmsLayers, setSelectedWmsLayers] = useState<string[]>([]);
  const [wmsStatus, setWmsStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // --- Tab 3: Export Data State ---
  const [selectedTransmitters, setSelectedTransmitters] = useState<string[]>([]);
  const [exportFromDate, setExportFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [exportToDate, setExportToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [exportFormat, setExportFormat] = useState<'GeoJSON' | 'Shapefile' | 'KML'>('GeoJSON');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // --- Tab 4: Layer Manager State ---
  const [deletingLayerId, setDeletingLayerId] = useState<string | null>(null);

  // --- Handlers: Import Layers ---
  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileSelect = async (file: File) => {
    const validExts = ['.qgz', '.qgs', '.qlr', '.csv', '.gpx', '.geojson', '.json', '.zip', '.kml', '.kmz', '.gpkg'];
    const isExtValid = validExts.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!isExtValid) {
      setImportStatus({ type: 'error', message: 'Invalid file format. Please upload .qgz, .qgs, .qlr, .csv, .gpx, .geojson, .zip, .kml, .kmz, or .gpkg' });
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setImportStatus({ type: 'error', message: 'File too large. Maximum size is 25 MB. Use WMS/WFS for larger datasets.' });
      return;
    }

    setImportFile(file);
    setLayerName(file.name.replace(/\.[^/.]+$/, ''));
    setIsParsing(true);
    setImportStatus(null);
    setImportPreview(null);
    
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const geojson = await parseFileToGeoJSON(file, ext);
      const metadata = extractMetadata(geojson);

      // Adopt QGIS layer color if present in parsed features
      const firstColor = metadata.normalizedGeoJSON?.features?.find((f: any) => f?.properties?._color)?.properties?._color;
      if (firstColor) {
        setLayerStyle(prev => ({
          ...prev,
          strokeColor: firstColor,
          fillColor: firstColor
        }));
      }
      
      setImportPreview({
        geojson: metadata.normalizedGeoJSON,
        geometryType: metadata.geometryType,
        featureCount: metadata.featureCount,
        bounds: metadata.bounds,
        properties: metadata.properties
      });
      setIsParsing(false);
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error.message || 'Error parsing file' });
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!importFile || !importPreview) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      const layerId = `qgis_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const ext = importFile.name.split('.').pop()?.toLowerCase() || 'geojson';
      const formatMap: Record<string, QGISLayer['format']> = { 
        qgz: 'qgz', qgs: 'qgs', qlr: 'qlr', csv: 'csv', gpx: 'gpx',
        geojson: 'geojson', json: 'geojson', zip: 'shapefile', kml: 'kml', kmz: 'kml', gpkg: 'geopackage' 
      };
      
      // Upload normalized GeoJSON to Firebase Storage
      const storageUrl = await uploadGeoJSONToStorage(layerId, importPreview.geojson);
      
      // Build layer metadata
      const layer: QGISLayer = {
        id: layerId,
        name: layerName || importFile.name.split('.')[0],
        type: 'file',
        storageUrl,
        format: formatMap[ext] || 'geojson',
        geometryType: importPreview.geometryType,
        featureCount: importPreview.featureCount,
        bounds: importPreview.bounds,
        style: {
          color: layerStyle.strokeColor,
          fillColor: layerStyle.fillColor,
          fillOpacity: layerStyle.fillOpacity,
          weight: layerStyle.strokeWeight,
          radius: layerStyle.pointRadius
        },
        visible: true,
        zIndex: 700 + (qgisLayers?.length || 0),
        uploadedBy: 'current-user',
        uploadedAt: new Date().toISOString(),
        description: layerDescription || undefined,
        properties: importPreview.properties
      };
      
      // Save to Firestore
      await saveLayerMetadata(layer);
      
      // Add to local store
      if (addQGISLayer) addQGISLayer(layer);
      
      // Cache the GeoJSON for immediate rendering
      const { cacheQGISGeoJSON } = useAppStore.getState();
      if (cacheQGISGeoJSON) cacheQGISGeoJSON(layerId, importPreview.geojson);
      
      setImportStatus({ type: 'success', message: `Layer "${layer.name}" imported successfully with ${importPreview.featureCount} features!` });
      setIsImporting(false);
      setImportFile(null);
      setImportPreview(null);
      setLayerName('');
      setLayerDescription('');
    } catch (error: any) {
      setImportStatus({ type: 'error', message: error.message || 'Failed to import layer' });
      setIsImporting(false);
    }
  };

  // --- Handlers: WMS/WFS ---
  const handleConnect = async () => {
    if (!wmsUrl) return;
    setIsConnecting(true);
    setWmsStatus(null);
    try {
      const result = await fetchWMSCapabilities(wmsUrl);
      const layerList = (result.layers || []).filter(Boolean).map((name: string) => ({
        name,
        title: name,
        crs: 'EPSG:4326'
      }));
      setWmsCapabilities(layerList);
      setIsConnecting(false);
      if (layerList.length > 0) {
        setWmsStatus({ type: 'success', message: `Found ${layerList.length} layers from ${serviceType} service` });
      } else {
        setWmsStatus({ type: 'error', message: 'No layers found. Check the URL and try again.' });
      }
    } catch (error: any) {
      setWmsStatus({ type: 'error', message: error.message || 'Failed to connect to service' });
      setIsConnecting(false);
    }
  };

  const handleToggleWmsLayer = (layerName: string) => {
    setSelectedWmsLayers(prev => 
      prev.includes(layerName) ? prev.filter(l => l !== layerName) : [...prev, layerName]
    );
  };

  const handleAddWmsLayers = async () => {
    if (selectedWmsLayers.length === 0) return;
    
    for (const lName of selectedWmsLayers) {
      const layerData = wmsCapabilities.find((l: any) => l.name === lName);
      if (layerData && addQGISLayer) {
        const layerId = `wms_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const layer: QGISLayer = {
          id: layerId,
          name: layerData.title || layerData.name,
          type: serviceType === 'WMS' ? 'wms' : 'wfs',
          sourceUrl: wmsUrl,
          format: 'geojson',
          geometryType: 'Mixed',
          featureCount: 0,
          bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 },
          style: {
            color: layerStyle.strokeColor,
            fillColor: layerStyle.fillColor,
            fillOpacity: layerStyle.fillOpacity,
            weight: layerStyle.strokeWeight,
            radius: layerStyle.pointRadius
          },
          visible: true,
          zIndex: 700 + (qgisLayers?.length || 0),
          uploadedBy: 'current-user',
          uploadedAt: new Date().toISOString(),
          description: `${serviceType} layer from ${wmsUrl}`,
          wmsLayers: layerData.name
        };
        
        await saveLayerMetadata(layer);
        addQGISLayer(layer);
      }
    }
    
    setSelectedWmsLayers([]);
    setWmsStatus({ type: 'success', message: `${selectedWmsLayers.length} layer(s) added successfully!` });
  };

  // --- Handlers: Export Data ---
  const handleToggleTransmitter = (pttId: string) => {
    setSelectedTransmitters(prev => 
      prev.includes(pttId) ? prev.filter(id => id !== pttId) : [...prev, pttId]
    );
  };

  const handleSelectAllTransmitters = () => {
    if (selectedTransmitters.length === transmitters.length) {
      setSelectedTransmitters([]);
    } else {
      setSelectedTransmitters(transmitters.map(t => t.platform_id));
    }
  };

  const handleExportData = async () => {
    if (selectedTransmitters.length === 0) return;
    setIsExporting(true);
    setExportStatus(null);
    try {
      // Fetch positions for all selected transmitters
      let allPositions: any[] = [];
      const transIds = selectedTransmitters
        .map(pttId => transmitters.find(t => t.platform_id === pttId))
        .filter(Boolean)
        .map(t => t!.id);
      
      if (transIds.length > 0) {
        const positions = await getHistoricalPositions(transIds, new Date(exportFromDate), new Date(exportToDate));
        allPositions = positions;
      }
      
      if (allPositions.length === 0) {
        setExportStatus({ type: 'error', message: 'No positions found for the selected transmitters and date range.' });
        setIsExporting(false);
        return;
      }
      
      // Build GeoJSON
      const geojson = exportTrackingDataAsGeoJSON(allPositions, transmitters, birds);
      
      // Download as file
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
      const filename = `hbtrack_export_${selectedTransmitters.join('_')}_${exportFromDate}_${exportToDate}.geojson`;
      saveAs(blob, filename);
      
      setIsExporting(false);
      setExportStatus({ type: 'success', message: `Exported ${allPositions.length} positions from ${selectedTransmitters.length} transmitter(s) as ${exportFormat}` });
    } catch (error: any) {
      setExportStatus({ type: 'error', message: error.message || 'Failed to export data' });
      setIsExporting(false);
    }
  };

  // --- Handlers: Layer Manager ---
  const handleDeleteLayer = async (layerId: string) => {
    setDeletingLayerId(layerId);
    try {
      await deleteLayer(layerId);
      if (removeQGISLayer) removeQGISLayer(layerId);
      setDeletingLayerId(null);
    } catch (error) {
      console.error(error);
      setDeletingLayerId(null);
    }
  };

  // --- UI Components ---
  const tabs = [
    { id: 'import-layers', label: 'Import Vector Layer', icon: FileUp },
    { id: 'wms-wfs', label: 'Connect WMS/WFS', icon: Globe },
    { id: 'export-data', label: 'Export Tracks', icon: Download },
    { id: 'layer-manager', label: 'Manage Layers', icon: Layers }
  ];

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-4">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div>
          <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">QGIS Integration</span>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            GIS Data Connector
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-[12px] mt-1">
            Import QGIS layers, connect to WMS/WFS servers, and export tracking data.
          </p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex overflow-x-auto hide-scrollbar space-x-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap
                ${isActive 
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-slate-800/50 dark:hover:text-gray-300'
                }`}
            >
              <Icon size={16} className={isActive ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-5">
        
        {/* TAB 1: IMPORT LAYERS */}
        {activeTab === 'import-layers' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Import Vector Layer</h3>
            
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => !isParsing && !isImporting && fileInputRef.current?.click()}
              className={`border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-8 text-center transition-colors cursor-pointer
                ${(isParsing || isImporting) ? 'opacity-50 cursor-not-allowed' : 'hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-slate-800/50'}
              `}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".qgz,.qgs,.qlr,.csv,.gpx,.geojson,.json,.zip,.kml,.kmz,.gpkg"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                }}
              />
              
              <div className="mx-auto w-12 h-12 bg-brand-50 dark:bg-brand-900/20 text-brand-500 rounded-full flex items-center justify-center mb-3">
                {isParsing ? <Loader2 className="animate-spin" size={24} /> : <FileUp size={24} />}
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {isParsing ? 'Parsing QGIS / GIS file...' : (importFile ? importFile.name : 'Click or drag QGIS project (.qgz) or GIS layer file here')}
              </p>
              {!importFile && !isParsing && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Supports .qgz, .qgs, .qlr (QGIS Projects & Layers), .csv, .gpx, .geojson, .zip (Shapefile), .kml, .kmz, .gpkg
                </p>
              )}
            </div>

            {importStatus && (
              <div className={`p-3 rounded-lg flex items-start gap-3 text-sm ${
                importStatus.type === 'error' 
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-100 dark:border-red-900/30'
                  : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
              }`}>
                {importStatus.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                <span>{importStatus.message}</span>
              </div>
            )}

            {importPreview && (
              <div className="grid md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Layer Name</label>
                    <input 
                      type="text" 
                      value={layerName}
                      onChange={(e) => setLayerName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                    <textarea 
                      value={layerDescription}
                      onChange={(e) => setLayerDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-none"
                    />
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700/50 text-sm space-y-2">
                    <p className="text-gray-600 dark:text-gray-300"><span className="font-medium">Geometry Type:</span> {importPreview.geometryType}</p>
                    <p className="text-gray-600 dark:text-gray-300"><span className="font-medium">Feature Count:</span> {importPreview.featureCount.toLocaleString()}</p>
                    {importPreview.properties?.length > 0 && (
                      <p className="text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Attributes:</span> {importPreview.properties.slice(0, 5).join(', ')}
                        {importPreview.properties.length > 5 ? '...' : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Palette size={16} className="text-brand-500" /> Layer Styling
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stroke Color</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="color" 
                          value={layerStyle.strokeColor}
                          onChange={(e) => setLayerStyle({...layerStyle, strokeColor: e.target.value})}
                          className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{layerStyle.strokeColor}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fill Color</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="color" 
                          value={layerStyle.fillColor}
                          onChange={(e) => setLayerStyle({...layerStyle, fillColor: e.target.value})}
                          className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{layerStyle.fillColor}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Fill Opacity ({Math.round(layerStyle.fillOpacity * 100)}%)</label>
                    <input 
                      type="range" 
                      min="0" max="1" step="0.1" 
                      value={layerStyle.fillOpacity}
                      onChange={(e) => setLayerStyle({...layerStyle, fillOpacity: parseFloat(e.target.value)})}
                      className="w-full accent-brand-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stroke Weight ({layerStyle.strokeWeight}px)</label>
                    <input 
                      type="range" 
                      min="1" max="5" step="1" 
                      value={layerStyle.strokeWeight}
                      onChange={(e) => setLayerStyle({...layerStyle, strokeWeight: parseInt(e.target.value)})}
                      className="w-full accent-brand-500"
                    />
                  </div>

                  {importPreview.geometryType === 'Point' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Point Radius ({layerStyle.pointRadius}px)</label>
                      <input 
                        type="range" 
                        min="3" max="15" step="1" 
                        value={layerStyle.pointRadius}
                        onChange={(e) => setLayerStyle({...layerStyle, pointRadius: parseInt(e.target.value)})}
                        className="w-full accent-brand-500"
                      />
                    </div>
                  )}
                  
                  <div className="pt-4">
                    <button
                      onClick={handleImport}
                      disabled={isImporting || !layerName.trim()}
                      className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                      {isImporting ? 'Importing Layer...' : 'Import Layer'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WMS/WFS CONNECT */}
        {activeTab === 'wms-wfs' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Connect WMS/WFS Server</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enter a QGIS Server, GeoServer, or MapServer URL</p>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <div className="md:col-span-3 space-y-3">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="radio" name="serviceType" value="WMS" checked={serviceType === 'WMS'} onChange={() => setServiceType('WMS')} className="text-brand-500 focus:ring-brand-500 h-4 w-4" />
                    WMS (Web Map Service)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="radio" name="serviceType" value="WFS" checked={serviceType === 'WFS'} onChange={() => setServiceType('WFS')} className="text-brand-500 focus:ring-brand-500 h-4 w-4" />
                    WFS (Web Feature Service)
                  </label>
                </div>
                
                <input 
                  type="url" 
                  placeholder="https://example.com/geoserver/wms"
                  value={wmsUrl}
                  onChange={(e) => setWmsUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleConnect}
                  disabled={isConnecting || !wmsUrl.trim()}
                  className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Connect
                </button>
              </div>
            </div>

            {wmsStatus && (
              <div className={`p-3 rounded-lg flex items-start gap-3 text-sm ${
                wmsStatus.type === 'error' 
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-100 dark:border-red-900/30'
                  : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
              }`}>
                {wmsStatus.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                <span>{wmsStatus.message}</span>
              </div>
            )}

            {wmsCapabilities.length > 0 && (
              <div className="mt-6 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="bg-gray-50 dark:bg-slate-800 px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">Available Layers</h4>
                  <span className="text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 px-2 py-1 rounded-full">
                    {wmsCapabilities.length} Found
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-[300px] overflow-y-auto">
                  {wmsCapabilities.map((layer) => (
                    <label key={layer.name} className="flex items-start gap-3 p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={selectedWmsLayers.includes(layer.name)}
                        onChange={() => handleToggleWmsLayer(layer.name)}
                        className="mt-1 rounded text-brand-500 focus:ring-brand-500 h-4 w-4 border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{layer.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{layer.name} • {layer.crs}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedWmsLayers.length > 0 && (
                  <div className="p-4 bg-gray-50 dark:bg-slate-800/80 border-t border-gray-200 dark:border-slate-700 flex justify-end">
                    <button
                      onClick={handleAddWmsLayers}
                      className="bg-brand-500 hover:bg-brand-600 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                      Add Selected Layers ({selectedWmsLayers.length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EXPORT DATA */}
        {activeTab === 'export-data' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Export Tracking Data</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Export telemetry data in standard GIS formats.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Select Transmitters</label>
                    <button 
                      onClick={handleSelectAllTransmitters}
                      className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {selectedTransmitters.length === transmitters.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  
                  <div className="border border-gray-200 dark:border-slate-700 rounded-lg max-h-[250px] overflow-y-auto bg-white dark:bg-slate-800 p-2 space-y-1">
                    {transmitters.map(t => (
                      <label key={t.id} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 dark:hover:bg-slate-700 rounded cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedTransmitters.includes(t.platform_id)}
                          onChange={() => handleToggleTransmitter(t.platform_id)}
                          className="rounded text-brand-500 focus:ring-brand-500 h-3.5 w-3.5 border-gray-300 dark:border-slate-600"
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-200">{t.platform_id}</span>
                      </label>
                    ))}
                    {transmitters.length === 0 && (
                      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        No transmitters available.
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {selectedTransmitters.length} selected
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
                    <input 
                      type="date" 
                      value={exportFromDate}
                      onChange={(e) => setExportFromDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
                    <input 
                      type="date" 
                      value={exportToDate}
                      onChange={(e) => setExportToDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Export Format</label>
                  <div className="relative">
                    <select 
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white appearance-none outline-none focus:border-brand-500"
                    >
                      <option value="GeoJSON">GeoJSON (.geojson)</option>
                      <option value="Shapefile">ESRI Shapefile (.zip)</option>
                      <option value="KML">Google Earth (.kml)</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleExportData}
                    disabled={isExporting || selectedTransmitters.length === 0}
                    className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {isExporting ? 'Exporting...' : 'Export Data'}
                  </button>
                </div>

                {exportStatus && (
                  <div className={`p-3 rounded-lg flex items-start gap-3 text-sm ${
                    exportStatus.type === 'error' 
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-100 dark:border-red-900/30'
                      : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
                  }`}>
                    {exportStatus.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                    <span>{exportStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LAYER MANAGER */}
        {activeTab === 'layer-manager' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Layer Manager</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage imported layers and external map services.</p>
            </div>

            {qgisLayers && qgisLayers.length > 0 ? (
              <div className="grid gap-4">
                {qgisLayers.map((layer: any) => (
                  <div key={layer.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-brand-50 dark:bg-brand-900/20 text-brand-500 rounded-lg">
                        {layer.geometryType === 'WMS' ? <Globe size={20} /> : <Layers size={20} />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          {layer.name}
                          {!layer.visible && <span className="text-[10px] bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded font-medium">Hidden</span>}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {layer.geometryType === 'WMS' 
                            ? `WMS Service • ${layer.wmsUrl}`
                            : `${layer.geometryType} • ${layer.featureCount?.toLocaleString() || 0} features`
                          }
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {layer.geometryType !== 'WMS' && (
                        <div className="flex items-center gap-1 mr-2 px-2 py-1 rounded bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-700">
                          <div className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: layer.style?.fillColor || '#ccc' }}></div>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">Color</span>
                        </div>
                      )}
                      
                      <button 
                        title="Toggle Visibility"
                        onClick={async () => {
                          const nextVal = !layer.visible;
                          if (updateQGISLayerVisibility) updateQGISLayerVisibility(layer.id, nextVal);
                          try {
                            await updateLayerVisibilityInDB(layer.id, nextVal);
                          } catch (e) {
                            console.warn('Failed to persist layer visibility:', e);
                          }
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          layer.visible 
                            ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700' 
                            : 'text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-slate-700'
                        }`}
                      >
                        {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button 
                        title="Zoom to Extent on Live Map"
                        onClick={() => {
                          if (layer.bounds && setSharedMapCenter && setSharedMapZoom) {
                            const centerLat = (layer.bounds.minLat + layer.bounds.maxLat) / 2;
                            const centerLon = (layer.bounds.minLon + layer.bounds.maxLon) / 2;
                            if (!isNaN(centerLat) && !isNaN(centerLon)) {
                              setSharedMapCenter([centerLat, centerLon]);
                              setSharedMapZoom(9);
                            }
                          }
                          if (setGlobalActiveTab) setGlobalActiveTab('Live Tracking');
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <MapPin size={16} />
                      </button>
                      <button 
                        title="Delete Layer"
                        onClick={() => handleDeleteLayer(layer.id)}
                        disabled={deletingLayerId === layer.id}
                        className="p-2 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-1"
                      >
                        {deletingLayerId === layer.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                <Layers size={48} className="mx-auto text-gray-300 dark:text-slate-600 mb-3" />
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">No layers imported</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                  Import vector layers or connect to WMS/WFS services to manage them here.
                </p>
                <button
                  onClick={() => setActiveTab('import-layers')}
                  className="mt-4 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Go to Import Layer &rarr;
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
