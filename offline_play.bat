@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [离线] 仅本机 127.0.0.1，不需要互联网。按 Ctrl+C 可结束服务器。
echo.
where py >nul 2>&1 && py -3 server.py --offline --open-browser && goto :end
python server.py --offline --open-browser
:end
if errorlevel 1 pause
