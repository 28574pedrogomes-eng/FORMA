param([switch]$Rebuild, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$phpPath = 'C:\xampp\php\php.exe'
$mysqlPath = 'C:\xampp\mysql\bin\mysqld.exe'
if (-not (Test-Path -LiteralPath $phpPath)) { throw 'XAMPP nao encontrado em C:\xampp. Ajusta phpPath neste script.' }
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'storage') | Out-Null

if (-not (Get-Process mysqld -ErrorAction SilentlyContinue)) {
    Write-Host 'A iniciar o MySQL do XAMPP...'
    Start-Process -FilePath $mysqlPath -ArgumentList '--defaults-file=C:\xampp\mysql\bin\my.ini','--bind-address=127.0.0.1','--console' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'storage\mysql-output.log') -RedirectStandardError (Join-Path $projectRoot 'storage\mysql-error.log') | Out-Null
    Start-Sleep -Seconds 3
}
& $phpPath 'server/install.php'
if ($LASTEXITCODE -ne 0) { throw 'A instalacao MySQL falhou. Verifica as credenciais em server/config.local.php.' }

if ($Rebuild -or -not (Test-Path 'public/build/index.html')) {
    $portableNode = Join-Path $projectRoot '.tools\node-v22.16.0-win-x64'
    if (Test-Path (Join-Path $portableNode 'node.exe')) { $env:Path = "$portableNode;$env:Path" }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Instala Node.js 22.16+ ou usa a copia portatil em .tools para compilar o React.' }
    if (-not (Test-Path 'node_modules')) { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel instalar as dependencias.' } }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'A compilacao falhou.' }
}

$running = $false
try {
    $sessionResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:8081/api/index.php?route=/session' -TimeoutSec 3
    $running = [bool]$sessionResponse.csrf
} catch { }
if (-not $running) {
    Write-Host 'A iniciar o PHP em http://localhost:8081 ...'
    $server = Start-Process -FilePath $phpPath -ArgumentList '-d','upload_max_filesize=5M','-d','post_max_size=6M','-S','127.0.0.1:8081','-t','public','server/router.php' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'storage\server-output.log') -RedirectStandardError (Join-Path $projectRoot 'storage\server-error.log')
    Set-Content -LiteralPath (Join-Path $projectRoot 'storage\server.pid') -Value $server.Id
    Start-Sleep -Seconds 2
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8081/api/index.php?route=/session' -TimeoutSec 5
    if (-not $health.csrf) { throw 'O servidor nao iniciou. Consulta storage/server-error.log.' }
}
Write-Host ''
$workerPidFile = Join-Path $projectRoot 'storage\worker.pid'
$workerRunning = $false
if (Test-Path -LiteralPath $workerPidFile) {
    $workerId = [int](Get-Content -LiteralPath $workerPidFile)
    $workerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $workerId" -ErrorAction SilentlyContinue
    $workerRunning = $workerProcess -and $workerProcess.Name -eq 'php.exe' -and $workerProcess.CommandLine -like '*server/worker.php*'
}
if (-not $workerRunning) {
    $worker = Start-Process -FilePath $phpPath -ArgumentList 'server/worker.php' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'storage\worker-output.log') -RedirectStandardError (Join-Path $projectRoot 'storage\worker-error.log')
    Set-Content -LiteralPath $workerPidFile -Value $worker.Id
}
Write-Host 'FORMA pronta: http://localhost:8081' -ForegroundColor Green
Write-Host 'Admin: admin@forma.pt | Palavra-passe: storage/setup-credentials.txt'
Write-Host 'Gemini/OpenAI e email SMTP: Administracao > Integracoes (sem SMTP, mensagens em storage/mail/)'
if (-not $NoBrowser) { Start-Process 'http://localhost:8081' }
