// Supabase Initialization
const SUPABASE_URL = 'https://hwcnsfbskdhlsaagbbuo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3Y25zZmJza2RobHNhYWdiYnVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyNDY0NTEsImV4cCI6MjA2NjgyMjQ1MX0.J7PYUDJcD990Ougrc5-KF4nxLryKbMBAtb5aVOtC-ko';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase URL or Anon Key is missing. Please check your configuration.');
}

let supabaseClient = null;

try {
    // The Supabase client is usually available globally via the CDN script as `supabase.createClient`
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.supabaseClient = supabaseClient; // Expose the client globally
        console.log('Supabase client initialized successfully.');
    } else {
        console.error('Supabase client library (supabase.createClient) not found. Ensure it is loaded correctly.');
    }
} catch (error) {
    console.error('Error initializing Supabase client:', error);
}

// Optional: Export for module usage if ever needed, though current setup is global.
// export { supabaseClient };
