@echo off
REM Lost Worlds Combat Game Launcher for Windows
REM Starts the development server and opens the browser

cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Starting Lost Worlds Combat Game...
echo.

REM Start the dev server
start "Lost Worlds Server" cmd /c "npm run dev"

REM Wait for server to start
timeout /t 3 /nobreak > nul

REM Open browser
start http://localhost:5173

echo.
echo ================================================================
echo           LOST WORLDS COMBAT GAME
echo ================================================================
echo   Server running at: http://localhost:5173
echo   Close the server window to stop
echo ================================================================
echo.

pause
