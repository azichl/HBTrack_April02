import re

with open('views/LiveTracking.tsx', 'r') as f:
    content = f.read()

# 1. Add states to LiveTracking component
state_code = """    const [isMeasuring, setIsMeasuring] = useState(false);
    const [measurePoints, setMeasurePoints] = useState<L.LatLngExpression[]>([]);

    // Navigation state
    const [userLocation, setUserLocation] = useState<{lat: number, lon: number, accuracy: number} | null>(null);
    const [isTrackingUser, setIsTrackingUser] = useState(false);
    const watchIdRef = useRef<number | null>(null);
    const [navTarget, setNavTarget] = useState<{id: string, lat: number, lon: number} | null>(null);

    const toggleUserTracking = () => {
        if (isTrackingUser) {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
            setIsTrackingUser(false);
            setUserLocation(null);
            setNavTarget(null);
        } else {
            setIsTrackingUser(true);
            if ('geolocation' in navigator) {
                watchIdRef.current = navigator.geolocation.watchPosition(
                    (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
                    (err) => { console.error(err); alert("Failed to get location."); setIsTrackingUser(false); },
                    { enableHighAccuracy: true, maximumAge: 0 }
                );
            } else {
                alert("Geolocation not supported by this browser.");
                setIsTrackingUser(false);
            }
        }
    };

    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, []);"""

content = re.sub(
    r"    const \[isMeasuring, setIsMeasuring\] = useState\(false\);\n    const \[measurePoints, setMeasurePoints\] = useState<L\.LatLngExpression\[\]>\(\[\]\);",
    state_code,
    content
)

# 2. Add navTarget state to TransmitterMarker props
props_replace = """    setSelectedTransmitterIds: (ids: string[]) => void;
    setShowHistory: (show: boolean) => void;
    setNavTarget?: (target: {id: string, lat: number, lon: number} | null) => void;
    isTrackingUser?: boolean;
}"""
content = re.sub(
    r"    setSelectedTransmitterIds: \(ids: string\[\]\) => void;\n    setShowHistory: \(show: boolean\) => void;\n}",
    props_replace,
    content
)

# 3. Update TransmitterMarker definition
marker_def_replace = """const TransmitterMarker: React.FC<TransmitterMarkerProps> = ({ 
    pos, 
    transmitter, 
    bird, 
    timeZone, 
    setSelectedTransmitterIds, 
    setShowHistory,
    setNavTarget,
    isTrackingUser
}) => {"""
content = re.sub(
    r"const TransmitterMarker: React\.FC<TransmitterMarkerProps> = \(\{ \n    pos, \n    transmitter, \n    bird, \n    timeZone, \n    setSelectedTransmitterIds, \n    setShowHistory \n\}\) => \{",
    marker_def_replace,
    content
)

# 4. Update popupopen handler
popup_handler_replace = """        <Marker 
            position={[pos.lat, pos.lon]}
            icon={getStatusIcon(status)}
            eventHandlers={{
                popupopen: () => {
                    setIsOpen(true);
                    if (setNavTarget) {
                        setNavTarget({id: pos.transmitter_id, lat: pos.lat, lon: pos.lon});
                    }
                },
                popupclose: () => setIsOpen(false)
            }}
        >"""
content = re.sub(
    r"        <Marker \n            position=\{\[pos\.lat, pos\.lon\]\}\n            icon=\{getStatusIcon\(status\)\}\n            eventHandlers=\{\{\n                popupopen: \(\) => setIsOpen\(true\),\n                popupclose: \(\) => setIsOpen\(false\)\n            \}\}\n        >",
    popup_handler_replace,
    content
)

# 5. Pass setNavTarget when rendering TransmitterMarker
marker_render_replace = """                return (
                    <TransmitterMarker 
                        key={pos.id} 
                        pos={pos}
                        transmitter={transmitter}
                        bird={bird}
                        timeZone={timeZone}
                        setSelectedTransmitterIds={setSelectedTransmitterIds}
                        setShowHistory={setShowHistory}
                        setNavTarget={setNavTarget}
                        isTrackingUser={isTrackingUser}
                    />
                );"""
