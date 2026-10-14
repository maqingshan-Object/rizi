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
  try { getApp().globalData.user = null; } catch (ignored) {}
}

// 注册"静默重登"能力：http 层遇到 401/403（token 过期）时会调用它重新登录并重试。
// 云托管登录不弹任何授权窗，所以用户完全无感，不会再看到"云托管服务返回异常"。
http.setReauthenticator(() => signIn());

module.exports = { currentUser, isConfigured, signIn, updateProfile, signOut };
