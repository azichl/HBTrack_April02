const fs = require('fs');

// Target your telemetry service, hook, or map component file where history tracks are processed.
// Update the path below if your sorting/mapping logic resides in a specific hook (e.g., useTelemetry.ts or MapView.tsx)
const targetFile = '/Users/abdelazizchlih/HBTrack_April02/views/LiveTracking.tsx'; // or your telemetry service file

let content = fs.readFileSync(targetFile, 'utf8');

// Target the history path coordinate mapping/sorting block and wrap it with strict chronological sorting
// This replaces unsorted or message-date-indexed coordinate generation with strict locationDate sorting.
const targetPattern = /const\s+trackCoordinates(?::\s*[^=]+)?\s*=\s*([\s\S]*?)\.map\(/;

if (targetPattern.test(content)) {
  const replacement = `const sortedPositions = [...$1].sort((a, b) => {
    const timeA = new Date(a.locationDate || a.fixTime || a.gpsDate || 0).getTime();
    const timeB = new Date(b.locationDate || b.fixTime || b.gpsDate || 0).getTime();
    return timeA - timeB; // Strictly chronological: oldest to newest
  });

  const trackCoordinates = sortedPositions.map(`;

  content = content.replace(targetPattern, replacement);
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log('Successfully patched history path sorting in LiveTracking.tsx!');
} else {
  console.log('Target coordinate mapping pattern not found. Let us check the exact file containing your history path loop.');
}
