import fs from 'fs';
import path from 'path';

const distPath = path.join(process.cwd(), 'dist', 'assets');
if (!fs.existsSync(distPath)) {
  console.log("No dist/assets directory");
  process.exit(1);
}

const files = fs.readdirSync(distPath);
const jsFile = files.find(f => f.endsWith('.js'));
if (jsFile) {
  const code = fs.readFileSync(path.join(distPath, jsFile), 'utf-8');
  console.log("readXlsxFile mapping in bundle:", code.includes('readXlsxFile') ? 'FOUND' : 'MISSING');
  console.log("jspdf mapping in bundle:", code.includes('jsPDF') ? 'FOUND' : 'MISSING');
}
