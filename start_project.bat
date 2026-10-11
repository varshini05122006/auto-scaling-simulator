@echo off
set PY=python
python --version >nul 2>&1 || set PY=py
start "Backend" cmd /k "cd /d %~dp0backend && %PY% app.py"
start "Frontend" cmd /k "cd /d %~dp0frontend && %PY% -m http.server 5500"
timeout /t 3 >nul
start http://127.0.0.1:5500
