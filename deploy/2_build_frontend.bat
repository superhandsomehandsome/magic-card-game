@echo off
chcp 65001 >nul
title 秘术对决 - 第 2 步：构建前端

echo ╔═════════════════════════════════════════════╗
echo ║  第 2 步：构建前端到 frontend\dist          ║
echo ╚═════════════════════════════════════════════╝
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js！
    echo.
    echo 请先安装 Node.js（v18+）：
    echo     https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js 已安装：
node --version
echo.

cd /d "%~dp0\..\frontend"

if not exist node_modules (
    echo [安装] 首次运行，安装 npm 依赖（约 2-5 分钟）...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] npm install 失败
        pause
        exit /b 1
    )
)

echo [构建] 开始构建...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

echo.
echo [完成] 前端已构建到 frontend\dist
dir dist /b
echo.
pause
