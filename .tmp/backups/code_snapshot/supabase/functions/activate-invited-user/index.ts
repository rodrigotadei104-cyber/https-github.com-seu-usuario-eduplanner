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
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

        // Parse request
        const { email, password } = await req.json()

        if (!email || !password) {
            return new Response(
                JSON.stringify({ error: 'Missing email or password' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 1. Verificar se usuário existe e está pending
        const { data: user, error: fetchError } = await supabaseAdmin
            .from('users')
            .select('id, status')
            .eq('email', email)
            .single()

        if (fetchError || !user) {
            return new Response(
                JSON.stringify({ error: 'Usuário não encontrado. Verifique se recebeu um convite.' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (user.status !== 'pending') {
            return new Response(
                JSON.stringify({ error: 'Esta conta já foi ativada. Faça login normalmente.' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Definir senha e confirmar email usando Admin API
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            {
                password: password,
                email_confirm: true  // Marcar e-mail como confirmado
            }
        )

        if (updateError) {
            console.error('Error setting password:', updateError)
            return new Response(
                JSON.stringify({ error: `Falha ao definir senha: ${updateError.message}` }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 3. Atualizar status para ativo
        const { error: statusError } = await supabaseAdmin
            .from('users')
            .update({ status: 'active' })
            .eq('id', user.id)

        if (statusError) {
            console.error('Error updating status:', statusError)
            return new Response(
                JSON.stringify({ error: 'Senha definida mas falha ao ativar status' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 4. Retornar sucesso
        return new Response(
            JSON.stringify({ success: true, message: 'Conta ativada com sucesso!' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Exception:', error)
        return new Response(
            JSON.stringify({ error: `Exception: ${error.message}` }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
