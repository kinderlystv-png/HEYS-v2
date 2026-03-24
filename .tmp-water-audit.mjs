
import { chromium, devices } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
});
const context = await browser.newContext({ ...devices['iPhone 12'] });
const page = await context.newPage();

const logs = [];
page.on('console', m => logs.push({ t: m.type(), x: m.text().slice(0, 200) }));
page.on('pageerror', e => logs.push({ t: 'pageerror', x: String(e).slice(0, 300) }));

try {
  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('URL:', page.url());

  // Find all nav elements
  const navItems = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[class*="tab"], [class*="nav"], nav button, .bottom-nav button, .tab-bar button')];
    return els.map(el => ({ 
      tag: el.tagName, 
      cls: el.className.slice(0, 100), 
      text: el.innerText.slice(0, 30),
      id: el.id
    }));
  });
  console.log('Nav items:', JSON.stringify(navItems, null, 2));

  // Find FAB water button directly
  const fabInfo = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    return buttons
      .filter(b => b.textContent.includes('🥛') || b.textContent.toLowerCase().includes('вод') || b.className.includes('water') || b.className.includes('fab'))
      .map(b => ({
        cls: b.className,
        text: b.innerText.slice(0, 50),
        html: b.outerHTML.slice(0, 300)
      }));
  });
  console.log('Water/FAB buttons:', JSON.stringify(fabInfo, null, 2));

  // Find all water-related elements
  const waterEls = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[class*="water"], [class*="Water"]')];
    return els.map(el => ({
      tag: el.tagName,
      cls: el.className.slice(0, 100),
      text: el.innerText.slice(0, 80),
      html: el.outerHTML.slice(0, 400)
    }));
  });
  console.log('Water elements:', JSON.stringify(waterEls.slice(0, 10), null, 2));

} catch(e) {
  console.error('Error:', e.message);
} finally {
  console.log('Console logs:', JSON.stringify(logs.slice(-20), null, 2));
  await browser.close();
}
