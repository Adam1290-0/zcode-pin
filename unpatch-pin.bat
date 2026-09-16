@echo off
setlocal enabledelayedexpansion
echo ============================================
echo ZCode Pin Unpatcher (surgical removal)
echo ============================================
tasklist /FI "IMAGENAME eq ZCode.exe" 2>nul | findstr /I /C:"ZCode.exe" >nul
if %errorlevel% equ 0 ( echo [ERROR] Close ZCode first & pause & exit /b 1 )

set "BASE=%~dp0"
set "ASAR_PATH=H:\Zcode\resources\app.asar"
set "ZCJS=H:\Zcode\resources\glm\zcode.cjs"
set "ASAR_PKG=@electron/asar@4.3.0"
set "WORK_DIR=%TEMP%\zpin-asar-rm"

echo [1/2] Removing pin require line from zcode.cjs...
python "%BASE%uninject-pin-wrapper.py" "%ZCJS%"
if errorlevel 1 ( echo [WARN] zcode.cjs cleanup failed - see message above )

echo [2/2] Removing pin UI block from app.asar (2-3 minutes)...
if exist "%WORK_DIR%" rmdir /S /Q "%WORK_DIR%" 2>nul
mkdir "%WORK_DIR%"
call npx --yes %ASAR_PKG% extract "%ASAR_PATH%" "%WORK_DIR%"
if !errorlevel! neq 0 ( echo [ERROR] extract failed & pause & exit /b 1 )
python "%BASE%uninject-pin-ui.py" "%WORK_DIR%\out"
if !errorlevel! neq 0 ( echo [ERROR] UI removal failed & pause & exit /b 1 )
call npx --yes %ASAR_PKG% pack "%WORK_DIR%" "%ASAR_PATH%.new" --unpack "*.{node,dll,exe}"
if !errorlevel! neq 0 ( echo [ERROR] test pack failed & pause & exit /b 1 )
del /F /Q "%ASAR_PATH%.new" >nul 2>&1
call npx --yes %ASAR_PKG% pack "%WORK_DIR%" "%ASAR_PATH%" --unpack "*.{node,dll,exe}"
if !errorlevel! neq 0 (
    echo [ERROR] repack failed. Restoring backup...
    if exist "%ASAR_PATH%.pinbak" copy /Y "%ASAR_PATH%.pinbak" "%ASAR_PATH%" >nul
    if exist "%ASAR_PATH%.unpacked.pinbak" (
        rmdir /S /Q "%ASAR_PATH%.unpacked" 2>nul
        xcopy "%ASAR_PATH%.unpacked.pinbak" "%ASAR_PATH%.unpacked" /E /I /Y >nul
    )
    rmdir /S /Q "%WORK_DIR%" 2>nul
    pause
    exit /b 1
)
rmdir /S /Q "%WORK_DIR%" 2>nul

echo.
echo [OK] Pin uninstalled. Pin data kept under %USERPROFILE%\.zcode\plugins\pin\ - delete manually if desired.
echo (.pinbak backups are only a fallback; other plugins' injections were preserved.)
pause