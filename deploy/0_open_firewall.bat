@echo off
chcp 65001 >nul
title 秘术对决 - 开放 Windows 防火墙端口

REM ─────────────────────────────────────────
REM  在本机 Windows 防火墙中开放游戏端口
REM  (服务器外的网络/路由器防火墙需要管理员另外开放)
REM ─────────────────────────────────────────

set PORT=80

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 请右键此 .bat 文件，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo [配置] 在 Windows 防火墙中开放端口 %PORT% (TCP 入站)...

REM 删除旧规则（如有）
netsh advfirewall firewall delete rule name="MagicCardGame_TCP_%PORT%" >nul 2>&1

REM 添加新规则
netsh advfirewall firewall add rule ^
    name="MagicCardGame_TCP_%PORT%" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=%PORT% ^
    description="秘术对决游戏服务器入站端口"

if %errorlevel% equ 0 (
    echo [OK] Windows 防火墙规则已添加：MagicCardGame_TCP_%PORT%
) else (
    echo [错误] 添加防火墙规则失败
)

echo.
pause
