@echo off
chcp 65001 >nul
cls

:: 调用 PowerShell 实时监听脚本
powershell.exe -ExecutionPolicy Bypass -File "%~dp0auto-deploy.ps1"