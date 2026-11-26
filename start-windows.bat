@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Rezie Live
where node >nul 2>nul || (echo Node.js neni nainstalovany. Stahni ho z https://nodejs.org a spust tento soubor znovu. & pause & exit /b)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node server.js
pause
