import { createClient } from '@supabase/supabase-js';

// Credentials provided by user
const supabaseUrl = 'https://rndvwtwnbfwyjoymeblx.supabase.co';
const supabaseKey = 'sb_publishable_bW9um4iaCTHsSiYjWl6ptQ_-05RmfPx';

export const supabase = createClient(supabaseUrl, supabaseKey);