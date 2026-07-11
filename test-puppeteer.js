import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

const server = spawn('npm', ['run', 'preview', '--', '--port', '4000', '--host'], { stdio: 'inherit' });

setTimeout(async () => {
  console.log('Server started, launching puppeteer...');
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:4000', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    // find and click the AI Predictions tab
    const tabs = Array.from(document.querySelectorAll('button, a'));
    const aiTab = tabs.find(t => t.textContent.includes('AI Predictions') || t.textContent.includes('AI Prediction'));
    if (aiTab) aiTab.click();
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  await browser.close();
  server.kill();
  process.exit(0);
}, 3000);
