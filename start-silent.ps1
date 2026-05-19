# -------------------------------------------------------------------
# CHALACA - Inicio silencioso (sin ventanas de Chrome)
# -------------------------------------------------------------------
# Uso:  .\start-silent.ps1
#       .\start-silent.ps1 -BackendOnly   (solo backend, sin Vite)
# -------------------------------------------------------------------
param(
    [switch]$BackendOnly
)

$Host.UI.RawUI.WindowTitle = "Chalaca Silent Server"

Write-Host ""
Write-Host "  * CHALACA - Modo Silencioso" -ForegroundColor Green
Write-Host "  ----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# 1. Forzar Playwright/Chromium a modo headless (por si algun script lo ignora)
$env:PLAYWRIGHT_CHROMIUM_HEADLESS = "true"
$env:HEADLESS = "true"

# 2. Evitar que Vite abra el navegador automaticamente
$env:BROWSER = "none"

# Definir ruta local para pasarla a los Jobs (evita error de $using:PSScriptRoot)
$scriptDir = $PSScriptRoot

# 3. Iniciar Backend (Express + Scrapers)
Write-Host "  [1/2] Iniciando Backend en puerto 3001..." -ForegroundColor Cyan
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:scriptDir
    $env:PLAYWRIGHT_CHROMIUM_HEADLESS = "true"
    $env:HEADLESS = "true"
    node backend/server.js 2>&1
}
Write-Host "  [OK] Backend iniciado (Job ID: $($backendJob.Id))" -ForegroundColor Green

if (-not $BackendOnly) {
    # 4. Iniciar Frontend (Vite dev server)
    Start-Sleep -Seconds 2
    Write-Host "  [2/2] Iniciando Frontend en puerto 5173..." -ForegroundColor Cyan
    $frontendJob = Start-Job -ScriptBlock {
        Set-Location $using:scriptDir
        $env:BROWSER = "none"
        npx vite --host 2>&1
    }
    Write-Host "  [OK] Frontend iniciado (Job ID: $($frontendJob.Id))" -ForegroundColor Green
}

Write-Host ""
Write-Host "  ----------------------------------------" -ForegroundColor DarkGray
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor Yellow
if (-not $BackendOnly) {
    Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Yellow
}
Write-Host "  ----------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Presiona Ctrl+C para detener ambos servidores." -ForegroundColor DarkGray
Write-Host "  Logs en tiempo real:" -ForegroundColor DarkGray
Write-Host ""

# 5. Mostrar logs en tiempo real hasta que el usuario cancele
try {
    while ($true) {
        # Backend logs
        $backendOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
        if ($backendOutput) {
            $backendOutput | ForEach-Object { Write-Host "  [BE] $_" -ForegroundColor Gray }
        }

        # Frontend logs
        if (-not $BackendOnly -and $frontendJob) {
            $frontendOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
            if ($frontendOutput) {
                $frontendOutput | ForEach-Object { Write-Host "  [FE] $_" -ForegroundColor DarkCyan }
            }
        }

        Start-Sleep -Milliseconds 500
    }
}
finally {
    Write-Host ""
    Write-Host "  Deteniendo servidores..." -ForegroundColor Yellow
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
    if (-not $BackendOnly -and $frontendJob) {
        Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $frontendJob -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  [OK] Servidores detenidos correctamente." -ForegroundColor Green
}
