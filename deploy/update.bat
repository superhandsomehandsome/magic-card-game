@echo off
chcp 65001 >nul
title 秘术对决 - 一键更新部署

echo ╔═════════════════════════════════════════════╗
echo ║  秘术对决 — 一键更新                         ║
echo ║  从 GitHub 拉取最新代码并重启服务             ║
echo ╚═════════════════════════════════════════════╝
echo.

cd /d "%~dp0\.."

echo [1/3] 从 GitHub 拉取最新代码...
git pull
if %errorlevel% neq 0 (
    echo.
    echo [错误] git pull 失败。请检查：
    echo   - 服务器能访问 GitHub
    echo   - 代码目录是否正确: %cd%
    pause
    exit /b 1
)
echo [成功] 代码已更新。
echo.

echo [2/3] 构建前端...
cd frontend
call npm install --silent
if %errorlevel% neq 0 (
    echo [错误] npm install 失败
    pause
    exit /b 1
)
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端构建失败
    pause
    exit /b 1
)
cd ..
echo [成功] 前端构建完毕。
echo.

echo [3/3] 重启游戏服务...
deploy\nssm.exe restart MagicCardGame
if %errorlevel% neq 0 (
    echo [提示] 服务重启失败（可能服务未安装，尝试直接运行服务器）
    echo 如果你是临时运行模式，请手动关掉旧的窗口再运行 3_run_server.bat
) else (
    echo [成功] 服务已重启。
)
echo.

echo ╔═════════════════════════════════════════════╗
echo ║  更新完成！访问 http://180.184.178.218/      ║
echo ╚═════════════════════════════════════════════╝
echo.
pause
