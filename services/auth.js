const config = require('../config/backend');
const http = require('./http');
const session = require('./session');

function currentUser() {
  return session.user();
}

function isConfigured() {
  return http.isBackendReady();
}

function setSession(response) {
  if (!response || !response.accessToken || !response.user) {
    const error = new Error('登录服务返回的数据无效，未建立账号。');
    error.code = 'INVALID_AUTH_RESPONSE';
    throw error;
  }
  session.save(response.accessToken, response.user);
  try { getApp().globalData.user = response.user; } catch (ignored) {}
  return response.user;
}

async function signIn() {
  if (!isConfigured()) {
    const error = new Error('登录服务尚未配置，当前只能使用访客记录。');
    error.code = 'BACKEND_NOT_CONFIGURED';
    throw error;
  }

  // 微信云托管内网调用会自动带上 X-WX-OPENID，后端无需再用 code 换 openid。
  if (http.containerReady()) {
    return setSession(await http.post('/api/auth/cloudrun/login', {}));
  }

  const login = await new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });
  if (!login.code) {
    const error = new Error('微信未返回登录凭证，请稍后重试。');
    error.code = 'WECHAT_LOGIN_NO_CODE';
    throw error;
  }
  return setSession(await http.post('/api/auth/wechat/login', { code: login.code }));
}

async function updateProfile({ nickname, avatarUrl }) {
  if (!currentUser()) {
    const error = new Error('尚未登录，不能保存账号资料。');
    error.code = 'UNAUTHORIZED';
    throw error;
  }
  const user = await http.post('/api/auth/profile', { nickname, avatarUrl });
  session.saveUser(user);
  try { getApp().globalData.user = user; } catch (ignored) {}
  return user;
}

function signOut() {
  session.clear();
  // 本机头像属于个人资料，退出账号时一并清掉，避免下一个账号看到别人的头像。
  clearLocalAvatar();
  try { getApp().globalData.user = null; } catch (ignored) {}
}

const AVATAR_KEY = 'days_profile_avatar_v1';

/** 本机保存的头像文件路径（微信头像选择器给的是临时文件，必须落盘后才能长期显示）。 */
function localAvatar() {
  return wx.getStorageSync(AVATAR_KEY) || '';
}

function clearLocalAvatar() {
  try { wx.removeStorageSync(AVATAR_KEY); } catch (ignored) {}
}

/**
 * 把微信头像选择器返回的临时文件落成本机永久文件。
 *
 * 为什么必须落盘：<button open-type="chooseAvatar"> 给的是 wxfile://tmp_xxx 临时路径，
 * 小程序重启或过一段时间后就会失效 —— 表现出来就是"头像变成灰色空白"。
 */
function persistAvatar(tempFilePath) {
  return new Promise(resolve => {
    if (!tempFilePath) {
      resolve({ ok: false, code: 'EMPTY_PATH', message: '没有拿到图片，请重新选择头像。' });
      return;
    }
    if (/^wxfile:\/\/usr/i.test(tempFilePath)) {
      wx.setStorageSync(AVATAR_KEY, tempFilePath);
      resolve({ ok: true, path: tempFilePath });
      return;
    }
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.saveFile !== 'function') {
      wx.setStorageSync(AVATAR_KEY, tempFilePath);
      resolve({ ok: true, path: tempFilePath, degraded: true });
      return;
    }
    fs.saveFile({
      tempFilePath,
      success: result => {
        const savedPath = result && result.savedFilePath ? result.savedFilePath : tempFilePath;
        wx.setStorageSync(AVATAR_KEY, savedPath);
        resolve({ ok: true, path: savedPath });
      },
      fail: error => resolve({ ok: false, code: 'SAVE_FILE_FAILED', message: '头像保存到本机失败，请重试。', cause: error })
    });
  });
}

/**
 * 尝试把本机头像上传到云存储，拿到可跨设备显示的 fileID。
 * 云存储未开通或上传失败都只是回退到本机路径，不影响使用。
 */
function uploadAvatar(localPath) {
  return new Promise(resolve => {
    if (!localPath || !wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
      resolve({ ok: false, code: 'CLOUD_UNAVAILABLE' });
      return;
    }
    const user = currentUser();
    const suffix = (String(localPath).split('.').pop() || 'png').toLowerCase().slice(0, 4);
    const cloudPath = `avatars/${(user && user.id) || 'unknown'}-${Date.now()}.${suffix}`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath: localPath,
      success: result => resolve({ ok: !!(result && result.fileID), fileId: result && result.fileID }),
      fail: error => resolve({ ok: false, code: 'CLOUD_UPLOAD_FAILED', cause: error })
    });
  });
}

/** 只有真正可跨设备的地址（https 或云存储 fileID）才值得写给服务端。 */
function isRemoteAvatar(path) {
  return /^(https?:|cloud:)/i.test(String(path || ''));
}

// 注册"静默重登"能力：http 层遇到 401/403（token 过期）时会调用它重新登录并重试。
// 云托管登录不弹任何授权窗，所以用户完全无感，不会再看到"云托管服务返回异常"。
http.setReauthenticator(() => signIn());

module.exports = {
  currentUser, isConfigured, signIn, updateProfile, signOut,
  localAvatar, clearLocalAvatar, persistAvatar, uploadAvatar, isRemoteAvatar
};
