const auth = require('../services/auth');
function prepare(page, selected) {
  const theme = wx.getStorageSync('days_theme') || 'cream';
  page.setData({ theme, user: auth.currentUser(), guest: !auth.currentUser() });
  const app = getApp(); app.globalData.theme = theme; app.globalData.user = auth.currentUser();
  if (page.getTabBar && page.getTabBar()) page.getTabBar().setData({ selected, theme });
}
function login() { wx.navigateTo({ url: '/pages/login/login' }); }
function notify(error) { wx.showToast({ title: error && (error.message || error.errMsg) || '操作未完成，请稍后重试', icon: 'none', duration: 2600 }); }

/**
 * 让「日子」首页重新读取提醒状态。
 *
 * 为什么需要：表单保存后的授权是异步的 —— 首页早在授权完成之前就已经 onShow 过了，
 * 那条"还没开启提醒"的提示会停在过期状态，看起来像是同一个提醒让用户开了两次。
 */
function refreshDaysReminderNotice() {
  try {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const days = pages.filter(page => page && page.route === 'pages/days/days').pop();
    if (days && typeof days.refreshReminderNotice === 'function') days.refreshReminderNotice();
  } catch (ignored) {}
}

module.exports = { prepare, login, notify, refreshDaysReminderNotice };
