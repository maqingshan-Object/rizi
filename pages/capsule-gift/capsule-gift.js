const { prepare, notify } = require('../../utils/page');
const auth = require('../../services/auth');
const capsules = require('../../services/capsules');

/**
 * 领取卡落地页 —— 收到卡片的人打开的页面。
 *
 * ⚠️ 这里是整个传播链路的第一印象，两条底线：
 *   1. 【免登录】就能看（门槛越低传得越远），只有"收下"才要登录；
 *   2. 未到启封日**【只给倒计时，不给正文】**（服务端也没下发）。
 */
Page({
  data: {
    theme: 'cream',
    loading: true,
    error: '',
    gift: null,
    canClaim: false,
    claiming: false
  },

  onLoad(options) {
    try { prepare(this, -1); } catch (error) { notify(error); }
    this._token = options && options.token ? String(options.token) : '';
    if (!this._token) {
      this.setData({ loading: false, error: '这个链接不完整' });
      return;
    }
    this.load();
  },

  load() {
    capsules.giftView(this._token).then(gift => {
      this.setData({ gift, loading: false, error: '', canClaim: !!gift && gift.openable });
    }).catch(error => {
      this.setData({ loading: false, error: (error && error.message) || '这张领取卡已经失效了' });
    });
  },

  onClaim() {
    if (this.data.claiming) return;
    if (!auth.currentUser()) {
      wx.showModal({
        title: '登录后收下',
        content: '收下之后它会留在你的时间胶囊里，到期也能收到提醒。',
        confirmText: '去登录',
        success: r => { if (r.confirm) wx.navigateTo({ url: '/pages/login/login' }); }
      });
      return;
    }
    this.setData({ claiming: true });
    capsules.requestReminderAuth().then(() => capsules.claim(this._token)).then(result => {
      this.setData({ claiming: false });
      wx.showModal({
        title: '收下了',
        content: (result && result.message) || '已经放进你的时间胶囊里了',
        showCancel: false,
        confirmText: '去看看',
        success: () => wx.navigateTo({ url: '/pages/capsules/capsules' })
      });
    }).catch(error => {
      this.setData({ claiming: false });
      notify(error);
    });
  },

  /** 收下之后，她也可以把这份心意传下去（内置的增长闭环）。 */
  onShareAppMessage() {
    return {
      title: '有人给你留了一段话，到那天才能打开',
      path: '/pages/capsule-gift/capsule-gift?token=' + this._token,
      imageUrl: '/assets/capsule-gift-cover.png'
    };
  },

  onWrite() {
    wx.navigateTo({ url: '/pages/capsule-edit/capsule-edit?kind=gift' });
  },

  onHome() {
    wx.switchTab({ url: '/pages/days/days' });
  }
});
