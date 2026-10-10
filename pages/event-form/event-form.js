const { prepare, notify } = require('../../utils/page');
const events = require('../../services/events');
const dates = require('../../utils/date');
const lunar = require('../../utils/lunar');

const categories = [
  { value: 'birthday', label: '生日' },
  { value: 'anniversary', label: '纪念日' },
  { value: 'growth', label: '成长' },
  { value: 'holiday', label: '节日' },
  { value: 'other', label: '其他' }
];
const modes = [
  { value: 'countdown', label: '倒计时 · 还有多少天' },
  { value: 'countup', label: '正计时 · 已经多少天' }
];
const repeats = [{ value: 'yearly', label: '每年重复' }, { value: 'none', label: '不重复' }];
const calendars = [{ value: 'solar', label: '公历' }, { value: 'lunar', label: '农历生日' }];
const icons = [
  { value: 'heart', label: '爱心' }, { value: 'cake', label: '蛋糕' },
  { value: 'leaf', label: '树叶' }, { value: 'lantern', label: '灯笼' },
  { value: 'flower', label: '花朵' }
];
const tints = [
  { value: 'pink', label: '柔雾粉' }, { value: 'mint', label: '薄荷绿' },
  { value: 'yellow', label: '奶油黄' }, { value: 'blue', label: '雾蓝' }
];
const pins = [{ value: false, label: '不置顶' }, { value: true, label: '置顶首页' }];
const leaps = [{ value: false, label: '普通月' }, { value: true, label: '闰月' }];
const selectors = {
  category: categories, mode: modes, repeat: repeats, calendarType: calendars,
  icon: icons, tint: tints, pin: pins, lunarLeap: leaps
};

