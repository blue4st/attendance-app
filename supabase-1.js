import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://qkhokdmtloufbbcajmst.supabase.co';  // <-- Replace this
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFraG9rZG10bG91ZmJiY2FqbXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODA4NjksImV4cCI6MjA2NzA1Njg2OX0.86U7qFrZ59h--B0yyENgrLyF3mtoZ8FdFrQU87tTTiY';                    // <-- Replace this

export const supabaseClient = createClient(supabaseUrl, supabaseKey);
