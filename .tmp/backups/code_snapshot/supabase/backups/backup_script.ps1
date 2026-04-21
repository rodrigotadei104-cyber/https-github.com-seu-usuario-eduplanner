# Script de Backup Completo para Supabase Free Plan (PowerShell)
# Data: 2026-01-24

Write-Host "🔒 Iniciando backup do EduPlanner..." -ForegroundColor Green

# Configurações
$BACKUP_DIR = "supabase\backups"
$BACKUP_FILE = "supabase_dump_recoverypoint_20260124.sql"
$DATE = Get-Date -Format "yyyyMMdd_HHmmss"

# Criar diretório se não existir
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
}

Write-Host "📦 Verificando Supabase CLI..." -ForegroundColor Cyan

# Verificar se Supabase CLI está instalado
$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue

if (-not $supabaseCmd) {
    Write-Host "❌ Supabase CLI não encontrado!" -ForegroundColor Red
    Write-Host "📥 Instalando Supabase CLI..." -ForegroundColor Yellow
    npm install -g supabase
    
    # Verificar novamente
    $supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
    if (-not $supabaseCmd) {
        Write-Host "❌ Falha ao instalar Supabase CLI!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ Supabase CLI encontrado!" -ForegroundColor Green

# Verificar se está logado
Write-Host "🔐 Verificando autenticação..." -ForegroundColor Cyan
$projectsOutput = supabase projects list 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Não autenticado. Execute: supabase login" -ForegroundColor Yellow
    Write-Host "Depois execute este script novamente." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Autenticado!" -ForegroundColor Green

# Gerar dump
Write-Host "💾 Gerando dump do banco de dados..." -ForegroundColor Cyan
$dumpPath = Join-Path $BACKUP_DIR $BACKUP_FILE
supabase db dump -f $dumpPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup criado com sucesso!" -ForegroundColor Green
    Write-Host "📁 Arquivo: $dumpPath" -ForegroundColor Cyan
    
    # Validar backup
    Write-Host "🔍 Validando backup..." -ForegroundColor Cyan
    
    if (Test-Path $dumpPath) {
        $fileSize = (Get-Item $dumpPath).Length
        $content = Get-Content $dumpPath -Raw
        $tableCount = ([regex]::Matches($content, "CREATE TABLE")).Count
        
        Write-Host "📊 Tamanho do arquivo: $fileSize bytes" -ForegroundColor Cyan
        Write-Host "📊 Tabelas encontradas: $tableCount" -ForegroundColor Cyan
        
        if ($tableCount -ge 7) {
            Write-Host "✅ Backup validado com sucesso!" -ForegroundColor Green
            Write-Host "🎯 Recovery point completo!" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Aviso: Menos tabelas do que esperado ($tableCount/7)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Arquivo de backup não encontrado!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "❌ Erro ao criar backup!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Processo concluído!" -ForegroundColor Green
Write-Host "📝 Próximo passo: Atualizar CHECKLIST_RECOVERY_20260124.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para restaurar este backup no futuro:" -ForegroundColor Yellow
Write-Host "  supabase db push --db-url 'postgresql://...' < $dumpPath" -ForegroundColor Gray