Page({
  data: {
    theme: 'cream', guest: true, title: '记下一个新日子',
    loading: true, loadError: '', error: '', saving: false, saved: false,
    name: '', note: '', date: '', category: 'birthday', mode: 'countdown',
    repeat: 'yearly', calendarType: 'solar', icon: 'heart', tint: 'pink',
    pin: false, reminder: '不提醒', lunarMonth: 1, lunarDay: 1, lunarLeap: false,
    categories, modes, repeats, calendars, icons, tints, pins, leaps,
    reminders: ['不提醒'], reminderIndex: 0,
    months: lunar.monthNames.map((name, index) => `${index + 1} 月 · ${name}`),
    days: lunar.dayNames.map((name, index) => `${index + 1} 日 · ${name}`),
    categoryIndex: 0, modeIndex: 0, repeatIndex: 0, calendarTypeIndex: 0,
    iconIndex: 0, tintIndex: 0, pinIndex: 0, lunarLeapIndex: 0,
    lunarMonthIndex: 0, lunarDayIndex: 0,
    lunarRangeText: `农历换算支持 ${lunar.range.min}—${lunar.range.max} 农历年，仅支持每年倒计时生日。`,
    lunarDateText: '', lunarError: '', dateHint: ''
  },

  onLoad(options) {
    this._id = options && Object.prototype.hasOwnProperty.call(options, 'id') ? String(options.id) : null;
    this._submitLocked = false;
    this.loadForm(options || {});
  },

  onShow() {
    try { prepare(this, -1); } catch (error) { notify(error); }
  },

  loadForm(options) {
    try {
      const record = this._id !== null ? events.get(this._id) : null;
      if (this._id !== null && (!record || record.id !== this._id)) {
        throw new Error('这个日子已不存在，不能继续编辑。请返回后重新选择。');
      }
      const state = record ? Object.assign({}, record) : {
        name: '', date: dates.validDate(options.date) ? options.date : dates.today(),
        category: 'birthday', mode: 'countdown', repeat: 'yearly',
        calendarType: 'solar', icon: 'heart', tint: 'pink', pin: false,
        note: '', reminder: '不提醒', lunarMonth: 1, lunarDay: 1, lunarLeap: false
      };
      Object.keys(selectors).forEach(field => {
        const choices = selectors[field];
        if (!choices.some(item => item.value === state[field])) state[field] = choices[0].value;
      });
      state.name = state.name || '';
      state.note = state.note || '';
      state.reminder = '不提醒';
      state.lunarMonth = Number(state.lunarMonth) || 1;
      state.lunarDay = Number(state.lunarDay) || 1;
      if (state.lunarMonth < 1 || state.lunarMonth > 12 || state.lunarDay < 1 || state.lunarDay > 30) {
        throw new Error('农历月日无效，请返回后检查记录。');
      }
      if (state.calendarType === 'lunar') {
        state.category = 'birthday'; state.mode = 'countdown'; state.repeat = 'yearly';
      } else if (state.mode === 'countup') {
        state.repeat = 'none';
      }
      // 不将存储记录的 id 或其他未知字段放进可编辑表单状态。
      const fields = {};
      ['name', 'note', 'date', 'category', 'mode', 'repeat', 'calendarType', 'icon', 'tint',
        'pin', 'reminder', 'lunarMonth', 'lunarDay', 'lunarLeap'].forEach(field => { fields[field] = state[field]; });
      this._existingRecord = record;
      this.setData(Object.assign(fields, {
        loading: false, loadError: '', title: record ? '编辑这个日子' : '记下一个新日子'
      }));
      this.updatePresentation();
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '暂时无法读取这个日子。' });
      notify(error);
    }
  },

  onNameInput(event) { this.setData({ name: event.detail.value, error: '' }); },
  onNoteInput(event) { this.setData({ note: event.detail.value, error: '' }); },
  onDateChange(event) {
    if (this._submitLocked) return;
    this.setData({ date: event.detail.value, error: '' });
    this.updatePresentation();
  },

  onSelect(event) {
    if (this._submitLocked) return;
    const field = event.currentTarget.dataset.field;
    const index = Number(event.detail.value);
    if (!Number.isInteger(index)) return;
    const patch = { error: '' };
    if (field === 'lunarMonth' || field === 'lunarDay') {
      const limit = field === 'lunarMonth' ? 12 : 30;
      if (index < 0 || index >= limit) return;
      patch[field] = index + 1;
    } else {
      const options = selectors[field];
      if (!options || !options[index]) return;
      patch[field] = options[index].value;
    }
    if (field === 'calendarType' && patch.calendarType === 'lunar') {
      if (this.data.category !== 'birthday') {
        this.setData({ error: '农历仅支持生日，请先将分类改为生日。' });
        return;
      }
      patch.mode = 'countdown'; patch.repeat = 'yearly';
    }
    if (field === 'category' && patch.category !== 'birthday' && this.data.calendarType === 'lunar') {
      this.setData({ error: '农历仅支持生日。请先切换为公历，再更改分类。' });
      return;
    }
    if (field === 'mode') {
      if (this.data.calendarType === 'lunar' && patch.mode !== 'countdown') return;
      if (patch.mode === 'countup') patch.repeat = 'none';
    }
    if (field === 'repeat' && (this.data.calendarType === 'lunar' || this.data.mode === 'countup')) return;
    this.setData(patch);
    this.updatePresentation();
  },

  updatePresentation() {
    const patch = {};
    Object.keys(selectors).forEach(field => {
      patch[`${field}Index`] = selectors[field].findIndex(item => item.value === this.data[field]);
    });
    patch.lunarMonthIndex = this.data.lunarMonth - 1;
    patch.lunarDayIndex = this.data.lunarDay - 1;
    patch.lunarDateText = ''; patch.lunarError = ''; patch.dateHint = '';
    if (this.data.calendarType === 'lunar') {
      try {
        const converted = dates.nextDate(this.lunarRecord());
        if (!dates.validDate(converted) || converted < dates.today()) {
          patch.lunarError = '支持范围内没有下一次可换算日期，不能保存。请修改月日或闰月选择。';
        } else {
          patch.lunarDateText = `本次／下次公历日期：${converted.replace(/-/g, '.')}`;
        }
      } catch (error) {
        patch.lunarError = '农历日期暂时无法换算，不能保存。请检查月日或稍后重试。';
      }
    } else if (dates.validDate(this.data.date)) {
      if (this.data.mode === 'countup' && this.data.date > dates.today()) {
        patch.dateHint = '正计时从已经发生的日子开始，日期不能晚于今天。';
      } else if (this.data.mode === 'countdown' && this.data.repeat === 'none' && this.data.date < dates.today()) {
        patch.dateHint = this.timingFieldsChanged(this._existingRecord)
          ? '这一天已经过去，请改为正计时或每年重复后保存。'
          : '这一天已经过去，仍可编辑名称、备注等信息；保持计时设置不变即可保存。';
      }
    }
    this.setData(patch);
  },

  timingFieldsChanged(existing) {
    return !existing || ['date', 'mode', 'repeat', 'calendarType'].some(field => existing[field] !== this.data[field]);
  },

  lunarRecord() {
    return {
      calendarType: 'lunar', category: 'birthday', mode: 'countdown', repeat: 'yearly',
      date: this.data.date, lunarMonth: this.data.lunarMonth,
      lunarDay: this.data.lunarDay, lunarLeap: this.data.lunarLeap
    };
  },

  rejectSubmission(message) {
    this._submitLocked = false;
    this.setData({ saving: false, error: message });
  },

  onSubmit(event) {
    if (this._submitLocked || this.data.loading || this.data.loadError) return;
    // 同步锁先于 setData 生效，阻止同一帧内的双击提交。
    this._submitLocked = true;
    this.setData({ saving: true, error: '' });
    try {
      const values = event.detail.value;
      const name = String(values.name || '').trim();
      const note = String(values.note || '').trim();
      if (!name) { this.rejectSubmission('给这个日子起个名字吧。'); return; }
      if (name.length > 20) { this.rejectSubmission('日子名称不能超过 20 个字。'); return; }
      if (note.length > 120) { this.rejectSubmission('备注不能超过 120 个字。'); return; }
      const existing = this._id !== null ? events.get(this._id) : null;
      if (this._id !== null && (!existing || existing.id !== this._id)) {
        this.rejectSubmission('这个日子已被删除，不能重新保存为新记录。'); return;
      }
      let date = this.data.date;
      if (this.data.calendarType === 'lunar') {
        if (this.data.category !== 'birthday' || this.data.mode !== 'countdown' || this.data.repeat !== 'yearly') {
          this.rejectSubmission('农历仅支持每年倒计时生日。'); return;
        }
        date = dates.nextDate(this.lunarRecord());
        if (!dates.validDate(date) || date < dates.today()) {
          this.rejectSubmission('支持范围内没有下一次可换算农历日期，不能保存。'); return;
        }
      }
      if (!dates.validDate(date)) {
        this.rejectSubmission('请选择 1900—2100 年之间的有效日期。'); return;
      }
      if (this.data.mode === 'countup' && date > dates.today()) {
        this.rejectSubmission('正计时的开始日期不能晚于今天。'); return;
      }
      if (this.data.mode === 'countdown' && this.data.repeat === 'none' && date < dates.today() &&
          this.timingFieldsChanged(existing)) {
        this.rejectSubmission('这一天已过去，请选择正计时或每年重复。'); return;
      }
      // 合并完整记录，避免编辑或置顶状态使未展示字段丢失。
      const record = Object.assign({}, existing || {}, {
        name, note, date, category: this.data.category, mode: this.data.mode,
        repeat: this.data.mode === 'countup' ? 'none' : this.data.repeat,
        calendarType: this.data.calendarType, icon: this.data.icon, tint: this.data.tint,
        pin: this.data.pin, reminder: '不提醒'
      });
      if (this._id !== null) record.id = this._id;
      if (record.calendarType === 'lunar') {
        record.lunarMonth = this.data.lunarMonth;
        record.lunarDay = this.data.lunarDay;
        record.lunarLeap = this.data.lunarLeap;
      } else {
        delete record.lunarMonth; delete record.lunarDay; delete record.lunarLeap;
      }
      events.save(record);
    } catch (error) {
      this.rejectSubmission(error.message || '保存失败，请重试。');
      notify(error);
      return;
    }
    this.setData({ saving: false, saved: true });
    this.onSavedBack();
  },

  onSavedBack() {
    if (!this.data.saved) return;
    try {
      wx.navigateBack({ delta: 1, fail: () => {
        notify(new Error('日子已保存在本机，请点击左上角或下方按钮返回。'));
      } });
    } catch (error) { notify(error); }
  }
});
