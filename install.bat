@echo off
setlocal

rem Instala office2google en una ruta estable de tu usuario y asocia las
rem extensiones Office al doble click. No requiere administrador.

set "SRC=%~dp0"
set "TARGET=%LOCALAPPDATA%\Programs\office2google"
set "EXE="

if exist "%SRC%office2google.exe" set "EXE=%SRC%office2google.exe"
if not defined EXE if exist "%SRC%dist\office2google.exe" set "EXE=%SRC%dist\office2google.exe"

if not defined EXE (
  echo.
  echo ERROR: no se encontro office2google.exe en esta carpeta.
  echo Compilalo con "bun run build" o copia el exe junto a install.bat.
  echo.
  pause
  exit /b 1
)

echo.
echo Instalando office2google en:
echo   %TARGET%
if not exist "%TARGET%" mkdir "%TARGET%"
copy /y "%EXE%" "%TARGET%\office2google.exe" >nul
if errorlevel 1 (
  echo ERROR: no se pudo copiar el exe. Esta abierto? Cierralo e intenta otra vez.
  pause
  exit /b 1
)
if exist "%SRC%client_secret.json" (
  copy /y "%SRC%client_secret.json" "%TARGET%\client_secret.json" >nul
  echo   + client_secret.json copiado
)

echo.
echo Asociando extensiones Office (docx xlsx pptx y demas)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SRC%install.ps1" -ExePath "%TARGET%\office2google.exe"
if errorlevel 1 (
  echo.
  echo ERROR: no se pudieron asociar las extensiones.
  pause
  exit /b 1
)

echo.
"%TARGET%\office2google.exe" status

echo.
echo Listo. Doble click en cualquier .docx / .xlsx / .pptx y entra con tu
echo cuenta de Google cuando el navegador se abra la primera vez.
echo.
echo Nota: si recompilas la app, vuelve a ejecutar install.bat para
echo refrescar la copia instalada.
echo.
pause
exit /b 0
