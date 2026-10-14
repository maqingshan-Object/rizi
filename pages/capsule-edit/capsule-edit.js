const { prepare, notify } = require('../../utils/page');
const capsules = require('../../services/capsules');
const dates = require('../../utils/date');

Page({
  data: {
    theme: 'cream',
    mode: 'write',          // write 写新的 ｜ read 启封后只读
    kind: 'self',           // self 自用 ｜ gift 送人
    title: '',
    content: '',
    openOn: '',
    recipient: '',
    minDate: '',
    loaded: null,
    saving: false,
    error: ''
  },

  onLoad(options) {
    try { prepare(this, -1); } catch (error) { notify(error); }
    const id = options && options.id ? String(options.id) : '';
    const kind = options && options.kind === 'gift' ? 'gift' : 'self';
    // 最早只能选明天：时间胶囊的意义就是"等一等"
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const minDate = [tomorrow.getFullYear(), String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0')].join('-');
    this.setData({ kind, minDate, openOn: minDate });
    if (id) {
      this._id = id;
      this.setData({ mode: 'read' });
      capsules.detail(id).then(item => {
        this.setData({
          loaded: item,
          title: item.title || '',
          content: item.content || '',
          openOn: item.openOn,
          recipient: item.recipientName || '',
          kind: item.kind
        });
      }).catch(error => this.setData({ error: (error && error.message) || '读取失败' }));
    }
  },

  onKind(event) {
    if (this.data.mode !== 'write') return;
    this.setData({ kind: event.currentTarget.dataset.kind });
  },
  onTitle(event) { this.setData({ title: event.detail.value }); },
  onRecipient(event) { this.setData({ recipient: event.detail.value }); },
  onContent(event) { this.setData({ content: event.detail.value }); },
  onDate(event) { this.setData({ openOn: event.detail.value }); },

  onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true, error: '' });
    capsules.create({
      kind: this.data.kind,
      title: this.data.title,
      content: this.data.content,
      openOn: this.data.openOn,
      recipientName: this.data.recipient
    }).then(() => {
      wx.showToast({ title: '封存好了，等那天启封', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200);
    }).catch(error => {
      this.setData({ saving: false });
      notify(error);
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/profile/profile' }) });
  }
});
