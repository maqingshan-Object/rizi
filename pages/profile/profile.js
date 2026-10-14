const auth = require('../../services/auth');
const events = require('../../services/events');
const remindersService = require('../../services/reminders');
const { prepare, notify, login } = require('../../utils/page');

/** 内置默认头像：它是带留白的插画，不适合裁切铺满，单独用 aspectFit 呈现。 */
const DEFAULT_AVATAR = '/assets/cat.png';

Page({
  data: {
    theme: 'cream',
    user: null,
    guest: true,
    nickname: '日子的收藏家',
    avatar: '/assets/cat.png',
    avatarIndex: 0,
    avatarFailed: false,
    avatarArt: false,
    avatarLetter: '日',
    backupNote: '',
    stats: { total: 0, birthday: 0, countup: 0 },
    sampleCount: 0,
    reminderNote: '读取中…',
    pendingReminderCount: 0,
    error: '',
    clearing: false,
    themes: [
      { id: 'cream', name: '奶油猫猫', caption: '温暖奶油', bg: '#faf6eb', soft: '#f6e9c9', accent: '#876c42' },
      { id: 'cherry', name: '樱桃手账', caption: '柔雾樱粉', bg: '#fcf2f0', soft: '#f7dfe2', accent: '#a35965' },
      { id: 'mint', name: '薄荷极简', caption: '清新留白', bg: '#f2f6f2', soft: '#e2ece5', accent: '#526f63' }
    ]
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    prepare(this, 2);
    const user = auth.currentUser();
    const nickname = user ? (user.nickname || '还没有昵称') : '日子的收藏家';
    // 头像按优先级排队：云端地址 → 本机保存的副本 → 内置默认图；
    // 前面的加载失败会自动试下一个，最后用昵称首字兜底，不会出现灰色空头像。
    const candidates = [];
    if (user && user.avatarUrl) candidates.push(user.avatarUrl);
    const localAvatar = auth.localAvatar();
    if (localAvatar && candidates.indexOf(localAvatar) < 0) candidates.push(localAvatar);
    candidates.push(DEFAULT_AVATAR);
    this._avatarCandidates = candidates;
    this.setData({
      guest: events.isGuest(),
      nickname,
      avatarLetter: nickname.slice(0, 1),
      avatar: candidates[0],
      avatarIndex: 0,
      avatarFailed: false,
      // 用户头像用 aspectFill 铺满方框（否则四周会留白，看起来"没对齐"）；
      // 内置插画保持 aspectFit + 内边距，避免被裁掉边缘。
      avatarArt: candidates[0] === DEFAULT_AVATAR,
      backupNote: user ? '已开启' : '登录后开启'
    });
    this.loadReminderSummary();
    try {
      const records = events.list();
      this.setData({
        stats: {
          total: records.length,
          birthday: records.filter(record => record.category === 'birthday').length,
          countup: records.filter(record => record.mode === 'countup').length
        },
        sampleCount: records.filter(record => record.sample === true).length,
        error: ''
      });
    } catch (error) {
      this.setData({ error: error.message || '本机记录读取失败，请重试。' });
      notify(error);
    }
  },

  chooseTheme(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.themes.some(theme => theme.id === id)) return;
    try {
      wx.setStorageSync('days_theme', id);
      prepare(this, 2);
    } catch (error) {
      notify(error);
    }
  },

  openLogin() {
    login();
  },

  openDays() {
    wx.switchTab({ url: '/pages/days/days', fail: notify });
  },

  openPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy', fail: notify });
  },

  avatarError() {
    // 逐个候选往下试；全部失败才用昵称首字兜底。
    const list = this._avatarCandidates || [];
    const next = (this.data.avatarIndex || 0) + 1;
    if (next < list.length) {
      this.setData({
        avatar: list[next],
        avatarIndex: next,
        avatarArt: list[next] === DEFAULT_AVATAR
      });
      return;
    }
    this.setData({ avatarFailed: true });
  },

  loadReminderSummary() {
    this.setData({ reminderNote: this.data.guest ? '请先登录' : '读取中…', pendingReminderCount: 0 });
    remindersService.pendingAuthorization(events.list()).then(response => {
      if (!response.ok) {
        this.setData({
          reminderNote: response.status === 'BACKEND_NOT_CONFIGURED' || response.status === 'MISSING_TEMPLATE'
            ? '暂不可用' : response.status === 'UNAUTHORIZED' ? '请先登录' : '读取失败',
          pendingReminderCount: 0
        });
        return;
      }
      // 与首页提示同一口径：authorized !== true 才算"还没开启"，避免两处数字打架。
      const pending = (response.data || []).filter(item => item && item.task && item.event).length;
      this.setData({
        pendingReminderCount: pending,
        reminderNote: pending ? `${pending} 个日子等你开启` : '都安排好了'
      });
    });
  },

  showReminders() {
    remindersService.list().then(response => {
      if (!response.ok) {
        wx.showModal({
          title: response.status === 'UNAUTHORIZED' ? '请先登录' : '提醒服务暂时不可用',
          content: response.message,
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      const labels = {
        pending: '等你开启', needs_authorization: '需要重新开启', sent: '已经发出',
        failed: '这次没能发出', cancelled: '已取消'
      };
      const items = response.data.slice(0, 5);
      const lines = items.map((item, index) => `${index + 1}. ${item.occurrence || '日期待定'} · ${labels[item.status] || '状态待确认'}`);
      const extra = response.data.length > 5 ? `\n还有 ${response.data.length - 5} 条未展开。` : '';
      wx.showModal({
        title: '提醒安排',
        content: lines.length ? lines.join('\n') + extra : '还没有云端提醒。日子里的提醒偏好，要开启授权后才会真的发出来。',
        showCancel: false,
        confirmText: '知道了'
      });
    });
  },

  showBackup() {
    if (this.data.guest) {
      wx.showModal({
        title: '云端备份需要先登录',
        content: '登录一下，日子就不只留在这台手机上了。\n\n现在还是访客模式，记录只存在这台设备里；登录后会自动同步，换手机也能原样找回来。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }
    wx.showModal({
      title: '云端备份已开启',
      content: '你的日子已经跟着微信走了。\n\n加一条、改一改、删掉，云端都会跟着更新；\n换手机或重新安装后，登录同一个微信就能全部找回来。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  clearSamples() {
    if (this.data.clearing) return;
    this.setData({ clearing: true });
    wx.showModal({
      title: '移除示例日子？',
      content: '只移除标记为示例的记录，你自己新建或保存过的日子会保留。移除后不会自动补回示例。',
      confirmText: '移除示例',
      cancelText: '再留一会',
      success: result => {
        if (!result.confirm) return;
        try {
          events.clearSamples();
          this.refresh();
          wx.showToast({ title: '示例已移除', icon: 'none' });
        } catch (error) {
          notify(error);
        }
      },
      fail: notify,
      complete: () => this.setData({ clearing: false })
    });
  },

  showAbout() {
    wx.showModal({
      title: '日子绵绵',
      content: '把重要的日子，慢慢放在心上。\n\n登录后，日子会跟着你的微信走，换手机也不怕丢。\n选了提醒的日子，会按你定的提前天数（1、3、7 天）收到一条服务通知。\n微信的提醒一次只能约一条，下一条到时首页会提醒你续上。',
      showCancel: false,
      confirmText: '慢慢记录'
    });
  },

  signOut() {
    if (!auth.currentUser()) return;
    wx.showModal({
      title: '退出当前账号？',
      content: '退出后回到访客模式，不会删除本机的访客记录。',
      confirmText: '退出账号',
      success: async result => {
        if (!result.confirm) return;
        try {
          await auth.signOut();
          this.refresh();
        } catch (error) {
          notify(error);
        }
      },
      fail: notify
    });
  }
});