content = re.sub(
    r"                return \(\n                    <TransmitterMarker \n                        key=\{pos\.id\} \n                        pos=\{pos\}\n                        transmitter=\{transmitter\}\n                        bird=\{bird\}\n                        timeZone=\{timeZone\}\n                        setSelectedTransmitterIds=\{setSelectedTransmitterIds\}\n                        setShowHistory=\{setShowHistory\}\n                    />\n                \);",
    marker_render_replace,
    content
)

# 6. Render user location and navigation line
nav_render_code = """
            {/* User GPS Location & Navigation Line */}
            {userLocation && (
                <>
                    <Marker 
                        position={[userLocation.lat, userLocation.lon]}
                        icon={L.divIcon({
                            className: 'bg-transparent',
                            html: `<div class="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
                                     <div class="w-2 h-2 bg-white rounded-full"></div>
                                   </div>`,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })}
                        zIndexOffset={2000}
                    >
                        <Popup>Your Location</Popup>
                    </Marker>
                    {userLocation.accuracy && (
                        <CircleMarker 
                            center={[userLocation.lat, userLocation.lon]} 
                            radius={Math.min(userLocation.accuracy / 2, 100)} 
                            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }} 
                        />
                    )}
                    {navTarget && (
                        <>
                            <Polyline 
                                positions={[[userLocation.lat, userLocation.lon], [navTarget.lat, navTarget.lon]]}
                                pathOptions={{ color: '#10b981', weight: 3, dashArray: '10, 10', opacity: 0.8 }}
                            />
                            <Marker 
                                position={[(userLocation.lat + navTarget.lat)/2, (userLocation.lon + navTarget.lon)/2]}
                                icon={L.divIcon({ className: 'bg-transparent', html: '<div></div>' })}
                            >
                                <Tooltip permanent direction="center" className="!bg-emerald-600 !text-white !border-0 !rounded-lg !px-2 !py-1 !font-bold !shadow-lg">
                                    {formatDistance((() => {
                                        const p1 = L.latLng(userLocation.lat, userLocation.lon);
                                        const p2 = L.latLng(navTarget.lat, navTarget.lon);
                                        return p1.distanceTo(p2);
                                    })())}
                                </Tooltip>
                            </Marker>
                        </>
                    )}
                </>
            )}

            {/* Measurement Tool Drawing */}"""

content = content.replace("            {/* Measurement Tool Drawing */}", nav_render_code)


# 7. Add Navigation Toggle Button
nav_btn_code = """            {/* Measurement Tool Toggle */}
            <div className="relative">
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        closeAllDropdowns();
                        setIsMeasuring(!isMeasuring);
                        if (!isMeasuring) setMeasurePoints([]); // Clear points when starting new
                    }}
                    className={`p-2.5 bg-white rounded-lg shadow-md hover:bg-brand-50 transition-colors ${isMeasuring ? 'text-yellow-600 bg-yellow-50 ring-2 ring-yellow-500' : 'text-gray-700'}`}
                    title="Distance Measurement Tool"
                >
                    <Ruler size={20} />
                </button>
            </div>

            {/* GPS Navigation Toggle */}
            <div className="relative">
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        closeAllDropdowns();
                        toggleUserTracking();
                    }}
                    className={`p-2.5 bg-white rounded-lg shadow-md hover:bg-brand-50 transition-colors ${isTrackingUser ? 'text-blue-600 bg-blue-50 ring-2 ring-blue-500' : 'text-gray-700'}`}
                    title="Toggle My GPS Position & Navigation"
                >
                    <Crosshair size={20} />
                </button>
            </div>"""

content = re.sub(
    r"            \{\/\* Measurement Tool Toggle \*\/\}[\s\S]*?<Ruler size=\{20\} \/>\n                </button>\n            </div>",
    nav_btn_code,
    content
)

with open('views/LiveTracking.tsx', 'w') as f:
    f.write(content)

print("LiveTracking.tsx patched successfully.")
