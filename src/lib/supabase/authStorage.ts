import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Na web, o Supabase persiste a sessão de forma mais fiável com `localStorage`
 * (o AsyncStorage do RN Web pode não alinhar com o timing do redirect OAuth).
 */
export const supabaseAuthStorage = {
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        return Promise.resolve(localStorage.getItem(key));
      } catch {
        return Promise.resolve(null);
      }
    }
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* quota / private mode */
      }
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};
