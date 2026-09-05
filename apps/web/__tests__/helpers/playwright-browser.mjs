import { chromium } from '@playwright/test';

let browser;
let browserPromise;
let launchChain = Promise.resolve();

export async function getPlaywrightBrowser() {
  if (browser) return browser;
  launchChain = launchChain.then(async () => {
    if (!browser) {
      browserPromise ||= chromium.launch({ headless: true });
      browser = await browserPromise;
    }
  });
  await launchChain;
  return browser;
}

export async function closePlaywrightBrowser() {
  if (!browser) return;
  const instance = browser;
  browser = undefined;
  browserPromise = undefined;
  try {
    await Promise.all(instance.contexts().map((context) => context.close()));
  } catch {
    // Best-effort teardown under parallel load.
  }
  try {
    await instance.close();
  } catch {
    instance.process()?.kill?.('SIGKILL');
  }
}
