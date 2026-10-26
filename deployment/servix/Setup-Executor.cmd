@echo off
powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File "%~dp0Setup-Executor.ps1"
pause
