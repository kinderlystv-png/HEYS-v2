'use client'

import Hero from '@/components/Hero'
import VariantLandingSections from '@/components/VariantLandingSections'
import VersionSwitcher from '@/components/VersionSwitcher'
import { VariantProvider } from '@/context/VariantContext'

export default function Home() {
  return (
    <VariantProvider>
      <main>
        <Hero />
        <VariantLandingSections />
      </main>
      {/* FAB для переключения версий A/B/C */}
      <VersionSwitcher />
    </VariantProvider>
  )
}
