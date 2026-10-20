# Revierte lo que hizo install.ps1: elimina nuestra asociacion y restaura UserChoice original.
param([string[]]$Extensions = @('docx', 'doc', 'docm', 'xlsx', 'xls', 'xlsm', 'pptx', 'ppt', 'pptm'))
$ErrorActionPreference = 'SilentlyContinue'
$backupDir = Join-Path $env:APPDATA 'office2google\backup'

foreach ($raw in $Extensions) {
	$ext = $raw.TrimStart('.').ToLower()
	$progId = "Office2Google.$ext"
	$extKey = "HKCU:\Software\Classes\.$ext"

	# Solo borramos la clave si la escribimos nosotros (evita borrar ajustes ajenos)
	if (Test-Path $extKey) {
		$current = (Get-ItemProperty -Path $extKey -Name '(default)').'(default)'
		if ($current -eq $progId) { Remove-Item -Path $extKey -Recurse -Force }
	}
	Remove-Item -Path "HKCU:\Software\Classes\$progId" -Recurse -Force

	# Restaurar la eleccion original de Windows (si hubo backup)
	$regFile = Join-Path $backupDir "userchoice-$ext.reg"
	if (Test-Path $regFile) { & reg import $regFile | Out-Null }
}

# Eliminar la copia instalada por install.bat (no toca la carpeta de origen)
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\office2google'
if (Test-Path $installDir) {
	Remove-Item -Path (Join-Path $installDir 'office2google.exe') -Force -ErrorAction SilentlyContinue
	Remove-Item -Path (Join-Path $installDir 'client_secret.json') -Force -ErrorAction SilentlyContinue
	$leftover = Get-ChildItem -Path $installDir -Force | Select-Object -First 1
	if (-not $leftover) { Remove-Item -Path $installDir -Force -ErrorAction SilentlyContinue }
}

Write-Host "OK: asociaciones restauradas (vuelve a abrir con Office por defecto)"
