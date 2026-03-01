@echo off
echo.
echo  =======================================
echo   DAREMAXXING - Starting Server...
echo  =======================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed!
    echo  Download it from: https://nodejs.org
    echo  Install it, then double-click this file again.
    pause
    exit
)

echo  Installing dependencies...
call npm install

echo.
echo  Starting server...
echo  Open your browser at: http://localhost:3000
echo.
start "" "http://localhost:3000"
node server.js
pause
