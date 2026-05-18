const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { initSteam, runCallbacks, isSteamRunning } = require('./steam.cjs');

// Steam App ID — 替换为你在 Steamworks 后台创建的 App ID
const STEAM_APP_ID = parseInt(process.env.STEAM_APP_ID || '480', 10); // 480 = Spacewar (测试用)

let mainWindow;
let steamCallbackInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: '秘术对决',
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
    backgroundColor: '#0a0014',
  });

  // 生产环境加载打包后的文件，开发环境连 vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 尝试初始化 Steam（非阻断性：Steam 不可用时游戏仍可运行）
initSteam(STEAM_APP_ID);
if (isSteamRunning()) {
  steamCallbackInterval = setInterval(runCallbacks, 1000);
}

// CSP: 限制可加载资源，仅允许自身和游戏服务器
app.on('ready', () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "connect-src 'self' https://magic-card.onrender.com wss://magic-card.onrender.com ws://localhost:* http://localhost:*; " +
          "script-src 'self' 'unsafe-inline'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data:; " +
          "font-src 'self' https://fonts.gstatic.com;"
        ],
      },
    });
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (steamCallbackInterval) clearInterval(steamCallbackInterval);
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
