// filepath: packages/shared/src/performance/CodeSplitter.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CodeSplitter } from './CodeSplitter';
import * as fs from 'fs';
import * as path from 'path';

// Mock файловой системы
vi.mock('fs');
vi.mock('path');

const mockFs = vi.mocked(fs);
const mockPath = vi.mocked(path);

describe('CodeSplitter', () => {
  let codeSplitter: CodeSplitter;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock базовых path операций
    mockPath.join.mockImplementation((...paths: string[]) => paths.join('/'));
    mockPath.relative.mockImplementation((from: string, to: string) => 
      to.replace(from + '/', ''));
    
    codeSplitter = new CodeSplitter({
      projectRoot: '/test/project',
      sourceDirectory: 'src',
      chunkSizeThreshold: 100 // 100KB для тестов
    });
  });

  afterEach(() => {
    codeSplitter.clearCache();
  });

  describe('Конфигурация', () => {
    it('должен использовать настройки по умолчанию', () => {
      const defaultSplitter = new CodeSplitter();
      expect(defaultSplitter).toBeDefined();
    });

    it('должен применять пользовательские настройки', () => {
      const customSplitter = new CodeSplitter({
        chunkSizeThreshold: 500,
        routeBasedSplitting: false
      });
      expect(customSplitter).toBeDefined();
    });
  });

  describe('Анализ файлов', () => {
    beforeEach(() => {
      // Mock файловой структуры
      mockFs.readdirSync.mockImplementation((path: any) => {
        if (path === '/test/project') {
          return ['src', 'node_modules', 'package.json'] as any;
        }
        if (path === '/test/project/src') {
          return ['components', 'pages', 'utils'] as any;
        }
        if (path === '/test/project/src/components') {
          return ['Header.tsx', 'Footer.tsx', 'LargeComponent.tsx'] as any;
        }
        if (path === '/test/project/src/pages') {
          return ['Home.tsx', 'About.tsx', 'Admin.tsx'] as any;
        }
        return [] as any;
      });

      mockFs.statSync.mockImplementation((path: any) => {
        const isDirectory = !path.includes('.');
        return {
          isDirectory: () => isDirectory,
          isFile: () => !isDirectory,
          size: path.includes('Large') ? 150000 : 50000 // 150KB vs 50KB
        } as any;
      });
    });

    it('должен найти все релевантные файлы', async () => {
      // Mock чтения файлов
      mockFs.readFileSync.mockImplementation((path: any) => {
        if (path.includes('Home.tsx')) {
          return `
            import { useRouter } from 'react-router-dom';
            export default function HomePage() {
              const router = useRouter();
              return <div>Home Page</div>;
            }
          `;
        }
        if (path.includes('LargeComponent.tsx')) {
          return `
            import lodash from 'lodash';
            import moment from 'moment';
            export default function LargeComponent() {
              return <div>Large Component with heavy imports</div>;
            }
          `;
        }
        return 'export default function Component() { return <div />; }';
      });

      const analysis = await codeSplitter.analyzeProject();
      
      expect(analysis.totalFiles).toBeGreaterThan(0);
      expect(analysis.splitPoints).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
    });

    it('должен определить файлы маршрутов', async () => {
      mockFs.readFileSync.mockReturnValue(`
        import { useRouter } from 'react-router-dom';
        export default function HomePage() {
          const router = useRouter();
          return <div>Home Page</div>;
        }
      `);

      const analysis = await codeSplitter.analyzeProject();
      const routeSplitPoints = analysis.splitPoints.filter(p => p.type === 'route');
      
      expect(routeSplitPoints.length).toBeGreaterThan(0);
      if (routeSplitPoints.length > 0) {
        expect(routeSplitPoints[0]!.reason).toContain('Route-based splitting');
      }
    });

    it('должен определить большие компоненты', async () => {
      mockFs.readFileSync.mockReturnValue(`
        export default function LargeComponent() {
          return <div>Large Component</div>;
        }
      `);

      const analysis = await codeSplitter.analyzeProject();
      const componentSplitPoints = analysis.splitPoints.filter(p => p.type === 'component');
      
      expect(componentSplitPoints.length).toBeGreaterThan(0);
    });

    it('должен определить тяжелые импорты', async () => {
      mockFs.readFileSync.mockReturnValue(`
        import lodash from 'lodash';
        import moment from 'moment';
        export default function Component() {
          return <div>Component with heavy imports</div>;
        }
      `);

      const analysis = await codeSplitter.analyzeProject();
      const vendorSplitPoints = analysis.splitPoints.filter(p => p.type === 'vendor');
      
      expect(vendorSplitPoints.length).toBeGreaterThan(0);
      if (vendorSplitPoints.length > 0) {
        expect(vendorSplitPoints[0]!.reason).toContain('lodash');
      }
    });

    it('должен определить feature модули', async () => {
      mockPath.relative.mockReturnValue('src/features/auth/AuthComponent.tsx');
      mockFs.readFileSync.mockReturnValue(`
        export const login = () => {};
        export const logout = () => {};
        export const register = () => {};
        export default function AuthComponent() {
          return <div>Auth Component</div>;
        }
      `);

      const analysis = await codeSplitter.analyzeProject();
      const featureSplitPoints = analysis.splitPoints.filter(p => p.type === 'feature');
      
      expect(featureSplitPoints.length).toBeGreaterThan(0);
    });

    it('должен найти возможности динамических импортов', async () => {
      mockFs.readFileSync.mockReturnValue(`
        import { Modal } from './Modal';
        export default function App() {
          const [showModal, setShowModal] = useState(false);
          return (
            <div>
              {showModal && <Modal />}
            </div>
          );
        }
      `);

      const analysis = await codeSplitter.analyzeProject();
      const dynamicSplitPoints = analysis.splitPoints.filter(p => p.type === 'dynamic');
      
      expect(dynamicSplitPoints.length).toBeGreaterThan(0);
      if (dynamicSplitPoints.length > 0) {
        expect(dynamicSplitPoints[0]!.reason).toContain('модальные компоненты');
      }
    });
  });

  describe('Генерация рекомендаций', () => {
    it('должен генерировать рекомендации для разных типов разделения', async () => {
      const mockSplitPoints = [
        {
          file: 'src/pages/Home.tsx',
          reason: 'Route-based splitting',
          estimatedSize: 50000,
          priority: 'high' as const,
          type: 'route' as const
        },
        {
          file: 'src/components/LargeComponent.tsx',
          reason: 'Большой компонент',
          estimatedSize: 150000,
          priority: 'medium' as const,
          type: 'component' as const
        }
      ];

      // Mock приватного метода через прототип
      const generateRecommendations = (codeSplitter as any).generateRecommendations.bind(codeSplitter);
      const recommendations = generateRecommendations(mockSplitPoints);
      
      expect(recommendations).toContain('route-based splitting');
      expect(recommendations).toContain('больших компонентов');
    });

    it('должен рассчитывать потенциальную экономию', async () => {
      const mockAnalysis = {
        totalFiles: 10,
        totalSize: 1000000, // 1MB
        splitPoints: [
          {
            file: 'test.tsx',
            reason: 'test',
            estimatedSize: 300000, // 300KB
            priority: 'high' as const,
            type: 'component' as const
          }
        ],
        recommendations: [],
        potentialSavings: {
          initialBundle: 0,
          averageChunk: 0,
          estimatedImprovement: '0%'
        }
      };

      const calculateSavings = (codeSplitter as any).calculatePotentialSavings.bind(codeSplitter);
      const savings = calculateSavings(mockAnalysis);
      
      expect(savings.initialBundle).toBe(976); // ~1000KB
      expect(savings.averageChunk).toBe(293); // ~300KB
      expect(savings.estimatedImprovement).toMatch(/\d+%/);
    });
  });

  describe('Обработка файлов', () => {
    it('должен корректно исключать файлы', () => {
      const shouldExclude = (codeSplitter as any).shouldExclude.bind(codeSplitter);
      
      expect(shouldExclude('node_modules/package')).toBe(true);
      expect(shouldExclude('src/component.test.ts')).toBe(true);
      expect(shouldExclude('src/component.tsx')).toBe(false);
    });

    it('должен определять релевантные файлы', () => {
      const isRelevantFile = (codeSplitter as any).isRelevantFile.bind(codeSplitter);
      
      expect(isRelevantFile('component.tsx')).toBe(true);
      expect(isRelevantFile('component.ts')).toBe(true);
      expect(isRelevantFile('component.js')).toBe(true);
      expect(isRelevantFile('component.jsx')).toBe(true);
      expect(isRelevantFile('component.test.ts')).toBe(false);
      expect(isRelevantFile('component.spec.js')).toBe(false);
      expect(isRelevantFile('styles.css')).toBe(false);
    });

    it('должен кешировать содержимое файлов', () => {
      mockFs.readFileSync.mockReturnValue('test content');
      
      const getFileContent = (codeSplitter as any).getFileContent.bind(codeSplitter);
      
      // Первый вызов
      const content1 = getFileContent('/test/file.ts');
      expect(content1).toBe('test content');
      
      // Второй вызов должен использовать кеш
      const content2 = getFileContent('/test/file.ts');
      expect(content2).toBe('test content');
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('должен очищать кеш', () => {
      mockFs.readFileSync.mockReturnValue('test content');
      
      const getFileContent = (codeSplitter as any).getFileContent.bind(codeSplitter);
      
      getFileContent('/test/file.ts');
      codeSplitter.clearCache();
      getFileContent('/test/file.ts');
      
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('Генерация конфигурации Vite', () => {
    it('должен генерировать корректную конфигурацию Vite', () => {
      const viteConfig = codeSplitter.generateViteConfig();
      
      expect(viteConfig).toContain('manualChunks');
      expect(viteConfig).toContain('vendor');
      expect(viteConfig).toContain('chunkFileNames');
    });
  });

  describe('Обработка ошибок', () => {
    it('должен обрабатывать ошибки чтения файлов', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const getFileContent = (codeSplitter as any).getFileContent.bind(codeSplitter);
      const content = getFileContent('/nonexistent/file.ts');
      
      expect(content).toBe('');
    });

    it('должен обрабатывать недоступные директории', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Не должно выбрасывать ошибку
      expect(async () => {
        await codeSplitter.analyzeProject();
      }).not.toThrow();
    });

    it('должен обрабатывать ошибки stat файлов', () => {
      mockFs.statSync.mockImplementation(() => {
        throw new Error('Stat error');
      });

      const getFileSize = (codeSplitter as any).getFileSize.bind(codeSplitter);
      const size = getFileSize('/test/file.ts');
      
      expect(size).toBe(0);
    });
  });
});
