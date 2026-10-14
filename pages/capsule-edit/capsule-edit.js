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
    noQuota: false,
    quotaLeft: null,
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
    // 进页面就先看额度：没额度直接说清楚并给出路，别等写完 500 字才拦
    if (!id) this.checkQuota();
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

  /** 额度校验：0 就禁用保存并显示去商店的入口。 */
  checkQuota() {
    if (!capsules.isReady()) return;
    capsules.list().then(result => {
      const counts = (result && result.counts) || {};
      const cost = this.data.kind === 'gift' ? (counts.costGift || 2) : (counts.costSelf || 1);
      const left = counts.quota == null ? null : counts.quota;
      const enough = left == null ? true : left >= cost;
      this.setData({
        quotaLeft: left,
        noQuota: !enough,
        error: enough ? '' : (this.data.kind === 'gift'
          ? '送出一份心意需要 ' + cost + ' 个时间胶囊，现在有 ' + left + ' 个'
          : '写一个时间胶囊需要 ' + cost + ' 个，现在有 ' + left + ' 个')
      });
    }).catch(() => {});
  },

  onStore() {
    wx.navigateTo({ url: '/pages/store/store' });
  },

  onKind(event) {
    if (this.data.mode !== 'write') return;
    this.setData({ kind: event.currentTarget.dataset.kind });
    this.checkQuota();
  },
  onTitle(event) { this.setData({ title: event.detail.value }); },
  onRecipient(event) { this.setData({ recipient: event.detail.value }); },
  onContent(event) { this.setData({ content: event.detail.value }); },
  onDate(event) { this.setData({ openOn: event.detail.value }); },

  onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true, error: '' });
    // 先申请到期提醒的授权（一次性订阅，只能在使用当下申请），再封存
    capsules.requestReminderAuth().then(() => capsules.create({
      kind: this.data.kind,
      title: this.data.title,
      content: this.data.content,
      openOn: this.data.openOn,
      recipientName: this.data.recipient
    })).then(() => {
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
