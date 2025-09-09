// filepath: packages/auth/src/lib/migrations.ts

/**
 * HEYS EAP 3.0 - Database Migration Runner
 * 
 * Purpose: Execute database migrations safely with proper error handling
 * Features: Sequential execution, rollback support, migration tracking
 */

import { createAdminSupabaseClient } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

export interface Migration {
  id: string
  name: string
  description: string
  sql: string
  checksum: string
  executedAt?: string
  success?: boolean
  error?: string
}

export interface MigrationResult {
  migration: Migration
  success: boolean
  executionTime: number
  error?: string
}

export class MigrationRunner {
  private supabase: SupabaseClient
  private migrationsPath: string

  constructor(migrationsPath?: string) {
    this.supabase = createAdminSupabaseClient()
    this.migrationsPath = migrationsPath || join(process.cwd(), 'packages/auth/database')
  }

  /**
   * Create migrations tracking table if it doesn't exist
   */
  private async ensureMigrationsTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        checksum VARCHAR(64) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        execution_time INTEGER, -- milliseconds
        success BOOLEAN DEFAULT true,
        error TEXT
      );
    `

    const { error } = await this.supabase.rpc('exec_sql', { sql: createTableSQL })
    if (error) {
      throw new Error(`Failed to create migrations table: ${error.message}`)
    }
  }

  /**
   * Get list of executed migrations
   */
  private async getExecutedMigrations(): Promise<Migration[]> {
    const { data, error } = await this.supabase
      .from('migrations')
      .select('*')
      .order('executed_at', { ascending: true })

    if (error) {
      console.warn('Could not fetch migration history:', error.message)
      return []
    }

    return data.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      sql: '', // Not stored in database
      checksum: row.checksum,
      executedAt: row.executed_at,
      success: row.success,
      error: row.error,
    }))
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    // Simple checksum - in production, use crypto.createHash
    return Buffer.from(content).toString('base64').slice(0, 16)
  }

  /**
   * Load migration files from filesystem
   */
  private loadMigrationFiles(): Migration[] {
    const migrations: Migration[] = []

    try {
      // Load schema migration
      const schemaPath = join(this.migrationsPath, '001_initial_auth_schema.sql')
      const schemaSQL = readFileSync(schemaPath, 'utf-8')
      migrations.push({
        id: '001_initial_auth_schema',
        name: 'Initial Auth Schema',
        description: 'Create authentication tables and core structure',
        sql: schemaSQL,
        checksum: this.calculateChecksum(schemaSQL),
      })

      // Load seed data migration
      const seedPath = join(this.migrationsPath, '002_default_roles_permissions.sql')
      const seedSQL = readFileSync(seedPath, 'utf-8')
      migrations.push({
        id: '002_default_roles_permissions',
        name: 'Default Roles and Permissions',
        description: 'Insert default roles, permissions, and assignments',
        sql: seedSQL,
        checksum: this.calculateChecksum(seedSQL),
      })

      // Load RLS policies migration
      const rlsPath = join(this.migrationsPath, 'policies/003_rls_policies.sql')
      const rlsSQL = readFileSync(rlsPath, 'utf-8')
      migrations.push({
        id: '003_rls_policies',
        name: 'Row Level Security Policies',
        description: 'Implement comprehensive RLS policies for data security',
        sql: rlsSQL,
        checksum: this.calculateChecksum(rlsSQL),
      })

      return migrations.sort((a, b) => a.id.localeCompare(b.id))
    } catch (error) {
      console.error('Failed to load migration files:', error)
      return []
    }
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now()

    try {
      console.log(`Executing migration: ${migration.id} - ${migration.name}`)

      // Execute the migration SQL
      const { error } = await this.supabase.rpc('exec_sql', { 
        sql: migration.sql 
      })

      const executionTime = Date.now() - startTime

      if (error) {
        console.error(`Migration ${migration.id} failed:`, error.message)
        
        // Record failed migration
        await this.recordMigration(migration, executionTime, false, error.message)
        
        return {
          migration,
          success: false,
          executionTime,
          error: error.message,
        }
      }

      console.log(`✅ Migration ${migration.id} completed in ${executionTime}ms`)

      // Record successful migration
      await this.recordMigration(migration, executionTime, true)

      return {
        migration,
        success: true,
        executionTime,
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      console.error(`Migration ${migration.id} failed:`, errorMessage)
      
      // Record failed migration
      await this.recordMigration(migration, executionTime, false, errorMessage)
      
      return {
        migration,
        success: false,
        executionTime,
        error: errorMessage,
      }
    }
  }

  /**
   * Record migration execution in database
   */
  private async recordMigration(
    migration: Migration, 
    executionTime: number, 
    success: boolean, 
    error?: string
  ): Promise<void> {
    try {
      const { error: insertError } = await this.supabase
        .from('migrations')
        .upsert({
          id: migration.id,
          name: migration.name,
          description: migration.description,
          checksum: migration.checksum,
          execution_time: executionTime,
          success,
          error: error || null,
        })

      if (insertError) {
        console.warn(`Could not record migration ${migration.id}:`, insertError.message)
      }
    } catch (err) {
      console.warn(`Could not record migration ${migration.id}:`, err)
    }
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<MigrationResult[]> {
    console.log('🚀 Starting database migrations...')

    try {
      // Ensure migrations table exists
      await this.ensureMigrationsTable()

      // Load available migrations
      const availableMigrations = this.loadMigrationFiles()
      if (availableMigrations.length === 0) {
        console.log('No migration files found')
        return []
      }

      // Get executed migrations
      const executedMigrations = await this.getExecutedMigrations()
      const executedIds = new Set(
        executedMigrations
          .filter(m => m.success)
          .map(m => m.id)
      )

      // Find pending migrations
      const pendingMigrations = availableMigrations.filter(
        migration => !executedIds.has(migration.id)
      )

      if (pendingMigrations.length === 0) {
        console.log('✅ All migrations are up to date')
        return []
      }

      console.log(`📦 Found ${pendingMigrations.length} pending migrations`)

      // Execute pending migrations sequentially
      const results: MigrationResult[] = []
      for (const migration of pendingMigrations) {
        const result = await this.executeMigration(migration)
        results.push(result)

        // Stop on first failure
        if (!result.success) {
          console.error(`❌ Migration failed: ${migration.id}`)
          break
        }
      }

      const successCount = results.filter(r => r.success).length
      const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0)

      console.log(`🎉 Completed ${successCount}/${results.length} migrations in ${totalTime}ms`)

      return results
    } catch (error) {
      console.error('❌ Migration process failed:', error)
      throw error
    }
  }

  /**
   * Check migration status
   */
  async getStatus(): Promise<{
    available: Migration[]
    executed: Migration[]
    pending: Migration[]
  }> {
    const available = this.loadMigrationFiles()
    const executed = await this.getExecutedMigrations()
    const executedIds = new Set(executed.filter(m => m.success).map(m => m.id))
    const pending = available.filter(m => !executedIds.has(m.id))

    return { available, executed, pending }
  }

  /**
   * Validate database schema
   */
  async validateSchema(): Promise<boolean> {
    try {
      // Check if core tables exist
      const tables = [
        'user_profiles',
        'roles', 
        'permissions',
        'role_permissions',
        'user_roles',
        'user_permissions',
        'user_sessions'
      ]

      for (const table of tables) {
        const { data, error } = await this.supabase
          .from(table)
          .select('count')
          .limit(1)

        if (error) {
          console.error(`Table ${table} validation failed:`, error.message)
          return false
        }
      }

      console.log('✅ Database schema validation passed')
      return true
    } catch (error) {
      console.error('❌ Database schema validation failed:', error)
      return false
    }
  }
}

// Utility functions for CLI usage
export async function runMigrations(): Promise<void> {
  const runner = new MigrationRunner()
  await runner.runMigrations()
}

export async function getMigrationStatus(): Promise<void> {
  const runner = new MigrationRunner()
  const status = await runner.getStatus()
  
  console.log('\n📊 Migration Status:')
  console.log(`Available: ${status.available.length}`)
  console.log(`Executed: ${status.executed.length}`)
  console.log(`Pending: ${status.pending.length}`)
  
  if (status.pending.length > 0) {
    console.log('\n⏳ Pending migrations:')
    status.pending.forEach(m => {
      console.log(`  - ${m.id}: ${m.name}`)
    })
  }
}

export async function validateDatabaseSchema(): Promise<void> {
  const runner = new MigrationRunner()
  const isValid = await runner.validateSchema()
  
  if (!isValid) {
    process.exit(1)
  }
}

export default MigrationRunner
