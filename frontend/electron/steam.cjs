/**
 * Steamworks 集成模块
 *
 * 需要:
 * 1. npm install steamworks.js
 * 2. 在 Steamworks 后台创建应用并获取 App ID
 * 3. 将 steam_appid.txt 放到构建输出根目录
 *
 * 当前为骨架代码，未安装 steamworks.js 时优雅降级。
 */

let steamClient = null;
let steamInitialized = false;

function initSteam(appId) {
  try {
    const steamworks = require('steamworks.js');
    steamClient = steamworks.init(appId);
    steamInitialized = true;
    console.log('[Steam] Initialized successfully. User:', getSteamUserName());
    return true;
  } catch (e) {
    console.warn('[Steam] Failed to initialize (Steam not running or steamworks.js not installed):', e.message);
    steamInitialized = false;
    return false;
  }
}

function isSteamRunning() {
  return steamInitialized && steamClient !== null;
}

function getSteamId() {
  if (!steamClient) return null;
  try {
    return steamClient.localplayer.getSteamId().steamId64.toString();
  } catch {
    return null;
  }
}

function getSteamUserName() {
  if (!steamClient) return null;
  try {
    return steamClient.localplayer.getName();
  } catch {
    return null;
  }
}

function activateAchievement(achievementId) {
  if (!steamClient) return false;
  try {
    steamClient.achievement.activate(achievementId);
    return true;
  } catch (e) {
    console.warn('[Steam] Achievement activation failed:', e.message);
    return false;
  }
}

function runCallbacks() {
  if (steamClient && typeof steamClient.runCallbacks === 'function') {
    steamClient.runCallbacks();
  }
}

module.exports = {
  initSteam,
  isSteamRunning,
  getSteamId,
  getSteamUserName,
  activateAchievement,
  runCallbacks,
};
