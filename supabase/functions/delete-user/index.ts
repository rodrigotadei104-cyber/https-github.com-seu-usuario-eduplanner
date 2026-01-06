import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        // 1. Client for identifying the caller (Auth Context)
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: req.headers.get('Authorization')! } },
        })

        // 2. Admin client for privileged operations
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

        // 3. Get Caller User
        const {
            data: { user },
        } = await supabaseClient.auth.getUser()

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 4. Verify Caller Role & Tenant
        const { data: callerProfile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single()

        if (profileError || !callerProfile || callerProfile.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 5. Parse Request Body
        const { userId } = await req.json()

        if (!userId) {
            return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Prevent Self-Deletion
        if (userId === user.id) {
            return new Response(JSON.stringify({ error: 'You cannot delete your own account.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 6. Delete User via Auth Admin API
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (deleteError) {
            // Se o usuário não existe no Auth (ex: dados antigos de teste ou apenas na tabela public),
            // ignoramos o erro para permitir a limpeza da tabela public.users
            if (deleteError.message.includes('User not found') || deleteError.status === 404) {
                console.warn('User not found in Auth, proceeding to delete from public table:', userId);
            } else {
                console.error('Delete Error:', deleteError);
                return new Response(JSON.stringify({ error: `Auth Delete Error: ${deleteError.message}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
        }

        // 7. Ensure Public Record is Deleted (in case Cascade fails or isn't set)
        // NOTE: If ON DELETE CASCADE is set, this might be redundant but harmless (0 rows deleted)
        await supabaseAdmin.from('users').delete().eq('id', userId);

        // 8. Log Audit Event
        await supabaseAdmin.from('audit_logs').insert({
            tenant_id: callerProfile.tenant_id,
            action: 'USER_DELETED',
            entity: 'user',
            entity_id: userId,
            details: { deleted_by: user.id },
            user_id: user.id
        })

        return new Response(JSON.stringify({ success: true, message: 'User deleted successfully' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: `Exception: ${error.message}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
