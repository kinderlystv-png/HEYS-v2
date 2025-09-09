// HEYS EAP 3.0 - WebSocket Client Configuration
// Fixes for Vite HMR and WebSocket connection issues

class HEYSWebSocketClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || '/api';
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.onError = options.onError || this.defaultErrorHandler;
    
    this.client = null;
    this.isInitialized = false;
    this.connectionAttempts = 0;
  }

  /**
   * Initialize the client with proper error handling
   */
  async init() {
    try {
      console.log('🔌 Initializing HEYS WebSocket Client...');
      
      // Setup base configuration
      this.setupBaseConfig();
      
      // Initialize WebSocket connection with retry logic
      await this.connectWithRetry();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      this.isInitialized = true;
      console.log('✅ HEYS WebSocket Client initialized successfully');
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Client initialization failed:', error);
      this.onError(error);
      return { success: false, error };
    }
  }

  /**
   * Setup base client configuration
   */
  setupBaseConfig() {
    this.config = {
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': '3.0.0'
      }
    };
  }

  /**
   * Connect with retry logic
   */
  async connectWithRetry() {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        await this.establishConnection();
        console.log(`✅ WebSocket connected on attempt ${attempt}`);
        return;
      } catch (error) {
        console.warn(`⚠️ Connection attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.retryAttempts) {
          throw new Error(`Failed to connect after ${this.retryAttempts} attempts`);
        }
        
        await this.delay(this.retryDelay * attempt);
      }
    }
  }

  /**
   * Establish WebSocket connection
   */
  async establishConnection() {
    return new Promise((resolve, reject) => {
      try {
        // Determine WebSocket URL based on current environment
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname;
        const wsPort = this.getWebSocketPort();
        
        const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}`;
        console.log(`🔗 Attempting WebSocket connection to: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('✅ WebSocket connection established');
          this.connectionAttempts = 0;
          resolve();
        };
        
        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          reject(new Error('WebSocket connection failed'));
        };
        
        this.ws.onclose = (event) => {
          console.log('🔌 WebSocket connection closed:', event.code, event.reason);
          this.handleDisconnection();
        };
        
        // Connection timeout
        setTimeout(() => {
          if (this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            reject(new Error('WebSocket connection timeout'));
          }
        }, this.timeout);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get appropriate WebSocket port
   */
  getWebSocketPort() {
    // Check if we're in development mode
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // Try to use the same port as current page, fallback to common dev ports
      const currentPort = window.location.port;
      if (currentPort) return currentPort;
      
      // Common Vite dev server ports
      return window.location.port || '3002';
    }
    
    // Production - use current port or default
    return window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    if (!this.ws) return;
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('❌ Failed to parse WebSocket message:', error);
      }
    };
  }

  /**
   * Handle incoming messages
   */
  handleMessage(data) {
    console.log('📨 WebSocket message received:', data);
    
    // Handle different message types
    switch (data.type) {
      case 'ping':
        this.send({ type: 'pong' });
        break;
      case 'error':
        console.error('❌ Server error:', data.error);
        break;
      case 'notification':
        this.handleNotification(data);
        break;
      default:
        console.log('📨 Unknown message type:', data.type);
    }
  }

  /**
   * Handle notifications
   */
  handleNotification(data) {
    console.log('🔔 Notification received:', data);
    // Emit custom event for other parts of the application
    window.dispatchEvent(new CustomEvent('heys-notification', { detail: data }));
  }

  /**
   * Handle disconnection with auto-reconnect
   */
  handleDisconnection() {
    if (this.isInitialized) {
      console.log('🔄 Attempting to reconnect...');
      setTimeout(() => {
        this.connectWithRetry().catch(error => {
          console.error('❌ Reconnection failed:', error);
        });
      }, this.retryDelay);
    }
  }

  /**
   * Send message via WebSocket
   */
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    } else {
      console.warn('⚠️ WebSocket not connected, message not sent:', data);
      return false;
    }
  }

  /**
   * Close WebSocket connection
   */
  close() {
    if (this.ws) {
      this.isInitialized = false;
      this.ws.close();
      this.ws = null;
      console.log('🔌 WebSocket connection closed');
    }
  }

  /**
   * Default error handler
   */
  defaultErrorHandler(error) {
    console.error('❌ HEYS Client Error:', error);
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if client is ready
   */
  isReady() {
    return this.isInitialized && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status
   */
  getStatus() {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }
}

// Global client instance
let clientInstance = null;

/**
 * Initialize the global client
 */
export function initClient(options = {}) {
  if (clientInstance) {
    console.log('ℹ️ Client already initialized');
    return clientInstance;
  }
  
  clientInstance = new HEYSWebSocketClient(options);
  
  // Auto-initialize
  clientInstance.init().catch(error => {
    console.error('❌ Auto-initialization failed:', error);
  });
  
  // Expose globally for debugging
  if (typeof window !== 'undefined') {
    window.HEYS = window.HEYS || {};
    window.HEYS.client = clientInstance;
  }
  
  return clientInstance;
}

/**
 * Get the global client instance
 */
export function getClient() {
  if (!clientInstance) {
    console.warn('⚠️ Client not initialized, creating default instance');
    return initClient();
  }
  return clientInstance;
}

/**
 * Reset the global client
 */
export function resetClient() {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
  }
}

// Auto-initialize if in browser environment
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initClient({
        onError: (error) => console.error('[HEYS Client Error]', error)
      });
    });
  } else {
    initClient({
      onError: (error) => console.error('[HEYS Client Error]', error)
    });
  }
}

export default HEYSWebSocketClient;
