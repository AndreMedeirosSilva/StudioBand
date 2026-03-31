import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { getSupabaseApiKey, getSupabaseUrl, isSupabaseConfigured } from './config';
import { supabaseAuthStorage } from './authStorage';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase não configurado (URL / chave API).');
  }
  if (!client) {
    client = createClient(getSupabaseUrl(), getSupabaseApiKey(), {
      auth: {
        storage: supabaseAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });
  }
  return client;
}
