const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '秘术对决：禁忌魔典',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#1a0b2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    // 启动时最大化，更像游戏
    show: false,
  });

  // 加载打包好的前端 HTML
  const indexPath = path.join(__dirname, 'renderer', 'index.html');
  win.loadFile(indexPath);

  // 窗口准备好再显示，避免白屏闪烁
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // 外部链接在系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
