@echo off
title FatLoss WeChat Service

set "PBIN=%USERPROFILE%\.picoclaw\picoclaw.exe"
set "PCFG=%USERPROFILE%\.picoclaw\config.json"

if not exist "%PBIN%" (
    echo [ERROR] Picoclaw not installed. Run setup_picoclaw.bat first.
    pause
    exit /b 1
)

if not exist "%PCFG%" (
    echo [ERROR] Config not found: %PCFG%
    echo        Run setup_picoclaw.bat first.
    pause
    exit /b 1
)

echo ============================================
echo   FatLoss WeChat Service Starting ...
echo ============================================
echo.
echo Press Ctrl+C to stop.
echo.

set "DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE"
"%PBIN%" gateway

pause
