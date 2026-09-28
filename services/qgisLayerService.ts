import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, doc, setDoc, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import shp from 'shpjs';
import { kml, gpx } from '@tmcw/togeojson';
import JSZip from 'jszip';
import bbox from '@turf/bbox';
import { getHistoricalPositions } from './firestoreService';
import { useAppStore } from '../store/appStore';
import type { QGISLayer, QGISLayerStyle, Position, Transmitter, Bird } from '../types';

const storage = getStorage();

// Convert Web Mercator (EPSG:3857) meters to WGS84 (EPSG:4326) degrees if needed
const toWGS84 = (x: number, y: number, authid?: string): [number, number] => {
  if (authid === 'EPSG:3857' || Math.abs(x) > 180 || Math.abs(y) > 90) {
    const lon = (x * 180) / 20037508.34;
    const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
    return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
  }
  return [x, y];
};

// Parse QGIS RGBA string "r,g,b,a" or "r,g,b,a,rgb:..." to hex color #rrggbb
const parseQgisColorToHex = (val?: string | null): string | null => {
  if (!val) return null;
  const parts = val.split(',').map(s => parseInt(s.trim(), 10));
  if (parts.length >= 3 && parts.slice(0, 3).every(n => !isNaN(n) && n >= 0 && n <= 255)) {
    const [r, g, b] = parts;
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  return null;
};

// Parse CSV text into GeoJSON FeatureCollection
const parseCSVToGeoJSON = (csvText: string, defaultName = 'CSV Layer'): any => {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error('CSV file is empty');

  const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const splitRow = (row: string) => row.split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());

  const firstRow = splitRow(lines[0]);
  const firstRowHasNumbers = firstRow.some(c => !isNaN(parseFloat(c)) && isFinite(Number(c)));
  const headers = firstRowHasNumbers
    ? firstRow.map((_, i) => `col_${i + 1}`)
    : firstRow;
  const startIdx = firstRowHasNumbers ? 0 : 1;

  const lowerHeaders = headers.map(h => h.toLowerCase());
  let latIdx = lowerHeaders.findIndex(h => ['lat', 'latitude', 'y', 'lat_dd', '釋', 'شمال'].some(k => h === k || h.includes('lat')));
  let lonIdx = lowerHeaders.findIndex(h => ['lon', 'lng', 'long', 'longitude', 'x', 'lon_dd', 'شرق'].some(k => h === k || h.includes('lon') || h.includes('lng')));

  const features: any[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    let lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : NaN;
    let lon = lonIdx >= 0 ? parseFloat(cols[lonIdx]) : NaN;

    // Fallback: scan columns for valid (lat, lon) numeric pair
    if (isNaN(lat) || isNaN(lon)) {
      const nums = cols.map((v, idx) => ({ val: parseFloat(v), idx })).filter(n => !isNaN(n.val));
      if (nums.length >= 2) {
        const a = nums[0].val;
        const b = nums[1].val;
        if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
          lat = a;
          lon = b;
        } else if (Math.abs(b) <= 90 && Math.abs(a) <= 180) {
          lat = b;
          lon = a;
        }
      }
    }

    if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0)) {
      const props: Record<string, any> = { layer: defaultName };
      headers.forEach((h, idx) => {
        if (cols[idx] !== undefined) props[h] = cols[idx];
      });
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: props
      });
    }
  }

  return { type: 'FeatureCollection', features };
};

