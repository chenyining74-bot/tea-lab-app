@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "NODE_HOME=D:\"
set "PATH=%NODE_HOME%;%PATH%"

cd /d "%PROJECT_DIR%"

if /I "%~1"=="--check" goto check

echo [Tea Lab App] Starting development server...
echo Project: %PROJECT_DIR%
echo.
call npm.cmd run dev
goto end

:check
echo [Tea Lab App] Environment check
where node
where npm
node -v
npm -v
goto end

:end
endlocal
