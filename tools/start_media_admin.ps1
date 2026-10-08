$ErrorActionPreference='Stop'
$mediaRoot=Split-Path -Parent $PSScriptRoot
$nodePath=(Get-Command node -ErrorAction Stop).Source
$servicePath=Join-Path $PSScriptRoot 'media_server.mjs'
$logRoot=Join-Path $mediaRoot 'outputs'
New-Item -ItemType Directory -Force $logRoot | Out-Null
try { $check=Invoke-WebRequest 'http://127.0.0.1:8766/api/admin/session' -TimeoutSec 2; $running=$check.StatusCode -eq 200 } catch { $running=$false }
if(!$running){
 $serviceArgs=@(('"' + $servicePath + '"'),'--lan')
 Start-Process -FilePath $nodePath -ArgumentList $serviceArgs -WorkingDirectory $mediaRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'media-admin.log') -RedirectStandardError (Join-Path $logRoot 'media-admin-error.log') | Out-Null
}
Start-Process 'http://127.0.0.1:8766/admin/'