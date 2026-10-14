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
    counts: { sealed: 0, openable: 0, selfQuota: 0, giftQuota: 0 }
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
    if (!this.data.counts.giftQuota) {
      wx.showModal({
        title: '这份心意已经用掉了',
        content: '想再送一个人，可以去商店买一份送人胶囊。',
        confirmText: '去商店', cancelText: '知道了',
        success: r => { if (r.confirm) wx.navigateTo({ url: '/pages/store/store' }); }
      });
      return;
    }
    wx.navigateTo({ url: '/pages/capsule-edit/capsule-edit?kind=gift' });
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
  }
});
