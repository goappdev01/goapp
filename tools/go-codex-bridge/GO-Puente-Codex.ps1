# Compatible with Windows PowerShell 5.1. No global execution-policy changes.
[CmdletBinding()]
param(
    [ValidateSet('Abrir','Mantener','Estado','Pruebas','PruebaCodex')][string]$Accion = 'Abrir'
)
$ErrorActionPreference = 'Stop'
$bridgeRoot = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$config = Get-Content -LiteralPath (Join-Path $bridgeRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$python = $config.python_executable
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'No se encuentra el Python ya disponible. Hay que actualizar su ruta local en config.json; no reinstalar Codex.'
}
$program = Join-Path $bridgeRoot 'puente.py'
$env:PYTHONUTF8 = '1'
if ($Accion -eq 'Pruebas') {
    & $python -m unittest discover -s (Join-Path $bridgeRoot 'tests') -v
    exit $LASTEXITCODE
}
if ($Accion -eq 'Estado') { & $python $program status; exit $LASTEXITCODE }
if ($Accion -eq 'PruebaCodex') { & $python $program test-b; exit $LASTEXITCODE }
$origin = 'http://localhost:8765'
function Get-LocalBridgeHealth {
    try {
        # Probe IPv4 directly: Windows PowerShell can spend its short deadline
        # trying ::1 first. Keep the intended localhost Host validation intact.
        $request = [Net.HttpWebRequest]::Create('http://127.0.0.1:8765/api/health')
        $request.Host = 'localhost:8765'
        $request.Proxy = $null
        $request.Timeout = 3000
        $response = $request.GetResponse()
        try {
            $reader = New-Object IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
            try { return ($reader.ReadToEnd() | ConvertFrom-Json) }
            finally { $reader.Dispose() }
        } finally { $response.Dispose() }
    }
    catch { $script:bridgeProbeError = $_.Exception.Message; return $null }
}
function Open-LocalBridgePanel {
    if ($Accion -eq 'Mantener') { return }
    try { Start-Process -FilePath $origin -ErrorAction Stop | Out-Null }
    catch { Write-Warning 'El coordinador esta activo. Abre http://localhost:8765 en tu navegador.' }
}
$health = Get-LocalBridgeHealth
if ($null -ne $health) {
    if ($health.application -ne 'GO-Puente-Codex' -or -not [StringComparer]::OrdinalIgnoreCase.Equals([string]$health.home, $bridgeRoot)) {
        throw 'El puerto 8765 pertenece a otro proceso. No se detendra automaticamente.'
    }
    Open-LocalBridgePanel
    Write-Output 'Se reutiliza el coordinador existente en http://localhost:8765.'
    exit 0
}
if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue) {
    throw ('El puerto 8765 esta ocupado y no confirma la identidad del puente. No se inicia un duplicado. Detalle local: ' + $script:bridgeProbeError)
}
$arguments = '"' + $program + '" serve --no-browser'
Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $bridgeRoot -WindowStyle Hidden | Out-Null
for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 300
    $health = Get-LocalBridgeHealth
    if ($null -ne $health -and $health.application -eq 'GO-Puente-Codex' -and [StringComparer]::OrdinalIgnoreCase.Equals([string]$health.home, $bridgeRoot)) {
        Open-LocalBridgePanel
        Write-Output 'GO Puente Codex esta disponible en http://localhost:8765.'
        exit 0
    }
}
throw 'No se ha confirmado el inicio del coordinador. Comprueba la disponibilidad local del puerto 8765.'
