// types/supabase.d.ts - Generated from Supabase schema
export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          name: string;
          curator_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          curator_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          curator_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      kv_store: {
        Row: {
          id: string;
          user_id: string;
          k: string;
          v: any;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          k: string;
          v: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          k?: string;
          v?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
      client_kv_store: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          k: string;
          v: any;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          k: string;
          v: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          k?: string;
          v?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Type helpers for better DX
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// Specific table types
export type Client = Tables<'clients'>;
export type ClientInsert = TablesInsert<'clients'>;
export type ClientUpdate = TablesUpdate<'clients'>;

export type KVStore = Tables<'kv_store'>;
export type KVStoreInsert = TablesInsert<'kv_store'>;
export type KVStoreUpdate = TablesUpdate<'kv_store'>;

export type ClientKVStore = Tables<'client_kv_store'>;
export type ClientKVStoreInsert = TablesInsert<'client_kv_store'>;
export type ClientKVStoreUpdate = TablesUpdate<'client_kv_store'>;

// Supabase client type with Database generic
export interface TypedSupabaseClient {
  from<T extends keyof Database['public']['Tables']>(table: T): any; // Would be properly typed with @supabase/supabase-js
}
