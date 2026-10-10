'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 只在隔离上下文加载纯日期模块；固定今天，不加载服务或访问微信与真实数据。
const root = path.resolve(__dirname, '..');
const cache = new Map();
const allowed = new Set(['date', 'lunar', 'holidays', 'festivals']);
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [2026, 9, 10, 12])); }
  static now() { return new FixedDate().getTime(); }
}
function load(name) {
  assert.ok(allowed.has(name), `禁止加载非纯日期模块：${name}`);
  if (cache.has(name)) return cache.get(name);
  const module = { exports: {} };
  cache.set(name, module.exports);
  const context = vm.createContext({
    module, Date: FixedDate,
    require: request => {
      assert.ok(request.startsWith('./'), `禁止外部依赖：${request}`);
      if (name === 'festivals') assert.equal(request, './lunar');
      return load(request.slice(2));
    }
  });
  const file = path.join(root, 'utils', `${name}.js`);
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(context);
  cache.set(name, module.exports);
  return module.exports;
}
const date = load('date');
const festivals = load('festivals');
const lunar = load('lunar');
const plain = value => JSON.parse(JSON.stringify(value));
const event = overrides => Object.assign({
  id: 'test', name: '保留原始名称', date: '2026-01-31', category: 'other',
  mode: 'countdown', repeat: 'none', calendarType: 'solar', pin: false
}, overrides);
const festival = key => event({ category: 'holiday', repeat: 'festival', holidayKey: key });
let passed = 0;
function test(label, run) {
  run(); passed++;
  console.log(`通过：${label}`);
}

test('每月31号截断后还原，并保持原始锚点', () => {
  const e = Object.freeze(event({ repeat: 'monthly' }));
  assert.equal(date.monthlyDate(e, 2026, 2), '2026-02-28');
  assert.equal(date.monthlyDate(e, 2026, 3), '2026-03-31');
  assert.equal(date.monthlyDate(e, 2026, 4), '2026-04-30');
  assert.equal(date.monthlyDate(e, 2026, 5), '2026-05-31');
  assert.equal(date.nextDate(e, '2026-02-01'), '2026-02-28');
  assert.equal(date.nextDate(e, '2026-03-01'), '2026-03-31');
  assert.equal(e.date, '2026-01-31');
});

test('闰年截断到2月29日，下月恢复31号；原始29号不变成31号', () => {
  const e = event({ date: '2024-01-31', repeat: 'monthly' });
  assert.equal(date.nextDate(e, '2024-02-01'), '2024-02-29');
  assert.equal(date.nextDate(e, '2024-03-01'), '2024-03-31');
  assert.equal(date.monthlyDate(event({ date: '2024-02-29', repeat: 'monthly' }), 2024, 3), '2024-03-29');
});

test('每月当天、次日、跨年和未来锚点', () => {
  const e = event({ repeat: 'monthly' });
  assert.equal(date.nextDate(e, '2026-01-31'), '2026-01-31');
  assert.equal(date.annotate(e, '2026-01-31').count, 0);
  assert.equal(date.nextDate(e, '2026-02-28'), '2026-02-28');
  assert.equal(date.nextDate(e, '2026-12-31'), '2026-12-31');
  assert.equal(date.nextDate(e, '2027-01-01'), '2027-01-31');
  assert.equal(date.nextDate(event({ date: '2026-12-15', repeat: 'monthly' }), '2026-12-16'), '2027-01-15');
  const future = event({ date: '2027-03-31', repeat: 'monthly' });
  assert.equal(date.nextDate(future, '2026-01-01'), '2027-03-31');
  assert.equal(date.monthlyDate(future, 2027, 2), '');
  assert.equal(date.occurrencesInMonth(2027, 2, [future]).length, 0);
  assert.ok(date.monthCells(2027, 2, [future]).cells.every(c => c.eventCount === 0));
  assert.equal(date.monthlyDate(e, 2026, 0), '');
  assert.equal(date.monthlyDate(e, 2101, 1), '');
  assert.equal(date.nextDate(event({ date: '2026-02-30', repeat: 'monthly' }), '2026-03-01'), '');
});

test('每月月历及邻月格子保持实际日期', () => {
  const e = event({ repeat: 'monthly', tint: 'pink' });
  assert.deepEqual(plain(date.occurrencesInMonth(2026, 2, [e]).map(r => r.occurrence)), ['2026-02-28']);
  assert.deepEqual(plain(date.occurrencesInMonth(2026, 3, [e]).map(r => r.occurrence)), ['2026-03-31']);
  const feb = date.monthCells(2026, 2, [e, event({ id: 'first', date: '2025-01-01', repeat: 'monthly' })]);
  const january31 = feb.cells.find(c => c.date === '2026-01-31');
  assert.equal(january31.current, false);
  assert.equal(january31.eventCount, 1);
  assert.equal(january31.dots[0].id, 'test');
  assert.equal(feb.cells.find(c => c.date === '2026-03-01').eventCount, 1);
  const march = date.monthCells(2026, 3, [e]);
  assert.equal(march.cells.find(c => c.date === '2026-02-28').eventCount, 1);
  assert.equal(march.occurrences[0].occurrence, '2026-03-31');
});

