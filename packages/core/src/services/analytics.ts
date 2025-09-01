// Analytics service
export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
}

export interface AnalyticsProvider {
  track(event: AnalyticsEvent): Promise<void>;
  identify(userId: string, traits?: Record<string, any>): Promise<void>;
}

export class AnalyticsService {
  private providers: AnalyticsProvider[] = [];
  private eventQueue: AnalyticsEvent[] = [];
  private userId?: string;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  addProvider(provider: AnalyticsProvider): void {
    this.providers.push(provider);
  }

  async track(name: string, properties?: Record<string, any>): Promise<void> {
    const event: AnalyticsEvent = {
      name,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };

    if (properties) {
      event.properties = properties;
    }

    if (this.userId) {
      event.userId = this.userId;
    }

    this.eventQueue.push(event);

    // Send to all providers
    const promises = this.providers.map(provider => 
      provider.track(event).catch(error => 
        console.error('Analytics provider error:', error)
      )
    );

    await Promise.allSettled(promises);
  }

  async identify(userId: string, traits?: Record<string, any>): Promise<void> {
    this.userId = userId;

    const promises = this.providers.map(provider =>
      provider.identify(userId, traits).catch(error =>
        console.error('Analytics identify error:', error)
      )
    );

    await Promise.allSettled(promises);
  }

  getEventQueue(): AnalyticsEvent[] {
    return [...this.eventQueue];
  }

  clearEventQueue(): void {
    this.eventQueue = [];
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
