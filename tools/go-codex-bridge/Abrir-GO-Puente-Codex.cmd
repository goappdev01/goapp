@echo off
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0GO-Puente-Codex.ps1" -Accion Abrir
if errorlevel 1 pause