test('正计时忽略所有重复类型且月历只显示原日期', () => {
  for (const repeat of ['none', 'yearly', 'monthly', 'festival']) {
    const e = festival('spring');
    Object.assign(e, { mode: 'countup', repeat, date: '2026-02-06', calendarType: 'lunar', lunarMonth: 1, lunarDay: 1 });
    assert.equal(date.nextDate(e, '2027-02-01'), '2026-02-06');
    assert.equal(date.annotate(e, '2026-02-07').count, 1);
    assert.equal(date.annotate(e, '2026-02-07').resolvedHolidayLabel, '');
    assert.equal(date.occurrencesInMonth(2026, 2, [e]).length, 1);
    assert.equal(date.occurrencesInMonth(2027, 2, [e]).length, 0);
    assert.equal(date.occurrencesInMonth(2026, 3, [e]).length, 0);
  }
});

test('旧公历一次性与每年重复回归', () => {
  const once = event({ date: '2020-02-29' });
  assert.equal(date.nextDate(once, '2026-10-10'), '2020-02-29');
  const annual = event({ date: '2024-02-29', repeat: 'yearly' });
  assert.equal(date.nextDate(annual, '2025-02-01'), '2025-02-28');
  assert.equal(date.nextDate(annual, '2025-03-01'), '2026-02-28');
  assert.equal(date.nextDate(annual, '2023-01-01'), '2024-02-29');
  assert.equal(date.occurrencesInMonth(2023, 2, [annual]).length, 0);
  assert.equal(date.occurrencesInMonth(2025, 2, [annual])[0].occurrence, '2025-02-28');
  assert.equal(date.annotate(event({ date: '2026-10-09' }), '2026-10-10').count, -1);
  assert.equal(date.validDate('2024-02-29'), true);
  assert.equal(date.validDate('2026-02-29'), false);
  assert.equal(date.daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(date.today(), '2026-10-10');
});

test('旧农历重复、闰月及跨公历年月历回归', () => {
  const e = event({ repeat: 'yearly', calendarType: 'lunar', lunarMonth: 1, lunarDay: 1, lunarLeap: false });
  assert.equal(date.nextDate(e, '2026-10-10'), '2027-02-06');
  assert.equal(date.nextDate(e, '2027-02-06'), '2027-02-06');
  assert.equal(date.nextDate(e, '2027-02-07'), lunar.findDate(2028, 1, 1, false));
  assert.equal(date.occurrencesInMonth(2027, 2, [e])[0].occurrence, '2027-02-06');
  const leap = event({ repeat: 'yearly', calendarType: 'lunar', lunarMonth: 2, lunarDay: 1, lunarLeap: true });
  assert.equal(date.nextDate(leap, '2023-01-01'), '2023-03-22');
  assert.equal(date.occurrencesInMonth(2024, 3, [leap]).length, 0);
  const last = event({ repeat: 'yearly', calendarType: 'lunar', lunarMonth: 12, lunarDay: 29, lunarLeap: false });
  const target = lunar.findDate(2026, 12, 29, false);
  assert.equal(target.slice(0, 4), '2027');
  assert.equal(date.nextDate(last, '2027-01-01'), target);
  assert.equal(date.occurrencesInMonth(2027, Number(target.slice(5, 7)), [last])[0].occurrence, target);
  assert.equal(date.nextDate(e, '2036-12-31'), '');
});

test('节日8项选项、定义和严格年份范围', () => {
  assert.deepEqual(plain(festivals.range), { min: 2020, max: 2035 });
  assert.deepEqual(plain(festivals.choices.map(d => d.value)), ['next', 'new-year', 'spring', 'qingming', 'labour', 'dragon-boat', 'mid-autumn', 'national']);
  assert.ok(festivals.choices.every(d => Object.keys(d).length === 2 && d.label));
  assert.equal(festivals.definition('spring').label, '春节');
  assert.equal(festivals.definition('next').label, '最近节假日');
  assert.equal(festivals.definition('invalid'), null);
  const def = festivals.definition('spring'); def.label = '临时修改';
  assert.equal(festivals.definition('spring').label, '春节');
  for (const key of festivals.choices.map(d => d.value)) {
    for (const year of [2019, 2036, 2026.5, NaN]) assert.equal(festivals.dateInYear(key, year), '');
  }
  assert.equal(festivals.dateInYear('next', 2026), '');
  assert.equal(festivals.dateInYear('invalid', 2026), '');
  assert.equal(festivals.next('invalid', '2026-10-10'), null);
  assert.equal(festivals.next('next', '2026-02-30'), null);
  assert.equal(festivals.next('next', '2036-01-01'), null);
  assert.equal(festivals.occurrences('next', 2036, 1).length, 0);
});

test('春节、端午、中秋逐年农历换算，公历三节固定', () => {
  assert.equal(festivals.dateInYear('spring', 2027), '2027-02-06');
  assert.equal(festivals.dateInYear('spring', 2026), '2026-02-17');
  assert.equal(festivals.dateInYear('dragon-boat', 2026), '2026-06-19');
  assert.equal(festivals.dateInYear('mid-autumn', 2026), '2026-09-25');
  for (let y = 2020; y <= 2035; y++) {
    assert.equal(festivals.dateInYear('new-year', y), `${y}-01-01`);
    assert.equal(festivals.dateInYear('labour', y), `${y}-05-01`);
    assert.equal(festivals.dateInYear('national', y), `${y}-10-01`);
    assert.equal(festivals.dateInYear('spring', y), lunar.findDate(y, 1, 1, false));
    assert.equal(festivals.dateInYear('dragon-boat', y), lunar.findDate(y, 5, 5, false));
    assert.equal(festivals.dateInYear('mid-autumn', y), lunar.findDate(y, 8, 15, false));
  }
  assert.equal(festivals.next('spring', '2026-02-18').date, '2027-02-06');
});

test('清明静态表对应源文本，2026年4月5日不是假期起点', () => {
  const days = [4, 4, 5, 5, 4, 4, 5, 5, 4, 4, 5, 5, 4, 4, 5, 5];
  days.forEach((day, i) => assert.equal(festivals.dateInYear('qingming', 2020 + i), `${2020 + i}-04-0${day}`));
  assert.equal(date.annotate(festival('qingming'), '2026-04-04').count, 1);
  assert.equal(date.annotate(festival('qingming'), '2026-04-05').count, 0);
  assert.equal(date.monthCells(2026, 4, [festival('qingming')]).cells.find(c => c.date === '2026-04-04').eventCount, 0);
});

test('动态最近节日跨年、元旦当天0、次日春节', () => {
  assert.deepEqual(plain(festivals.next('next', '2026-10-10')), { key: 'new-year', label: '元旦', date: '2027-01-01' });
  assert.equal(date.nextDate(festival('next'), '2026-10-10'), '2027-01-01');
  assert.equal(date.annotate(festival('next'), '2027-01-01').count, 0);
  assert.deepEqual(plain(festivals.next('next', '2027-01-02')), { key: 'spring', label: '春节', date: '2027-02-06' });
  assert.equal(date.nextDate(festival('new-year'), '2027-01-02'), '2028-01-01');
  assert.equal(date.nextDate(festival('spring'), '2027-02-07'), lunar.findDate(2028, 1, 1, false));
});

test('无键旧节日保持计时，只有有效新模型进入节日分支', () => {
  const legacy = event({ category: 'holiday', date: '2026-04-04' });
  assert.equal(date.nextDate(legacy, '2026-10-10'), '2026-04-04');
  assert.equal(date.annotate(legacy, '2026-04-05').count, -1);
  assert.equal(date.annotate(legacy).festivalHelp, '');
  assert.equal(date.nextDate(Object.assign({}, legacy, { repeat: 'yearly' }), '2026-10-10'), '2027-04-04');
  assert.equal(date.nextDate(Object.assign({}, legacy, { repeat: 'festival' }), '2026-10-10'), '2026-04-04');
  assert.equal(date.nextDate(Object.assign({}, festival('invalid')), '2026-10-10'), '2026-01-31');
  assert.equal(date.nextDate(Object.assign({}, festival('spring'), { category: 'other' }), '2026-10-10'), '2026-01-31');
  assert.equal(date.nextDate(Object.assign({}, festival('spring'), { repeat: 'none' }), '2026-10-10'), '2026-01-31');
});

test('节日月历按当天发生，最近选择全年七类各一次', () => {
  const all = [];
  const e = Object.freeze(festival('next'));
  for (let month = 1; month <= 12; month++) {
    const raw = festivals.occurrences('next', 2027, month);
    const rows = date.occurrencesInMonth(2027, month, [e]);
    assert.deepEqual(plain(rows.map(r => r.occurrence)), plain(raw.map(r => r.date)));
    rows.forEach((r, i) => {
      assert.equal(r.name, e.name);
      assert.equal(r.resolvedHolidayLabel, raw[i].label);
      assert.equal(r.day, Number(raw[i].date.slice(8)));
    });
    all.push(...raw);
  }
  assert.equal(all.length, 7);
  assert.equal(new Set(all.map(r => r.key)).size, 7);
  assert.equal(date.occurrencesInMonth(2027, 2, [festival('spring')])[0].occurrence, '2027-02-06');
  assert.equal(date.occurrencesInMonth(2027, 3, [festival('spring')]).length, 0);
  const mixed = date.occurrencesInMonth(2027, 2, [event({ id: 'later', date: '2027-02-20', pin: true }), festival('spring')]);
  assert.deepEqual(plain(mixed.map(r => r.occurrence)), ['2027-02-06', '2027-02-20']);
  assert.equal(festivals.occurrences('next', 2027, 13).length, 0);
  // 中秋和国庆同一天时，日历键必须区分具体节日。
  const overlap = date.occurrencesInMonth(2031, 10, [festival('next')]);
  const sameDay = overlap.filter(r => r.occurrence === '2031-10-01');
  assert.equal(sameDay.length, 2);
  assert.equal(new Set(sameDay.map(r => r.id + '-' + r.occurrence + '-' + r.occurrenceHolidayKey)).size, 2);
});

test('注解保留名称、派生节日名、分类背景及其他分类', () => {
  const e = Object.freeze(festival('next'));
  const a = date.annotate(e, '2027-01-02');
  assert.equal(a.name, '保留原始名称');
  assert.equal(a.resolvedHolidayLabel, '春节');
  assert.ok(a.festivalHelp.includes('2020') && a.festivalHelp.includes('2035'));
  assert.equal(a.backgroundSrc, '/assets/holiday-art.png');
  assert.notEqual(a, e);
  const backgrounds = { birthday: '/assets/birthday-art.png', anniversary: '/assets/anniversary-art.png', holiday: '/assets/holiday-art.png', other: '', growth: '' };
  Object.entries(backgrounds).forEach(([category, src]) => assert.equal(date.annotate(event({ category })).backgroundSrc, src));
  assert.equal(date.annotate(event({ category: 'growth' })).categoryName, '其他');
  const unavailable = date.annotate(e, '2036-01-01');
  assert.equal(unavailable.count, null);
  assert.equal(unavailable.resolvedHolidayLabel, '');
});

test('排序置顶、0、未来、过去、正计时、不可换算及同值稳定且不修改输入', () => {
  const input = [
    event({ id: 'past-far', date: '2026-10-01' }),
    event({ id: 'countup-long', date: '2026-10-01', mode: 'countup', repeat: 'monthly' }),
    event({ id: 'future-tie-a', date: '2026-10-12' }),
    event({ id: 'unavailable-a', repeat: 'yearly', calendarType: 'lunar', lunarMonth: 13, lunarDay: 1, lunarLeap: false }),
    event({ id: 'pin-past', date: '2026-01-01', pin: true }),
    event({ id: 'today', date: '2026-10-10' }),
    event({ id: 'future-tie-b', date: '2026-10-12' }),
    event({ id: 'past-tie-a', date: '2026-10-09' }),
    event({ id: 'countup-short', date: '2026-10-09', mode: 'countup' }),
    event({ id: 'future-near', date: '2026-10-11' }),
    event({ id: 'pin-today', date: '2026-10-10', pin: true }),
    event({ id: 'past-tie-b', date: '2026-10-09' }),
    event({ id: 'pin-unavailable', date: '', pin: true }),
    event({ id: 'unavailable-b', date: '' })
  ];
  const snapshot = JSON.stringify(input);
  input.forEach(Object.freeze); Object.freeze(input);
  const sorted = date.sortEvents(input, '2026-10-10');
  assert.deepEqual(plain(sorted.map(e => e.id)), [
    'pin-today', 'pin-past', 'pin-unavailable', 'today', 'future-near', 'future-tie-a', 'future-tie-b',
    'past-tie-a', 'past-tie-b', 'past-far', 'countup-short', 'countup-long', 'unavailable-a', 'unavailable-b'
  ]);
  assert.equal(JSON.stringify(input), snapshot);
  assert.notEqual(sorted, input);
  sorted.forEach(e => assert.notEqual(e, input.find(original => original.id === e.id)));
  assert.deepEqual(plain(date.sortEvents(input).map(e => e.id)), plain(sorted.map(e => e.id)));
  assert.equal(date.sortEvents([]).length, 0);
});

console.log(`全部通过：${passed} 组隔离日期回归测试。`);
