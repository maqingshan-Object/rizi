const { prepare, notify } = require('../../utils/page');
const events = require('../../services/events');
const dates = require('../../utils/date');
const lunar = require('../../utils/lunar');

const categoryNames = { birthday: '生日', anniversary: '纪念日', holiday: '节日', other: '其他' };
const iconNames = ['heart', 'cake', 'leaf', 'lantern', 'flower'];
const tintNames = ['pink', 'mint', 'yellow', 'blue'];

Page({
  data: {
    theme: 'cream', guest: true, loading: true, error: '', missing: false,
    event: null, busy: false, deleted: false
  },

  onLoad(options) {
    this._id = options && Object.prototype.hasOwnProperty.call(options, 'id') ? String(options.id) : '';
    this._actionLocked = false;
    this._editLocked = false;
  },

  onShow() {
    try { prepare(this, -1); } catch (error) { notify(error); }
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
      const annotated = dates.annotate(record);
      const target = dates.nextDate(record);
      const available = dates.validDate(target);
      const base = dates.today();
      const count = available ? (record.mode === 'countup' ? dates.daysBetween(record.date, base) : dates.daysBetween(base, target)) : null;
      const past = count !== null && count < 0;
      let status = '日期换算超出支持范围';
      if (count !== null) {
        status = count === 0 ? '就在今天' : past ? '这一天已经过去' : record.mode === 'countup' ? '已经一起走过' : '距离这一天还有';
      }
      const detail = Object.assign({}, annotated, {
        id: record.id, name: record.name, note: record.note || '',
        categoryText: categoryNames[record.category] || '其他',
        modeText: record.mode === 'countup' ? '正计时' : '倒计时',
        repeatText: ({yearly:'每年重复',monthly:'每月重复',festival:record.holidayKey === 'next' ? '自动跟随最近节日' : '自动跟随节日'})[record.repeat] || '不重复',
        monthlyHelp: record.repeat === 'monthly' ? `每月 ${Number(record.date.slice(8))} 日，小月份按当月最后一天；下月恢复原设定日号。` : '',
        calendarText: record.calendarType === 'lunar' ? '农历' : '公历',
        icon: iconNames.includes(record.icon) ? record.icon : 'heart',
        tint: tintNames.includes(record.tint) ? record.tint : 'pink',
        pin: !!record.pin, countText: count === null ? '—' : String(Math.abs(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        statusText: status, unitText: count === null ? '' : '天',
        targetDateText: available ? target.replace(/-/g, '.') : '无可换算日期',
        originalDateText: dates.validDate(record.date) ? record.date.replace(/-/g, '.') : '日期无效',
        dateLabel: record.mode === 'countup' ? '开始日期' : record.repeat !== 'none' ? '本次／下次日期' : '记录日期',
        lunarText: '', lunarHelp: '', unavailable: !available,
        phrase: record.category === 'birthday' ? '爱要记得，也要说出口。' : '每一天，都值得被认真记住。'
      });
      if (record.calendarType === 'lunar') {
        const month = Number(record.lunarMonth), day = Number(record.lunarDay);
        detail.lunarText = month >= 1 && month <= 12 && day >= 1 && day <= 30
          ? `${record.lunarLeap ? '闰' : ''}${lunar.monthNames[month - 1]}${lunar.dayNames[day - 1]}`
          : '农历月日无效';
        detail.lunarHelp = `支持 ${lunar.range.min}—${lunar.range.max} 农历年。闰月无对应年时跳到下一个有对应闰月且日期有效的年份，不替换为普通月；无有效日期的年份也会跳过。`;
      }
      this.setData({ event: detail, loading: false });
    } catch (error) {
      this.setData({ loading: false, event: null, error: error.message || '这个日子暂时无法读取。' });
      notify(error);
    }
  },

  onRetry() { if (!this.data.deleted) this.refresh(); },

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
      this.refresh();
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
