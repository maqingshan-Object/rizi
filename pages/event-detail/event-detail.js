const { prepare, notify } = require('../../utils/page');
const events = require('../../services/events');
const auth = require('../../services/auth');
const remindersService = require('../../services/reminders');
const reminderOptions = require('../../utils/reminder');
// 详情页与分享海报共用同一套计算，避免"页面显示的天数"和"海报印的天数"对不上。
const eventView = require('../../utils/event-view');

Page({
  data: {
    theme: 'cream', guest: true, loading: true, error: '', missing: false,
    event: null, busy: false, reminderBusy: false, deleted: false
  },

  onLoad(options) {
    this._id = options && Object.prototype.hasOwnProperty.call(options, 'id') ? String(options.id) : '';
    this._actionLocked = false;
    this._editLocked = false;
  },

  onShow() {
    try { prepare(this, -1); } catch (error) { notify(error); }
    // 显式打开「转发」和「分享到朋友圈」入口（朋友圈需要页面定义 onShareTimeline 才会出现）
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    if (!this.data.deleted) this.refresh();
  },

  refresh() {
    this.setData({ loading: true, error: '', missing: false });
    try {
      const record = this._id ? events.get(this._id) : null;
      if (!record || record.id !== this._id) {
        this.setData({ loading: false, missing: true, event: null });
        return;
      }
      const detail = eventView.build(record);
      this.setData({ event: detail, loading: false });
      if (reminderOptions.enabledFor(detail.reminder) && auth.currentUser()) this.loadReminderStatus(detail.id);
    } catch (error) {
      this.setData({ loading: false, event: null, error: error.message || '这个日子暂时无法读取。' });
      notify(error);
    }
  },

  onRetry() { if (!this.data.deleted) this.refresh(); },

  /**
   * 转发文案统一由 utils/event-view 提供，分享海报页用的是同一份，
   * 保持"详情页转发"和"海报页转发"的说法一致。
   */
  shareTitle() {
    return eventView.shareTitle(this.data.event);
  },

  onShareAppMessage() {
    const event = this.data.event;
    if (!event) {
      return { title: '日子绵绵 · 把重要的日子慢慢放在心上', path: '/pages/days/days' };
    }
    return {
      title: this.shareTitle(),
      // 好友点开直接落到这个日子，不用自己再找
      path: `/pages/event-detail/event-detail?id=${event.id}`,
      imageUrl: this.data.shareImage || undefined
    };
  },

  onShareTimeline() {
    const event = this.data.event;
    if (!event) return { title: '日子绵绵 · 把重要的日子慢慢放在心上' };
    return { title: this.shareTitle(), query: `id=${event.id}` };
  },

  onSharePoster() {
    if (this._actionLocked || !this.data.event) return;
    wx.navigateTo({
      url: `/pages/share/share?id=${this.data.event.id}`,
      fail: () => notify(new Error('打不开海报页，请稍后再试。'))
    });
  },

  loadReminderStatus(eventId, options) {
    remindersService.statusForEvent(eventId).then(response => {
      if (!this.data.event || this.data.event.id !== eventId) return;
      // 刚授权成功时，如果后端还是旧版本（不返回 authorized），pending 无法区分
      // "未授权"和"已授权待发送"，此时保留成功提示，别用"等待订阅授权"盖掉。
      if (options && options.keepSuccessOnAmbiguous && response && response.ambiguous) return;
      const patch = { 'event.reminderStatus': response.message || '提醒状态暂时无法确认。' };
      const task = response && response.data;
      // 按钮文案跟着真实状态走：已授权 → 只用于再攒额度；未授权 → 引导开启。
      if (task && typeof task.authorized === 'boolean') {
        patch['event.reminderActionText'] = task.authorized ? '重新授权提醒' : '开启提醒';
      }
      this.setData(patch);
    });
  },

  onSubscribeReminder() {
    if (this.data.reminderBusy || !this.data.event || this.data.deleted) return;
    if (!auth.currentUser()) {
      wx.showModal({
        title: '请先登录',
        content: '访客记录只保存在本机，登录后才能申请微信订阅授权并查看云端提醒状态。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    this.setData({ reminderBusy: true });
    remindersService.subscribeForEvent(this._id).then(response => {
      wx.showModal({
        title: response.ok ? '提醒已开启' : '提醒还没开启',
        content: response.message,
        showCancel: false,
        confirmText: '知道了'
      });
      if (response.ok) {
        // 授权已成功，先把状态显示成"已开启"，再拉一次服务端权威状态。
        this.setData({
          'event.reminderStatus': '提醒已开启，到时候会给你发一条服务通知。',
          'event.reminderActionText': '重新授权提醒'
        });
        this.loadReminderStatus(this._id, { keepSuccessOnAmbiguous: true });
      }
    }).catch(error => {
      notify(error);
    }).finally(() => {
      this.setData({ reminderBusy: false });
    });
  },

  onEdit() {
    if (this._actionLocked || this._editLocked || !this.data.event || this.data.deleted) return;
    this._editLocked = true;
    try {
      wx.navigateTo({
        url: `/pages/event-form/event-form?id=${encodeURIComponent(this._id)}`,
        fail: () => notify(new Error('编辑页面暂时无法打开，请重试。')),
        complete: () => { this._editLocked = false; }
      });
    } catch (error) { this._editLocked = false; notify(error); }
  },

  onPin() {
    if (this._actionLocked || !this.data.event || this.data.deleted) return;
    this._actionLocked = true;
    this.setData({ busy: true });
    try {
      const record = events.get(this._id);
      if (!record || record.id !== this._id) throw new Error('这个日子已被删除，无法置顶。');
      // 仅通过专用 API 改变置顶，不用不完整的展示记录调用 save。
      const pinned = events.togglePin(this._id);
      const remote = events.remoteReady() ? events.saveRemote(events.get(this._id)).catch(() => {
        wx.showToast({ title: '已改本机，云端同步未完成', icon: 'none' });
      }) : Promise.resolve();
      remote.finally(() => this.refresh());
      if (typeof pinned === 'boolean') {
        wx.showToast({ title: pinned ? '已置顶这个日子' : '已取消置顶', icon: 'none' });
      }
    } catch (error) { notify(error); }
    finally { this._actionLocked = false; this.setData({ busy: false }); }
  },

  onDelete() {
    if (this._actionLocked || !this.data.event || this.data.deleted) return;
    const id = this._id;
    const name = this.data.event.name;
    this._actionLocked = true;
    this.setData({ busy: true });
    const unlock = () => { this._actionLocked = false; this.setData({ busy: false }); };
    try {
      wx.showModal({
        title: '要和这个日子告别吗？',
        content: `将删除本机记录「${name}」。此操作不可撤销，不会删除其他日子。`,
        confirmText: '删除日子', cancelText: '再留一会', confirmColor: '#a45151',
        success: result => {
          if (!result.confirm || this._id !== id) { unlock(); return; }
          try {
            const current = events.get(id);
            if (!current || current.id !== id) throw new Error('这个日子已不存在，没有删除其他记录。');
            events.remove(id);
            if (events.remoteReady()) {
              events.removeRemote(id).catch(() => wx.showToast({ title: '本机已删除，云端删除未完成', icon: 'none' }));
            }
            this.setData({ deleted: true, event: null, missing: false, busy: false });
          } catch (error) { unlock(); notify(error); this.refresh(); return; }
          this.onBack();
        },
        fail: () => { unlock(); notify(new Error('删除确认未打开，没有删除任何日子。')); }
      });
    } catch (error) { unlock(); notify(error); }
  },

  onBack() {
    try {
      wx.navigateBack({ delta: 1, fail: () => notify(new Error('请点击左上角返回；已完成的本机操作不会重复执行。')) });
    } catch (error) { notify(error); }
  }
});
