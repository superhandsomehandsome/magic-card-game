@echo off
chcp 65001 >nul
title 打包更新包（在你自己电脑上运行）

echo =========================================
echo  在你自己电脑上运行这个脚本
echo  它会构建前端并打包成 update_package.zip
echo =========================================
echo.

cd /d "%~dp0\.."

echo [1/3] 构建前端...
cd frontend
call npm install
if %errorlevel% neq 0 ( echo [错误] npm install 失败 & pause & exit /b 1 )
call npm run build
if %errorlevel% neq 0 ( echo [错误] npm build 失败 & pause & exit /b 1 )
cd ..
echo [完成] 前端构建成功。
echo.

echo [2/3] 打包需要传输的文件...
if exist deploy\update_package.zip del deploy\update_package.zip

powershell -Command ^
  "Compress-Archive -Path @('frontend\dist', 'realtime_server.py') -DestinationPath 'deploy\update_package.zip' -Force"

echo [完成] 打包完成。
echo.

echo [3/3] 完成！
echo.
echo =====================================================
echo  打包文件位置: deploy\update_package.zip
echo  文件很小（通常 1-5 MB），传输很快
echo.
echo  接下来：
echo  1. 通过 RDP 文件共享把 update_package.zip 传到服务器
echo  2. 在服务器上运行 deploy\apply_update.bat
echo =====================================================
echo.
pause
