const { prepare } = require('../../utils/page');
const eventsService = require('../../services/events');
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
  }
});
