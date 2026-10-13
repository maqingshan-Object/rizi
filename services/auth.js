const config = require('../config/backend');
const http = require('./http');

const USER_KEY = 'days_auth_user_v1';
const TOKEN_KEY = 'days_auth_access_token_v1';

function currentUser() {
  return wx.getStorageSync(USER_KEY) || null;
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
  wx.setStorageSync(TOKEN_KEY, response.accessToken);
  wx.setStorageSync(USER_KEY, response.user);
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
  wx.setStorageSync(USER_KEY, user);
  try { getApp().globalData.user = user; } catch (ignored) {}
  return user;
}

function signOut() {
  wx.removeStorageSync(USER_KEY);
  wx.removeStorageSync(TOKEN_KEY);
  try { getApp().globalData.user = null; } catch (ignored) {}
}

module.exports = { currentUser, isConfigured, signIn, updateProfile, signOut };
