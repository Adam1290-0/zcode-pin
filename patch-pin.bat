@echo off
setlocal enabledelayedexpansion

echo ============================================
echo ZCode Pin Patcher
echo ============================================
echo.

tasklist /FI "IMAGENAME eq ZCode.exe" 2>nul | findstr /I /C:"ZCode.exe" >nul
if %errorlevel% equ 0 (
    echo [ERROR] ZCode is still running! Please close ZCode completely and try again.
    pause
    exit /b 1
)

set "BASE=%~dp0"
set "ASAR_PATH=H:\Zcode\resources\app.asar"
set "ASAR_BACKUP=%ASAR_PATH%.pinbak"
set "UNPACKED_PATH=%ASAR_PATH%.unpacked"
set "UNPACKED_BACKUP=%UNPACKED_PATH%.pinbak"
set "UI_JS=%BASE%ui_pin.js"
set "TOKEN_FILE=%USERPROFILE%\.zcode\plugins\pin\auth-token"
set "INJECT_UI_PY=%BASE%inject-pin-ui.py"
set "INJECT_WRAPPER_PY=%BASE%inject-pin-wrapper.py"
set "ASAR_PKG=@electron/asar@4.3.0"
set "WORK_DIR=%TEMP%\zpin-asar"

if not exist "%ASAR_PATH%" ( echo [ERROR] app.asar not found & pause & exit /b 1 )
if not exist "%UI_JS%" ( echo [ERROR] ui_pin.js not found & pause & exit /b 1 )

echo [1/5] Injecting pin wrapper into zcode.cjs...
python "%INJECT_WRAPPER_PY%"
if !errorlevel! neq 0 ( echo [ERROR] wrapper injection failed & pause & exit /b 1 )

for %%A in ("%ASAR_PATH%") do set CUR_SIZE=%%~zA
set REFRESH=1
if exist "%ASAR_BACKUP%" (
    for %%B in ("%ASAR_BACKUP%") do set BAK_SIZE=%%~zB
    if !BAK_SIZE! equ !CUR_SIZE! set REFRESH=0
)
if !REFRESH! equ 1 (
    echo [2/5] Saving asar backup...
    copy /Y "%ASAR_PATH%" "%ASAR_BACKUP%" >nul
    if exist "%UNPACKED_PATH%" (
        if exist "%UNPACKED_BACKUP%" rmdir /S /Q "%UNPACKED_BACKUP%" 2>nul
        xcopy "%UNPACKED_PATH%" "%UNPACKED_BACKUP%" /E /I /Y >nul
    )
) else (
    echo [2/5] Backup already current, skip.
)

echo [3/5] Extracting current asar (preserves existing injections; 2-3 minutes)...
if exist "%WORK_DIR%" rmdir /S /Q "%WORK_DIR%" 2>nul
mkdir "%WORK_DIR%"
call npx --yes %ASAR_PKG% extract "%ASAR_PATH%" "%WORK_DIR%"
if !errorlevel! neq 0 ( echo [ERROR] asar extract failed & pause & exit /b 1 )

echo [4/5] Injecting pin UI into renderer/index.html...
python "%INJECT_UI_PY%" "%WORK_DIR%\out" "%UI_JS%" "%TOKEN_FILE%"
if !errorlevel! neq 0 ( echo [ERROR] UI injection failed. Run unpatch-pin.bat to roll back the wrapper step. & pause & exit /b 1 )

echo [5/5] Repacking asar (test-pack to .new first, 2-3 minutes)...
call npx --yes %ASAR_PKG% pack "%WORK_DIR%" "%ASAR_PATH%.new" --unpack "*.{node,dll,exe}"
if !errorlevel! neq 0 (
    echo [ERROR] Test repack failed. Nothing was modified.
    rmdir /S /Q "%WORK_DIR%" 2>nul
    pause
    exit /b 1
)
del /F /Q "%ASAR_PATH%.new" >nul 2>&1
call npx --yes %ASAR_PKG% pack "%WORK_DIR%" "%ASAR_PATH%" --unpack "*.{node,dll,exe}"
if !errorlevel! neq 0 (
    echo [ERROR] Repacking failed. Restoring backup...
    copy /Y "%ASAR_BACKUP%" "%ASAR_PATH%" >nul
    if exist "%UNPACKED_BACKUP%" (
        rmdir /S /Q "%UNPACKED_PATH%" 2>nul
        xcopy "%UNPACKED_BACKUP%" "%UNPACKED_PATH%" /E /I /Y >nul
    )
    rmdir /S /Q "%WORK_DIR%" 2>nul
    pause
    exit /b 1
)
rmdir /S /Q "%WORK_DIR%" 2>nul

echo.
echo [SUCCESS] Pin patched! Restart ZCode; the pin icon appears near the composer.
echo Re-run this after every ZCode upgrade. To revert: run unpatch-pin.bat
pause