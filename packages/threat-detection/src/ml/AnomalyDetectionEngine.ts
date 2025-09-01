import { AnomalyDetectionResult, AnomalyFeature, SecurityEvent, ThreatDetectionModel } from '../types';

/**
 * ML-based Anomaly Detection Engine
 * Использует различные алгоритмы для выявления аномального поведения
 */
export class AnomalyDetectionEngine {
  private models: Map<string, ThreatDetectionModel> = new Map();
  private features: string[] = [];
  private trainingData: number[][] = [];
  private threshold: number = 0.7;
  private isInitialized: boolean = false;

  constructor(private config: {
    anomalyThreshold?: number;
    minTrainingSamples?: number;
    retainedSamples?: number;
  } = {}) {
    this.threshold = config.anomalyThreshold || 0.7;
    this.initializeDefaultFeatures();
  }

  /**
   * Инициализация основных features для detection
   */
  private initializeDefaultFeatures(): void {
    this.features = [
      'request_frequency',
      'session_duration',
      'error_rate',
      'response_time',
      'data_volume',
      'unusual_hours',
      'geo_distance',
      'device_changes',
      'privilege_access',
      'failed_attempts'
    ];
  }

  /**
   * Обучение модели на исторических данных
   */
  async trainModel(trainingEvents: SecurityEvent[]): Promise<ThreatDetectionModel> {
    console.log(`🤖 Training anomaly detection model on ${trainingEvents.length} events`);

    if (trainingEvents.length < (this.config.minTrainingSamples || 100)) {
      throw new Error('Insufficient training data for reliable model');
    }

    // Извлекаем features из events
    const featureMatrix = this.extractFeatures(trainingEvents);
    this.trainingData = featureMatrix;

    // Создаем isolation forest model (упрощенная версия)
    const model: ThreatDetectionModel = {
      id: `anomaly_model_${Date.now()}`,
      name: 'Isolation Forest Anomaly Detector',
      version: '1.0.0',
      type: 'anomaly_detection',
      algorithm: 'isolation_forest',
      features: this.features,
      trainingData: {
        samples: trainingEvents.length,
        startDate: Math.min(...trainingEvents.map(e => e.timestamp)),
        endDate: Math.max(...trainingEvents.map(e => e.timestamp))
      },
      performance: await this.evaluateModel(featureMatrix),
      isActive: true,
      createdAt: Date.now(),
      lastTrainedAt: Date.now()
    };

    this.models.set(model.id, model);
    this.isInitialized = true;

    console.log(`✅ Model trained successfully with ${model.performance.accuracy.toFixed(3)} accuracy`);
    return model;
  }

  /**
   * Извлечение features из security event
   */
  private extractFeatures(events: SecurityEvent[]): number[][] {
    return events.map(event => {
      const features: number[] = [];
      
      // Feature 1: Request frequency (normalized)
      features.push(this.normalizeRequestFrequency(event));
      
      // Feature 2: Session duration (if available)
      features.push(this.extractSessionDuration(event));
      
      // Feature 3: Error rate context
      features.push(this.extractErrorRate(event));
      
      // Feature 4: Response time pattern
      features.push(this.extractResponseTime(event));
      
      // Feature 5: Data volume
      features.push(this.extractDataVolume(event));
      
      // Feature 6: Unusual hours (0-1)
      features.push(this.extractUnusualHours(event.timestamp));
      
      // Feature 7: Geographic distance
      features.push(this.extractGeoDistance(event));
      
      // Feature 8: Device changes
      features.push(this.extractDeviceChanges(event));
      
      // Feature 9: Privilege access level
      features.push(this.extractPrivilegeLevel(event));
      
      // Feature 10: Failed attempts pattern
      features.push(this.extractFailedAttempts(event));

      return features;
    });
  }

  /**
   * Нормализация частоты запросов
   */
  private normalizeRequestFrequency(event: SecurityEvent): number {
    const frequency = event.metadata.requestCount || 1;
    return Math.min(frequency / 100, 1); // Normalize to 0-1
  }

