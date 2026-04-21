import { createClient } from '@supabase/supabase-js';

// Credentials provided by user
const supabaseUrl = 'https://ubhtibihkpwocgazwtur.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_bW9um4iaCTHsSiYjWl6ptQ_-05RmfPx';

export const supabase = createClient(supabaseUrl, supabaseKey);