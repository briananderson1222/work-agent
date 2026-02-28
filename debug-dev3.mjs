import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', msg => { if(msg.type() !== 'warning') logs.push('[' + msg.type() + '] ' + msg.text()); });
page.on('pageerror', err => logs.push('[PAGE ERROR] ' + err.message));

await page.goto('http://localhost:4200/', { timeout: 60000 });
await page.waitForTimeout(12000);

console.log('=== ALL CONSOLE OUTPUT ===');
logs.forEach(l => console.log(l));
