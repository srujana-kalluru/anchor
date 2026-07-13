// Placeholders are substituted by the GitHub Pages workflow from repository secrets.
export const environment = {
  production: true,
  apiUrl: '__API_URL__',
  supabaseUrl: '__SUPABASE_URL__',
  supabaseAnonKey: '__SUPABASE_ANON_KEY__',
  vapidPublicKey: '__VAPID_PUBLIC_KEY__'
};
