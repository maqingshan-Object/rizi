const auth = require('../../services/auth');
const events = require('../../services/events');
const remindersService = require('../../services/reminders');
const { prepare, notify, login } = require('../../utils/page');

Page({
  data: {
    theme: 'cream',
    user: null,
    guest: true,
    nickname: '日子的收藏家',
    avatar: '/assets/cat.png',
    stats: { total: 0, birthday: 0, countup: 0 },
    sampleCount: 0,
    reminderNote: '待接通',
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
    this.setData({
      guest: events.isGuest(),
      nickname: user ? (user.nickname || '尚未设置昵称') : '日子的收藏家',
      avatar: user && user.avatarUrl ? user.avatarUrl : '/assets/cat.png'
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
    this.setData({ avatar: '/assets/cat.png' });
  },

  loadReminderSummary() {
    this.setData({ reminderNote: this.data.guest ? '请先登录' : '读取中…', pendingReminderCount: 0 });
    remindersService.list().then(response => {
      if (!response.ok) {
        this.setData({
          reminderNote: response.status === 'BACKEND_NOT_CONFIGURED' || response.status === 'MISSING_TEMPLATE'
            ? '待接通' : response.status === 'UNAUTHORIZED' ? '请先登录' : '读取失败',
          pendingReminderCount: 0
        });
        return;
      }
      const pending = response.data.filter(item => item && ['pending', 'needs_authorization'].includes(item.status)).length;
      this.setData({
        pendingReminderCount: pending,
        reminderNote: pending ? `${pending} 条待授权` : response.data.length ? `${response.data.length} 条云端任务` : '暂无任务'
      });
    });
  },

  showReminders() {
    remindersService.list().then(response => {
      if (!response.ok) {
        wx.showModal({
          title: response.status === 'UNAUTHORIZED' ? '请先登录' : '提醒服务待接通',
          content: response.message,
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      const labels = {
        pending: '等待授权', needs_authorization: '需要重新授权', sent: '服务端已处理',
        failed: '处理失败', cancelled: '已取消'
      };
      const items = response.data.slice(0, 5);
      const lines = items.map((item, index) => `${index + 1}. ${item.occurrence || '日期待定'} · ${labels[item.status] || '状态待确认'}`);
      const extra = response.data.length > 5 ? `\n还有 ${response.data.length - 5} 条未展开。` : '';
      wx.showModal({
        title: '提醒状态',
        content: lines.length ? lines.join('\n') + extra : '暂无云端提醒任务。本机记录中的提醒偏好不代表通知已开启。',
        showCancel: false,
        confirmText: '知道了'
      });
    });
  },

  showBackup() {
    wx.showModal({
      title: '云端备份待接通',
      content: '当前没有可用的登录和云端备份服务。访客日子保存在本机，尚未上传，不能跨设备恢复。请勿将本机记录视为云端备份。',
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
      content: '把重要的日子，慢慢放在心上。当前为开发中的原生小程序，支持本机访客记录与主题切换；事件云端同步与订阅提醒受后端配置、微信授权和服务端状态限制。',
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
