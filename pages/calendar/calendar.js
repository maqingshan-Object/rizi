const { prepare } = require('../../utils/page');
const eventsService = require('../../services/events');
const dateUtils = require('../../utils/date');

const WEEKDAYS = [
  { key: 'mon', label: '一', className: 'week-label' },
  { key: 'tue', label: '二', className: 'week-label' },
  { key: 'wed', label: '三', className: 'week-label' },
  { key: 'thu', label: '四', className: 'week-label' },
  { key: 'fri', label: '五', className: 'week-label' },
  { key: 'sat', label: '六', className: 'week-label weekend-label' },
  { key: 'sun', label: '日', className: 'week-label weekend-label' }
];
const CATEGORY_TINTS = { birthday: 'pink', anniversary: 'pink', other: 'mint', holiday: 'yellow' };

function dateString(year, month, day) {
  return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
}

function tintClass(value) {
  return 'tint-' + (['pink', 'mint', 'yellow', 'blue'].indexOf(value) >= 0 ? value : 'pink');
}

function cellView(cell) {
  const classes = ['day-cell'];
  if (!cell.current) classes.push('is-outside');
  if (cell.weekend && cell.holidayType !== 'work') classes.push('is-weekend');
  if (cell.today) classes.push('is-today');
  if (cell.selected) classes.push('is-selected');
  if (cell.eventCount) classes.push('has-events');
  const dots = (cell.dots || []).slice(0, 3).map((dot, index) => {
    const value = typeof dot === 'string' ? dot : dot.tint || CATEGORY_TINTS[dot.category];
    return { key: cell.key + '-dot-' + index, className: 'event-dot ' + tintClass(value) };
  });
  const badge = cell.current && cell.holidayType === 'rest' ? '休'
    : cell.current && cell.holidayType === 'work' ? '补' : '';
  return Object.assign({}, cell, {
    className: classes.join(' '),
    badge,
    badgeClass: cell.holidayType === 'work' ? 'day-badge work-badge' : 'day-badge rest-badge',
    // 农历与休补均只展示共享日期模块返回的已知信息，不在页面推算或虚构。
    subLabel: cell.holidayName && cell.holidayType === 'rest' ? cell.holidayName : cell.lunarLabel || '',
    subLabelClass: cell.holidayType === 'rest' ? 'lunar-label holiday-label' : 'lunar-label',
    dots,
    extraDots: (cell.dots || []).length > 3,
    ariaLabel: cell.date + (cell.today ? '，今天' : '') + (cell.selected ? '，已选中' : '')
      + (cell.holidayName ? '，' + cell.holidayName : '')
      + (cell.eventCount ? '，' + cell.eventCount + '个日子' : '')
  });
}

function scheduleView(event, currentDate) {
  const delta = dateUtils.daysBetween(currentDate, event.occurrence);
  const parts = event.occurrence.split('-');
  return Object.assign({}, event, {
    rowKey: event.id + '-' + event.occurrence + (event.occurrenceHolidayKey ? '-' + event.occurrenceHolidayKey : ''),
    dayText: Number(parts[2]),
    monthText: Number(parts[1]) + '月',
    icon: event.icon || 'days',
    tintClass: tintClass(event.tint),
    occurrenceDisplay: dateUtils.display(event.occurrence),
    name: event.repeat === 'festival' && event.resolvedHolidayLabel ? event.name + ' · ' + event.resolvedHolidayLabel : event.name,
    repeatText: ({yearly:' · 每年重复',monthly:' · 每月重复',festival:' · 自动节日'})[event.repeat] || '',
    whenText: delta === 0 ? '就是今天' : delta > 0 ? delta + ' 天后' : '已过 ' + Math.abs(delta) + ' 天',
    whenClass: delta === 0 ? 'schedule-tail is-current' : 'schedule-tail'
  });
}

