const config = require('../config/backend');
function currentUser() { return null; }
function isConfigured() { return config.configured === true; }
async function signIn() {
  // Do not convert a wx.login temporary code into a fake authenticated account.
  const error = new Error('登录服务尚未接通，当前可使用访客记录。接入安全后端后才能验证微信身份。');
  error.code = 'BACKEND_NOT_CONNECTED';
  throw error;
}
async function updateProfile() { const error = new Error('资料保存服务尚未接通，未上传头像或昵称。'); error.code = 'BACKEND_NOT_CONNECTED'; throw error; }
function signOut() { getApp().globalData.user = null; }
module.exports = { currentUser, isConfigured, signIn, updateProfile, signOut };
