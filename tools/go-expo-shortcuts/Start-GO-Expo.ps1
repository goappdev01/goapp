param(
    [Parameter(Mandatory = $true)][ValidateSet(8088, 8089)][int]$Port,
    [Parameter(Mandatory = $true)][string]$Workspace,
    [string]$OwnerExpoState,
    [string]$BridgeHome,
    [string]$BridgePython,
    [string]$MainWorkspace,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = if ($Port -eq 8088) { 'GO Expo 8088 · MAIN' } else { 'GO Comprobar 8089 · verificado' }
$mobile = Join-Path $Workspace 'artifacts\go-app-mobile'
$cli = Join-Path $mobile 'node_modules\expo\bin\cli'

function Invoke-Git([string[]]$Arguments) {
    $previous = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 treats Git's ordinary stderr progress as a terminating error.
        $ErrorActionPreference = 'Continue'
        $value = & git.exe -C $Workspace @Arguments 2>$null
        $code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "Git no pudo comprobar $($Arguments[0]); no se cambia ni arranca el servidor." }
    return ($value | Out-String).Trim()
}

function Get-Listener {
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($connection) { return $connection }
    }
    catch {
        # Some Windows sessions cannot enumerate the owner of a listening port.
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $attempt = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            if ($attempt.AsyncWaitHandle.WaitOne(500)) {
                try { $client.EndConnect($attempt); return [pscustomobject]@{ OwningProcess = 'desconocido' } }
                catch { return $null }
            }
        }
        finally { $client.Close() }
    }
    return $null
}

function Get-Manifest {
    $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/")
    $request.Proxy = $null
    $request.Timeout = 10000
    $request.Headers.Add('Expo-Platform', 'ios')
    $request.Accept = 'application/expo+json'
    $response = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try { return ($reader.ReadToEnd() | ConvertFrom-Json) }
        finally { $reader.Dispose() }
    }
    finally { $response.Dispose() }
}

