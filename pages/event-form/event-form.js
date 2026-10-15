const { prepare, notify, refreshDaysReminderNotice } = require('../../utils/page');
const events = require('../../services/events');
const dates = require('../../utils/date');
const lunar = require('../../utils/lunar');
const festivals = require('../../utils/festivals');
const reminderOptions = require('../../utils/reminder');

const categories = [
  { value: 'birthday', label: '生日' },
  { value: 'anniversary', label: '纪念日' },
  { value: 'holiday', label: '节日' },
  { value: 'other', label: '其他' }
];
const modes = [
  { value: 'countdown', label: '倒计时 · 还有多少天' },
  { value: 'countup', label: '正计时 · 已经多少天' }
];
const repeats = [
  { value: 'yearly', label: '每年重复' },
  { value: 'monthly', label: '每月重复' },
  { value: 'none', label: '不重复' }
];
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
const holidayLabel = key => key === 'next' ? '最近节假日' : festivals.definition(key).label;
const categoryArt = {
  birthday: '/assets/birthday-art.png', holiday: '/assets/holiday-art.png',
  anniversary: '/assets/anniversary-art.png', other: '/assets/other-art.png'
};

Page({
  data: {
    theme: 'cream', guest: true, title: '记下一个新日子',
    loading: true, loadError: '', error: '', saving: false, saved: false,
    name: '', note: '', date: '', category: 'birthday', mode: 'countdown',
    repeat: 'yearly', calendarType: 'solar', icon: 'heart', tint: 'pink',
    pin: false, reminder: '不提醒', lunarMonth: 1, lunarDay: 1, lunarLeap: false,
    holidayKey: '', festivalActive: false, legacyHoliday: false, holidayChoices: [],
    holidayDateText: '', holidayHelp: '', holidayError: '',
    holidayRangeText: '按节日当天，非放假起始日，2020—2035年',
    monthlyHint: '', monthlyError: '', previewSrc: '', previewLabel: '',
    categories, modes, repeats, calendars, icons, tints, pins, leaps,
    reminders: reminderOptions.LABELS, reminderIndex: 0,
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
    this._autoHolidayName = '';
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
      const newHoliday = !record && options.category === 'holiday';
      const state = record ? Object.assign({}, record) : {
        name: '', date: dates.validDate(options.date) ? options.date : dates.today(),
        category: newHoliday ? 'holiday' : 'birthday', mode: 'countdown', repeat: 'yearly',
        calendarType: 'solar', icon: 'heart', tint: 'pink', pin: false,
        note: '', reminder: '不提醒', lunarMonth: 1, lunarDay: 1, lunarLeap: false
      };
      // 旧成长分类先归为其他，避免选择器回退到生日。
      if (state.category === 'growth') state.category = 'other';
      if (state.category === 'holiday' && state.holidayKey && !festivals.definition(state.holidayKey)) {
        throw new Error('节日选项无效，请返回后检查记录；不会自动替换节日或覆盖原日期。');
      }
      const active = state.category === 'holiday' && !!state.holidayKey && state.repeat === 'festival';
      Object.keys(selectors).forEach(field => {
        if (field === 'repeat' && active) return;
        const choices = selectors[field];
        if (!choices.some(item => item.value === state[field])) state[field] = choices[0].value;
      });
      state.holidayKey = active ? state.holidayKey : '';
      state.name = state.name || '';
      state.note = state.note || '';
      if (!reminderOptions.isKnown(state.reminder)) state.reminder = '不提醒';
      state.lunarMonth = Number(state.lunarMonth) || 1;
      state.lunarDay = Number(state.lunarDay) || 1;
      if (state.lunarMonth < 1 || state.lunarMonth > 12 || state.lunarDay < 1 || state.lunarDay > 30) {
        throw new Error('农历月日无效，请返回后检查记录。');
      }
      if (active) {
        state.calendarType = 'solar'; state.mode = 'countdown';
        this._autoHolidayName = holidayLabel(state.holidayKey);
      } else if (state.calendarType === 'lunar') {
        state.category = 'birthday'; state.mode = 'countdown'; state.repeat = 'yearly';
      } else if (state.mode === 'countup') {
        state.repeat = 'none';
      }
      // 不将存储记录的 id 或其他未知字段放进可编辑表单状态。
      const fields = {};
      ['name', 'note', 'date', 'category', 'mode', 'repeat', 'calendarType', 'icon', 'tint',
        'pin', 'reminder', 'lunarMonth', 'lunarDay', 'lunarLeap', 'holidayKey'].forEach(field => { fields[field] = state[field]; });
      this._existingRecord = record;
      this.setData(Object.assign(fields, {
        loading: false, loadError: '', title: record ? '编辑这个日子' : '记下一个新日子'
      }));
      if (newHoliday) this.selectHoliday('next');
      else this.updatePresentation();
    } catch (error) {
      this.setData({ loading: false, loadError: error.message || '暂时无法读取这个日子。' });
      notify(error);
    }
  },

  onNameInput(event) {
    if (this._submitLocked) return;
    this.setData({ name: event.detail.value, error: '' });
  },
  onNoteInput(event) {
    if (this._submitLocked) return;
    this.setData({ note: event.detail.value, error: '' });
  },
  onDateChange(event) {
    if (this._submitLocked || this.isFestivalForm()) return;
    this.setData({ date: event.detail.value, error: '' });
    this.updatePresentation();
  },

  onReminderChange(event) {
    if (this._submitLocked || this.data.saving) return;
    const index = Number(event.detail.value);
    if (!Number.isInteger(index) || !reminderOptions.LABELS[index]) return;
    this.setData({ reminder: reminderOptions.LABELS[index], reminderIndex: index, error: '' });
  },

  isFestivalForm() {
    return this.data.category === 'holiday' && this.data.repeat === 'festival' && !!festivals.definition(this.data.holidayKey);
  },

  onEnableHoliday() {
    if (this._submitLocked || this.data.loading || this.data.loadError || this.data.category !== 'holiday' || this.isFestivalForm()) return;
    this.selectHoliday('next');
  },

  onHolidaySelect(event) {
    if (this._submitLocked || !this.isFestivalForm()) return;
    const key = event.currentTarget.dataset.key;
    if (!festivals.definition(key)) {
      this.setData({ error: '请选择列表中的法定节日。' });
      return;
    }
    this.selectHoliday(key);
  },

  selectHoliday(key) {
    const autoName = holidayLabel(key);
    const patch = { holidayKey: key, calendarType: 'solar', mode: 'countdown', repeat: 'festival', error: '' };
    if (!this.data.name.trim() || this.data.name === this._autoHolidayName) patch.name = autoName;
    this._autoHolidayName = autoName;
    this.setData(patch);
    this.updatePresentation();
  },

  onSelect(event) {
    if (this._submitLocked || this.data.loading || this.data.loadError) return;
    const field = event.currentTarget.dataset.field;
    if (this.isFestivalForm() && ['calendarType', 'mode', 'repeat', 'lunarMonth', 'lunarDay', 'lunarLeap'].includes(field)) return;
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
    const enteringHoliday = field === 'category' && patch.category === 'holiday' && this.data.category !== 'holiday';
    if (field === 'calendarType' && patch.calendarType === 'lunar') {
      if (this.data.category !== 'birthday') {
        this.setData({ error: '农历仅支持生日，请先将分类改为生日。' });
        return;
      }
      patch.mode = 'countdown'; patch.repeat = 'yearly';
    }
    if (field === 'category' && patch.category !== 'birthday' && this.data.calendarType === 'lunar' && !enteringHoliday) {
      this.setData({ error: '农历仅支持生日。请先切换为公历，再更改分类。' });
      return;
    }
    if (field === 'category' && patch.category !== 'holiday') {
      patch.holidayKey = '';
      if (this.data.repeat === 'festival') patch.repeat = 'yearly';
    }
    if (field === 'mode') {
      if (this.data.calendarType === 'lunar' && patch.mode !== 'countdown') return;
      if (patch.mode === 'countup') patch.repeat = 'none';
    }
    if (field === 'repeat' && (this.data.calendarType === 'lunar' || this.data.mode === 'countup')) return;
    this.setData(patch);
    if (enteringHoliday) this.selectHoliday('next');
    else this.updatePresentation();
  },

  updatePresentation() {
    const patch = {};
    const base = dates.today();
    const active = this.isFestivalForm();
    Object.keys(selectors).forEach(field => {
      patch[`${field}Index`] = Math.max(0, selectors[field].findIndex(item => item.value === this.data[field]));
    });
    patch.reminderIndex = Math.max(0, reminderOptions.LABELS.indexOf(this.data.reminder));
    patch.lunarMonthIndex = this.data.lunarMonth - 1;
    patch.lunarDayIndex = this.data.lunarDay - 1;
    patch.previewSrc = categoryArt[this.data.category] || '/assets/cat-heart.png';
    patch.previewLabel = `${categories[patch.categoryIndex].label} · 卡片艺术预览`;
    patch.festivalActive = active;
    patch.legacyHoliday = this.data.category === 'holiday' && !active;
    patch.holidayChoices = []; patch.holidayDateText = ''; patch.holidayHelp = ''; patch.holidayError = '';
    patch.monthlyHint = ''; patch.monthlyError = '';
    patch.lunarDateText = ''; patch.lunarError = ''; patch.dateHint = '';
    if (active) {
      patch.holidayChoices = festivals.choices.map(choice => {
        const occurrence = festivals.next(choice.value, base);
        return {
          value: choice.value, label: holidayLabel(choice.value),
          dateText: occurrence ? dates.display(occurrence.date) : '超出支持范围',
          unavailable: !occurrence
        };
      });
      try {
        const occurrence = festivals.next(this.data.holidayKey, base);
        const next = dates.nextDate(this.festivalRecord(), base);
        patch.date = next || '';
        if (!occurrence || !dates.validDate(next) || next < base) {
          patch.holidayError = '2020—2035年支持范围内没有下一次节日，不能保存。';
        } else {
          patch.holidayDateText = `下次公历：${dates.display(next)} · ${dates.daysBetween(base, next)} 天后`;
          patch.holidayHelp = this.data.holidayKey === 'next'
            ? `最近节假日当前为${occurrence.label}；节日当天结束后，自动跟随下一个法定节日。`
            : `${occurrence.label} · 自动跟随节日，每次按节日当天计算。`;
        }
      } catch (error) {
        patch.holidayError = '节日日期暂时无法计算，不能保存，请稍后重试。';
      }
    } else if (this.data.calendarType === 'lunar') {
      try {
        const converted = dates.nextDate(this.lunarRecord(), base);
        if (!dates.validDate(converted) || converted < base) {
          patch.lunarError = '支持范围内没有下一次可换算日期，不能保存。请修改月日或闰月选择。';
        } else {
          patch.lunarDateText = `本次／下次公历日期：${dates.display(converted)}`;
        }
      } catch (error) {
        patch.lunarError = '农历日期暂时无法换算，不能保存。请检查月日或稍后重试。';
      }
    } else if (dates.validDate(this.data.date)) {
      if (this.data.mode === 'countdown' && this.data.repeat === 'monthly') {
        const next = dates.nextDate({ date: this.data.date, mode: 'countdown', repeat: 'monthly', calendarType: 'solar' }, base);
        patch.monthlyHint = `每月 ${Number(this.data.date.slice(8))} 日；小月缺少这一天时按月末。`;
        if (dates.validDate(next) && next >= base) {
          patch.monthlyHint += `下次公历：${dates.display(next)}，还有 ${dates.daysBetween(base, next)} 天。`;
        } else {
          patch.monthlyError = '1900—2100 年支持范围内没有下一次每月日期，不能保存。';
        }
      }
      if (this.data.mode === 'countup' && this.data.date > base) {
        patch.dateHint = '正计时从已经发生的日子开始，日期不能晚于今天。';
      } else if (this.data.mode === 'countdown' && this.data.repeat === 'none' && this.data.date < base) {
        patch.dateHint = this.timingFieldsChanged(this._existingRecord)
          ? '这一天已经过去，请改为正计时、每月或每年重复后保存。'
          : '这一天已经过去，仍可编辑名称、备注等信息；保持计时设置不变即可保存。';
      }
    }
    this.setData(patch);
  },

  timingFieldsChanged(existing) {
    return !existing || ['date', 'mode', 'repeat', 'calendarType'].some(field => existing[field] !== this.data[field]);
  },

  festivalRecord() {
    return {
      category: 'holiday', calendarType: 'solar', mode: 'countdown', repeat: 'festival',
      holidayKey: this.data.holidayKey, date: this.data.date
    };
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
      const active = this.isFestivalForm();
      let date = this.data.date;
      if (this.data.repeat === 'festival' || this.data.holidayKey) {
        if (!active || this.data.calendarType !== 'solar' || this.data.mode !== 'countdown') {
          this.rejectSubmission('节日选项无效，请重新选择法定节日；不能保存。'); return;
        }
        // 提交时重算，避免页面停留跨日后保存过期的节日公历日期。
        date = dates.nextDate(this.festivalRecord());
        if (!dates.validDate(date) || date < dates.today() ||
            Number(date.slice(0, 4)) < festivals.range.min || Number(date.slice(0, 4)) > festivals.range.max) {
          this.rejectSubmission('2020—2035年支持范围内没有下一次节日，不能保存。'); return;
        }
      } else if (this.data.calendarType === 'lunar') {
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
      if (this.data.mode === 'countdown' && this.data.repeat === 'monthly') {
        const next = dates.nextDate({ date, mode: 'countdown', repeat: 'monthly', calendarType: 'solar' });
        if (!dates.validDate(next) || next < dates.today()) {
          this.rejectSubmission('支持范围内没有下一次每月日期，不能保存。'); return;
        }
        // 只校验下一次，保存的仍是原日期锚点，不写回月末截断结果。
      }
      if (this.data.mode === 'countup' && date > dates.today()) {
        this.rejectSubmission('正计时的开始日期不能晚于今天。'); return;
      }
      if (this.data.mode === 'countdown' && this.data.repeat === 'none' && date < dates.today() &&
          this.timingFieldsChanged(existing)) {
        this.rejectSubmission('这一天已过去，请选择正计时、每月或每年重复。'); return;
      }
      // 合并完整记录，避免编辑或置顶状态使未展示字段丢失。
      const record = Object.assign({}, existing || {}, {
        name, note, date, category: this.data.category, mode: this.data.mode,
        repeat: this.data.mode === 'countup' ? 'none' : this.data.repeat,
        calendarType: this.data.calendarType, icon: this.data.icon, tint: this.data.tint,
        pin: this.data.pin, reminder: this.data.reminder
      });
      if (this._id !== null) record.id = this._id;
      if (active) record.holidayKey = this.data.holidayKey;
      else delete record.holidayKey;
      if (record.calendarType === 'lunar') {
        record.lunarMonth = this.data.lunarMonth;
        record.lunarDay = this.data.lunarDay;
        record.lunarLeap = this.data.lunarLeap;
      } else {
        delete record.lunarMonth; delete record.lunarDay; delete record.lunarLeap;
      }
      const savedRecord = events.save(record);
      this.scheduleAfterSave(savedRecord);
    } catch (error) {
      this.rejectSubmission(error.message || '保存失败，请重试。');
      notify(error);
      return;
    }
    // 未登录 + 这个日子开了提醒 -> show login prompt instead of the saved page
    // ⚠️ savedRecord 是在上面 try 块里声明的（const），出来就取不到了，
    //    直接用会 ReferenceError —— 页面就卡在「正在保存」。这里用表单自己的状态。
    var reminderOn = !!this.data.reminder && this.data.reminder !== '不提醒';
    if (!auth.currentUser() && reminderOn && !this.NOT_LOGGED_PROMPTED) {
      this.NOT_LOGGED_PROMPTED = true;
      this.setData({ saving: false });
      wx.showModal({
        title: '登录后，到日子会收到微信提醒',
        content: '日子已经存到这台手机了。登录一下，到那天微信就会提醒你 —— 换手机也不会丢。',
        confirmText: '去登录',
        cancelText: '以后再说',
        success: result => {
          wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/days/days' }) });
          if (result.confirm) {
            setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 150);
          }
        }
      });
      return;
    }
    this.setData({ saving: false, saved: true });
    this.onSavedBack();
  },

  showPostSaveNotice(title, content) {
    try {
      wx.showModal({ title, content, showCancel: false, confirmText: '知道了' });
    } catch (error) { notify(error); }
  },

  scheduleAfterSave(record) {
    if (typeof events.remoteReady !== 'function') return;
    const remindersService = require('../../services/reminders');
    const shouldSync = events.remoteReady();
    const remoteSync = shouldSync
      ? events.saveRemote(record).then(() => true).catch(() => {
        try { wx.showToast({ title: '已保存本机，云端同步未完成', icon: 'none' }); } catch (ignored) {}
        return false;
      })
      : Promise.resolve(false);
    if (!reminderOptions.enabledFor(record.reminder) || !remindersService.canRequestSubscription()) return;
    remindersService.requestSubscription().then(subscription => {
      if (!subscription.ok) {
        if (subscription.status === 'REJECTED') {
          this.showPostSaveNotice('需要重新授权', '日子已保存，但你拒绝了微信订阅授权；重新授权后才会继续处理提醒。');
        }
        return;
      }
      remoteSync.then(remoteSynced => remindersService.authorizeForEvent(record.id).then(authorized => {
        if (!authorized.ok) {
          // 登录过期是最常见的原因（JWT 默认 120 分钟），要说清楚，别丢一句"服务异常"。
          if (authorized.status === 'AUTH_EXPIRED' || authorized.status === 'UNAUTHORIZED') {
            this.showPostSaveNotice('登录已过期', `${authorized.message}\n日子已保存在本机；请到「我的」重新登录后再开启提醒。`);
            return;
          }
          this.showPostSaveNotice('提醒没开成功', authorized.message);
          return;
        }
        if (remoteSynced) {
          this.showPostSaveNotice('提醒已开启', '提醒开好了，日子也存进云端了。\n到那天会给你发一条服务通知，记得留意微信。');
        } else {
          // 标题必须和内容一致：云端没同步成功就别说"已开启"。
          this.showPostSaveNotice('还差一步', '微信授权拿到了，但日子还没同步到云端，这次提醒还没真正开起来。\n回头联网了，再点一次「开启提醒」就好。');
        }
        // 首页那条「还没开启提醒」是授权完成之前渲染的，这里让它重新读一次；
        // 否则会出现"弹窗说已开启、首页还说没开启"的矛盾，看起来像被要求开了两次。
        refreshDaysReminderNotice();
      }));
    }).catch(() => {
      this.showPostSaveNotice('提醒没开成功', '日子已保存，但提醒授权流程未完成，请稍后重新授权。');
    });
  },

  /** 保存完成、返回上一页。未登录时顺便提示一次「登录才收得到提醒」✅ */
  onSavedBack() {
    if (!this.data.saved) return;
    try {
      wx.navigateBack({ delta: 1, fail: () => {
        notify(new Error('日子已保存在本机，请点击左上角或下方按钮返回。'));
      } });
    } catch (error) { notify(error); }
  }
});