// Parse a QGIS XML document (.qgs or .qlr) into a GeoJSON FeatureCollection (and extract layer styling)
const parseQGISXmlToGeoJSON = async (xmlText: string, zipContents?: JSZip): Promise<any> => {
  const dom = new DOMParser().parseFromString(xmlText, 'text/xml');
  const mapLayers = Array.from(dom.querySelectorAll('maplayer'));
  const allFeatures: any[] = [];

  const { transmitters = [] } = useAppStore.getState();

  for (const ml of mapLayers) {
    const layerType = ml.getAttribute('type') || 'vector';
    const provider = ml.querySelector('provider')?.textContent?.trim() || '';
    const layerName = ml.querySelector('layername')?.textContent?.trim() || 'QGIS Layer';
    const datasource = ml.querySelector('datasource')?.textContent?.trim() || '';
    const wkbType = (ml.getAttribute('wkbType') || ml.getAttribute('geometry') || '').toLowerCase();

    // Skip base raster tile layers (Google Maps, Esri, Bing, OSM)
    if (layerType === 'raster' || provider === 'wms' || provider === 'xyz') {
      continue;
    }

    // Extract QGIS layer symbology color
    let layerColor = '#3b82f6';
    const colorOptions = Array.from(ml.querySelectorAll('Option[name="color"], Option[name="line_color"], Option[name="outline_color"], prop[k="color"], prop[k="line_color"]'));
    for (const opt of colorOptions) {
      const val = opt.getAttribute('value') || opt.getAttribute('v');
      const hex = parseQgisColorToHex(val);
      if (hex) {
        layerColor = hex;
        break;
      }
    }

    // 1. Check if the file referenced in <datasource> is bundled inside the .qgz zip
    if (zipContents && datasource) {
      const cleanName = datasource.split('|')[0].split('/').pop()?.split('\\').pop()?.replace(/^['"]|['"]$/g, '') || '';
      if (cleanName) {
        const bundledFile = Object.values(zipContents.files).find(f => !f.dir && f.name.toLowerCase().endsWith(cleanName.toLowerCase()));
        if (bundledFile) {
          try {
            if (cleanName.endsWith('.geojson') || cleanName.endsWith('.json')) {
              const gj = JSON.parse(await bundledFile.async('text'));
              const feats = gj.features || [gj];
              feats.forEach((f: any) => {
                f.properties = { ...f.properties, _qgisLayer: layerName, _color: layerColor };
                allFeatures.push(f);
              });
              continue;
            } else if (cleanName.endsWith('.csv')) {
              const gj = parseCSVToGeoJSON(await bundledFile.async('text'), layerName);
              gj.features.forEach((f: any) => {
                f.properties = { ...f.properties, _qgisLayer: layerName, _color: layerColor };
                allFeatures.push(f);
              });
              continue;
            } else if (cleanName.endsWith('.kml')) {
              const kmlDom = new DOMParser().parseFromString(await bundledFile.async('text'), 'text/xml');
              const gj = kml(kmlDom);
              (gj.features || []).forEach((f: any) => {
                f.properties = { ...f.properties, _qgisLayer: layerName, _color: layerColor };
                allFeatures.push(f);
              });
              continue;
            }
          } catch (e) {
            console.warn('Error reading bundled file inside qgz:', e);
          }
        }
      }
    }

    // 2. Check if the layer name or datasource references a known PTT ID (e.g. 244292, 244289, 7211, etc.)
    const combinedText = `${layerName} ${datasource}`;
    const matchedTransmitter = transmitters.find(t => t.platform_id && combinedText.includes(t.platform_id));
    const pttDigitsMatch = combinedText.match(/\b(24\d{4}|\d{5,6})\b/);
    const targetPttId = matchedTransmitter?.platform_id || (pttDigitsMatch ? pttDigitsMatch[1] : null);

    if (targetPttId) {
      try {
        // Parse optional date filter from layer name (e.g. "from 01-07-2025 to 14-03-2026")
        let startDate = new Date('2020-01-01');
        let endDate = new Date();
        const dateRangeMatch = combinedText.match(/(\d{2})-(\d{2})-(\d{4})\s*to\s*(\d{2})-(\d{2})-(\d{4})/i);
        if (dateRangeMatch) {
          startDate = new Date(`${dateRangeMatch[3]}-${dateRangeMatch[2]}-${dateRangeMatch[1]}T00:00:00Z`);
          endDate = new Date(`${dateRangeMatch[6]}-${dateRangeMatch[5]}-${dateRangeMatch[4]}T23:59:59Z`);
        }

        const transObj = transmitters.find(t => t.platform_id === targetPttId);
        const queryIds = transObj ? [transObj.id, targetPttId] : [targetPttId];
        const positions = await getHistoricalPositions(queryIds, startDate, endDate);

        const validPos = positions
          .filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        if (validPos.length > 0) {
          const isLineLayer = wkbType.includes('line') || layerName.includes('مسار') || layerName.toLowerCase().includes('track') || layerName.toLowerCase().includes('distance');
          if (isLineLayer && validPos.length > 1) {
            allFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: validPos.map(p => [p.lon, p.lat])
              },
              properties: {
                name: layerName,
                ptt_id: targetPttId,
                points_count: validPos.length,
                from: validPos[0].timestamp,
                to: validPos[validPos.length - 1].timestamp,
                _qgisLayer: layerName,
                _color: layerColor
              }
            });
          } else {
            validPos.forEach(p => {
              allFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
                properties: {
                  name: layerName,
                  ptt_id: targetPttId,
                  timestamp: p.timestamp,
                  lc: p.lc,
                  speed_kmh: p.speed_kmh,
                  _qgisLayer: layerName,
                  _color: layerColor
                }
              });
            });
          }
          continue;
        }
      } catch (e) {
        console.warn('Could not reconstruct PTT track from Firestore for QGIS layer:', layerName, e);
      }
    }

    // 3. Reconstruct geometry from the QGIS <maplayer><extent> metadata so external layers still render on the map
    const extentEl = ml.querySelector('extent');
    if (extentEl) {
      const rawXmin = parseFloat(extentEl.querySelector('xmin')?.textContent || 'NaN');
      const rawYmin = parseFloat(extentEl.querySelector('ymin')?.textContent || 'NaN');
      const rawXmax = parseFloat(extentEl.querySelector('xmax')?.textContent || 'NaN');
      const rawYmax = parseFloat(extentEl.querySelector('ymax')?.textContent || 'NaN');
      const authid = ml.querySelector('srs authid')?.textContent?.trim();

      if (!isNaN(rawXmin) && !isNaN(rawYmin) && !isNaN(rawXmax) && !isNaN(rawYmax)) {
        const [minLon, minLat] = toWGS84(rawXmin, rawYmin, authid);
        const [maxLon, maxLat] = toWGS84(rawXmax, rawYmax, authid);

        if (Math.abs(minLat) <= 90 && Math.abs(maxLat) <= 90 && Math.abs(minLon) <= 180 && Math.abs(maxLon) <= 180 && (minLat !== 0 || maxLat !== 0)) {
          const spanLon = Math.abs(maxLon - minLon);
          const spanLat = Math.abs(maxLat - minLat);
          const isPoint = wkbType.includes('point') || (spanLon < 0.01 && spanLat < 0.01) || layerName.toLowerCase().includes('camp') || layerName.includes('إحداثيات');
          const isLine = wkbType.includes('line') || layerName.includes('مسار') || layerName.toLowerCase().includes('distance') || layerName.toLowerCase().includes('route');

          if (isPoint) {
            allFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [Number(((minLon + maxLon) / 2).toFixed(6)), Number(((minLat + maxLat) / 2).toFixed(6))]
              },
              properties: { name: layerName, source: 'QGIS Project Layer', _qgisLayer: layerName, _color: layerColor }
            });
          } else if (isLine) {
            allFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [[minLon, minLat], [maxLon, maxLat]]
              },
              properties: { name: layerName, source: 'QGIS Project Layer', _qgisLayer: layerName, _color: layerColor }
            });
          } else {
            allFeatures.push({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]]
              },
              properties: { name: layerName, source: 'QGIS Project Layer', _qgisLayer: layerName, _color: layerColor }
            });
          }
        }
      }
    }
  }

  if (allFeatures.length === 0) {
    throw new Error('No vector features or valid layer extents found in this QGIS file.');
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures
  };
};

