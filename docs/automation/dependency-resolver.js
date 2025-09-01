// 🔗 СИСТЕМА РАЗРЕШЕНИЯ ЗАВИСИМОСТЕЙ ДОКУМЕНТАЦИИ
// Автоматический анализ и управление связями между файлами

class DependencyResolver {
  constructor() {
    this.dependencyGraph = new Map();
    this.reverseDependencies = new Map();
    this.circularDependencies = [];
    this.dependencyFile = './docs/dependencies.yaml';
    this.loadDependencies();
  }

  // 📥 Загрузка зависимостей из YAML файла
  async loadDependencies() {
    try {
      const fs = require('fs').promises;
      const yaml = require('js-yaml');

      const yamlContent = await fs.readFile(this.dependencyFile, 'utf8');
      const data = yaml.load(yamlContent);

      this.buildDependencyGraph(data);
      console.log('✅ Зависимости загружены из YAML');
    } catch (error) {
      console.warn('⚠️ Не удалось загрузить зависимости:', error.message);
      this.initializeEmptyGraph();
    }
  }

  // 🏗️ Построение графа зависимостей
  buildDependencyGraph(data) {
    this.dependencyGraph.clear();
    this.reverseDependencies.clear();

    // Обработка основных документов
    if (data.core_documents) {
      for (let doc of data.core_documents) {
        this.addNode(doc.name, {
          type: doc.type,
          criticality: doc.criticality,
          dependencies: doc.dependencies || [],
          dependents: doc.dependents || [],
        });
      }
    }

    // Обработка навигационных карт
    if (data.navigation_maps) {
      for (let map of data.navigation_maps) {
        this.addNode(map.name, {
          type: 'navigation_map',
          dependencies: map.dependencies || [],
          dependents: map.dependents || [],
          status: map.status,
        });
      }
    }

    // Обработка roadmaps
    if (data.roadmaps) {
      for (let roadmap of data.roadmaps) {
        this.addNode(roadmap.name, {
          type: roadmap.type,
          dependencies: roadmap.dependencies || [],
          dependents: roadmap.dependents || [],
          priority: roadmap.priority,
        });
      }
    }

    // Сохранение информации о циклических зависимостях
    this.circularDependencies = data.circular_dependencies || [];
  }

  // ➕ Добавление узла в граф
  addNode(nodeName, nodeData) {
    this.dependencyGraph.set(nodeName, nodeData);

    // Построение обратных зависимостей
    for (let dependency of nodeData.dependencies) {
      if (!this.reverseDependencies.has(dependency)) {
        this.reverseDependencies.set(dependency, []);
      }
      this.reverseDependencies.get(dependency).push(nodeName);
    }
  }

  // 🔍 Поиск зависимостей файла
  getDependencies(fileName, maxDepth = 3) {
    const visited = new Set();
    const dependencies = [];

    const traverse = (currentFile, depth) => {
      if (depth > maxDepth || visited.has(currentFile)) {
        return;
      }

      visited.add(currentFile);
      const nodeData = this.dependencyGraph.get(currentFile);

      if (nodeData && nodeData.dependencies) {
        for (let dep of nodeData.dependencies) {
          dependencies.push({
            file: dep,
            depth: depth,
            type: 'dependency',
          });
          traverse(dep, depth + 1);
        }
      }
    };

    traverse(fileName, 0);
    return dependencies;
  }

  // 🔄 Поиск зависимых файлов (кто зависит от данного файла)
  getDependents(fileName, maxDepth = 3) {
    const visited = new Set();
    const dependents = [];

    const traverse = (currentFile, depth) => {
      if (depth > maxDepth || visited.has(currentFile)) {
        return;
      }

      visited.add(currentFile);
      const fileDependents = this.reverseDependencies.get(currentFile) || [];

      for (let dependent of fileDependents) {
        dependents.push({
          file: dependent,
          depth: depth,
          type: 'dependent',
        });
        traverse(dependent, depth + 1);
      }
    };

    traverse(fileName, 0);
    return dependents;
  }

  // 🌀 Обнаружение циклических зависимостей
  detectCircularDependencies() {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    const dfs = (node, path) => {
      if (recursionStack.has(node)) {
        // Найден цикл
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart).concat([node]);
        cycles.push({
          cycle: cycle,
          severity: this.evaluateCycleSeverity(cycle),
          description: `Циклическая зависимость: ${cycle.join(' → ')}`,
        });
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const nodeData = this.dependencyGraph.get(node);
      if (nodeData && nodeData.dependencies) {
        for (let dependency of nodeData.dependencies) {
          dfs(dependency, [...path]);
        }
      }

      recursionStack.delete(node);
      path.pop();
    };

    // Проверка всех узлов
    for (let [nodeName] of this.dependencyGraph) {
      if (!visited.has(nodeName)) {
        dfs(nodeName, []);
      }
    }

    return cycles;
  }

