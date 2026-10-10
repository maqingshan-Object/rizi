const auth = require('../services/auth');
function prepare(page, selected) {
  const theme = wx.getStorageSync('days_theme') || 'cream';
  page.setData({ theme, user: auth.currentUser(), guest: !auth.currentUser() });
  const app = getApp(); app.globalData.theme = theme; app.globalData.user = auth.currentUser();
  if (page.getTabBar && page.getTabBar()) page.getTabBar().setData({ selected, theme });
}
function login() { wx.navigateTo({ url: '/pages/login/login' }); }
function notify(error) { wx.showToast({ title: error && (error.message || error.errMsg) || '操作未完成，请稍后重试', icon: 'none', duration: 2600 }); }
module.exports = { prepare, login, notify };