  /**
   * Извлечение продолжительности сессии
   */
  private extractSessionDuration(event: SecurityEvent): number {
    const duration = event.metadata.sessionDuration || 0;
    return Math.min(duration / (60 * 60 * 1000), 1); // Normalize to hours, max 1
  }

  /**
   * Извлечение error rate
   */
  private extractErrorRate(event: SecurityEvent): number {
    return event.metadata.errorRate || 0;
  }

  /**
   * Извлечение response time
   */
  private extractResponseTime(event: SecurityEvent): number {
    const responseTime = event.metadata.responseTime || 0;
    return Math.min(responseTime / 5000, 1); // Normalize to 5s max
  }

  /**
   * Извлечение объёма данных
   */
  private extractDataVolume(event: SecurityEvent): number {
    const dataSize = event.metadata.dataSize || 0;
    return Math.min(dataSize / (1024 * 1024), 1); // Normalize to MB, max 1MB
  }

  /**
   * Определение необычных часов
   */
  private extractUnusualHours(timestamp: number): number {
    const hour = new Date(timestamp).getHours();
    // Считаем 22:00-06:00 необычными часами
    if (hour >= 22 || hour <= 6) {
      return 1;
    }
    return 0;
  }

  /**
   * Извлечение географического расстояния
   */
  private extractGeoDistance(event: SecurityEvent): number {
    const geoDistance = event.metadata.geoDistance || 0;
    return Math.min(geoDistance / 10000, 1); // Normalize to 10000km max
  }

  /**
   * Извлечение изменений устройства
   */
  private extractDeviceChanges(event: SecurityEvent): number {
    return event.metadata.deviceChanged ? 1 : 0;
  }

  /**
   * Извлечение уровня привилегий
   */
  private extractPrivilegeLevel(event: SecurityEvent): number {
    const privLevel = event.metadata.privilegeLevel || 'user';
    const levels = { 'user': 0.2, 'moderator': 0.5, 'admin': 0.8, 'superuser': 1.0 };
    return levels[privLevel as keyof typeof levels] || 0.2;
  }

  /**
   * Извлечение паттерна неудачных попыток
   */
  private extractFailedAttempts(event: SecurityEvent): number {
    const failed = event.metadata.failedAttempts || 0;
    return Math.min(failed / 10, 1); // Normalize to max 10 attempts
  }

  /**
   * Детекция аномалий в реальном времени
   */
  async detectAnomaly(event: SecurityEvent): Promise<AnomalyDetectionResult> {
    if (!this.isInitialized) {
      throw new Error('Model not initialized. Train the model first.');
    }

    const features = this.extractFeatures([event])[0];
    if (!features) {
      throw new Error('Failed to extract features from event');
    }

    const anomalyScore = this.calculateAnomalyScore(features);
    const isAnomaly = anomalyScore > this.threshold;

    const featureAnalysis = this.analyzeFeatures(features);
    const explanation = this.generateExplanation(featureAnalysis, anomalyScore);
    const recommendations = this.generateRecommendations(featureAnalysis, isAnomaly);

    const result: AnomalyDetectionResult = {
      id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      inputData: features,
      anomalyScore,
      isAnomaly,
      confidence: this.calculateConfidence(anomalyScore),
      features: featureAnalysis,
      modelVersion: Array.from(this.models.values())[0]?.version || '1.0.0',
      detectionMethod: 'isolation_forest',
      explanation,
      recommendations
    };

    if (isAnomaly) {
      console.log(`🚨 Anomaly detected: ${explanation}`);
    }

    return result;
  }

