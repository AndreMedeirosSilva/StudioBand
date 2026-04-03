require('dotenv').config();

/** Expo só embute `EXPO_PUBLIC_*` no bundle; `NEXT_PUBLIC_*` entra via `extra`. */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra ?? {}),
    supabaseUrl:
      process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      '',
    supabaseKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      '',
  },
});
