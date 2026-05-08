# 秘术对决：禁忌魔典 — 自建服务器部署指南

## 适用场景

把游戏部署到你自己的 Windows Server 上，**不再依赖 Render 云服务**。

部署后访问方式：
```
http://服务器IP:端口/
例如：http://180.184.178.218/
```

---

## 第 0 步：先确认这些信息

- [ ] 服务器系统：**Windows Server**（管理员账号 administrator）
- [ ] 服务器外网 IP：**180.184.178.218**
- [ ] 已开放的入站端口：**?（先问服务器管理员）**

---

## 第 1 步：登录服务器

在你自己的电脑上：
1. 按 `Win + R` → 输入 `mstsc` → 回车
2. 计算机：`180.184.178.218`
3. 用户名：`administrator`
4. 密码：（你已经有的）

成功登录后，就像操作普通电脑一样操作这台服务器。

---

## 第 2 步：把游戏代码下载到服务器

在服务器上打开浏览器（自带 Edge）：

**方式 A：直接下载 ZIP（最简单）**
1. 访问 https://github.com/superhandsomehandsome/magic-card-game
2. 点 `Code` → `Download ZIP`
3. 下载到 `C:\Users\administrator\Desktop\magic-card`
4. 解压

**方式 B：用 git 克隆（如果服务器装了 git）**
```powershell
cd C:\Users\administrator\Desktop
git clone https://github.com/superhandsomehandsome/magic-card-game.git magic-card
```

---

## 第 3 步：装 Node.js 和 Python

### 3.1 装 Python（用于运行后端）

1. 服务器浏览器打开 https://www.python.org/downloads/
2. 下载 Python 3.11+ 的 Windows installer
3. **安装时一定勾选 "Add Python to PATH"**
4. 完成

### 3.2 装 Node.js（用于构建前端）

1. 服务器浏览器打开 https://nodejs.org/
2. 下载 LTS 版本的 Windows Installer
3. 一路 Next 默认安装
4. 完成

### 3.3 验证

打开 PowerShell（按 Win + X → Windows PowerShell）：
```powershell
python --version    # 应该显示 Python 3.11.x
node --version      # 应该显示 v20.x.x
```

---

## 第 4 步：执行部署脚本

进入游戏代码目录：
```powershell
cd C:\Users\administrator\Desktop\magic-card
```

按顺序双击运行 `deploy\` 目录下的 .bat：

### 4.1 — `0_open_firewall.bat`（**右键 → 以管理员身份运行**）
作用：在 Windows 防火墙开放端口 80（默认）

> ⚠️ 如果管理员告诉你只能用 8080 或 10000，先编辑这个 .bat 文件，把 `set PORT=80` 改成对应端口。

### 4.2 — `1_install_python.bat`（双击）
作用：安装 Python 依赖（python-socketio + aiohttp）

### 4.3 — `2_build_frontend.bat`（双击）
作用：构建前端到 `frontend/dist/`，约 2-5 分钟

### 4.4 选一种运行方式：

#### 选项 A：临时运行（关掉窗口就停）

双击 `3_run_server.bat`，看到日志：
```
Starting realtime server on port 80
```
保持窗口开着即可访问。

#### 选项 B：装成系统服务（推荐，开机自启 + 后台 + 自动重启）

**右键 `4_install_service.bat` → 以管理员身份运行**

完成后：
- 服务自动启动
- 关机重启后自动运行
- 崩溃了自动拉起来
- 日志写入 `deploy\server.log`

---

## 第 5 步：验证

### 5.1 在服务器自己访问

服务器浏览器打开：
```
http://localhost/
```
看到游戏首页 → 后端正常。

### 5.2 用别的电脑访问

任何能上网的电脑浏览器：
```
http://180.184.178.218/
```
看到游戏首页 → 外网访问正常。

如果打不开，检查：
- 服务器管理员是否开了对应端口
- Windows 防火墙规则是否已加（`0_open_firewall.bat` 是否运行成功）
- 服务是否在跑（任务管理器看 `python.exe`）

---

## 端口选择说明

| 端口 | 访问 URL | 优劣 |
|---|---|---|
| **80** | `http://180.184.178.218/` | 最干净，不用加端口号 |
| **8080** | `http://180.184.178.218:8080/` | 备选 |
| **10000** | `http://180.184.178.218:10000/` | 不太常用，但通常没冲突 |

如果改端口，需要修改：
- `deploy/0_open_firewall.bat` 顶部 `set PORT=`
- `deploy/3_run_server.bat` 顶部 `set PORT=`
- `deploy/4_install_service.bat` 顶部 `set PORT=`

---

## 常用运维命令

打开管理员 PowerShell：

```powershell
cd C:\Users\administrator\Desktop\magic-card

# 启动服务
.\deploy\nssm.exe start MagicCardGame

# 停止服务
.\deploy\nssm.exe stop MagicCardGame

# 重启服务（如改了代码后）
.\deploy\nssm.exe restart MagicCardGame

# 卸载服务
.\deploy\nssm.exe remove MagicCardGame confirm

# 查看实时日志
Get-Content .\deploy\server.log -Wait -Tail 50
```

---

## 代码更新流程

每次你在自己电脑改了代码：

1. `git push` 到 GitHub
2. 服务器 PowerShell：
   ```powershell
   cd C:\Users\administrator\Desktop\magic-card
   git pull
   .\deploy\2_build_frontend.bat
   .\deploy\nssm.exe restart MagicCardGame
   ```

---

## 故障排查

### ❌ "python 不是内部或外部命令"
→ Python 安装时没勾 PATH。重新安装时勾选 "Add Python to PATH"。

### ❌ 端口 80 被占用
→ 服务器上可能跑着 IIS 或别的 Web 服务。换 8080 或 10000。检查命令：
```powershell
netstat -ano | findstr :80
```

### ❌ 外网打不开但 localhost 能打开
→ 1) 检查 Windows 防火墙；2) 联系服务器管理员确认端口已开放

### ❌ 玩家进入游戏后联机一直转圈
→ Socket.IO 没连上。F12 看 Console 报错。常见是连到了 Render 旧地址，需要清缓存。

---

## 卸载（不要游戏服务器了）

管理员 PowerShell：
```powershell
cd C:\Users\administrator\Desktop\magic-card
.\deploy\nssm.exe stop MagicCardGame
.\deploy\nssm.exe remove MagicCardGame confirm
netsh advfirewall firewall delete rule name="MagicCardGame_TCP_80"
```
然后删除 `magic-card` 文件夹即可。
