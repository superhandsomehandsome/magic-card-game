@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ╔══════════════════════════════════════════════╗
echo ║     秘术对决 · 局域网双人对战               ║
echo ╚══════════════════════════════════════════════╝
echo.
echo  [准备] 请确保两台设备连在同一个 WiFi / 热点
echo.

set "LAN_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    if not defined LAN_IP (
        for /f "tokens=*" %%b in ("%%a") do set "LAN_IP=%%b"
    )
)

if not defined LAN_IP (
    echo  [!] 未检测到局域网 IP，请确认已连接 WiFi 或已开热点
    echo      将以 127.0.0.1 启动（仅本机可用）
    set "LAN_IP=127.0.0.1"
)

echo  ┌─────────────────────────────────────────────┐
echo  │  告诉你的朋友，在浏览器输入：               │
echo  │                                             │
echo  │    http://%LAN_IP%:5000                     │
echo  │                                             │
echo  │  然后创建房间，把 4 位房号告诉对方          │
echo  └─────────────────────────────────────────────┘
echo.
echo  按 Ctrl+C 可结束服务器
echo.

where py >nul 2>&1 && (
    py -3 server.py --open-browser
    goto :end
)
python server.py --open-browser

:end
if errorlevel 1 pause
