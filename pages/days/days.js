const { prepare } = require('../../utils/page');
const eventsService = require('../../services/events');
const remindersService = require('../../services/reminders');
const dateUtils = require('../../utils/date');

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
    life: null,
    visibleCount: 0,
    emptyTitle: '还没有珍藏的日子',
    emptyDescription: '记下生日、相爱和生活，把小小的期待放在心上。'
  },

  onShow() {
    this.refresh();
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
        life: null,
        visibleCount: 0
      });
    }
    // 本机记录渲染完再补云端提醒状态：不阻塞首屏，也不影响离线可用。
    this.refreshReminderNotice();
  },

  applyCategory(category) {
    const visible = (this._events || []).filter(event => category === 'all' || event.category === category);
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
      life: null,
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
    if (eventsService.isGuest() || !eventsService.remoteReady()) {
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
            ? `「${first.event.name}」还没完成微信订阅授权`
            : `「${first.event.name}」等 ${count} 个日子还没完成微信订阅授权`,
          timeText: first.remaining === 0 ? '提醒日就是今天' : `提醒将在 ${first.remaining} 天后发出`,
          action: '去开启'
        }
      });
    }).catch(() => {
      if (this.data.reminderNotice) this.setData({ reminderNotice: null });
    });
  },

  onReminderNoticeTap() {
    const notice = this.data.reminderNotice;
    if (!notice || !notice.eventId) return;
    wx.navigateTo({
      url: '/pages/event-detail/event-detail?id=' + encodeURIComponent(notice.eventId),
      fail: () => wx.showToast({ title: '详情页暂时打不开，请重试', icon: 'none' })
    });
  }
});
