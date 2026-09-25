import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vsgodplulqilbbhjwvfo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzZ29kcGx1bHFpbGJiaGp3dmZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTQzNjEsImV4cCI6MjEwMDgzMDM2MX0.Lp8Xuusr-TXDH8nVSTIEavVbErWtMX8iPD9lYEkCBVk';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const ADMIN_EMAIL = 'admin@mmer3.com';