export const parseFileToGeoJSON = async (file: File, fileExtension: string): Promise<any> => {
  const arrayBuffer = await file.arrayBuffer();
  
  if (fileExtension === 'geojson' || fileExtension === 'json') {
    const text = await file.text();
    return JSON.parse(text);
  }
  
  if (fileExtension === 'csv') {
    const text = await file.text();
    return parseCSVToGeoJSON(text, file.name.replace(/\.csv$/i, ''));
  }

  if (fileExtension === 'gpx') {
    const text = await file.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    return gpx(dom);
  }

  if (fileExtension === 'qgs' || fileExtension === 'qlr') {
    const text = await file.text();
    return parseQGISXmlToGeoJSON(text);
  }

  if (fileExtension === 'qgz') {
    const zip = new JSZip();
    const contents = await zip.loadAsync(arrayBuffer);
    const qgsFile = Object.values(contents.files).find(f => !f.dir && (f.name.endsWith('.qgs') || f.name.endsWith('.qlr')));
    if (!qgsFile) {
      throw new Error('Invalid .qgz archive: no .qgs project file found inside.');
    }
    const qgsXml = await qgsFile.async('text');
    return parseQGISXmlToGeoJSON(qgsXml, contents);
  }

  if (fileExtension === 'zip') {
    // Check if the zip is actually a .qgz or contains a .qgs file first
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(arrayBuffer);
      const qgsFile = Object.values(contents.files).find(f => !f.dir && (f.name.endsWith('.qgs') || f.name.endsWith('.qlr')));
      if (qgsFile) {
        const qgsXml = await qgsFile.async('text');
        return parseQGISXmlToGeoJSON(qgsXml, contents);
      }
    } catch (_) {
      // Fallback to shpjs
    }
    const geojson = await shp(arrayBuffer);
    return geojson;
  }
  
  if (fileExtension === 'kml') {
    const text = await file.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    return kml(dom);
  }
  
  if (fileExtension === 'kmz') {
    const zip = new JSZip();
    const contents = await zip.loadAsync(arrayBuffer);
    
    const kmlFile = Object.values(contents.files).find(f => f.name.endsWith('.kml') && !f.dir);
    if (!kmlFile) throw new Error("No KML file found in KMZ");
    
    const kmlText = await kmlFile.async('text');
    const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
    return kml(dom);
  }
  
  throw new Error(`Unsupported file format: ${fileExtension}`);
};

