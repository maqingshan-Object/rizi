const { prepare, notify } = require('../../utils/page');
const auth = require('../../services/auth');
const capsules = require('../../services/capsules');

Page({
  data: {
    theme: 'cream',
    logged: false,
    loading: true,
    error: '',
    openable: [],
    sealed: [],
    opened: [],
    counts: { sealed: 0, openable: 0, quota: 0, costSelf: 1, costGift: 2 }
  },

  onShow() {
    try { prepare(this, -1); } catch (error) { notify(error); }
    this.refresh();
  },

  refresh() {
    const logged = !!auth.currentUser();
    this.setData({ logged });
    if (!logged || !capsules.isReady()) {
      this.setData({ loading: false, openable: [], sealed: [], opened: [] });
      return;
    }
    this.setData({ loading: true, error: '' });
    capsules.list().then(result => {
      const all = (result && result.capsules) || [];
      this.setData({
        openable: all.filter(item => item.openable),
        sealed: all.filter(item => !item.openable && item.status === 'sealed'),
        opened: all.filter(item => item.status === 'opened'),
        counts: (result && result.counts) || this.data.counts,
        loading: false
      });
    }).catch(error => this.setData({ loading: false, error: (error && error.message) || '读取失败，稍后再试' }));
  },

  onWrite() {
    if (!this.data.logged) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.navigateTo({ url: '/pages/capsule-edit/capsule-edit?kind=self' });
  },

  onWriteGift() {
    // 送人消耗 2 个；额度不够就引导去商店，别让人白写
    if ((this.data.counts.quota || 0) < (this.data.counts.costGift || 2)) {
      wx.showModal({
        title: '这份心意已经用掉了',
        content: '送出一份心意需要 2 个时间胶囊，现在的额度不够了，可以去商店补充。',
        confirmText: '去商店', cancelText: '知道了',
        success: r => { if (r.confirm) wx.navigateTo({ url: '/pages/store/store' }); }
      });
      return;
    }
    wx.navigateTo({ url: '/pages/capsule-edit/capsule-edit?kind=gift' });
  },

  /** 自己写消耗 1 个 */
  hasSelfQuota() {
    return (this.data.counts.quota || 0) >= (this.data.counts.costSelf || 1);
  },

  onOpen(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: '启封这个胶囊',
      content: '打开后内容就会一直留着，可以做成卡片发给别人。',
      confirmText: '启封',
      success: r => {
        if (!r.confirm) return;
        capsules.open(id).then(() => {
          wx.showToast({ title: '已启封', icon: 'success' });
          this.refresh();
        }).catch(error => notify(error));
      }
    });
  },

  /** 封存中的点一下只提示，不给看内容（服务端也没下发）。 */
  onSealedTap(event) {
    const days = event.currentTarget.dataset.days;
    wx.showToast({ title: '还有 ' + days + ' 天才能打开', icon: 'none' });
  },

  onRead(event) {
    const item = this.data.opened.find(c => c.id === event.currentTarget.dataset.id);
    if (!item) return;
    wx.navigateTo({ url: '/pages/capsule-edit/capsule-edit?id=' + item.id });
  },

  onDelete(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这个胶囊',
      content: '删了就真的没了，也无法恢复。',
      confirmText: '删除', confirmColor: '#a7585b',
      success: r => {
        if (!r.confirm) return;
        capsules.remove(id).then(() => {
          wx.showToast({ title: '已删除', icon: 'none' });
          this.refresh();
        }).catch(error => notify(error));
      }
    });
  },

  onGiftRead() {
    wx.showToast({ title: '对方打开时会看到你的称呼', icon: 'none' });
  },

  /**
   * 把领取卡发出去：分享路径带领取码，对方打开就是「XX 给你留了一段话」。
   * ⚠️ 文案刻意不写"分享得奖励" —— 微信判定诱导分享会封号；
   *    这里是"把礼物发出去"，不是"分享换权益"。
   */
  onShareAppMessage(event) {
    const token = event && event.target && event.target.dataset ? event.target.dataset.token : '';
    const name = event && event.target && event.target.dataset ? event.target.dataset.name : '你';
    if (!token) {
      return { title: '日子绵绵 · 把重要的日子放在心上', path: '/pages/days/days' };
    }
    return {
      title: '给' + (name || '你') + '留了一段话，到那天才能打开',
      path: '/pages/capsule-gift/capsule-gift?token=' + token
    };
  }
});
