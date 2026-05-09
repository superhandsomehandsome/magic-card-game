@echo off
chcp 65001 >nul
title 应用更新（在服务器上运行）

echo =========================================
echo  在服务器上运行这个脚本
echo  把 update_package.zip 的内容覆盖到当前目录
echo =========================================
echo.

cd /d "%~dp0\.."

if not exist "deploy\update_package.zip" (
    echo [错误] 找不到 deploy\update_package.zip
    echo 请先把 update_package.zip 放到 deploy 文件夹里
    pause
    exit /b 1
)

echo [1/3] 解压更新包...
if exist "_update_tmp" rmdir /s /q "_update_tmp"
powershell -Command "Expand-Archive -Path 'deploy\update_package.zip' -DestinationPath '_update_tmp' -Force"
if %errorlevel% neq 0 ( echo [错误] 解压失败 & pause & exit /b 1 )
echo [完成] 解压成功。
echo.

echo [2/3] 覆盖文件...
if exist "_update_tmp\dist" (
    if exist "frontend\dist" rmdir /s /q "frontend\dist"
    mkdir "frontend\dist"
    xcopy /E /Y "_update_tmp\dist\*" "frontend\dist\"
    echo [完成] 前端静态文件已更新。
)
if exist "_update_tmp\realtime_server.py" (
    copy /Y "_update_tmp\realtime_server.py" "realtime_server.py"
    echo [完成] 后端服务文件已更新。
)

rmdir /s /q "_update_tmp"
echo.

echo [3/3] 重启服务...
deploy\nssm.exe restart MagicCardGame
if %errorlevel% neq 0 (
    echo [提示] 服务重启失败，可能未安装为系统服务。
    echo 请手动关掉运行中的服务器窗口，再双击 3_run_server.bat 重新启动。
) else (
    echo [完成] 服务已重启！
)

echo.
echo =====================================================
echo  更新完成！访问 http://180.184.178.218/ 验证
echo =====================================================
echo.
pause
