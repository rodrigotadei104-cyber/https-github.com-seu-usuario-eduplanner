import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Create Supabase Client with Admin Access (Service Role)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 2. Create Regular Client to check requester permissions
        const authHeader = req.headers.get('Authorization')!
        const token = authHeader.replace('Bearer ', '')
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        // 3. Authenticate User & Check Permissions
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized: ' + (userError?.message || 'No user') }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Explicit check for role 'admin' in your 'users' table configuration
        const { data: callerProfile, error: profileError } = await supabaseAdmin
            .from('users')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single()

        if (profileError || !callerProfile || callerProfile.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Forbidden: Only admins can invite users' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 4. Parse Request Body
        const { email, name, role } = await req.json()

        if (!email || !name || !role) {
            return new Response(JSON.stringify({ error: 'Missing required fields: email, name, role' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 5. Invoke Supabase Auth Invite
        const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';
        console.log(`Sending invite with redirect to: ${siteUrl}`);

        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { name, invited_by: user.id }, // Metadata
            redirectTo: `${siteUrl}#mode=activate`
        })

        if (inviteError) {
            console.error('Invite Error:', inviteError);
            return new Response(JSON.stringify({ error: `Auth Error: ${inviteError.message}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 6. Check for existing "fake" user created by fallback (same email, different ID)
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', email)
            .single()

        if (existingUser && existingUser.id !== inviteData.user.id) {
            // Delete the "fake" fallback user to allow the real Auth user to take its place
            // This fixes the "Unique Violation" error when resending invites
            const { error: deleteError } = await supabaseAdmin
                .from('users')
                .delete()
                .eq('id', existingUser.id)

            if (deleteError) {
                return new Response(JSON.stringify({ error: `Failed to clean up old user record: ${deleteError.message}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
            }
        }

        // 7. Insert/Update public.users table with PENDING status
        const { error: upsertError } = await supabaseAdmin
            .from('users')
            .upsert({
                id: inviteData.user.id,
                tenant_id: callerProfile.tenant_id, // Inherit tenant from admin
                email: email,
                name: name,
                role: role,
                status: 'pending',
                created_at: new Date().toISOString()
            })

        if (upsertError) {
            return new Response(JSON.stringify({ error: `User invited but database creation failed: ${upsertError.message}` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 8. Log Audit
        await supabaseAdmin.from('audit_logs').insert({
            tenant_id: callerProfile.tenant_id,
            user_id: user.id,
            action: 'INVITE_SENT',
            entity: 'user',
            entity_id: inviteData.user.id,
            details: JSON.stringify({ email, role, method: 'edge_function' }),
            timestamp: new Date().toISOString()
        })

        return new Response(JSON.stringify({ success: true, data: inviteData.user }), {
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
