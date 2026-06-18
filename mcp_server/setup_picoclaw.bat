@echo off
title FatLoss Picoclaw Setup

set "PDIR=%USERPROFILE%\.picoclaw"
set "PBIN=%PDIR%\picoclaw.exe"
set "DL=https://github.com/sipeed/picoclaw/releases/download/v0.2.9/picoclaw_Windows_x86_64.zip"
set "TZIP=%TEMP%\picoclaw_win.zip"

if exist "%PBIN%" (
    echo [OK] Picoclaw already installed: %PBIN%
    goto :deploy
)

echo [1/3] Downloading Picoclaw v0.2.9 ...
powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DL%' -OutFile '%TZIP%' }"
if %ERRORLEVEL% NEQ 0 (
    echo [FAIL] Download failed.
    echo Manual download: %DL%
    echo Extract picoclaw.exe to: %PDIR%
    pause
    exit /b 1
)
echo [OK] Downloaded

echo [2/3] Extracting to %PDIR% ...
if not exist "%PDIR%" mkdir "%PDIR%"
powershell -Command "Expand-Archive -Path '%TZIP%' -DestinationPath '%PDIR%' -Force"
del "%TZIP%" 2>nul
echo [OK] Extracted

:deploy
echo.
echo [3/3] Deploying FatLoss config ...
copy /Y "%~dp0picoclaw_config.json" "%PDIR%\config.json" >nul
echo [OK] Config deployed to %PDIR%\config.json

echo.
echo ============================================
echo   Setup Complete
echo ============================================
echo.
echo Next steps:
echo   1. Login:  "%PBIN%" auth weixin
echo   2. Scan QR code with WeChat
echo   3. Start:  "%~dp0start_fatloss.bat"
echo.
echo Then send meal descriptions via WeChat!
echo ============================================
pause
