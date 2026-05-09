@echo off
chcp 65001 >nul
title 秘术对决 - 第 2 步：构建前端

echo =========================================
echo   第 2 步：构建前端（生成静态文件）
echo =========================================
echo.

cd /d "%~dp0\..\frontend"

echo [1/3] 安装 Node.js 依赖...
call npm install
if %errorlevel% neq 0 (
    echo [错误] npm install 失败
    pause
    exit /b 1
)

echo.
echo [2/3] 构建生产版本...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

echo.
echo [3/3] 复制到 Electron 目录...
if not exist "..\electron\renderer" mkdir "..\electron\renderer"
xcopy /E /Y "dist\*" "..\electron\renderer\"

echo.
echo [完成] 前端构建并复制完毕。
echo.
pause
