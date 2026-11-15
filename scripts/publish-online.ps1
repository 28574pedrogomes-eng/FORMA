Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$winscpDir = Join-Path $root 'output\WinSCP-Portable'
$dll = Join-Path $winscpDir 'net40\WinSCPnet.dll'
$exe = Join-Path $winscpDir 'WinSCP.exe'
if (!(Test-Path $dll) -or !(Test-Path $exe)) { throw 'WinSCP portátil não encontrado em output\WinSCP-Portable.' }
[void][Reflection.Assembly]::LoadFrom($dll)

$form = New-Object Windows.Forms.Form
$form.Text = 'Publicar FORMA online'
$form.ClientSize = New-Object Drawing.Size(560, 245)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false

$label = New-Object Windows.Forms.Label
$label.Text = 'Palavra-passe FTP da conta if0_43368458:'
$label.Location = New-Object Drawing.Point(20, 18)
$label.AutoSize = $true
$form.Controls.Add($label)

$passwordBox = New-Object Windows.Forms.TextBox
$passwordBox.Location = New-Object Drawing.Point(20, 45)
$passwordBox.Size = New-Object Drawing.Size(518, 27)
$passwordBox.UseSystemPasswordChar = $true
$form.Controls.Add($passwordBox)

$button = New-Object Windows.Forms.Button
$button.Text = 'Ligar e publicar'
$button.Location = New-Object Drawing.Point(20, 86)
$button.Size = New-Object Drawing.Size(150, 36)
$form.Controls.Add($button)
$form.AcceptButton = $button

$status = New-Object Windows.Forms.Label
$status.Text = 'Destino: FTPS ftpupload.net → /htdocs. Os ficheiros existentes não serão apagados.'
$status.Location = New-Object Drawing.Point(20, 142)
$status.Size = New-Object Drawing.Size(518, 75)
$form.Controls.Add($status)

$button.Add_Click({
    $password = $passwordBox.Text
    if ([string]::IsNullOrWhiteSpace($password)) {
        [Windows.Forms.MessageBox]::Show('Introduz a palavra-passe FTP para continuar.','FORMA') | Out-Null
        return
    }
    $passwordBox.Clear()
    $button.Enabled = $false
    $status.Text = 'A preparar a versão e a ligar ao servidor…'
    $form.Refresh()

    $stage = Join-Path $env:TEMP ('forma-publish-' + [Guid]::NewGuid().ToString('N'))
    $session = $null
    try {
        [void](New-Item -ItemType Directory -Path $stage)
        $allowed = @('public','server','database','vendor')
        foreach ($folder in $allowed) {
            $source = Join-Path $root $folder
            if (Test-Path $source) {
                Get-ChildItem -LiteralPath $source -File -Recurse | ForEach-Object {
                    $relative = $_.FullName.Substring($root.Length).TrimStart('\','/')
                    if ($relative -match '(^|[\\/])config\.local\.php$' -or $relative -match '(^|[\\/])\.DS_Store$') { return }
                    $target = Join-Path $stage $relative
                    $parent = Split-Path -Parent $target
                    if (!(Test-Path $parent)) { [void](New-Item -ItemType Directory -Path $parent -Force) }
                    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
                }
            }
        }
        foreach ($file in @('index.php','.htaccess','composer.json','composer.lock')) {
            $source = Join-Path $root $file
            if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $stage $file) -Force }
        }
        if (!(Test-Path (Join-Path $stage 'public\build\index.html'))) { throw 'A compilação public/build não está incluída na publicação.' }
        if (!(Test-Path (Join-Path $stage 'public\api\index.php'))) { throw 'A API pública não está incluída na publicação.' }

        $options = New-Object WinSCP.SessionOptions
        $options.Protocol = [WinSCP.Protocol]::Ftp
        $options.FtpSecure = [WinSCP.FtpSecure]::Explicit
        $options.HostName = 'ftpupload.net'
        $options.PortNumber = 21
        $options.UserName = 'if0_43368458'
        $options.Password = $password
        $session = New-Object WinSCP.Session
        $session.ExecutablePath = $exe
        $session.Timeout = [TimeSpan]::FromSeconds(60)
        $session.Open($options)

        $status.Text = 'Ligação segura estabelecida. A sincronizar a aplicação em /htdocs…'
        $form.Refresh()
        $sync = $session.SynchronizeDirectories([WinSCP.SynchronizationMode]::Remote,$stage,'/htdocs',$false)
        $sync.Check()
        if (!$session.FileExists('/htdocs/index.php') -or !$session.FileExists('/htdocs/public/build/index.html')) {
            throw 'A sincronização terminou, mas não confirmei os ficheiros de entrada remotos.'
        }
        $count = @($sync.Transfers).Count
        $status.Text = "Publicação concluída. $count ficheiro(s) enviados/atualizados; entrada e compilação confirmadas no servidor. Nenhum ficheiro remoto foi apagado."
        [Windows.Forms.MessageBox]::Show($status.Text,'FORMA — publicação concluída') | Out-Null
    }
    catch {
        $status.Text = "Publicação não concluída: $($_.Exception.Message)"
        [Windows.Forms.MessageBox]::Show($status.Text,'FORMA — erro de publicação') | Out-Null
        $button.Enabled = $true
    }
    finally {
        if ($session) { $session.Dispose() }
        $password = $null
        if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
})

[void]$form.ShowDialog()
