const { prepare } = require('../../utils/page');
const auth = require('../../services/auth');
const capsulesService = require('../../services/capsules');

/**
 * 首页提示条：只在**有值得看一眼的事**时出现（有可启封的 / 有可送出的心意），
 * 其余时候完全是空字符串 → WXML 里 wx:if 不渲染，首页保持干净。
 * 优先级：可启封 > 有心意可送。
 */
function capsuleBannerText(counts) {
  if (!counts) return '';
  if (counts.openable > 0) return '你有 ' + counts.openable + ' 个时间胶囊今天可以启封';
  if ((counts.quota || 0) >= (counts.costGift || 2)) return '你有一份心意可以送出去';
  return '';
}
const eventsService = require('../../services/events');
const remindersService = require('../../services/reminders');
const dateUtils = require('../../utils/date');
const reminderOptions = require('../../utils/reminder');

const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'birthday', label: '生日' },
  { key: 'anniversary', label: '纪念日' },
  { key: 'holiday', label: '节日' },
  { key: 'other', label: '其他' }
];
const CATEGORY_LABELS = {
  birthday: '生日', anniversary: '纪念日', holiday: '节日', other: '其他'
};

/** 把 'YYYY-MM-DD' 往前推 days 天，得到"提醒日"。 */
function shiftDays(iso, days) {
  if (!iso) return '';
  const parts = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] - (Number(days) || 0)));
  return dateUtils.dateString(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function cardView(event) {
  const annotated = dateUtils.annotate(event);
  const tint = ['pink', 'mint', 'yellow', 'blue'].indexOf(annotated.tint) >= 0
    ? annotated.tint : 'yellow';
  return Object.assign({}, annotated, {
    icon: annotated.icon || 'days',
    tintClass: 'tint-' + tint,
    // 卡片角落的小铃铛：只看本机的"提前提醒"设置，离线与访客模式同样准确。
    reminderOn: reminderOptions.enabledFor(annotated.reminder),
    categoryLabel: CATEGORY_LABELS[annotated.category] || '日子',
    displayDate: annotated.displayDate || dateUtils.display(
      annotated.mode === 'countup' ? annotated.date : annotated.nextDate || annotated.date
    ),
    repeatText: ({yearly:' · 每年',monthly:' · 每月',festival:' · 自动节日'})[annotated.repeat] || '',
    holidayText: annotated.resolvedHolidayLabel ? '下一站 · ' + annotated.resolvedHolidayLabel : '',
    featureLabel: annotated.pin ? '特别的日子 · 置顶' : CATEGORY_LABELS[annotated.category] || '珍藏的日子',
    phrase: annotated.category === 'birthday' ? '爱要记得，也要说出口' : '每一天，都值得被记住'
  });
}

Page({
  data: {
    theme: 'cream',
    user: null,
    guest: true,
    todayLabel: '',
    category: 'all',
    categories: CATEGORIES.map(item => Object.assign({}, item, {
      className: item.key === 'all' ? 'category-button is-active' : 'category-button'
    })),
    loading: true,
    error: '',
    reminderNotice: null,
    feature: null,
    cards: [],
    visibleCount: 0,
    emptyTitle: '还没有珍藏的日子',
    emptyDescription: '记下生日、相爱和生活，把小小的期待放在心上。'
  },

  /** 读胶囊数量，决定首页提示条显示什么（读不到就保持不显示）。 */
  loadCapsuleBanner() {
    // 胶囊开关关闭时不显示提示条（入口隐藏了，不能让人点进空页面 ⚠️）
    if (capsulesService && capsulesService.isEnabled && !capsulesService.isEnabled()) {
      if (this.data.capsuleBanner) this.setData({ capsuleBanner: '' });
      return;
    }
    if (!auth.currentUser() || !capsulesService.isReady()) {
      if (this.data.capsuleBanner) this.setData({ capsuleBanner: '' });
      return;
    }
    capsulesService.list().then(result => {
      const text = capsuleBannerText((result && result.counts) || {});
      if (text !== this.data.capsuleBanner) this.setData({ capsuleBanner: text });
    }).catch(() => {});
  },

  openCapsules() {
    wx.navigateTo({ url: '/pages/capsules/capsules' });
  },

  /** 访客点「登录」：跳登录页（不强制、不自动，用户自己决定 ✅）。 */
  onGuestLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  /**
   * 登录后问一次：把本机的日子同步到云端？
   * ⚠️ 访客期记的日子如果不上云，提醒建不起来、换手机也看不到（这次踩过的坑）✅
   * 只问一次（days_cloud_sync_offered），拒绝就不再来烦 ✅
   */
  offerCloudSync() {
    if (!auth.currentUser() || !eventsService.remoteReady()) return;
    if (wx.getStorageSync('days_cloud_sync_offered')) return;
    var all = [];
    try { all = eventsService.list() || []; } catch (error) { all = []; }
    if (!all.length) return;
    wx.setStorageSync('days_cloud_sync_offered', true);
    wx.showModal({
      title: '把本机的日子同步到云端？',
      content: '本机有 ' + all.length + ' 个日子。同步后换手机也能看到，微信提醒才能正常发出来。',
      confirmText: '同步',
      cancelText: '以后再说',
      success: function (result) {
        if (!result.confirm) return;
        wx.showLoading({ title: '同步中…' });
        eventsService.syncAllToCloud().then(function (count) {
          wx.hideLoading();
          wx.showToast({ title: '已同步 ' + count + ' 个', icon: 'none' });
        }).catch(function () { wx.hideLoading(); });
      }
    });
  },

  onShow() {
    this.loadCapsuleBanner();
    this.offerCloudSync();
    // 转发 + 分享到朋友圈：朋友圈入口需要本页定义 onShareTimeline 才会出现
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    this.refresh();
  },

  /** 首页转发：说的是"这个工具能帮你记日子"，而不是念产品名。 */
  onShareAppMessage() {
    return {
      title: '把重要的日子，慢慢放在心上 · 日子绵绵',
      path: '/pages/days/days'
    };
  },

  onShareTimeline() {
    return { title: '把重要的日子，慢慢放在心上 · 日子绵绵' };
  },

  onPullDownRefresh() {
    try {
      this.refresh();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  refresh() {
    this.setData({ loading: true, error: '' });
    try {
      prepare(this, 0);
      this.setData({ guest: eventsService.isGuest(), todayLabel: dateUtils.formatToday() });
      // 首次示例由事件服务初始化；空列表代表用户真实的空记录，不重新填入示例。
      this._events = dateUtils.sortEvents(eventsService.list()).map(cardView);
      this.applyCategory(this.data.category);
      this.setData({ loading: false });
    } catch (error) {
      this._events = [];
      this.setData({
        loading: false,
        error: '暂时没能读到本机记录，请重试。你的记录不会因此被清空。',
        feature: null,
        cards: [],
        visibleCount: 0
      });
    }
    // 本机记录渲染完再补云端提醒状态：不阻塞首屏，也不影响离线可用。
    this.refreshReminderNotice();
  },

  applyCategory(category) {
    const visible = (this._events || []).filter(event => category === 'all' || event.category === category);
    // 访客 + 只剩默认示例 => 等同于「还没有记录」，露出空状态引导他主动添加 ✅
    // （示例只是示范，不该让访客以为"已经有数据了" ⚠️）
    if (eventsService.isGuest()) {
      const realEvents = visible.filter(function (e) {
        return String((e && e.id) || '').indexOf('sample-') !== 0;
      });
      if (!realEvents.length) {
        const label = CATEGORY_LABELS[category];
        this.setData({
          category,
          categories: CATEGORIES.map(function (item) {
            return Object.assign({}, item, {
              className: item.key === category ? 'category-button is-active' : 'category-button'
            });
          }),
          feature: null,
          cards: [],
          visibleCount: 0,
          emptyTitle: category === 'all' ? '还没有珍藏的日子' : '还没有' + label + '记录',
          emptyDescription: '记下第一个属于你的日子 —— 生日、纪念日，或者只是想让某一天被记住。'
        });
        return;
      }
    }
    // 排序覆盖整列表，再选首张大卡；不再把某种日子抽出打乱顺序。
    const feature = visible[0] || null;
    const cards = visible.slice(feature ? 1 : 0);
    const label = CATEGORY_LABELS[category];
    this.setData({
      category,
      categories: CATEGORIES.map(item => Object.assign({}, item, {
        className: item.key === category ? 'category-button is-active' : 'category-button'
      })),
      feature,
      cards,
      visibleCount: visible.length,
      emptyTitle: category === 'all' ? '还没有珍藏的日子' : '还没有' + label + '记录',
      emptyDescription: category === 'all'
        ? '记下生日、相爱和生活，把小小的期待放在心上。'
        : '给' + label + '留一个位置，记下你的第一个小期待。'
    });
  },

  onCategoryTap(event) {
    const category = event.currentTarget.dataset.category;
    if (CATEGORIES.some(item => item.key === category)) this.applyCategory(category);
  },

  onEventTap(event) {
    wx.navigateTo({ url: '/pages/event-detail/event-detail?id=' + encodeURIComponent(event.currentTarget.dataset.id) });
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/event-form/event-form' + (this.data.category === 'holiday' ? '?category=holiday' : '') });
  },

  onRetryTap() {
    this.refresh();
  },

  /**
   * 首页显著位置的"还没开启提醒"提示。
   *
   * 口径与后端完全一致：只看云端任务里 authorized !== true 的日子 —— 用户以为开了、
   * 服务端其实不会发，是这里最容易踩的坑，所以宁可提示得直白。
   * 提醒日已经过去的不提示（本轮的发送窗口已经错过，提示了也点不出结果）。
   */
  refreshReminderNotice() {
    // 访客也要看到这条：他设了提醒却收不到，正是最需要知道原因的时候 ✅
    // 点一下 → 引导登录（而不是直接隐藏、让他一直以为提醒开着 ⚠️）
    if (eventsService.isGuest()) {
      var localList = this._events || [];
      if (!localList.length) {
        if (this.data.reminderNotice) this.setData({ reminderNotice: null });
        return;
      }
      var withReminder = localList.filter(function (e) {
        return e && e.reminder && e.reminder !== '\u4e0d\u63d0\u9192';
      }).length;
      // \u4e00\u4e2a\u63d0\u9192\u90fd\u6ca1\u8bbe\uff1a\u4e0d\u663e\u793a\u2014\u2014\u4e0a\u9762\u5df2\u7ecf\u6709\u4e00\u6761\u767b\u5f55\u5f15\u5bfc\uff0c\u4e24\u6761\u540c\u65f6\u51fa\u73b0\u53cd\u800c\u91cd\u590d\u4e86\u26a0\ufe0f
      if (!withReminder) {
        if (this.data.reminderNotice) this.setData({ reminderNotice: null });
        return;
      }
      this.setData({
        reminderNotice: {
          guest: true,
          title: '\u5fae\u4fe1\u63d0\u9192\u8fd8\u6ca1\u5f00\u542f',
          desc: '\u6709 ' + withReminder + ' \u4e2a\u65e5\u5b50\u8bbe\u4e86\u63d0\u9192\uff0c\u767b\u5f55\u540e\u624d\u80fd\u53d1\u5230\u5fae\u4fe1',
          timeText: '\u767b\u5f55\u53ea\u8981\u4e00\u79d2\uff0c\u4e0d\u7528\u586b\u4efb\u4f55\u8d44\u6599',
          action: '\u53bb\u767b\u5f55'
        }
      });
      return;
    }
    if (!eventsService.remoteReady()) {
      if (this.data.reminderNotice) this.setData({ reminderNotice: null });
      return;
    }
    remindersService.pendingAuthorization(this._events).then(response => {
      if (!response.ok || !response.data || !response.data.length) {
        if (this.data.reminderNotice) this.setData({ reminderNotice: null });
        return;
      }
      const today = dateUtils.today();
      const items = response.data
        .map(item => {
          const due = shiftDays(item.task.occurrence, item.task.daysBefore);
          return Object.assign({}, item, { due, remaining: dateUtils.daysBetween(today, due) });
        })
        .filter(item => item.remaining >= 0)
        .sort((a, b) => a.remaining - b.remaining);
      if (!items.length) {
        if (this.data.reminderNotice) this.setData({ reminderNotice: null });
        return;
      }
      const first = items[0];
      const count = items.length;
      this.setData({
        reminderNotice: {
          eventId: first.event.id,
          count,
          title: '提醒还没开启',
          desc: count === 1
            ? `「${first.event.name}」的提醒还没开启`
            : `「${first.event.name}」等 ${count} 个日子的提醒还没开启`,
          timeText: first.remaining === 0 ? '今天就是提醒的日子' : `还有 ${first.remaining} 天就会提醒你`,
          action: '去开启'
        }
      });
    }).catch(() => {
      if (this.data.reminderNotice) this.setData({ reminderNotice: null });
    });
  },

  onReminderNoticeTap() {
    // 访客看到的那条 → 引导登录（不是去授权）✅
    if (this.data.reminderNotice && this.data.reminderNotice.guest) {
      wx.showModal({
        title: '\u767b\u5f55\u540e\uff0c\u5230\u65e5\u5b50\u4f1a\u6536\u5230\u5fae\u4fe1\u63d0\u9192',
        content: '\u65e5\u5b50\u5df2\u7ecf\u5b58\u5728\u8fd9\u53f0\u624b\u673a\u4e86\u3002\u767b\u5f55\u4e00\u4e0b\uff0c\u5230\u90a3\u5929\u5fae\u4fe1\u5c31\u4f1a\u63d0\u9192\u4f60 \u2014\u2014 \u6362\u624b\u673a\u4e5f\u4e0d\u4f1a\u4e22\u3002',
        confirmText: '\u53bb\u767b\u5f55',
        cancelText: '\u4ee5\u540e\u518d\u8bf4',
        success: function (result) {
          if (result.confirm) wx.navigateTo({ url: '/pages/login/login' });
        }
      });
      return;
    }
    const notice = this.data.reminderNotice;
    if (!notice || !notice.eventId) return;
    wx.navigateTo({
      url: '/pages/event-detail/event-detail?id=' + encodeURIComponent(notice.eventId),
      fail: () => wx.showToast({ title: '详情页暂时打不开，请重试', icon: 'none' })
    });
  }
});