Page({
  /** 访客点「登录」→ 登录页（引导，不强制 ✅） */
  onGuestLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  data: {
    theme: 'cream',
    user: null,
    guest: true,
    year: 0,
    month: 0,
    monthLabel: '',
    weekdays: WEEKDAYS,
    selectedDate: '',
    selectedLabel: '',
    selectedCount: 0,
    selectedEvents: [],
    monthEvents: [],
    monthCount: 0,
    cells: [],
    loading: true,
    error: ''
  },

  onShow() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    this.refresh();
  },

  onShareAppMessage() {
    return {
      title: '日子都记在这张日历上 · 日子绵绵',
      path: '/pages/calendar/calendar'
    };
  },

  onShareTimeline() {
    return { title: '日子都记在这张日历上 · 日子绵绵' };
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
      prepare(this, 1);
      this.setData({ guest: eventsService.isGuest() });
      this._events = eventsService.list();
      const currentDate = dateUtils.today();
      const parts = currentDate.split('-').map(Number);
      this.renderMonth(this.data.year || parts[0], this.data.month || parts[1], this.data.selectedDate || currentDate);
    } catch (error) {
      this.showReadError();
    }
  },

  renderMonth(year, month, selectedDate) {
    this.setData({
      year,
      month,
      selectedDate,
      monthLabel: dateUtils.monthTitle(year, month),
      loading: true,
      error: ''
    });
    try {
      const result = dateUtils.monthCells(year, month, this._events || [], selectedDate);
      const cells = result.cells.map(cellView);
      const currentDate = dateUtils.today();
      const monthEvents = result.occurrences.map(event => scheduleView(event, currentDate))
        .sort((a, b) => a.occurrence.localeCompare(b.occurrence));
      const selectedEvents = monthEvents.filter(event => event.occurrence === selectedDate);
      const parts = selectedDate.split('-').map(Number);
      this.setData({
        cells,
        monthEvents,
        monthCount: monthEvents.length,
        selectedEvents,
        selectedCount: selectedEvents.length,
        selectedLabel: parts[1] + ' 月 ' + parts[2] + ' 日',
        loading: false,
        error: ''
      });
    } catch (error) {
      this.showReadError();
    }
  },

  showReadError() {
    this.setData({
      loading: false,
      error: '月历暂时没能读取完成，请重试。本机记录不会因此被清空。',
      cells: [],
      monthEvents: [],
      monthCount: 0,
      selectedEvents: [],
      selectedCount: 0
    });
  },

  onMonthTap(event) {
    if (this.data.loading || !this.data.year) return;
    const shift = Number(event.currentTarget.dataset.shift);
    if (shift !== -1 && shift !== 1) return;
    const target = new Date(this.data.year, this.data.month - 1 + shift, 1);
    const year = target.getFullYear();
    const month = target.getMonth() + 1;
    const maxDay = new Date(year, month, 0).getDate();
    const day = Math.min(Number(this.data.selectedDate.split('-')[2]) || 1, maxDay);
    this.renderMonth(year, month, dateString(year, month, day));
  },

  onDateTap(event) {
    const selectedDate = event.currentTarget.dataset.date;
    if (this.data.loading || !this.data.cells.some(cell => cell.date === selectedDate)) return;
    const parts = selectedDate.split('-').map(Number);
    this.renderMonth(parts[0], parts[1], selectedDate);
  },

  onTodayTap() {
    const currentDate = dateUtils.today();
    const parts = currentDate.split('-').map(Number);
    this.renderMonth(parts[0], parts[1], currentDate);
  },

  onEventTap(event) {
    wx.navigateTo({ url: '/pages/event-detail/event-detail?id=' + encodeURIComponent(event.currentTarget.dataset.id) });
  },

  onAddTap() {
    const selectedDate = this.data.selectedDate || dateUtils.today();
    wx.navigateTo({ url: '/pages/event-form/event-form?date=' + encodeURIComponent(selectedDate) });
  },

  onRetryTap() {
    this.refresh();
  }
});
