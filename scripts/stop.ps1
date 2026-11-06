$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workerPidFile = Join-Path $projectRoot 'storage\worker.pid'
if (Test-Path -LiteralPath $workerPidFile) {
    $workerId = [int](Get-Content -LiteralPath $workerPidFile)
    $workerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $workerId" -ErrorAction SilentlyContinue
    if ($workerProcess -and $workerProcess.Name -eq 'php.exe' -and $workerProcess.CommandLine -like '*server/worker.php*') { Stop-Process -Id $workerId }
}
$pidFile = Join-Path $projectRoot 'storage\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'Nao existe um servidor registado por iniciar.bat.'; exit }
$serverPid = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
if ($process -and $process.Name -eq 'php.exe' -and $process.CommandLine -like '*127.0.0.1:8081*' -and $process.CommandLine -like '*server/router.php*') {
    Stop-Process -Id $serverPid
    Write-Host 'Servidor PHP da FORMA terminado. O MySQL continua disponivel no XAMPP.'
}
