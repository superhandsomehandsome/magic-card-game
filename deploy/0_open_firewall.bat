@echo off
chcp 65001 >nul
title 秘术对决 - 开放防火墙端口

echo =========================================
echo   开放防火墙端口
echo =========================================
echo.

set PORT=80

echo [配置] 在 Windows 防火墙中开放端口 %PORT% (TCP 入站)...

netsh advfirewall firewall show rule name="MagicCardGame_TCP_%PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] 防火墙规则已存在，跳过。
) else (
    netsh advfirewall firewall add rule name="MagicCardGame_TCP_%PORT%" dir=in action=allow protocol=tcp localport=%PORT%
    if %errorlevel% neq 0 (
        echo [错误] 无法添加防火墙规则，请以管理员身份运行此脚本。
        pause
        exit /b 1
    )
    echo [OK] Windows 防火墙规则已添加：MagicCardGame_TCP_%PORT%
)

echo.
pause
