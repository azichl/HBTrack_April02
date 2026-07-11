#!/usr/bin/env python3
"""
HoubaraTracker - Google Earth Engine Geospatial Analysis Script
Performs NDVI (Vegetation Index) and LST (Land Surface Temperature) analysis
centered around the tracked birds' latest coordinates fetched from Firestore.
"""

import os
import sys
import getpass
import webbrowser
from datetime import datetime, timedelta
import requests
import folium
import ee

# Firebase Configurations (sourced from firebase.ts)
FIREBASE_API_KEY = "AIzaSyD9MzJr1x2DZdBy8vu5-TvB-uX2UwbheUg"
FIREBASE_PROJECT_ID = "trackapp-v2"
AUTH_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
FIRESTORE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery"

def get_firebase_token(email, password):
    """Authenticates with Firebase Auth and returns the ID token."""
    print("[Firebase] Authenticating...")
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }
    response = requests.post(AUTH_URL, json=payload)
    if response.status_code != 200:
        error_msg = response.json().get('error', {}).get('message', 'Unknown Error')
        raise Exception(f"Firebase authentication failed: {error_msg}")
    
    print("[Firebase] Authentication successful!")
    return response.json()["idToken"]

def fetch_latest_bird_positions(id_token):
    """Queries Firestore for the latest bird positions using structured query."""
    print("[Firestore] Fetching bird positions...")
    headers = {
        "Authorization": f"Bearer {id_token}"
    }
    
    # Structured query to fetch latest 150 positions
    query_payload = {
        "structuredQuery": {
            "from": [{"collectionId": "positions"}],
            "orderBy": [
                {"field": {"fieldPath": "timestamp"}, "direction": "DESCENDING"}
            ],
            "limit": 150
        }
    }
    
    response = requests.post(FIRESTORE_URL, json=query_payload, headers=headers)
    if response.status_code != 200:
        raise Exception(f"Firestore query failed: {response.text}")
    
    results = response.json()
    
    # Group by transmitter_id to keep only the latest position
    latest_positions = {}
    for result in results:
        doc = result.get("document")
        if not doc:
            continue
        
        fields = doc.get("fields", {})
        transmitter_id = fields.get("transmitter_id", {}).get("stringValue")
        timestamp = fields.get("timestamp", {}).get("stringValue")
        lat = fields.get("lat", {}).get("doubleValue")
        lon = fields.get("lon", {}).get("doubleValue")
        
        if not transmitter_id or lat is None or lon is None:
            continue
            
        # Parse coordinates as float
        lat = float(lat)
        lon = float(lon)
        
        if transmitter_id not in latest_positions:
            latest_positions[transmitter_id] = {
                "transmitter_id": transmitter_id,
                "timestamp": timestamp,
                "lat": lat,
                "lon": lon
            }
            
    return list(latest_positions.values())

def init_gee():
    """Initializes Google Earth Engine with authentication check."""
    print("[GEE] Initializing Google Earth Engine...")
    try:
        ee.Initialize(project='trackapp-v2')
    except Exception:
        print("[GEE] Authentication required. Opening GEE authentication page...")
        ee.Authenticate()
        ee.Initialize()
    print("[GEE] Google Earth Engine initialized successfully!")

def add_ee_tile_layer(map_obj, ee_image, vis_params, name):
    """Helper to convert GEE image into a Folium TileLayer."""
    map_id_dict = ee.Image(ee_image).getMapId(vis_params)
    tile_url = map_id_dict['tile_fetcher'].url_format
    folium.raster_layers.TileLayer(
        tiles=tile_url,
        attr='Google Earth Engine',
        name=name,
        overlay=True,
        control=True
    ).add_to(map_obj)
    return tile_url

def mask_s2_clouds(image):
    """Masks clouds in Sentinel-2 image using QA60 QA band."""
    qa = image.select('QA60')
    cloud_bit_mask = 1 << 10
    cirrus_bit_mask = 1 << 11
    mask = qa.bitwiseAnd(cloud_bit_mask).eq(0).And(
           qa.bitwiseAnd(cirrus_bit_mask).eq(0))
    return image.updateMask(mask).divide(10000)

