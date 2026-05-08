@echo off
chcp 65001 >nul
title 秘术对决 - 第 1 步：安装 Python

echo ╔═════════════════════════════════════════════╗
echo ║  第 1 步：检查 / 安装 Python                ║
echo ╚═════════════════════════════════════════════╝
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 未检测到 Python，需要安装。
    echo.
    echo 请打开浏览器访问：
    echo     https://www.python.org/downloads/
    echo.
    echo 下载并安装 Python 3.11 或更新版本。
    echo 安装时务必勾选 "Add Python to PATH"！
    echo.
    pause
    exit /b 1
)

echo [OK] Python 已安装：
python --version
echo.

echo ╔═════════════════════════════════════════════╗
echo ║  安装游戏依赖（python-socketio + aiohttp） ║
echo ╚═════════════════════════════════════════════╝
echo.

cd /d "%~dp0\.."
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo.
echo [完成] 依赖安装完毕。
echo.
pause
