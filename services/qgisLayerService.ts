import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, doc, setDoc, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import JSZip from 'jszip';
import bbox from '@turf/bbox';
import type { QGISLayer, QGISLayerStyle, Position, Transmitter, Bird } from '../types';

const storage = getStorage();

export const parseFileToGeoJSON = async (file: File, fileExtension: string): Promise<any> => {
  const arrayBuffer = await file.arrayBuffer();
  
  if (fileExtension === 'geojson' || fileExtension === 'json') {
    const text = await file.text();
    return JSON.parse(text);
  }
  
  if (fileExtension === 'zip') {
    // shpjs handles the zip file arraybuffer
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
