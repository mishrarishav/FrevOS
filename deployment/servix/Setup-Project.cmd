@echo off
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Setup-Connector.ps1"
echo.
pause