  // ⚠️ Оценка серьезности циклической зависимости
  evaluateCycleSeverity(cycle) {
    // Проверка критичности файлов в цикле
    let hasCritical = false;
    let hasCore = false;

    for (let file of cycle) {
      const nodeData = this.dependencyGraph.get(file);
      if (nodeData) {
        if (nodeData.criticality === 'critical') {
          hasCritical = true;
        }
        if (nodeData.type === 'core' || nodeData.type === 'architecture') {
          hasCore = true;
        }
      }
    }

    if (hasCritical && hasCore) {
      return 'high';
    } else if (hasCore || cycle.length > 4) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  // 📊 Анализ влияния изменений
  analyzeChangeImpact(changedFiles) {
    const impactAnalysis = {
      directly_affected: [],
      indirectly_affected: [],
      critical_path: [],
      recommendations: [],
    };

    for (let file of changedFiles) {
      // Прямо затронутые файлы
      const dependents = this.getDependents(file, 2);
      impactAnalysis.directly_affected.push({
        source: file,
        affected: dependents,
      });

      // Проверка критического пути
      const nodeData = this.dependencyGraph.get(file);
      if (nodeData && (nodeData.criticality === 'critical' || nodeData.type === 'architecture')) {
        impactAnalysis.critical_path.push(file);
        impactAnalysis.recommendations.push(
          `⚠️ Файл ${file} является критическим. Рекомендуется дополнительное тестирование.`,
        );
      }

      // Поиск косвенно затронутых файлов
      for (let dependent of dependents) {
        const secondLevelDependents = this.getDependents(dependent.file, 1);
        impactAnalysis.indirectly_affected.push(...secondLevelDependents);
      }
    }

    return impactAnalysis;
  }

  // 📋 Получение списка файлов для обновления
  getFilesToUpdate(changedFiles) {
    const updateList = new Set();
    const priorities = { critical: 1, high: 2, medium: 3, low: 4 };

    for (let file of changedFiles) {
      // Добавление зависимых файлов
      const dependents = this.getDependents(file, 2);
      for (let dependent of dependents) {
        updateList.add(dependent.file);
      }

      // Добавление навигационных карт если изменился JS/TS файл
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        const navMaps = this.findNavigationMaps(file);
        navMaps.forEach((map) => updateList.add(map));
      }
    }

    // Сортировка по приоритету
    return Array.from(updateList).sort((a, b) => {
      const aData = this.dependencyGraph.get(a);
      const bData = this.dependencyGraph.get(b);
      const aPriority = priorities[aData?.criticality] || 4;
      const bPriority = priorities[bData?.criticality] || 4;
      return aPriority - bPriority;
    });
  }

  // 🗺️ Поиск навигационных карт для файла
  findNavigationMaps(fileName) {
    const navMaps = [];
    for (let [mapName, mapData] of this.dependencyGraph) {
      if (
        mapData.type === 'navigation_map' &&
        mapData.dependencies &&
        mapData.dependencies.includes(fileName)
      ) {
        navMaps.push(mapName);
      }
    }
    return navMaps;
  }

  // 💾 Сохранение обновленных зависимостей
  async saveDependencies() {
    try {
      const fs = require('fs').promises;
      const yaml = require('js-yaml');

      const data = {
        version: '1.0.0',
        last_updated: new Date().toISOString(),
        system_status: 'active',

        core_documents: [],
        navigation_maps: [],
        roadmaps: [],
        circular_dependencies: this.circularDependencies,

        metrics: {
          total_documents: this.dependencyGraph.size,
          circular_dependencies_count: this.circularDependencies.length,
          last_full_validation: new Date().toISOString(),
        },
      };

      // Конвертация обратно в структуру YAML
      for (let [name, nodeData] of this.dependencyGraph) {
        const entry = {
          name: name,
          type: nodeData.type,
          dependencies: nodeData.dependencies,
          dependents: nodeData.dependents,
        };

        if (nodeData.criticality) entry.criticality = nodeData.criticality;
        if (nodeData.status) entry.status = nodeData.status;
        if (nodeData.priority) entry.priority = nodeData.priority;

        if (nodeData.type === 'navigation_map') {
          data.navigation_maps.push(entry);
        } else if (nodeData.type === 'implementation_plan') {
          data.roadmaps.push(entry);
        } else {
          data.core_documents.push(entry);
        }
      }

      const yamlContent = yaml.dump(data, {
        indent: 2,
        lineWidth: 100,
        noRefs: true,
      });

      await fs.writeFile(this.dependencyFile, yamlContent);
      console.log('✅ Зависимости сохранены в YAML');
    } catch (error) {
      console.error('❌ Ошибка сохранения зависимостей:', error);
    }
  }

  // 🔧 Инициализация пустого графа
  initializeEmptyGraph() {
    this.dependencyGraph.clear();
    this.reverseDependencies.clear();
    this.circularDependencies = [];
    console.log('⚠️ Инициализирован пустой граф зависимостей');
  }
}

// 🌐 Экспорт
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DependencyResolver;
}

console.log('🔗 Система разрешения зависимостей загружена');