function Verify-Http {
    $status = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/status" -UseBasicParsing -TimeoutSec 10
    $statusText = if ($status.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($status.Content) } else { [string]$status.Content }
    if ($statusText.Trim() -ne 'packager-status:running') { throw "El puerto $Port no devuelve el estado de Metro esperado." }
    $manifest = Get-Manifest
    $project = $manifest.extra.expoGo.developer.projectRoot
    if (-not $project -or [IO.Path]::GetFullPath($project).TrimEnd('\') -ine [IO.Path]::GetFullPath($mobile).TrimEnd('\')) {
        throw "El puerto $Port sirve otro checkout. No se detendrá ni sustituirá su proceso."
    }
    $asset = [Uri]$manifest.launchAsset.url
    if ($asset.Port -ne $Port -or -not $asset.AbsolutePath.EndsWith('.bundle') -or $asset.Query -notmatch 'platform=ios') {
        throw "El manifiesto del puerto $Port no apunta al bundle iOS esperado."
    }
    $bundle = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port$($asset.PathAndQuery)")
    $bundle.Proxy = $null
    $bundle.Timeout = 60000
    $response = $bundle.GetResponse()
    try {
        $stream = $response.GetResponseStream()
        if ($stream.ReadByte() -lt 0) { throw 'El bundle iOS está vacío.' }
    }
    finally { $response.Dispose() }
    Write-Host "Metro ${Port}: manifiesto y bundle iOS HTTP correctos; checkout $Workspace" -ForegroundColor Green
}

$launchMutex = $null
$ownsMutex = $false
try {
    if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw "Faltan las dependencias Expo ya instaladas en $mobile." }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git no está disponible.' }
    if ($Port -eq 8089 -and -not (Get-Listener) -and -not $CheckOnly) {
        if (-not $BridgeHome -or -not $BridgePython -or -not $MainWorkspace -or
            -not (Test-Path -LiteralPath (Join-Path $BridgeHome 'owner_expo.py')) -or
            -not (Test-Path -LiteralPath $BridgePython)) {
            throw 'Faltan los parámetros del puente necesarios para actualizar 8089 con MAIN verificado.'
        }
        Write-Host 'Comprobando MAIN publicado y el bundle iOS de 8088 antes de actualizar 8089...' -ForegroundColor Cyan
        & $BridgePython (Join-Path $BridgeHome 'owner_expo.py') sync --bridge-home $BridgeHome --main-workspace $MainWorkspace
        if ($LASTEXITCODE -ne 0) { Write-Host 'La actualización quedó pendiente. Se conservará la última versión verificada.' -ForegroundColor Yellow }
    }
    $head = Invoke-Git @('rev-parse', 'HEAD')
    if ($Port -eq 8089) {
        if (-not $OwnerExpoState -or -not (Test-Path -LiteralPath $OwnerExpoState -PathType Leaf)) {
            throw 'No se encuentra la configuración fijada de Expo 8089.'
        }
        $pinned = (Get-Content -LiteralPath $OwnerExpoState -Raw | ConvertFrom-Json).document
        if ($pinned.port -ne 8089 -or [IO.Path]::GetFullPath($pinned.workspace).TrimEnd('\') -ine [IO.Path]::GetFullPath($Workspace).TrimEnd('\')) {
            throw 'La configuración de 8089 señala otro worktree; no se cambia la versión.'
        }
        if ($head -ne $pinned.sha) { throw "8089 está en $($head.Substring(0,8)), distinto del SHA verificado $($pinned.sha.Substring(0,8)). Se conservan los cambios locales." }
        if ((Invoke-Git @('status', '--porcelain=v1', '-uno')) -or
            (Invoke-Git @('ls-files', '--others', '--exclude-standard', '--', 'artifacts/go-app-mobile'))) {
            throw '8089 contiene cambios locales; no se arranca código distinto de la versión fijada.'
        }
    }

    $listener = Get-Listener
    if ($listener) {
        if ($Port -eq 8088) {
            $remoteLine = Invoke-Git @('ls-remote', 'origin', 'refs/heads/main')
            $published = ($remoteLine -split '\s+')[0]
            if ($head -ne $published) {
                throw "8088 sirve $($head.Substring(0,8)), pero MAIN es $($published.Substring(0,8)). No se reinicia ni se modifica el servidor activo."
            }
        }
        Verify-Http
        Write-Host "El servidor correcto ya escucha en $Port (PID $($listener.OwningProcess)); no se inicia otro." -ForegroundColor Cyan
        return
    }

    if ($Port -eq 8088) {
        if (Invoke-Git @('status', '--porcelain=v1', '-uno')) { throw 'La copia MAIN contiene cambios locales; no se sobrescriben ni se arranca una versión antigua.' }
        if ((Invoke-Git @('branch', '--show-current')) -ne 'main') { throw '8088 debe arrancar desde la rama main de la copia de fábrica.' }
        if ($CheckOnly) { Write-Host '8088: checkout limpio; la sincronización con MAIN se hará al abrir el acceso.'; return }
        Invoke-Git @('fetch', 'origin', 'main') | Out-Null
        $latest = Invoke-Git @('rev-parse', 'FETCH_HEAD')
        & git.exe -C $Workspace merge-base --is-ancestor $head $latest 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'MAIN avanzó de forma no lineal; no se modifica el checkout.' }
        Invoke-Git @('merge', '--ff-only', $latest) | Out-Null
        if ((Invoke-Git @('rev-parse', 'HEAD')) -ne $latest) { throw 'No se pudo comprobar MAIN después del avance.' }
        Write-Host "8088 sincronizado con MAIN $($latest.Substring(0,8))." -ForegroundColor Green
    }
    if ($CheckOnly) { Write-Host "$Port listo para arrancar desde $($head.Substring(0,8))."; return }

    $launchMutex = New-Object System.Threading.Mutex($false, "Local\GO-Expo-$Port-Startup")
    $ownsMutex = $launchMutex.WaitOne(0)
    if (-not $ownsMutex) { throw "Ya se está iniciando GO Expo $Port en otra ventana." }
    $listener = Get-Listener
    if ($listener) { Verify-Http; Write-Host 'Otro acceso inició Metro durante la comprobación; se reutiliza.'; return }
    $node = if ($Port -eq 8089) { $pinned.node } else { (Get-Command node -ErrorAction Stop).Source }
    if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw "No se encuentra Node: $node" }
    foreach ($key in @('PORT','EXPO_PACKAGER_PROXY_URL','EXPO_PUBLIC_DOMAIN','REACT_NATIVE_PACKAGER_HOSTNAME')) {
        Remove-Item "Env:$key" -ErrorAction SilentlyContinue
    }
    if ($Port -eq 8089) {
        $env:EXPO_NO_DOTENV = '1'
        $env:REACT_NATIVE_PACKAGER_HOSTNAME = $pinned.host
    } else {
        $tailscale = 'C:\Program Files\Tailscale\tailscale.exe'
        if (Test-Path -LiteralPath $tailscale) {
            $ip = (& $tailscale ip -4 2>$null | Select-Object -First 1).Trim()
            if ($ip -match '^100\.(?:\d{1,3}\.){2}\d{1,3}$') { $env:REACT_NATIVE_PACKAGER_HOSTNAME = $ip }
        }
    }
    $cache = Join-Path ([IO.Path]::GetDirectoryName($PSCommandPath)) "cache-$Port"
    New-Item -ItemType Directory -Path $cache -Force | Out-Null
    $env:TEMP = $cache
    $env:TMP = $cache
    Push-Location $mobile
    try {
        Write-Host "Arrancando GO Expo $Port desde $mobile" -ForegroundColor Cyan
        Write-Host 'La ventana permanecerá abierta. Pulsa Ctrl+C aquí para detener solo este servidor.'
        & $node $cli start --port $Port --lan
    }
    finally { Pop-Location }
}
catch {
    Write-Host "GO Expo $Port no iniciado: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    if ($ownsMutex) { $launchMutex.ReleaseMutex() }
    if ($launchMutex) { $launchMutex.Dispose() }
}
