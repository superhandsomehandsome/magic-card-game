@echo off
chcp 65001 >nul
title 秘术对决 - 安装为 Windows 服务（开机自启）

REM ─────────────────────────────────────────────
REM  把游戏服务器装成 Windows 系统服务
REM  这样：1) 开机自启 2) 后台运行 3) 崩溃自动重启
REM  需要管理员权限运行此脚本（右键 → 以管理员身份运行）
REM ─────────────────────────────────────────────

set PORT=80
set SERVICE_NAME=MagicCardGame

REM 检查是否管理员
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 请右键此 .bat 文件，选择"以管理员身份运行"
    pause
    exit /b 1
)

cd /d "%~dp0"

REM 检查 NSSM 是否已下载
if not exist nssm.exe (
    echo [下载] 首次运行，下载 NSSM 服务管理器...
    powershell -Command "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile 'nssm.zip'"
    if not exist nssm.zip (
        echo [错误] 下载 NSSM 失败。请手动下载 https://nssm.cc/download
        echo 把 nssm-2.24\win64\nssm.exe 复制到 deploy\nssm.exe
        pause
        exit /b 1
    )
    powershell -Command "Expand-Archive -Path 'nssm.zip' -DestinationPath '.\nssm-temp' -Force"
    copy /Y "nssm-temp\nssm-2.24\win64\nssm.exe" "nssm.exe" >nul
    rmdir /S /Q nssm-temp >nul 2>&1
    del nssm.zip >nul 2>&1
    echo [OK] NSSM 已就绪
)

REM 找到 python 完整路径
for /f "delims=" %%i in ('where python') do set PYTHON_EXE=%%i & goto :found_python
:found_python
echo [Python] %PYTHON_EXE%

REM 卸载旧服务（如果存在）
nssm.exe stop %SERVICE_NAME% >nul 2>&1
nssm.exe remove %SERVICE_NAME% confirm >nul 2>&1

REM 计算游戏根目录绝对路径
set GAME_ROOT=%~dp0..
for %%I in ("%GAME_ROOT%") do set GAME_ROOT=%%~fI

echo [安装] 创建服务 %SERVICE_NAME%...
nssm.exe install %SERVICE_NAME% "%PYTHON_EXE%" "realtime_server.py"
nssm.exe set %SERVICE_NAME% AppDirectory "%GAME_ROOT%"
nssm.exe set %SERVICE_NAME% AppEnvironmentExtra PORT=%PORT%
nssm.exe set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm.exe set %SERVICE_NAME% AppStdout "%GAME_ROOT%\deploy\server.log"
nssm.exe set %SERVICE_NAME% AppStderr "%GAME_ROOT%\deploy\server.log"
nssm.exe set %SERVICE_NAME% AppRotateFiles 1
nssm.exe set %SERVICE_NAME% AppRotateBytes 10485760
nssm.exe set %SERVICE_NAME% Description "秘术对决：禁忌魔典 联机服务器"

echo [启动] 启动服务...
nssm.exe start %SERVICE_NAME%

echo.
echo ╔═════════════════════════════════════════════╗
echo ║  服务安装完成！                              ║
echo ║                                              ║
echo ║  游戏访问地址：http://本机IP:%PORT%/           ║
echo ║                                              ║
echo ║  常用命令：                                  ║
echo ║    deploy\nssm.exe start   MagicCardGame    ║
echo ║    deploy\nssm.exe stop    MagicCardGame    ║
echo ║    deploy\nssm.exe restart MagicCardGame    ║
echo ║    deploy\nssm.exe remove  MagicCardGame   ║
echo ║                                              ║
echo ║  查看日志：deploy\server.log                ║
echo ╚═════════════════════════════════════════════╝
echo.
pause
