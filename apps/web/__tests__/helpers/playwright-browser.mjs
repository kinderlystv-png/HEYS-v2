import { chromium } from '@playwright/test';

let browser;
let browserPromise;
let launchChain = Promise.resolve();
let suiteRetainCount = 0;
let closingPromise;

const CLOSE_TIMEOUT_MS = 15_000;

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

/** Call once per describe suite that shares the singleton browser. */
export function retainPlaywrightBrowserForSuite() {
  suiteRetainCount += 1;
}

/** Balanced teardown — closes only when the last retained suite releases. */
export async function releasePlaywrightBrowserForSuite() {
  suiteRetainCount = Math.max(0, suiteRetainCount - 1);
  if (suiteRetainCount > 0) return;
  await closePlaywrightBrowser();
}

export async function closePlaywrightBrowser() {
  if (!browser) return;
  if (closingPromise) {
    await closingPromise;
    return;
  }

  closingPromise = (async () => {
    const instance = browser;
    browser = undefined;
    browserPromise = undefined;
    launchChain = Promise.resolve();

    const forceKill = () => {
      try {
        instance.process()?.kill?.('SIGKILL');
      } catch {
        // Best-effort teardown under parallel load.
      }
    };

    const closeWork = async () => {
      const contexts = [...instance.contexts()];
      await Promise.allSettled(contexts.map((context) => context.close()));
      await instance.close();
    };

    try {
      await Promise.race([
        closeWork(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('playwright close timeout')), CLOSE_TIMEOUT_MS);
        }),
      ]);
    } catch {
      forceKill();
    }
  })();

  try {
    await closingPromise;
  } finally {
    closingPromise = undefined;
  }
}
