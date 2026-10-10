const { prepare, notify } = require('../../utils/page');

Page({
  data: { theme: 'cream', user: null, guest: true },

  onShow() {
    prepare(this, 2);
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1, fail: notify });
      return;
    }
    wx.switchTab({ url: '/pages/profile/profile', fail: notify });
  }
});
