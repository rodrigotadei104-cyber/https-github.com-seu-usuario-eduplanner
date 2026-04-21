#!/bin/bash
# Script de Backup Completo para Supabase Free Plan
# Data: 2026-01-24

echo "🔒 Iniciando backup do EduPlanner..."

# Configurações
BACKUP_DIR="supabase/backups"
BACKUP_FILE="supabase_dump_recoverypoint_20260124.sql"
DATE=$(date +%Y%m%d_%H%M%S)

# Criar diretório se não existir
mkdir -p "$BACKUP_DIR"

echo "📦 Verificando Supabase CLI..."

# Verificar se Supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não encontrado!"
    echo "📥 Instalando Supabase CLI..."
    npm install -g supabase
fi

echo "✅ Supabase CLI encontrado!"

# Verificar se está logado
echo "🔐 Verificando autenticação..."
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Não autenticado. Execute: supabase login"
    exit 1
fi

echo "✅ Autenticado!"

# Gerar dump
echo "💾 Gerando dump do banco de dados..."
supabase db dump -f "$BACKUP_DIR/$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Backup criado com sucesso!"
    echo "📁 Arquivo: $BACKUP_DIR/$BACKUP_FILE"
    
    # Validar backup
    echo "🔍 Validando backup..."
    FILE_SIZE=$(wc -c < "$BACKUP_DIR/$BACKUP_FILE")
    TABLE_COUNT=$(grep -c "CREATE TABLE" "$BACKUP_DIR/$BACKUP_FILE")
    
    echo "📊 Tamanho do arquivo: $FILE_SIZE bytes"
    echo "📊 Tabelas encontradas: $TABLE_COUNT"
    
    if [ $TABLE_COUNT -ge 7 ]; then
        echo "✅ Backup validado com sucesso!"
        echo "🎯 Recovery point completo!"
    else
        echo "⚠️  Aviso: Menos tabelas do que esperado"
    fi
else
    echo "❌ Erro ao criar backup!"
    exit 1
fi

echo ""
echo "✅ Processo concluído!"
echo "📝 Próximo passo: Atualizar CHECKLIST_RECOVERY_20260124.md"
