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

        // Cliente Admin para operações privilegiadas
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

        // Cliente Normal para validar o token do usuário
        // Não passamos chave aqui, vamos configurar com o token recebido
        const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '')

        // Parse request
        const { accessToken, newPassword } = await req.json()

        if (!accessToken || !newPassword) {
            return new Response(
                JSON.stringify({ error: 'Missing access_token or password' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 1. Validar o token e obter o usuário
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser(accessToken)

        if (userError || !user) {
            console.error('Invalid token:', userError)
            return new Response(
                JSON.stringify({ error: 'Token inválido ou expirado. Tente solicitar nova recuperação de senha.' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Com o ID do usuário validado, atualizar a senha via Admin API
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            { password: newPassword }
        )

        if (updateError) {
            console.error('Error updating password:', updateError)
            return new Response(
                JSON.stringify({ error: `Falha ao atualizar senha: ${updateError.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 3. Retornar sucesso
        return new Response(
            JSON.stringify({ success: true, message: 'Senha atualizada com sucesso!' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Exception:', error)
        return new Response(
            JSON.stringify({ error: `Exception: ${error.message}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
