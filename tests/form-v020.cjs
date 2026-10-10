'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 不加载真实服务；Page、wx 和记录均在隔离内存中模拟。
const root = path.resolve(__dirname, '..');
const formFile = path.join(root, 'pages/event-form/event-form.js');
const source = fs.readFileSync(formFile, 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const record = overrides => Object.assign({
  id: 'fixture', name: '测试日子', note: '', date: '2026-01-31', category: 'other',
  mode: 'countdown', repeat: 'yearly', calendarType: 'solar',
  icon: 'heart', tint: 'pink', pin: false, reminder: '不提醒'
}, overrides);

function harness({ records = [], today = '2026-10-10', deferSaving = false } = {}) {
  const clock = { today };
  const memory = new Map(records.map(item => [item.id, plain(item)]));
  const saved = [], notifications = [], navigations = [], deferred = [];
  const cache = new Map();
  const allowed = new Set(['date', 'lunar', 'holidays', 'festivals']);
  class FixedDate extends Date {
    constructor(...args) {
      const parts = clock.today.split('-').map(Number);
      super(...(args.length ? args : [parts[0], parts[1] - 1, parts[2], 12]));
    }
    static now() { return new FixedDate().getTime(); }
  }
  function load(name) {
    assert.ok(allowed.has(name), `禁止加载非纯日期模块：${name}`);
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    const context = vm.createContext({
      module, Date: FixedDate,
      require: request => {
        assert.ok(request.startsWith('./'), `禁止外部依赖：${request}`);
        return load(request.slice(2));
      }
    });
    const file = path.join(root, 'utils', `${name}.js`);
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(context);
    cache.set(name, module.exports);
    return module.exports;
  }
  const mockEvents = {
    get: id => memory.has(id) ? plain(memory.get(id)) : undefined,
    save: value => {
      if (mockEvents.beforeSave) mockEvents.beforeSave(value);
      const result = plain(value);
      saved.push(result);
      memory.set(result.id || 'mock-new-id', result);
      return result;
    }
  };
  const wx = {
    navigateBack: options => { navigations.push(options); },
    showToast: options => { notifications.push(options.title); },
    getStorageSync: () => { throw new Error('禁止访问真实存储'); },
    setStorageSync: () => { throw new Error('禁止访问真实存储'); }
  };
  let definition;
  const context = vm.createContext({
    Date: FixedDate, wx,
    Page: value => { definition = value; },
    require: request => {
      if (request === '../../services/events') return mockEvents;
      if (request === '../../utils/page') return {
        prepare: page => page.setData({ guest: true, theme: 'cream' }),
        notify: error => wx.showToast({ title: error.message })
      };
      assert.ok(request.startsWith('../../utils/'), `禁止加载依赖：${request}`);
      return load(request.slice('../../utils/'.length));
    }
  });
  new vm.Script(source, { filename: formFile }).runInContext(context);
  const page = Object.assign({}, definition, {
    data: plain(definition.data),
    setData(patch) {
      const immediate = plain(patch);
      if (deferSaving && Object.prototype.hasOwnProperty.call(immediate, 'saving')) {
        deferred.push(immediate.saving);
        delete immediate.saving;
      }
      Object.assign(this.data, immediate);
    }
  });
  const select = (field, value) => {
    const lists = { category: page.data.categories, repeat: page.data.repeats, mode: page.data.modes, calendarType: page.data.calendars };
    const index = lists[field].findIndex(choice => choice.value === value);
    assert.notEqual(index, -1, `测试选项不存在：${field}/${value}`);
    page.onSelect({ currentTarget: { dataset: { field } }, detail: { value: String(index) } });
  };
  const holiday = key => page.onHolidaySelect({ currentTarget: { dataset: { key } } });
  const submit = values => page.onSubmit({ detail: { value: Object.assign({ name: page.data.name, note: page.data.note }, values) } });
  return { page, memory, saved, notifications, navigations, deferred, clock, mockEvents, select, holiday, submit, dates: load('date') };
}

let passed = 0;
function test(label, run) {
  run(); passed++;
  console.log(`通过：${label}`);
}

function edit(overrides, options = {}) {
  const item = record(overrides);
  const h = harness(Object.assign({}, options, { records: [item] }));
  h.page.onLoad({ id: item.id });
  assert.equal(h.page.data.loadError, '');
  assert.equal(h.page.data.loading, false);
  return h;
}

function newHoliday(options = {}) {
  const h = harness(options);
  h.page.onLoad({ category: 'holiday' });
  return h;
}

test('每月31日展示月末与下一次天数，保存原日期而非截断日', () => {
  const h = edit({ repeat: 'monthly' }, { today: '2026-02-01' });
  assert.equal(h.page.data.date, '2026-01-31');
  assert.match(h.page.data.monthlyHint, /每月 31 日/);
  assert.match(h.page.data.monthlyHint, /小月.*月末/);
  assert.match(h.page.data.monthlyHint, /2026\.02\.28.*27 天/);
  h.submit();
  assert.equal(h.saved[0].date, '2026-01-31');
  assert.equal(h.saved[0].repeat, 'monthly');
  h.clock.today = '2026-03-01';
  assert.equal(h.dates.nextDate(h.saved[0]), '2026-03-31');
});

test('新建每月重复保存未来原始锚点且不注入id', () => {
  const h = harness({ today: '2026-02-01' });
  h.page.onLoad({ date: '2026-03-31' });
  h.select('repeat', 'monthly');
  h.submit({ name: '每月小愿望', id: '伪造id' });
  assert.equal(h.saved[0].date, '2026-03-31');
  assert.equal(Object.hasOwn(h.saved[0], 'id'), false);
  assert.equal(Object.hasOwn(h.page.data, 'id'), false);
});

test('旧成长编辑先归其他，保留原ID和未知字段', () => {
  const h = edit({ category: 'growth', extra: { untouched: true }, sample: true });
  assert.equal(h.page.data.category, 'other');
  assert.equal(h.page.data.categories[h.page.data.categoryIndex].value, 'other');
  assert.ok(h.page.data.categories.every(choice => choice.value !== 'growth'));
  assert.equal(h.page.data.previewSrc, '/assets/cat-heart.png');
  assert.equal(Object.hasOwn(h.page.data, 'id'), false);
  assert.equal(Object.hasOwn(h.page.data, 'extra'), false);
  h.submit({ name: '修改名称', id: '不可信id' });
  assert.equal(h.saved[0].id, 'fixture');
  assert.equal(h.saved[0].category, 'other');
  assert.deepEqual(h.saved[0].extra, { untouched: true });
});

test('新建节日默认最近节假日，明显列出8项和真实下一次日期', () => {
  const h = newHoliday();
  assert.equal(h.page.data.holidayKey, 'next');
  assert.equal(h.page.data.name, '最近节假日');
  assert.equal(h.page.data.date, '2027-01-01');
  assert.equal(h.page.data.festivalActive, true);
  assert.equal(h.page.data.calendarType, 'solar');
  assert.equal(h.page.data.mode, 'countdown');
  assert.equal(h.page.data.repeat, 'festival');
  assert.deepEqual(h.page.data.holidayChoices.map(choice => choice.value), ['next', 'new-year', 'spring', 'qingming', 'labour', 'dragon-boat', 'mid-autumn', 'national']);
  assert.equal(h.page.data.holidayChoices[0].label, '最近节假日');
  assert.equal(h.page.data.holidayChoices.find(choice => choice.value === 'spring').dateText, '2027.02.06');
  assert.match(h.page.data.holidayHelp, /当前为元旦.*自动跟随/);
  assert.match(h.page.data.holidayRangeText, /按节日当天，非放假起始日，2020—2035年/);
  assert.equal(h.page.data.previewSrc, '/assets/holiday-art.png');
});

test('主动切入节日后选择春节，自动名与公历2027年2月6日保存', () => {
  const h = harness();
  h.page.onLoad({});
  h.select('category', 'holiday');
  assert.equal(h.page.data.holidayKey, 'next');
  h.holiday('spring');
  assert.equal(h.page.data.name, '春节');
  assert.equal(h.page.data.date, '2027-02-06');
  assert.match(h.page.data.holidayDateText, /2027\.02\.06.*119 天/);
  h.submit();
  assert.equal(h.saved[0].holidayKey, 'spring');
  assert.equal(h.saved[0].date, '2027-02-06');
  assert.equal(h.saved[0].repeat, 'festival');
});

test('最近节假日保留自定义名称，切节日与跨日提交只更新日期', () => {
  const h = newHoliday();
  h.page.onNameInput({ detail: { value: '下一次全家聚餐' } });
  h.holiday('spring');
  h.holiday('next');
  assert.equal(h.page.data.name, '下一次全家聚餐');
  h.clock.today = '2027-01-02';
  h.submit();
  assert.equal(h.saved[0].name, '下一次全家聚餐');
  assert.equal(h.saved[0].holidayKey, 'next');
  assert.equal(h.saved[0].date, '2027-02-06');
});

test('旧节日无key的每年、每月、一次性与正计时不自动迁移', () => {
  for (const overrides of [
    { repeat: 'yearly' }, { repeat: 'monthly' }, { repeat: 'none' }, { mode: 'countup', repeat: 'none' }
  ]) {
    const h = edit(Object.assign({ category: 'holiday', date: '2026-04-04' }, overrides));
    assert.equal(h.page.data.holidayKey, '');
    assert.equal(h.page.data.festivalActive, false);
    assert.equal(h.page.data.legacyHoliday, true);
    assert.equal(h.page.data.date, '2026-04-04');
    assert.equal(h.page.data.mode, overrides.mode || 'countdown');
    assert.equal(h.page.data.repeat, overrides.repeat);
    h.holiday('spring');
    assert.equal(h.page.data.date, '2026-04-04');
    h.select('category', 'holiday');
    assert.equal(h.page.data.festivalActive, false);
    h.submit({ name: '保留旧手动节日' });
    assert.equal(h.saved[0].date, '2026-04-04');
    assert.equal(h.saved[0].repeat, overrides.repeat);
    assert.equal(Object.hasOwn(h.saved[0], 'holidayKey'), false);
  }
});

test('旧手动节日只经改用法定节日按钮启用，保留用户名称', () => {
  const h = edit({ category: 'holiday', repeat: 'none', date: '2026-04-04', name: '我的团聚日' });
  h.page.onEnableHoliday();
  assert.equal(h.page.data.holidayKey, 'next');
  assert.equal(h.page.data.name, '我的团聚日');
  assert.equal(h.page.data.date, '2027-01-01');
  h.holiday('spring');
  h.submit();
  assert.equal(h.saved[0].name, '我的团聚日');
  assert.equal(h.saved[0].date, '2027-02-06');
});

test('加载有效节日key与重复模式并锁历法、计时、重复和手动日期', () => {
  const h = edit({ category: 'holiday', repeat: 'festival', holidayKey: 'spring', name: '春节', date: '2026-02-17' });
  assert.equal(h.page.data.festivalActive, true);
  assert.equal(h.page.data.date, '2027-02-06');
  h.select('calendarType', 'lunar');
  h.select('mode', 'countup');
  for (const repeat of ['yearly', 'monthly', 'none']) h.select('repeat', repeat);
  h.page.onDateChange({ detail: { value: '2026-04-04' } });
  assert.equal(h.page.data.calendarType, 'solar');
  assert.equal(h.page.data.mode, 'countdown');
  assert.equal(h.page.data.repeat, 'festival');
  assert.equal(h.page.data.date, '2027-02-06');
  h.holiday('labour');
  assert.equal(h.page.data.name, '劳动节');
  h.submit();
  assert.equal(h.saved[0].id, 'fixture');
  assert.equal(h.saved[0].holidayKey, 'labour');
});

test('旧非节日对象即使有key也不激活，保存清除残留key', () => {
  for (const holidayKey of ['spring', '非法key']) {
    const h = edit({ holidayKey, repeat: 'festival', date: '2026-04-04' });
    assert.equal(h.page.data.category, 'other');
    assert.equal(h.page.data.festivalActive, false);
    assert.equal(h.page.data.holidayKey, '');
    assert.equal(h.page.data.repeat, 'yearly');
    assert.equal(h.page.data.date, '2026-04-04');
    h.submit();
    assert.equal(Object.hasOwn(h.saved[0], 'holidayKey'), false);
  }
});

test('节日有效key但不是自动重复仍保留手动模式', () => {
  const h = edit({ category: 'holiday', holidayKey: 'spring', repeat: 'none', date: '2026-04-04' });
  assert.equal(h.page.data.festivalActive, false);
  assert.equal(h.page.data.date, '2026-04-04');
  h.submit();
  assert.equal(h.saved[0].repeat, 'none');
  assert.equal(Object.hasOwn(h.saved[0], 'holidayKey'), false);
});

test('主动离开节日清key并回每年，保存不残留key且保留未知字段', () => {
  const h = edit({ category: 'holiday', repeat: 'festival', holidayKey: 'spring', extra: '保留' });
  h.select('category', 'anniversary');
  assert.equal(h.page.data.holidayKey, '');
  assert.equal(h.page.data.repeat, 'yearly');
  assert.equal(h.page.data.festivalActive, false);
  assert.equal(h.page.data.previewSrc, '/assets/anniversary-art.png');
  h.submit();
  assert.equal(Object.hasOwn(h.saved[0], 'holidayKey'), false);
  assert.equal(h.saved[0].extra, '保留');
});

test('非法节日key加载报错而非猜测替换，不能保存', () => {
  const h = harness({ records: [record({ category: 'holiday', holidayKey: 'invalid', repeat: 'festival' })] });
  h.page.onLoad({ id: 'fixture' });
  assert.match(h.page.data.loadError, /节日选项无效.*不会自动替换/);
  assert.equal(h.memory.get('fixture').date, '2026-01-31');
  assert.equal(Object.hasOwn(h.page.data, 'id'), false);
  h.submit({ name: '不能覆盖' });
  assert.equal(h.saved.length, 0);
});

test('非法选择不覆盖有效key，提交时非法key也不能保存', () => {
  const h = newHoliday();
  h.holiday('invalid');
  assert.equal(h.page.data.holidayKey, 'next');
  assert.match(h.page.data.error, /请选择列表/);
  h.page.setData({ holidayKey: 'invalid' });
  h.submit();
  assert.equal(h.saved.length, 0);
  assert.match(h.page.data.error, /节日选项无效/);
  assert.equal(h.page._submitLocked, false);
});

test('超出节日支持范围展示范围提示，UI与提交均不能保存', () => {
  const h = newHoliday({ today: '2036-01-01' });
  assert.equal(h.page.data.date, '');
  assert.match(h.page.data.holidayError, /2020—2035年.*不能保存/);
  assert.ok(h.page.data.holidayChoices.every(choice => choice.unavailable));
  h.submit();
  assert.equal(h.saved.length, 0);
  assert.equal(h.page._submitLocked, false);
  assert.match(h.page.data.error, /2020—2035年/);
  const expired = newHoliday();
  expired.clock.today = '2036-01-01';
  expired.submit();
  assert.equal(expired.saved.length, 0);
});

test('最后支持年节日已过去不回退原日期，最近选项仍可到当天', () => {
  const h = newHoliday({ today: '2035-12-31' });
  assert.match(h.page.data.holidayError, /不能保存/);
  h.submit();
  assert.equal(h.saved.length, 0);
  const sameDay = newHoliday({ today: '2027-01-01' });
  assert.match(sameDay.page.data.holidayDateText, /0 天后/);
  sameDay.submit();
  assert.equal(sameDay.saved[0].date, '2027-01-01');
});

test('删除前后均锁定编辑ID，不能复活或新建其他记录', () => {
  const missing = harness();
  missing.page.onLoad({ id: 'deleted' });
  assert.match(missing.page.data.loadError, /已不存在/);
  missing.submit({ name: '不能复活' });
  assert.equal(missing.saved.length, 0);
  const h = edit({});
  h.memory.delete('fixture');
  h.submit();
  h.submit();
  assert.equal(h.saved.length, 0);
  assert.match(h.page.data.error, /已被删除/);
  assert.equal(h.page._submitLocked, false);
});

test('同步提交锁不依赖setData，重入、同帧双击与已保存编辑均受保护', () => {
  const h = harness({ deferSaving: true });
  h.page.onLoad({});
  h.page.onNameInput({ detail: { value: '双锁测试' } });
  h.mockEvents.beforeSave = () => {
    assert.equal(h.page.data.saving, false);
    assert.equal(h.page._submitLocked, true);
    h.submit();
    h.select('category', 'holiday');
    h.page.onNameInput({ detail: { value: '不应修改' } });
    h.page.onDateChange({ detail: { value: '2000-01-01' } });
  };
  h.submit();
  h.submit();
  assert.equal(h.saved.length, 1);
  assert.equal(h.page.data.saved, true);
  assert.equal(h.page.data.name, '双锁测试');
  assert.equal(h.page.data.category, 'birthday');
  assert.equal(h.navigations.length, 1);
});

test('保存异常解除锁，重试可保存且未知字段不丢失', () => {
  const h = edit({ extra: { stable: 1 } });
  h.mockEvents.beforeSave = () => { throw new Error('模拟失败'); };
  h.submit();
  assert.equal(h.page._submitLocked, false);
  assert.equal(h.page.data.saving, false);
  assert.match(h.page.data.error, /模拟失败/);
  delete h.mockEvents.beforeSave;
  h.submit();
  assert.equal(h.saved.length, 1);
  assert.deepEqual(h.saved[0].extra, { stable: 1 });
});

test('农历生日仍固定每年倒计时，不能产生农历monthly组合', () => {
  const h = harness();
  h.page.onLoad({});
  h.select('repeat', 'monthly');
  h.select('calendarType', 'lunar');
  assert.equal(h.page.data.repeat, 'yearly');
  h.select('repeat', 'monthly');
  h.select('mode', 'countup');
  assert.equal(h.page.data.repeat, 'yearly');
  assert.equal(h.page.data.mode, 'countdown');
  h.submit({ name: '农历生日' });
  assert.equal(h.saved[0].date, '2027-02-06');
  assert.equal(h.saved[0].lunarMonth, 1);
  assert.equal(h.saved[0].lunarDay, 1);
  const invalid = harness();
  invalid.page.onLoad({});
  invalid.page.setData({ calendarType: 'lunar', repeat: 'monthly' });
  invalid.submit({ name: '非法组合' });
  assert.equal(invalid.saved.length, 0);
});

test('主动切农历生日到节日自动换公历，其他分类不能选择农历', () => {
  const h = harness();
  h.page.onLoad({});
  h.select('calendarType', 'lunar');
  h.select('category', 'holiday');
  assert.equal(h.page.data.calendarType, 'solar');
  assert.equal(h.page.data.holidayKey, 'next');
  const other = edit({});
  other.select('calendarType', 'lunar');
  assert.equal(other.page.data.calendarType, 'solar');
  assert.match(other.page.data.error, /农历仅支持生日/);
});

test('正计时repeat固定none，未来日期拒绝，恢复日期后可保存', () => {
  const h = harness();
  h.page.onLoad({ date: '2026-10-11' });
  h.select('repeat', 'monthly');
  h.select('mode', 'countup');
  assert.equal(h.page.data.repeat, 'none');
  h.select('repeat', 'monthly');
  assert.equal(h.page.data.repeat, 'none');
  h.submit({ name: '正计时测试' });
  assert.equal(h.saved.length, 0);
  assert.match(h.page.data.error, /不能晚于今天/);
  h.page.onDateChange({ detail: { value: '2026-10-09' } });
  h.submit({ name: '正计时测试' });
  assert.equal(h.saved[0].repeat, 'none');
});

test('过期一次性记录只允许信息编辑，改变计时字段不能保存', () => {
  const unchanged = edit({ repeat: 'none', date: '2026-04-04' });
  unchanged.submit({ name: '修改名称' });
  assert.equal(unchanged.saved.length, 1);
  const changed = edit({ repeat: 'none', date: '2026-04-04' });
  changed.page.onDateChange({ detail: { value: '2026-04-05' } });
  changed.submit();
  assert.equal(changed.saved.length, 0);
  assert.match(changed.page.data.error, /这一天已过去/);
});

test('日期、每月范围、名称和备注长度校验保留', () => {
  for (const date of ['1899-12-31', '2101-01-01', '2026-02-30']) {
    const h = harness();
    h.page.onLoad({});
    h.page.onDateChange({ detail: { value: date } });
    h.submit({ name: '无效日期' });
    assert.equal(h.saved.length, 0);
    assert.match(h.page.data.error, /有效日期/);
  }
  const last = edit({ repeat: 'monthly', date: '2100-01-01' }, { today: '2100-12-31' });
  assert.match(last.page.data.monthlyError, /不能保存/);
  last.submit();
  assert.equal(last.saved.length, 0);
  const names = harness();
  names.page.onLoad({});
  for (const values of [{ name: '' }, { name: '字'.repeat(21) }, { name: '测试', note: '字'.repeat(121) }]) {
    names.submit(values);
    assert.equal(names.saved.length, 0);
    assert.equal(names.page._submitLocked, false);
  }
});

test('静态模板标签平衡、节日选择可见、受控UI禁用和艺术预览路径', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/event-form/event-form.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(root, 'pages/event-form/event-form.wxss'), 'utf8');
  const stack = [];
  const tags = /<(\/?)([a-z][\w-]*)(?:\s[^<>]*?)?(\/?)>/g;
  for (const match of wxml.matchAll(tags)) {
    if (match[1]) assert.equal(stack.pop(), match[2], `模板标签不匹配：${match[2]}`);
    else if (!match[3]) stack.push(match[2]);
  }
  assert.equal(stack.length, 0);
  assert.match(wxml, /改用法定节日/);
  assert.match(wxml, /wx:for="\{\{holidayChoices\}\}"/);
  assert.match(wxml, /wx:if="\{\{festivalActive\}\}"/);
  assert.match(wxml, /disabled="\{\{saving \|\| festivalActive/);
  assert.match(wxml, /saving \|\| lunarError \|\| holidayError \|\| monthlyError/);
  assert.match(wxml, /src="\{\{previewSrc\}\}"/);
  assert.equal((wxss.match(/\{/g) || []).length, (wxss.match(/\}/g) || []).length);
  const h = harness();
  h.page.onLoad({});
  assert.equal(h.page.data.previewSrc, '/assets/birthday-art.png');
  h.select('category', 'anniversary');
  assert.equal(h.page.data.previewSrc, '/assets/anniversary-art.png');
  h.select('category', 'other');
  assert.equal(h.page.data.previewSrc, '/assets/cat-heart.png');
});

console.log(`全部通过：${passed} 组隔离表单回归测试。未调用真实服务、微信CLI或用户存储。`);
