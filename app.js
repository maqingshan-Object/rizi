const auth = require('./services/auth');
const store = require('./services/events');
const config = require('./config/backend');

App({
  globalData: { user: null, theme: 'cream' },
  onLaunch() {
    this.globalData.theme = wx.getStorageSync('days_theme') || 'cream';
    this.globalData.user = auth.currentUser();
    store.initializeGuest();
    this.initCloudContainer();
  },
  onShow() { this.globalData.user = auth.currentUser(); },

  /**
   * 使用 wx.cloud.callContainer 前必须先 init，全局执行一次即可。
   * 只有配置了云托管环境 ID 时才初始化，避免访客模式报错。
   */
  initCloudContainer() {
    if (config.mode !== 'container' || !config.cloudEnv) return;
    if (!wx.cloud || typeof wx.cloud.init !== 'function') return;
    try {
      wx.cloud.init({ env: config.cloudEnv, traceUser: true });
      this.globalData.containerReady = true;
    } catch (error) {
      this.globalData.containerReady = false;
    }
  }
});
