// filepath: packages/shared/src/performance/__tests__/TreeShaker.test.ts

/**
 * Тесты для TreeShaker - анализа tree shaking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TreeShaker } from '../TreeShaker';
import type { TreeShakingConfig } from '../TreeShaker';
import * as fs from 'fs';
import * as path from 'path';

// Мокаем fs модуль
vi.mock('fs');
vi.mock('path');

const mockedFs = vi.mocked(fs);
const mockedPath = vi.mocked(path);

describe('TreeShaker', () => {
  let treeShaker: TreeShaker;
  const mockConfig: Partial<TreeShakingConfig> = {
    include: ['src/**/*.ts'],
    exclude: ['**/*.test.ts'],
    bundler: 'vite',
    aggressive: false,
    preserveTypes: true,
  };

  beforeEach(() => {
    treeShaker = new TreeShaker(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Конструктор и конфигурация', () => {
    it('должен создаваться с конфигурацией по умолчанию', () => {
      const defaultTreeShaker = new TreeShaker();
      expect(defaultTreeShaker).toBeInstanceOf(TreeShaker);
    });

    it('должен принимать пользовательскую конфигурацию', () => {
      const customConfig: Partial<TreeShakingConfig> = {
        bundler: 'webpack',
        aggressive: true,
      };
      
      const customTreeShaker = new TreeShaker(customConfig);
      expect(customTreeShaker).toBeInstanceOf(TreeShaker);
    });

    it('должен объединять пользовательскую конфигурацию с значениями по умолчанию', () => {
      const treeShaker = new TreeShaker({ bundler: 'webpack' });
      expect(treeShaker).toBeInstanceOf(TreeShaker);
    });
  });

  describe('Поиск файлов', () => {
    it('должен находить исходные файлы', async () => {
      // Мокаем файловую систему
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'file2.tsx', isDirectory: () => false, isFile: () => true } as any,
        { name: 'file3.js', isDirectory: () => false, isFile: () => true } as any,
        { name: 'file4.test.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedPath.join.mockImplementation((...args: string[]) => args.join('/'));

      await treeShaker.analyzeProject('/test/project');
      
      expect(mockedFs.existsSync).toHaveBeenCalled();
      expect(mockedFs.readdirSync).toHaveBeenCalled();
    });

    it('должен исключать тестовые файлы', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'component.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'component.test.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedPath.join.mockImplementation((...args: string[]) => args.join('/'));
      
      // Мокаем чтение файлов
      mockedFs.readFileSync.mockReturnValue('export const test = "value";');

      await treeShaker.analyzeProject('/test/project');
      
      // Проверяем, что тестовые файлы исключены
      expect(mockedFs.readFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining('test.ts'),
        'utf8'
      );
    });
  });

  describe('Анализ экспортов', () => {
    it('должен находить export const', () => {
      const testCode = `
export const TEST_CONSTANT = 'value';
export const anotherConst = 42;
const localVar = 'local';
`;
      
      mockedFs.readFileSync.mockReturnValue(testCode);
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'test.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedPath.join.mockImplementation((...args) => args.join('/'));
      mockedPath.basename.mockImplementation((p) => p.split('/').pop() || '');
      mockedPath.extname.mockReturnValue('.ts');

      return treeShaker.analyzeProject('/test').then(result => {
        expect(result.unusedExports).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              exportName: 'TEST_CONSTANT',
              type: 'constant'
            }),
            expect.objectContaining({
              exportName: 'anotherConst',
              type: 'variable'
            })
          ])
        );
      });
    });

    it('должен находить export function', () => {
      const testCode = `
export function myFunction() {
  return 'test';
}
export const arrowFunc = () => 'arrow';
`;
      
      mockedFs.readFileSync.mockReturnValue(testCode);
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'test.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedPath.join.mockImplementation((...args) => args.join('/'));
      mockedPath.basename.mockImplementation((p) => p.split('/').pop() || '');
      mockedPath.extname.mockReturnValue('.ts');

      return treeShaker.analyzeProject('/test').then(result => {
        expect(result.unusedExports).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              exportName: 'myFunction',
              type: 'function'
            }),
            expect.objectContaining({
              exportName: 'arrowFunc',
              type: 'function'
            })
          ])
        );
      });
    });

    it('должен находить export class и interface', () => {
      const testCode = `
export class MyClass {
  constructor() {}
}
export interface MyInterface {
  prop: string;
}
export type MyType = string;
`;
      
      mockedFs.readFileSync.mockReturnValue(testCode);
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'test.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedPath.join.mockImplementation((...args) => args.join('/'));
      mockedPath.basename.mockImplementation((p) => p.split('/').pop() || '');
      mockedPath.extname.mockReturnValue('.ts');

      return treeShaker.analyzeProject('/test').then(result => {
        expect(result.unusedExports).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              exportName: 'MyClass',
              type: 'class'
            }),
            expect.objectContaining({
              exportName: 'MyInterface',
              type: 'interface'
            }),
            expect.objectContaining({
              exportName: 'MyType',
              type: 'type'
            })
          ])
        );
      });
    });

    it('должен находить named exports', () => {
      const testCode = `
const func1 = () => 'test1';
const func2 = () => 'test2';
const CONSTANT = 'value';

export { func1, func2, CONSTANT };
`;
      
      mockedFs.readFileSync.mockReturnValue(testCode);
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'test.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedPath.join.mockImplementation((...args) => args.join('/'));
      mockedPath.basename.mockImplementation((p) => p.split('/').pop() || '');
      mockedPath.extname.mockReturnValue('.ts');

      return treeShaker.analyzeProject('/test').then(result => {
        expect(result.unusedExports).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              exportName: 'func1',
              type: 'variable'
            }),
            expect.objectContaining({
              exportName: 'func2', 
              type: 'variable'
            }),
            expect.objectContaining({
              exportName: 'CONSTANT',
              type: 'constant'
            })
          ])
        );
      });
    });
  });

  describe('Определение использования экспортов', () => {
    it('должен определять используемые экспорты', async () => {
      const file1Code = 'export const myExport = "value";';
      const file2Code = 'import { myExport } from "./file1";';
      
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'file2.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      
      // Мокаем чтение файлов
      mockedFs.readFileSync.mockImplementation((path: any) => {
        if (path.includes('file1.ts')) return file1Code;
        if (path.includes('file2.ts')) return file2Code;
        return '';
      });
      
      mockedPath.join.mockImplementation((...args) => args.join('/'));
      mockedPath.basename.mockImplementation((p) => p.split('/').pop() || '');
      mockedPath.extname.mockReturnValue('.ts');

      const result = await treeShaker.analyzeProject('/test');
      
      // myExport используется в file2, поэтому не должен быть в списке неиспользуемых
      expect(result.unusedExports).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            exportName: 'myExport'
          })
        ])
      );
    });

    it('должен определять неиспользуемые экспорты', async () => {
      const file1Code = 'export const unusedExport = "value";';
      const file2Code = 'const localVar = "no imports here";';
      
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true } as any,
        { name: 'file2.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      
      mockedFs.readFileSync.mockImplementation((path: any) => {
        if (path.includes('file1.ts')) return file1Code;
        if (path.includes('file2.ts')) return file2Code;
        return '';
      });
      
      mockedPath.join.mockImplementation((...args) => args.join('/'));
      mockedPath.basename.mockImplementation((p) => p.split('/').pop() || '');
      mockedPath.extname.mockReturnValue('.ts');

      const result = await treeShaker.analyzeProject('/test');
      
      expect(result.unusedExports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            exportName: 'unusedExport'
          })
        ])
      );
    });
  });

  describe('Генерация рекомендаций', () => {
    it('должен генерировать рекомендации для неиспользуемых экспортов', async () => {
      const testCode = 'export const unusedExport = "value";';
      
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'test.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedFs.readFileSync.mockReturnValue(testCode);
      mockedPath.join.mockImplementation((...args) => args.join('/'));
      mockedPath.basename.mockImplementation((p) => p.split('/').pop() || '');
      mockedPath.extname.mockReturnValue('.ts');

      const result = await treeShaker.analyzeProject('/test');
      
      expect(result.recommendations).toHaveLength(3); // Базовое количество рекомендаций
      expect(result.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('удалить'),
          expect.stringContaining('экономия')
        ])
      );
    });

    it('должен показывать сообщение об отсутствии проблем', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([]);
      mockedPath.join.mockImplementation((...args) => args.join('/'));

      const result = await treeShaker.analyzeProject('/test');
      
      expect(result.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Отлично! Неиспользуемых экспортов не найдено')
        ])
      );
    });
  });

  describe('Bundler оптимизации', () => {
    it('должен генерировать оптимизации для Vite', () => {
      const viteShaker = new TreeShaker({ bundler: 'vite' });
      const result = viteShaker.analyzeProject('/test');
      
      return result.then(analysis => {
        expect(analysis.bundlerOptimizations).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Vite'),
            expect.stringContaining('rollupOptions')
          ])
        );
      });
    });

    it('должен генерировать оптимизации для Webpack', () => {
      const webpackShaker = new TreeShaker({ bundler: 'webpack' });
      
      return webpackShaker.analyzeProject('/test').then(analysis => {
        expect(analysis.bundlerOptimizations).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Webpack'),
            expect.stringContaining('usedExports')
          ])
        );
      });
    });
  });

  describe('Отчеты и экспорт', () => {
    it('должен генерировать текстовый отчет', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([]);
      mockedPath.join.mockImplementation((...args) => args.join('/'));

      await treeShaker.analyzeProject('/test');
      const report = treeShaker.generateReport();
      
      expect(report).toContain('ОТЧЕТ TREE SHAKING АНАЛИЗА');
      expect(report).toContain('Статистика');
      expect(typeof report).toBe('string');
    });

    it('должен экспортировать в JSON', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([]);
      mockedPath.join.mockImplementation((...args) => args.join('/'));

      await treeShaker.analyzeProject('/test');
      const json = treeShaker.exportToJson();
      
      expect(() => JSON.parse(json)).not.toThrow();
      
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('totalFiles');
      expect(parsed).toHaveProperty('unusedExports');
      expect(parsed).toHaveProperty('recommendations');
    });

    it('должен возвращать анализ', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([]);
      mockedPath.join.mockImplementation((...args) => args.join('/'));

      const analysis = await treeShaker.analyzeProject('/test');
      const retrievedAnalysis = treeShaker.getAnalysis();
      
      expect(retrievedAnalysis).toEqual(analysis);
      expect(retrievedAnalysis).toHaveProperty('totalFiles');
      expect(retrievedAnalysis).toHaveProperty('unusedExports');
    });

    it('должен выбрасывать ошибку при экспорте без анализа', () => {
      expect(() => treeShaker.exportToJson()).toThrow('Анализ не выполнен');
    });
  });

  describe('Обработка ошибок', () => {
    it('должен обрабатывать ошибки чтения файлов', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'broken.ts', isDirectory: () => false, isFile: () => true } as any,
      ]);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });
      mockedPath.join.mockImplementation((...args) => args.join('/'));

      // Не должно выбрасывать ошибку
      const result = await treeShaker.analyzeProject('/test');
      expect(result).toHaveProperty('totalFiles');
    });

    it('должен обрабатывать несуществующие пути', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedPath.join.mockImplementation((...args) => args.join('/'));

      const result = await treeShaker.analyzeProject('/nonexistent');
      
      expect(result.totalFiles).toBe(0);
      expect(result.unusedExports).toHaveLength(0);
    });
  });
});