def main():
    print("=" * 60)
    print("      HoubaraTracker - Google Earth Engine Spatial Analysis")
    print("=" * 60)
    
    # ── 1. Firebase Authentication ──
    print("\nPlease enter your HoubaraTracker credentials:")
    email = input("Email: ").strip()
    password = getpass.getpass("Password: ")
    
    try:
        id_token = get_firebase_token(email, password)
        birds = fetch_latest_bird_positions(id_token)
        print(f"[Firestore] Loaded latest positions for {len(birds)} active PTTs.")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("Falling back to default coordinates [36.0, 59.0] and offline mode.")
        birds = []
        
    # ── 2. Time Range Selection ──
    print("\nSelect Custom Analysis Date Range:")
    print("Format: YYYY-MM-DD (Press Enter to use default last 30 days)")
    
    default_end = datetime.utcnow()
    default_start = default_end - timedelta(days=30)
    
    start_input = input(f"Start Date [{default_start.strftime('%Y-%m-%d')}]: ").strip()
    end_input = input(f"End Date [{default_end.strftime('%Y-%m-%d')}]: ").strip()
    
    start_date_str = start_input if start_input else default_start.strftime('%Y-%m-%d')
    end_date_str = end_input if end_input else default_end.strftime('%Y-%m-%d')
    
    # ── 3. Initialize GEE ──
    try:
        init_gee()
    except Exception as e:
        print(f"\n❌ GEE Initialization failed: {e}")
        print("Please ensure you have registered for GEE at https://signup.earthengine.google.com/")
        sys.exit(1)
        
    # Define analysis geometry (bounding box around birds or default region)
    if birds:
        lats = [b["lat"] for b in birds]
        lons = [b["lon"] for b in birds]
        
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)
        
        # Add 0.5 degree buffer
        roi = ee.Geometry.Rectangle([min_lon - 0.5, min_lat - 0.5, max_lon + 0.5, max_lat + 0.5])
        map_center = [(min_lat + max_lat) / 2, (min_lon + max_lon) / 2]
        zoom_start = 7
    else:
        # Default: Central Asia / Iran border region
        roi = ee.Geometry.Rectangle([55.0, 32.0, 63.0, 39.0])
        map_center = [36.0, 59.0]
        zoom_start = 5

    print(f"[GEE] Analysis Region set to: {map_center}")
    print(f"[GEE] Analyzing date range: {start_date_str} to {end_date_str}")

    # ── 4. Sentinel-2 NDVI Analysis ──
    print("[GEE] Fetching Sentinel-2 Surface Reflectance imagery...")
    s2_col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
              .filterBounds(roi)
              .filterDate(start_date_str, end_date_str)
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
              .map(mask_s2_clouds))
              
    if s2_col.size().getInfo() > 0:
        print(f"[GEE] Found Sentinel-2 images. Computing Median composite & NDVI...")
        s2_composite = s2_col.median()
        ndvi = s2_composite.normalizedDifference(['B8', 'B4']).rename('NDVI')
    else:
        print("[GEE] ⚠️ No Sentinel-2 imagery found in range. NDVI overlay will be skipped.")
        ndvi = None

    # ── 5. MODIS Land Surface Temperature (LST) Analysis ──
    print("[GEE] Fetching MODIS LST (Land Surface Temperature) imagery...")
    modis_col = (ee.ImageCollection('MODIS/061/MOD11A1')
                 .filterBounds(roi)
                 .filterDate(start_date_str, end_date_str)
                 .select('LST_Day_1km'))
                 
    if modis_col.size().getInfo() > 0:
        print("[GEE] Found MODIS imagery. Computing Mean composite & converting to Celsius...")
        # Scale factor is 0.02, subtract 273.15 for Celsius
        lst_celsius = modis_col.mean().multiply(0.02).subtract(273.15).rename('LST')
    else:
        print("[GEE] ⚠️ No MODIS LST imagery found. LST overlay will be skipped.")
        lst_celsius = None

    # ── 6. Construct Interactive Folium Map ──
    print("[Map] Building Leaflet Folium map...")
    m = folium.Map(
        location=map_center,
        zoom_start=zoom_start,
        tiles='https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        attr='Google Satellite'
    )

    ndvi_url = None
    lst_url = None

    # Add NDVI Layer
    if ndvi:
        ndvi_vis = {
            'min': 0.0,
            'max': 0.6,
            'palette': [
                '#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901',
                '#66A200', '#228B22', '#012E01'
            ]
        }
        ndvi_url = add_ee_tile_layer(m, ndvi, ndvi_vis, 'NDVI (Vegetation Index)')

    # Add LST Layer
    if lst_celsius:
        lst_vis = {
            'min': 10.0,  # 10 °C
            'max': 45.0,  # 45 °C
            'palette': [
                '#0000FF', '#00FFFF', '#00FF00', '#FFFF00', '#FF0000'
            ]
        }
        lst_url = add_ee_tile_layer(m, lst_celsius, lst_vis, 'LST (Land Surface Temp °C)')

    # Add Birds' Markers
    print("[Map] Placing bird markers...")
    marker_group = folium.FeatureGroup(name="Bird Locations").add_to(m)
    for b in birds:
        # Format date for popup
        dt_parsed = datetime.fromisoformat(b["timestamp"].replace("Z", "+00:00"))
        local_time_str = dt_parsed.strftime("%Y-%m-%d %H:%M UTC")
        
        popup_html = f"""
        <div style="font-family: Arial, sans-serif; font-size: 12px; width: 180px;">
            <h4 style="margin: 0 0 5px 0; color: #4F46E5;">PTT {b['transmitter_id']}</h4>
            <hr style="margin: 5px 0; border: 0; border-top: 1px solid #E5E7EB;"/>
            <b>Time:</b> {local_time_str}<br/>
            <b>Lat:</b> {b['lat']:.5f}<br/>
            <b>Lon:</b> {b['lon']:.5f}
        </div>
        """
        folium.Marker(
            location=[b["lat"], b["lon"]],
            popup=folium.Popup(popup_html, max_width=200),
            tooltip=f"PTT {b['transmitter_id']}",
            icon=folium.Icon(color='green', icon='info-sign')
        ).add_to(marker_group)

    # Add Controls
    folium.LayerControl(position='topright').add_to(m)

    # Save to file and open
    output_filename = "gee_analysis_map.html"
    m.save(output_filename)
    
    print(f"\n✅ Success! Map generated successfully: {output_filename}")
    
    # Print GEE Tile URLs for Web App integration
    print("\n" + "=" * 65)
    print(" 🔗 COPY-PASTE TILE URLS FOR YOUR HOUBARATRACKER WEB APP")
    print("=" * 65)
    print("Copy any of these URLs and paste them into the 'Custom GEE Overlay'")
    print("text area in the web app's Layers panel to show it live:")
    print("-" * 65)
    if ndvi_url:
        print(f"👉 NDVI (Vegetation Index):\n{ndvi_url}\n")
    if lst_url:
        print(f"👉 LST (Land Surface Temperature):\n{lst_url}\n")
    print("=" * 65 + "\n")

    # Auto-open in browser
    abs_path = os.path.abspath(output_filename)
    webbrowser.open(f"file://{abs_path}")
    print("[Map] Opened map in your default web browser.")
    print("=" * 60)

if __name__ == "__main__":
    main()
