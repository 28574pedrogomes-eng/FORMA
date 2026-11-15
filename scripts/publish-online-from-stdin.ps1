$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$payload=[Console]::In.ReadToEnd() | ConvertFrom-Json
$password=[string]$payload.password
if([string]::IsNullOrWhiteSpace($password)){throw 'Palavra-passe vazia.'}
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$winscpDir=Join-Path $root 'output\WinSCP-Portable'
[void][Reflection.Assembly]::LoadFrom((Join-Path $winscpDir 'net40\WinSCPnet.dll'))
$stage=Join-Path 'C:\' ('fp'+[Guid]::NewGuid().ToString('N').Substring(0,8))
$session=$null
try{
  [void](New-Item -ItemType Directory -Path $stage)
  foreach($folder in @('public','server','database','vendor')){
    $source=Join-Path $root $folder
    if(Test-Path $source){Get-ChildItem -LiteralPath $source -File -Recurse | ForEach-Object{
      $relative=$_.FullName.Substring($root.Length).TrimStart('\','/')
      if($relative -match '(^|[\\/])config\.local\.php$' -or $relative -match '(^|[\\/])\.DS_Store$' -or $relative -match '^vendor[\\/]google[\\/]apiclient-services([\\/]|$)'){return}
      $target=Join-Path $stage $relative;$parent=Split-Path -Parent $target
      if(!(Test-Path $parent)){[void](New-Item -ItemType Directory -Path $parent -Force)}
      Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }}
  }
  foreach($file in @('index.php','.htaccess','composer.json','composer.lock')){$source=Join-Path $root $file;if(Test-Path $source){Copy-Item -LiteralPath $source -Destination (Join-Path $stage $file) -Force}}
  if(!(Test-Path (Join-Path $stage 'public\build\index.html'))){throw 'Compilação public/build não encontrada.'}
  $options=New-Object WinSCP.SessionOptions
  $options.Protocol=[WinSCP.Protocol]::Ftp;$options.FtpSecure=[WinSCP.FtpSecure]::Explicit
  $options.HostName='ftpupload.net';$options.PortNumber=21;$options.UserName='if0_43368458';$options.Password=$password
  $session=New-Object WinSCP.Session;$session.ExecutablePath=Join-Path $winscpDir 'WinSCP.exe';$session.Timeout=[TimeSpan]::FromSeconds(60);$session.Open($options)
  $sync=$session.SynchronizeDirectories([WinSCP.SynchronizationMode]::Remote,$stage,'/htdocs',$false);$sync.Check()
  if(!$session.FileExists('/htdocs/index.php') -or !$session.FileExists('/htdocs/public/build/index.html')){throw 'Ficheiros de entrada não confirmados no servidor.'}
  [Console]::Out.WriteLine((@{ok=$true;transferred=@($sync.Transfers).Count;verified=$true}|ConvertTo-Json -Compress))
}catch{[Console]::Out.WriteLine((@{ok=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress));exit 1}
finally{if($session){$session.Dispose()};$password=$null;if(Test-Path $stage){Remove-Item -LiteralPath $stage -Recurse -Force}}
