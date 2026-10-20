# Registra office2google.exe como handler de doble click para extensiones Office.
# No requiere administrador (HKCU). Respalda UserChoice para poder revertir.
param(
	[string[]]$Extensions = @('docx', 'doc', 'docm', 'xlsx', 'xls', 'xlsm', 'pptx', 'ppt', 'pptm'),
	[string]$ExePath = ''
)
$ErrorActionPreference = 'Stop'
if (-not $ExePath) {
	$candidates = @((Join-Path $PSScriptRoot 'office2google.exe'), (Join-Path $PSScriptRoot 'dist\office2google.exe'))
	$ExePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $ExePath -or -not (Test-Path $ExePath)) { Write-Host "ERROR: no se encontro office2google.exe"; exit 1 }
$ExePath = (Resolve-Path $ExePath).Path

$command = '"' + $ExePath + '" "%1"'
$backupDir = Join-Path $env:APPDATA 'office2google\backup'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

foreach ($raw in $Extensions) {
	$ext = $raw.TrimStart('.').ToLower()
	$progId = "Office2Google.$ext"
	$ucPath = "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.$ext\UserChoice"
	$ucPsPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.$ext\UserChoice"

	# Windows prioriza UserChoice sobre HKCU\Software\Classes: respaldar y quitar.
	# Regla de seguridad: JAMAS eliminar sin respaldo exitoso.
	if (Test-Path $ucPsPath) {
		$regFile = Join-Path $backupDir "userchoice-$ext.reg"
		& reg export $ucPath $regFile /y | Out-Null
		if (Test-Path $regFile) {
			Remove-Item -Path $ucPsPath -Recurse -Force
		} else {
			Write-Warning "No se pudo respaldar UserChoice de .$ext - NO se modifica (la asociacion no aplicara aqui)"
			continue
		}
	}

	New-Item -Path "HKCU:\Software\Classes\.$ext" -Force | Out-Null
	Set-ItemProperty -Path "HKCU:\Software\Classes\.$ext" -Name '(default)' -Value $progId
	New-Item -Path "HKCU:\Software\Classes\$progId\shell\open\command" -Force | Out-Null
	Set-ItemProperty -Path "HKCU:\Software\Classes\$progId\shell\open\command" -Name '(default)' -Value $command
}

Write-Host "OK: doble click en [$($Extensions -join ' ')] ahora ejecuta office2google.exe"
