// 登录态存储的唯一定义处。
// auth.js 负责写入，http.js 在收到 401/403 时需要清理它 —— 如果两边各写一份 key，
// 很容易改一处漏一处（历史上就出现过"token 过期后界面假装还登录着"的问题）。
const TOKEN_KEY = 'days_auth_access_token_v1';
const USER_KEY = 'days_auth_user_v1';

function token() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function user() {
  return wx.getStorageSync(USER_KEY) || null;
}

function save(accessToken, profile) {
  wx.setStorageSync(TOKEN_KEY, accessToken);
  wx.setStorageSync(USER_KEY, profile);
}

/** 只更新用户资料（改昵称/头像时用），不动 token。 */
function saveUser(profile) {
  wx.setStorageSync(USER_KEY, profile);
}

function clear() {
  try { wx.removeStorageSync(TOKEN_KEY); } catch (ignored) {}
  try { wx.removeStorageSync(USER_KEY); } catch (ignored) {}
}

module.exports = { TOKEN_KEY, USER_KEY, token, user, save, saveUser, clear };
