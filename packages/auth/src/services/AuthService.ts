// filepath: packages/auth/src/services/AuthService.ts

/**
 * HEYS EAP 3.0 - Real Authentication Service
 * 
 * Purpose: Replace mock authentication with real Supabase Auth integration
 * Features: Email/password auth, social login, session management, profile sync
 */

import { supabase, createServerSupabaseClient, handleSupabaseError } from '../lib/supabase'
import type { 
  User, 
  UserSession, 
  AuthState, 
  LoginCredentials, 
  RegisterCredentials,
  AuthError as IAuthError,
  PasswordResetRequest,
  EmailVerificationRequest
} from '../types/auth.types'
import type { 
  Database,
  UserProfile,
  UserProfileInsert,
  UserProfileUpdate,
  UserSession as DBUserSession,
  UserSessionInsert,
  RealtimePayload
} from '../types/database.types'
import type { 
  User as SupabaseUser, 
  Session as SupabaseSession,
  AuthError,
  AuthResponse
} from '@supabase/supabase-js'
import { logger } from '@heys/logger'

export class AuthService {
  private currentUser: User | null = null

  /**
   * Initialize authentication state
   */
  private async initializeAuth(): Promise<void> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Failed to get initial session:', error)
        return
      }

      if (session?.user) {
        await this.handleAuthStateChange(session)
      }
    } catch (error) {
      console.error('Auth initialization failed:', error)
    }
  }

  /**
   * Setup Supabase auth state listener
   */
  private setupAuthListener(): void {
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', { event, userId: session?.user?.id })

      try {
        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            if (session) {
              await this.handleAuthStateChange(session)
            }
            break

          case 'SIGNED_OUT':
            await this.handleSignOut()
            break

          case 'PASSWORD_RECOVERY':
            console.log('Password recovery initiated')
            break

          case 'USER_UPDATED':
            if (session) {
              await this.handleUserUpdate(session)
            }
            break

          default:
            console.log('Unhandled auth event:', event)
        }
      } catch (error) {
        console.error('Error handling auth state change:', error)
      }
    })
  }

  /**
   * Handle authentication state changes
   */
  private async handleAuthStateChange(session: SupabaseSession): Promise<void> {
    try {
      // Get or create user profile
      const userProfile = await this.getOrCreateUserProfile(session.user)
      
      // Create user session record
      const userSession = await this.createUserSession(session, userProfile)

      // Update current state
      this.currentUser = this.mapSupabaseUserToUser(session.user, userProfile)
      this.currentSession = userSession

      // Setup realtime subscriptions
      await this.setupRealtimeSubscriptions(userProfile.id)

      // Notify listeners
      this.notifyAuthStateChange({
        isAuthenticated: true,
        user: this.currentUser,
        session: userSession,
        loading: false,
        error: null,
      })

      console.log('User authenticated successfully:', { userId: userProfile.id })
    } catch (error) {
      console.error('Failed to handle auth state change:', error)
      this.handleAuthError(error)
    }
  }

  /**
   * Handle sign out
   */
  private async handleSignOut(): Promise<void> {
    try {
      // Clean up realtime subscriptions
      if (this.realtimeChannel) {
        await supabase.removeChannel(this.realtimeChannel)
        this.realtimeChannel = null
      }

      // Update session status if exists
      if (this.currentSession?.id) {
        await this.updateSessionStatus(this.currentSession.id, 'revoked')
      }

      // Clear current state
      this.currentUser = null
      this.currentSession = null

      // Notify listeners
      this.notifyAuthStateChange({
        isAuthenticated: false,
        user: null,
        session: null,
        loading: false,
        error: null,
      })

      console.log('User signed out successfully')
    } catch (error) {
      console.error('Error during sign out:', error)
    }
  }

  /**
   * Handle user profile update
   */
  private async handleUserUpdate(session: SupabaseSession): Promise<void> {
    if (!this.currentUser) return

    try {
      const userProfile = await this.getUserProfile(session.user.id)
      if (userProfile) {
        this.currentUser = this.mapSupabaseUserToUser(session.user, userProfile)
        this.notifyAuthStateChange({
          isAuthenticated: true,
          user: this.currentUser,
          session: this.currentSession,
          loading: false,
          error: null,
        })
      }
    } catch (error) {
      console.error('Failed to handle user update:', error)
    }
  }

  /**
   * Setup realtime subscriptions for user data
   */
  private async setupRealtimeSubscriptions(userId: string): Promise<void> {
    try {
      this.realtimeChannel = supabase
        .channel(`user_${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_profiles',
            filter: `id=eq.${userId}`,
          },
          (payload: RealtimePayload<UserProfile>) => {
            if (payload.new && this.currentUser) {
              this.currentUser = {
                ...this.currentUser,
                profile: payload.new,
              }
              this.notifyAuthStateChange({
                isAuthenticated: true,
                user: this.currentUser,
                session: this.currentSession,
                loading: false,
                error: null,
              })
            }
          }
        )
        .subscribe()

      console.log('Realtime subscriptions setup for user:', userId)
    } catch (error) {
      console.error('Failed to setup realtime subscriptions:', error)
    }
  }

  /**
   * Get or create user profile
   */
  private async getOrCreateUserProfile(user: SupabaseUser): Promise<UserProfile> {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw handleSupabaseError(error)
    }

    if (profile) {
      return profile
    }

    // Create new profile
    const newProfile: UserProfileInsert = {
      id: user.id,
      email: user.email || '',
      display_name: user.user_metadata?.display_name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
      email_verified: user.email_confirmed_at != null,
      status: 'active',
      security_level: 'basic',
    }

    const { data: createdProfile, error: createError } = await supabase
      .from('user_profiles')
      .insert(newProfile)
      .select()
      .single()

    if (createError) {
      throw handleSupabaseError(createError)
    }

    console.log('Created new user profile:', { userId: user.id })
    return createdProfile
  }

  /**
   * Get user profile by ID
   */
  private async getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw handleSupabaseError(error)
    }

    return data
  }

  /**
   * Create user session record
   */
  private async createUserSession(
    session: SupabaseSession, 
    userProfile: UserProfile
  ): Promise<UserSession> {
    const sessionData: UserSessionInsert = {
      user_id: userProfile.id,
      session_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: new Date(session.expires_at! * 1000).toISOString(),
      status: 'active',
      last_activity_at: new Date().toISOString(),
      device_info: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        platform: typeof navigator !== 'undefined' ? navigator.platform : null,
      },
    }

    const { data, error } = await supabase
      .from('user_sessions')
      .insert(sessionData)
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error)
    }

    return {
      id: data.id,
      userId: data.user_id,
      expiresAt: new Date(data.expires_at || Date.now() + 3600000),
      deviceInfo: data.device_info as Record<string, unknown> || {},
      ipAddress: data.ip_address || null,
      lastActivityAt: new Date(data.last_activity_at),
      status: data.status as 'active' | 'expired' | 'revoked',
      createdAt: new Date(data.created_at),
    }
  }

  /**
   * Update session status
   */
  private async updateSessionStatus(
    sessionId: string, 
    status: 'active' | 'expired' | 'revoked'
  ): Promise<void> {
    const { error } = await supabase
      .from('user_sessions')
      .update({ 
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    if (error) {
      console.error('Failed to update session status:', error)
    }
  }

  /**
   * Map Supabase user to application User type
   */
  private mapSupabaseUserToUser(user: SupabaseUser, profile: UserProfile): User {
    return {
      id: user.id,
      email: user.email || '',
      profile,
      roles: [], // Will be loaded separately
      permissions: [], // Will be loaded separately
      lastLoginAt: user.last_sign_in_at ? new Date(user.last_sign_in_at) : null,
      createdAt: new Date(user.created_at),
      isEmailVerified: user.email_confirmed_at != null,
      isPhoneVerified: user.phone_confirmed_at != null,
    }
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(error: unknown): void {
    const authError: IAuthError = {
      code: 'AUTH_ERROR',
      message: error instanceof Error ? error.message : 'Authentication failed',
      type: 'authentication',
    }

    this.notifyAuthStateChange({
      isAuthenticated: false,
      user: null,
      session: null,
      loading: false,
      error: authError,
    })
  }

  /**
   * Notify auth state listeners
   */
  private notifyAuthStateChange(state: AuthState): void {
    this.authStateListeners.forEach(listener => {
      try {
        listener(state)
      } catch (error) {
        console.error('Error in auth state listener:', error)
      }
    })
  }

  // =====================================================================
  // PUBLIC API METHODS
  // =====================================================================

  /**
   * Sign in with email and password
   */
  async signIn(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      })

      if (error) {
        throw handleSupabaseError(error)
      }

      return { data, error: null }
    } catch (error) {
      console.error('Sign in failed:', error)
      return { 
        data: { user: null, session: null }, 
        error: error as AuthError 
      }
    }
  }

  /**
   * Sign up with email and password
   */
  async signUp(credentials: RegisterCredentials): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            display_name: credentials.displayName,
          },
        },
      })

      if (error) {
        throw handleSupabaseError(error)
      }

      return { data, error: null }
    } catch (error) {
      console.error('Sign up failed:', error)
      return { 
        data: { user: null, session: null }, 
        error: error as AuthError 
      }
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw handleSupabaseError(error)
      }
    } catch (error) {
      console.error('Sign out failed:', error)
      throw error
    }
  }

  /**
   * Send password reset email
   */
  async resetPassword(request: PasswordResetRequest): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(request.email, {
        redirectTo: request.redirectUrl,
      })

      if (error) {
        throw handleSupabaseError(error)
      }
    } catch (error) {
      console.error('Password reset failed:', error)
      throw error
    }
  }

  /**
   * Update user password
   */
  async updatePassword(newPassword: string): Promise<void> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        throw handleSupabaseError(error)
      }
    } catch (error) {
      console.error('Password update failed:', error)
      throw error
    }
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(request: EmailVerificationRequest): Promise<void> {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: request.email,
      })

      if (error) {
        throw handleSupabaseError(error)
      }
    } catch (error) {
      console.error('Email verification resend failed:', error)
      throw error
    }
  }

  /**
   * Get current authentication state
   */
  getAuthState(): AuthState {
    return {
      isAuthenticated: this.currentUser !== null,
      user: this.currentUser,
      session: this.currentSession,
      loading: false,
      error: null,
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentUser
  }

  /**
   * Get current session
   */
  getCurrentSession(): UserSession | null {
    return this.currentSession
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (state: AuthState) => void): () => void {
    this.authStateListeners.push(callback)
    
    // Immediately call with current state
    callback(this.getAuthState())

    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback)
      if (index > -1) {
        this.authStateListeners.splice(index, 1)
      }
    }
  }

  /**
   * Refresh current session
   */
  async refreshSession(): Promise<void> {
    try {
      const { error } = await supabase.auth.refreshSession()
      if (error) {
        throw handleSupabaseError(error)
      }
    } catch (error) {
      console.error('Session refresh failed:', error)
      throw error
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<UserProfileUpdate>): Promise<void> {
    if (!this.currentUser) {
      throw new Error('No authenticated user')
    }

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', this.currentUser.id)

      if (error) {
        throw handleSupabaseError(error)
      }

      console.log('User profile updated successfully')
    } catch (error) {
      console.error('Profile update failed:', error)
      throw error
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel)
    }
    this.authStateListeners = []
    this.currentUser = null
    this.currentSession = null
  }
}

// Export singleton instance
export const authService = new AuthService()
export default authService
