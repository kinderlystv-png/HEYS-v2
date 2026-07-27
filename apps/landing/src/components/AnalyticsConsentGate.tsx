'use client';

import Script from 'next/script';
import React from 'react';
import { useEffect, useState } from 'react';

export const ANALYTICS_CONSENT_KEY = 'heys_analytics_consent_v1.1';
export const ANALYTICS_CONSENT_EVENT = 'heys:analytics-consent';
export type AnalyticsConsentValue = 'granted' | 'denied';

function readConsent(): AnalyticsConsentValue | null {
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export default function AnalyticsConsentGate({ ymId }: { ymId: string | null }) {
  const [consent, setConsent] = useState<AnalyticsConsentValue | null>(null);

  useEffect(() => {
    setConsent(readConsent());
    const handleConsent = (event: Event) => {
      const value = (event as CustomEvent<AnalyticsConsentValue>).detail;
      if (value === 'granted' || value === 'denied') setConsent(value);
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, handleConsent);
  }, []);

  if (!ymId || consent !== 'granted') return null;

  return (
    <Script id="yandex-metrika" strategy="afterInteractive">
      {`
        (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
        ym(${Number(ymId)}, "init", {
          clickmap:true,
          trackLinks:true,
          accurateTrackBounce:true,
          webvisor:false
        });
      `}
    </Script>
  );
}
