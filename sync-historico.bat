@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================================
::  Multiplant - Sync Histórico de todos los checadores
::  Autor: Humberto Alonso
::
::  Trae todo el histórico mes a mes desde FECHA_INICIO.
::  Usa INSERT OR IGNORE, así que NO duplica datos existentes.
::  Las bases de datos y fotos NO se pierden.
:: ============================================================

:: ── Configuración ──
set "APP_URL=http://localhost:3000"
set "FECHA_INICIO=2025-01-01"
set "FECHA_FIN=2026-02-11"

echo.
echo ========================================
echo   Multiplant - Sync Historico
echo ========================================
echo.
echo   Servidor:     %APP_URL%
echo   Rango:        %FECHA_INICIO% a %FECHA_FIN%
echo   Plantas:      Todas las activas
echo.
echo   Los datos existentes NO se pierden
echo   (INSERT OR IGNORE evita duplicados)
echo.
echo   Presiona cualquier tecla para iniciar...
pause >nul
echo.

:: ── Verificar que el servidor esté corriendo ──
echo [*] Verificando servidor...
curl -s -o nul -w "%%{http_code}" "%APP_URL%/api/plants" > "%TEMP%\mp_check.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\mp_check.txt"
del "%TEMP%\mp_check.txt" 2>nul

if "%HTTP_CODE%" neq "200" (
    echo.
    echo [ERROR] El servidor no responde en %APP_URL%
    echo         Asegurate de que la app este corriendo:
    echo           pm2 start ecosystem.config.js
    echo.
    pause
    exit /b 1
)
echo       Servidor OK
echo.

:: ── Generar rangos mensuales y sincronizar ──
:: Parseamos año y mes de inicio/fin
set "Y1=%FECHA_INICIO:~0,4%"
set "M1=%FECHA_INICIO:~5,2%"
:: Quitar cero inicial para aritmética
if "%M1:~0,1%"=="0" set "M1=%M1:~1%"

set "Y2=%FECHA_FIN:~0,4%"
set "M2=%FECHA_FIN:~5,2%"
if "%M2:~0,1%"=="0" set "M2=%M2:~1%"

set "SYNC_COUNT=0"
set "TOTAL_INSERTED=0"
set "TOTAL_FETCHED=0"
set "ERRORS=0"

set "CY=%Y1%"
set "CM=%M1%"

:LOOP
:: Construir fecha inicio del mes: YYYY-MM-01
if %CM% lss 10 (set "CM_PAD=0%CM%") else (set "CM_PAD=%CM%")
set "RANGE_START=%CY%-%CM_PAD%-01"

:: Calcular último día del mes
set /a "NEXT_M=%CM%+1"
set "NEXT_Y=%CY%"
if %NEXT_M% gtr 12 (
    set "NEXT_M=1"
    set /a "NEXT_Y=%CY%+1"
)
if %NEXT_M% lss 10 (set "NM_PAD=0%NEXT_M%") else (set "NM_PAD=%NEXT_M%")

:: Último día = día antes del 1ro del mes siguiente
:: Usamos node para calcular esto de forma precisa
for /f %%D in ('node -e "const d=new Date(%NEXT_Y%,%NEXT_M%-1,0);console.log(d.toISOString().split('T')[0])"') do set "RANGE_END=%%D"

:: No pasar de FECHA_FIN
node -e "process.exit(new Date('%RANGE_END%')>new Date('%FECHA_FIN%')?1:0)" 2>nul
if %errorlevel% equ 1 set "RANGE_END=%FECHA_FIN%"

:: No procesar si el rango ya pasó de FECHA_FIN
node -e "process.exit(new Date('%RANGE_START%')>new Date('%FECHA_FIN%')?1:0)" 2>nul
if %errorlevel% equ 1 goto DONE

set /a "SYNC_COUNT+=1"
echo [Sync %SYNC_COUNT%] %RANGE_START% a %RANGE_END% ...

:: Llamar al API sync-all
curl -s -X POST "%APP_URL%/api/plants/sync-all" ^
    -H "Content-Type: application/json" ^
    -d "{\"startDate\":\"%RANGE_START%\",\"endDate\":\"%RANGE_END%\"}" ^
    -o "%TEMP%\mp_sync_result.json" 2>nul

:: Parsear resultado con node
for /f "tokens=1,2,3,4 delims=|" %%A in ('node -e "try{const r=JSON.parse(require('fs').readFileSync(process.env.TEMP+'\\mp_sync_result.json','utf8'));if(r.success){const s=r.summary||{};console.log((s.totalInserted||0)+'|'+(s.totalFetched||0)+'|'+(s.plantsSuccess||0)+'|'+(s.plantsFailed||0))}else{console.log('0|0|0|ERR: '+r.error)}}catch(e){console.log('0|0|0|ERR: '+e.message)}"') do (
    set "INS=%%A"
    set "FETCH=%%B"
    set "P_OK=%%C"
    set "P_FAIL=%%D"
)

:: Verificar errores
echo %P_FAIL% | findstr /i "ERR" >nul
if %errorlevel% equ 0 (
    echo       [ERROR] %P_FAIL%
    set /a "ERRORS+=1"
) else (
    echo       Obtenidos: %FETCH%  Nuevos: %INS%  Plantas OK: %P_OK%  Fallidas: %P_FAIL%
    set /a "TOTAL_INSERTED+=%INS%"
    set /a "TOTAL_FETCHED+=%FETCH%"
    if "%P_FAIL%" neq "0" set /a "ERRORS+=%P_FAIL%"
)

del "%TEMP%\mp_sync_result.json" 2>nul

:: Avanzar al siguiente mes
set "CM=%NEXT_M%"
set "CY=%NEXT_Y%"
goto LOOP

:DONE
echo.
echo ========================================
echo   Sync Historico Completado
echo ========================================
echo.
echo   Meses procesados:    %SYNC_COUNT%
echo   Registros obtenidos: %TOTAL_FETCHED%
echo   Registros nuevos:    %TOTAL_INSERTED%
echo   Errores:             %ERRORS%
echo.
if %ERRORS% gtr 0 (
    echo   [AVISO] Hubo errores en algunas plantas/meses.
    echo           Puedes ejecutar este script de nuevo sin riesgo,
    echo           los datos existentes NO se duplican.
)
echo.
pause
