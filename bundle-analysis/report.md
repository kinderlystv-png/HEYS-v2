# Bundle Analysis Report

**Date**: 03.09.2025, 17:56:02
**Total Size**: 0.04 MB

## 📦 Largest Chunks
- **assets\index-ba0dbd15.css**: 14.47 KB
- **assets\core-4ed993c7.js**: 1 Bytes
- **assets\features-4ed993c7.js**: 1 Bytes
- **assets\vendor-4ed993c7.js**: 1 Bytes

## 🔗 Heaviest Dependencies  
- **typescript**: 22.54 MB
- **lighthouse**: 18.7 MB
- **happy-dom**: 13.22 MB
- **prettier**: 8.07 MB
- **msw**: 4.3 MB
- **zod**: 3.43 MB
- **jsdom**: 3.03 MB
- **eslint**: 2.91 MB
- **@typescript-eslint/eslint-plugin**: 2.49 MB
- **@types/node**: 2.17 MB

## 💡 Recommendations
- 🔗 Тяжелые зависимости: typescript, lighthouse, happy-dom - рассмотрите альтернативы
- 🌳 Много неиспользуемого кода - настройте tree shaking

## 🎯 Next Steps for Performance Sprint
1. Implement tree shaking for unused code elimination
2. Set up code splitting for large chunks (>500KB)
3. Consider lazy loading for heavy dependencies
4. Optimize images and fonts
5. Set up bundle size monitoring in CI/CD
