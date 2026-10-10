const auth = require('./services/auth');
const store = require('./services/events');
App({
  globalData: { user: null, theme: 'cream' },
  onLaunch() {
    this.globalData.theme = wx.getStorageSync('days_theme') || 'cream';
    this.globalData.user = auth.currentUser();
    store.initializeGuest();
  },
  onShow() { this.globalData.user = auth.currentUser(); }
});
