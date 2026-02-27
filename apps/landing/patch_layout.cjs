const fs = require('fs');
let content = fs.readFileSync('src/app/layout.tsx', 'utf8');

const oldImports = `import { ABTestSwitcher } from '@/components/ABTestSwitcher'
import type { Metadata } from 'next'
import { Open_Sans } from 'next/font/google'
import Script from 'next/script'
import '../styles/globals.css'`;

const newImports = `import type { Metadata } from 'next'
import { Open_Sans } from 'next/font/google'
import Script from 'next/script'

import { ABTestSwitcher } from '@/components/ABTestSwitcher'

import '../styles/globals.css'`;

content = content.replace(oldImports, newImports);
fs.writeFileSync('src/app/layout.tsx', content, 'utf8');
console.log('patched');
