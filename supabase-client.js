// Fill these in with your Supabase project's values
// (Project Settings -> API in your Supabase dashboard)
const SUPABASE_URL = 'https://oruxbkvbnuktiycpdaam.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_o4n4O6IfHC4NS3zTiYtbYg_E2N9duUJ';

// Google OAuth "Web application" Client ID (Google Cloud Console -> APIs & Services -> Credentials).
// Add your site's URL(s) under "Authorized JavaScript origins" for this client.
// This must also be added in Supabase: Authentication -> Providers -> Google -> Client ID.
const GOOGLE_CLIENT_ID = '332769424105-m3quh5fb46gq2vfv4nn1a642ejtf3q2j.apps.googleusercontent.com';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
