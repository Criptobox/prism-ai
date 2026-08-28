@echo off
rem Prism AI - instalador para Windows (doble clic)
rem Requiere Node.js 20.9+: https://nodejs.org
title Prism AI - Instalador
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [X] Node.js no encontrado.
  echo      Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)
node scripts\setup.mjs
echo.
pause
