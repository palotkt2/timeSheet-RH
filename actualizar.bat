@echo off
chcp 65001 >nul
setlocal

:: ============================================================
::  Multiplant - Script de actualización sin pérdida de datos
::  Autor: Humberto Alonso
::  Uso:   Ejecutar desde la carpeta del proyecto en el servidor
:: ============================================================

set "APP_DIR=%~dp0"
:: Quitar trailing backslash
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

:: Generar nombre de respaldo con fecha/hora
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set "DT=%%I"
set "BACKUP_DIR=%APP_DIR%\backups\%DT:~0,8%_%DT:~8,4%"

echo.
echo ========================================
echo   Multiplant - Actualizacion
echo ========================================
echo.
echo   Directorio: %APP_DIR%
echo.

:: ── 1. Respaldar bases de datos y fotos ──
echo [1/4] Creando respaldo de seguridad...
mkdir "%BACKUP_DIR%" 2>nul

if exist "%APP_DIR%\barcode_entries.db" (
    copy /Y "%APP_DIR%\barcode_entries.db" "%BACKUP_DIR%\" >nul
    echo       - barcode_entries.db respaldada
)
if exist "%APP_DIR%\multi_plant.db" (
    copy /Y "%APP_DIR%\multi_plant.db" "%BACKUP_DIR%\" >nul
    echo       - multi_plant.db respaldada
)
if exist "%APP_DIR%\.env" (
    copy /Y "%APP_DIR%\.env" "%BACKUP_DIR%\" >nul
    echo       - .env respaldado
)
echo       Respaldo en: %BACKUP_DIR%
echo.

:: ── 2. Detener la aplicacion ──
echo [2/4] Deteniendo aplicacion...
cd /d "%APP_DIR%"
call pm2 stop multiplant 2>nul
if %errorlevel% equ 0 (
    echo       - PM2 detenido
) else (
    echo       - PM2 no estaba corriendo (OK)
)
echo.

:: ── 3. Migraciones de base de datos ──
echo [3/5] Aplicando migraciones de BD...
cd /d "%APP_DIR%"
node -e "const Database = require('better-sqlite3'); const db = new Database('./multi_plant.db'); try { db.exec('ALTER TABLE shift_assignments ADD COLUMN is_manual INTEGER DEFAULT 0'); console.log('       - Columna is_manual agregada'); } catch(e) { console.log('       - is_manual ya existe (OK)'); } db.close();"
echo.

:: ── 4. Compilar ──
echo [4/5] Compilando proyecto...
cd /d "%APP_DIR%"

:: Limpiar cache de build anterior
if exist "%APP_DIR%\.next" (
    rmdir /S /Q "%APP_DIR%\.next" 2>nul
    echo       - Cache .next limpiado
)

call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] La compilacion fallo.
    echo         Revisa los errores arriba.
    echo         Las bases de datos NO fueron afectadas.
    pause
    exit /b 1
)
echo       - Build completado
echo.

:: ── 5. Reiniciar la aplicacion ──
echo [5/5] Iniciando aplicacion...
cd /d "%APP_DIR%"
call pm2 start ecosystem.config.js 2>nul
if %errorlevel% equ 0 (
    echo       - Aplicacion iniciada
    timeout /t 3 /nobreak >nul
    call pm2 status
) else (
    echo [ERROR] No se pudo iniciar con PM2
    echo         Intenta: pm2 start ecosystem.config.js
)

echo.
echo ========================================
echo   Actualizacion completada
echo ========================================
echo.
echo   Datos preservados (no tocados):
echo     - barcode_entries.db
echo     - multi_plant.db
echo     - data/employee-photos/
echo     - .env
echo.
echo   Respaldo en: %BACKUP_DIR%
echo.
pause
