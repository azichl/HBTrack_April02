import re

with open('views/LiveTracking.tsx', 'r') as f:
    content = f.read()

state_code = """  const [isMeasuring, setIsMeasuring] = useState(false);
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
    r"  const \[isMeasuring, setIsMeasuring\] = useState\(false\);\n  const \[measurePoints, setMeasurePoints\] = useState<L\.LatLngExpression\[\]>\(\[\]\);",
    state_code,
    content
)

with open('views/LiveTracking.tsx', 'w') as f:
    f.write(content)
print("State hooks inserted.")