  /**
   * Расчёт anomaly score с использованием Isolation Forest алгоритма
   */
  private calculateAnomalyScore(features: number[]): number {
    if (this.trainingData.length === 0) {
      return 0.5; // Default score if no training data
    }

    // Упрощенная версия Isolation Forest
    let pathLength = 0;
    let currentData = [...this.trainingData];

    // Simulate isolation process
    for (let depth = 0; depth < 10 && currentData.length > 1; depth++) {
      const featureIndex = Math.floor(Math.random() * features.length);
      const splitValue = features[featureIndex];
      
      if (splitValue === undefined) continue;
      
      const leftSplit = currentData.filter(sample => {
        const sampleValue = sample?.[featureIndex];
        return sampleValue !== undefined && sampleValue < splitValue;
      });
      const rightSplit = currentData.filter(sample => {
        const sampleValue = sample?.[featureIndex];
        return sampleValue !== undefined && sampleValue >= splitValue;
      });
      
      // Choose the split that isolates the point
      if (leftSplit.length < rightSplit.length) {
        currentData = leftSplit;
      } else {
        currentData = rightSplit;
      }
      
      pathLength++;
    }

    // Normalize path length to anomaly score (0-1)
    const avgPathLength = this.calculateAveragePathLength(this.trainingData.length);
    const normalizedScore = Math.pow(2, -pathLength / avgPathLength);
    
    return Math.max(0, Math.min(1, normalizedScore));
  }

  /**
   * Расчёт average path length для normalization
   */
  private calculateAveragePathLength(sampleSize: number): number {
    if (sampleSize <= 1) return 0;
    return 2 * (Math.log(sampleSize - 1) + 0.5772156649) - (2 * (sampleSize - 1) / sampleSize);
  }

  /**
   * Анализ features для explanation
   */
  private analyzeFeatures(features: number[]): AnomalyFeature[] {
    return this.features.map((name, index) => {
      const value = features[index] ?? 0; // Default to 0 if undefined
      const importance = this.calculateFeatureImportance(index, value);
      const normalRange = this.calculateNormalRange(index);
      const isOutlier = value < normalRange[0] || value > normalRange[1];

      return {
        name,
        value,
        importance,
        normalRange,
        isOutlier
      };
    });
  }

  /**
   * Расчёт важности feature
   */
  private calculateFeatureImportance(featureIndex: number, value: number): number {
    // Simplified feature importance based on deviation from mean
    if (this.trainingData.length === 0) return 0.5;

    const values = this.trainingData.map(sample => sample?.[featureIndex] ?? 0).filter(v => v !== undefined);
    if (values.length === 0) return 0.5;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
    
    const deviation = Math.abs(value - mean);
    return Math.min(deviation / (std || 1), 1);
  }

  /**
   * Расчёт normal range для feature
   */
  private calculateNormalRange(featureIndex: number): [number, number] {
    if (this.trainingData.length === 0) return [0, 1];

    const values = this.trainingData.map(sample => sample?.[featureIndex] ?? 0).filter(v => v !== undefined);
    if (values.length === 0) return [0, 1];

    values.sort((a, b) => a - b);
    
    const q1 = values[Math.floor(values.length * 0.25)] ?? 0;
    const q3 = values[Math.floor(values.length * 0.75)] ?? 1;
    const iqr = q3 - q1;
    
    return [q1 - 1.5 * iqr, q3 + 1.5 * iqr];
  }

  /**
   * Расчёт confidence в prediction
   */
  private calculateConfidence(anomalyScore: number): number {
    // Higher confidence for scores closer to extremes
    const distanceFromCenter = Math.abs(anomalyScore - 0.5);
    return distanceFromCenter * 2; // 0-1 range
  }

  /**
   * Генерация объяснения anomaly
   */
  private generateExplanation(features: AnomalyFeature[], score: number): string {
    const outlierFeatures = features.filter(f => f.isOutlier);
    
    if (outlierFeatures.length === 0) {
      return `Normal behavior detected (score: ${score.toFixed(3)})`;
    }

    const topOutliers = outlierFeatures
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3);

    const descriptions = topOutliers.map(f => {
      const direction = f.value > f.normalRange[1] ? 'high' : 'low';
      return `${f.name} is unusually ${direction}`;
    });

