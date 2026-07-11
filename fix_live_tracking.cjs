const fs = require('fs');
let content = fs.readFileSync('/Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx', 'utf8');

// 1. Update modal3D state
content = content.replace(
  'const [modal3D, setModal3D] = useState<{isOpen: boolean, lat: number, lon: number, pttId: string} | null>(null);',
  `const [modal3D, setModal3D] = useState<{lat: number, lon: number, pttId?: string} | null>(null);\n  const handleOpen3DModal = (lat: number, lon: number, pttId: string) => setModal3D({ lat, lon, pttId });`
);

// 2. Add onOpen3DModal to TransmitterMarker
content = content.replace(
  /<TransmitterMarker\s+key=\{pos\.transmitter_id\}\s+pos=\{pos\}\s+transmitter=\{transmitter\}\s+bird=\{bird\}\s+timeZone=\{timeZone\}\s+setSelectedTransmitterIds=\{setSelectedTransmitterIds\}\s+setShowHistory=\{setShowHistory\}\s*\/>/,
  `<TransmitterMarker 
                        key={pos.transmitter_id} 
                        pos={pos} 
                        transmitter={transmitter} 
                        bird={bird} 
                        timeZone={timeZone} 
                        setSelectedTransmitterIds={setSelectedTransmitterIds} 
                        setShowHistory={setShowHistory} 
                        onOpen3DModal={handleOpen3DModal}
                    />`
);

// 3. Add onOpen3DModal to HistoricalMarker
content = content.replace(
  /<HistoricalMarker\s+key=\{index\}\s+point=\{point\}\s+pttId=\{path\.id\}\s+color=\{path\.color\}\s+timeZone=\{timeZone\}\s*\/>/,
  `<HistoricalMarker 
                                key={index} 
                                point={point} 
                                pttId={path.id} 
                                color={path.color} 
                                timeZone={timeZone} 
                                onOpen3DModal={handleOpen3DModal}
                            />`
);

// 4. Replace the bottom modal rendering with ThreeDTerrainModal
const oldModalStart = content.indexOf('{modal3D && modal3D.isOpen && (');
if (oldModalStart !== -1) {
  // Find the end of the modal block
  let braces = 0;
  let oldModalEnd = -1;
  let inModal = false;
  for (let i = oldModalStart; i < content.length; i++) {
    if (content[i] === '{') braces++;
    if (content[i] === '}') braces--;
    
    if (braces === 1 && content.substr(i, 2) === ')}' && inModal) {
      oldModalEnd = i + 2;
      break;
    }
    
    if (braces > 0) inModal = true;
  }
  
  if (oldModalEnd !== -1) {
    const newModal = `{modal3D && (
            <ThreeDTerrainModal
                lat={modal3D.lat}
                lon={modal3D.lon}
                pttId={modal3D.pttId}
                onClose={() => setModal3D(null)}
            />
        )}`;
    content = content.substring(0, oldModalStart) + newModal + content.substring(oldModalEnd);
  }
}

fs.writeFileSync('/Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx', content);
