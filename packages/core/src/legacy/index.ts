/**
 * HEYS Legacy Exports for Core Package
 * Provides compatibility layer for v1.2 components
 */

// Note: Legacy core will be exported separately
// export { default as HeysCore } from './heys_core_v12';

// Temporary compatibility classes for security integration
export class HeysUser {
  async createUser(userData: any): Promise<any> {
    // Legacy user creation logic
    return { id: this.generateId(), ...userData };
  }

  async updateUser(userId: string, updateData: any): Promise<any> {
    // Legacy user update logic
    return { id: userId, ...updateData };
  }

  async searchUsers(_query: string): Promise<any[]> {
    // Legacy user search logic
    return [];
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

export class HeysDay {
  async createDay(dayData: any): Promise<any> {
    // Legacy day creation logic
    return { id: this.generateId(), ...dayData };
  }

  async updateDay(dayId: string, updateData: any): Promise<any> {
    // Legacy day update logic
    return { id: dayId, ...updateData };
  }

  async getDayContent(dayId: string): Promise<any> {
    // Legacy day content retrieval
    return { id: dayId, content: 'sample content' };
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

export class HeysSession {
  async createSession(sessionData: any): Promise<any> {
    // Legacy session creation logic
    return {
      id: this.generateId(),
      token: this.generateToken(),
      ...sessionData,
    };
  }

  async validateSessionToken(token: string): Promise<boolean> {
    // Legacy token validation
    return Boolean(token && token.length > 10);
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private generateToken(): string {
    return Math.random().toString(36).substr(2, 32);
  }
}