export const extractMetadata = (geojson: any) => {
  let firstFeature = null;
  let features: any[] = [];
  
  if (geojson.type === 'FeatureCollection') {
    features = geojson.features || [];
    firstFeature = features[0];
  } else if (Array.isArray(geojson)) {
    features = geojson.flatMap(fc => fc.features || []);
    firstFeature = features[0];
    geojson = { type: 'FeatureCollection', features };
  } else if (geojson.type === 'Feature') {
    features = [geojson];
    firstFeature = geojson;
    geojson = { type: 'FeatureCollection', features };
  } else {
    features = [{ type: 'Feature', geometry: geojson, properties: {} }];
    firstFeature = features[0];
    geojson = { type: 'FeatureCollection', features };
  }
  
  const featureCount = features.length;
  const geometryType = firstFeature?.geometry?.type || 'Mixed';
  
  let properties: string[] = [];
  if (firstFeature?.properties) {
    properties = Object.keys(firstFeature.properties);
  }
  
  let b = [0, 0, 0, 0];
  try {
    if (features.length > 0) {
      b = bbox(geojson);
    }
  } catch(e) {
    console.warn("Could not calculate bbox", e);
  }
  
  const bounds = {
    minLon: b[0],
    minLat: b[1],
    maxLon: b[2],
    maxLat: b[3]
  };
  
  return { geometryType, featureCount, bounds, properties, normalizedGeoJSON: geojson };
};

export const uploadGeoJSONToStorage = async (layerId: string, geojson: any): Promise<string> => {
  const fileRef = ref(storage, `qgis-layers/${layerId}.geojson`);
  const blob = new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' });
  await uploadBytes(fileRef, blob);
  return getDownloadURL(fileRef);
};

export const saveLayerMetadata = async (layer: QGISLayer): Promise<void> => {
  await setDoc(doc(db, 'qgis_layers', layer.id), layer);
};

export const fetchAllLayers = async (): Promise<QGISLayer[]> => {
  const snapshot = await getDocs(collection(db, 'qgis_layers'));
  return snapshot.docs.map(d => d.data() as QGISLayer);
};

export const deleteLayer = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, 'qgis_layers', id));
  try {
    const fileRef = ref(storage, `qgis-layers/${id}.geojson`);
    await deleteObject(fileRef);
  } catch(e) {
    console.warn("Storage deletion error", e);
  }
};

export const updateLayerStyle = async (id: string, style: QGISLayerStyle): Promise<void> => {
  await updateDoc(doc(db, 'qgis_layers', id), { style });
};

export const updateLayerVisibility = async (id: string, visible: boolean): Promise<void> => {
  await updateDoc(doc(db, 'qgis_layers', id), { visible });
};

export const getLayerGeoJSON = async (storageUrl: string): Promise<any> => {
  const response = await fetch(storageUrl);
  if (!response.ok) throw new Error("Failed to fetch GeoJSON from storage");
  return response.json();
};

export const exportTrackingDataAsGeoJSON = (positions: Position[], transmitters: Transmitter[], birds: Bird[]) => {
  const features = positions.map(pos => {
    const t = transmitters.find(x => x.platform_id === pos.transmitter_id);
    const b = birds.find(x => x.ring_id === t?.bird_id);
    
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [pos.lon, pos.lat]
      },
      properties: {
        timestamp: pos.timestamp,
        speed: pos.speed_kmh,
        course: pos.course,
        lc: pos.lc,
        satellite: pos.satellite,
        transmitter: pos.transmitter_id,
        model: t?.model,
        bird: t?.bird_id,
        species: b?.species
      }
    };
  });
  
  return {
    type: "FeatureCollection",
    features
  };
};

export const fetchWMSCapabilities = async (url: string) => {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}request=GetCapabilities&service=WMS`);
  const text = await response.text();
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  
  const layers = Array.from(dom.querySelectorAll('Layer > Name')).map(el => el.textContent);
  return { layers };
};