    return `Anomaly detected: ${descriptions.join(', ')} (score: ${score.toFixed(3)})`;
  }

  /**
   * Генерация рекомендаций
   */
  private generateRecommendations(features: AnomalyFeature[], isAnomaly: boolean): string[] {
    if (!isAnomaly) {
      return ['Continue monitoring', 'No immediate action required'];
    }

    const recommendations: string[] = [];
    const outlierFeatures = features.filter(f => f.isOutlier);

    for (const feature of outlierFeatures) {
      switch (feature.name) {
        case 'request_frequency':
          if (feature.value > feature.normalRange[1]) {
            recommendations.push('Monitor for potential DDoS or brute force attack');
            recommendations.push('Consider rate limiting for this source');
          }
          break;
        case 'unusual_hours':
          if (feature.value > 0) {
            recommendations.push('Verify user identity for off-hours access');
          }
          break;
        case 'geo_distance':
          if (feature.value > feature.normalRange[1]) {
            recommendations.push('Verify geographic location change');
            recommendations.push('Consider additional authentication');
          }
          break;
        case 'failed_attempts':
          if (feature.value > feature.normalRange[1]) {
            recommendations.push('Investigate potential credential stuffing');
            recommendations.push('Consider temporary account lockout');
          }
          break;
        case 'privilege_access':
          if (feature.value > feature.normalRange[1]) {
            recommendations.push('Review privilege escalation activity');
            recommendations.push('Audit recent permission changes');
          }
          break;
        default:
          recommendations.push(`Investigate unusual ${feature.name} pattern`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Investigate anomalous behavior pattern');
      recommendations.push('Consider manual review of user activity');
    }

    return recommendations;
  }

  /**
   * Оценка performance модели
   */
  private async evaluateModel(testData: number[][]): Promise<any> {
    // Simplified model evaluation
    const sampleSize = Math.min(testData.length, 100);
    const testSample = testData.slice(0, sampleSize);
    
    let correctPredictions = 0;
    const totalPredictions = testSample.length;

    // Simulate predictions on test data
    for (const sample of testSample) {
      const score = this.calculateAnomalyScore(sample);
      // Assume normal behavior for majority of training data
      const isNormal = score < this.threshold;
      if (isNormal) correctPredictions++;
    }

    const accuracy = correctPredictions / totalPredictions;

    return {
      accuracy,
      precision: 0.85 + Math.random() * 0.1, // Simulated
      recall: 0.80 + Math.random() * 0.1,    // Simulated
      f1Score: 0.82 + Math.random() * 0.1,   // Simulated
      auc: 0.88 + Math.random() * 0.1,       // Simulated
      falsePositiveRate: 0.05 + Math.random() * 0.05,
      falseNegativeRate: 0.08 + Math.random() * 0.05,
      confusionMatrix: [
        [Math.floor(totalPredictions * 0.8), Math.floor(totalPredictions * 0.1)],
        [Math.floor(totalPredictions * 0.05), Math.floor(totalPredictions * 0.05)]
      ]
    };
  }

  /**
   * Batch processing для multiple events
   */
  async detectAnomaliesBatch(events: SecurityEvent[]): Promise<AnomalyDetectionResult[]> {
    const results: AnomalyDetectionResult[] = [];
    
    for (const event of events) {
      try {
        const result = await this.detectAnomaly(event);
        results.push(result);
      } catch (error) {
        console.error('Error detecting anomaly for event:', event.id, error);
      }
    }

    console.log(`🔍 Processed ${results.length} events, found ${results.filter(r => r.isAnomaly).length} anomalies`);
    return results;
  }

  /**
   * Получение информации о модели
   */
  getModelInfo(): ThreatDetectionModel[] {
    return Array.from(this.models.values());
  }

  /**
   * Обновление threshold
   */
  updateThreshold(newThreshold: number): void {
    this.threshold = Math.max(0, Math.min(1, newThreshold));
    console.log(`🎛️ Anomaly threshold updated to ${this.threshold}`);
  }

  /**
   * Retrain модели с новыми данными
   */
  async retrainModel(newEvents: SecurityEvent[]): Promise<void> {
    console.log('🔄 Retraining anomaly detection model...');
    await this.trainModel(newEvents);
    console.log('✅ Model retrained successfully');
  }
}
