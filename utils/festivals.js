const lunar = require('./lunar');

const range = { min: 2020, max: 2035 };
const definitions = [
  { key: 'new-year', label: '元旦', calendarType: 'solar', month: 1, day: 1 },
  { key: 'spring', label: '春节', calendarType: 'lunar', month: 1, day: 1 },
  { key: 'qingming', label: '清明节', calendarType: 'solar', month: 4 },
  { key: 'labour', label: '劳动节', calendarType: 'solar', month: 5, day: 1 },
  { key: 'dragon-boat', label: '端午节', calendarType: 'lunar', month: 5, day: 5 },
  { key: 'mid-autumn', label: '中秋节', calendarType: 'lunar', month: 8, day: 15 },
  { key: 'national', label: '国庆节', calendarType: 'solar', month: 10, day: 1 }
];
const nearest = { key: 'next', label: '最近节假日' };
const choices = [nearest].concat(definitions).map(d => ({ value: d.key, label: d.label }));

// 清明当天摘自中国香港天文台公农历对照表的“清明”行，依次对应 2020–2035 年。
// 来源：https://www.hko.gov.hk/tc/gts/time/conversion1_text.htm
// 2026 年清明为 4 月 5 日，不能使用放假起始日 4 月 4 日。
// 假期核对来源：https://www.gov.cn/zhengce/content/202511/content_7047090.htm
const qingmingDays = [4, 4, 5, 5, 4, 4, 5, 5, 4, 4, 5, 5, 4, 4, 5, 5];
const pad = n => String(n).padStart(2, '0');

function definition(key) {
  const d = key === 'next' ? nearest : definitions.find(item => item.key === key);
  return d ? Object.assign({}, d) : null;
}

function dateInYear(key, year) {
  year = Number(year);
  if (!Number.isInteger(year) || year < range.min || year > range.max) return '';
  const d = definitions.find(item => item.key === key);
  if (!d) return '';
  if (d.calendarType === 'lunar') return lunar.findDate(year, d.month, d.day, false);
  const day = key === 'qingming' ? qingmingDays[year - range.min] : d.day;
  return `${year}-${pad(d.month)}-${pad(day)}`;
}

function occurrences(key, year, month) {
  year = Number(year); month = Number(month);
  if (!Number.isInteger(month) || month < 1 || month > 12) return [];
  const selected = key === 'next' ? definitions : definitions.filter(d => d.key === key);
  const prefix = `${year}-${pad(month)}`;
  return selected.map(d => ({ key: d.key, label: d.label, date: dateInYear(d.key, year) }))
    .filter(item => item.date && item.date.slice(0, 7) === prefix)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function next(key, base) {
  if (typeof base !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  const parts = base.split('-').map(Number);
  const parsed = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (parsed.toISOString().slice(0, 10) !== base) return null;
  const selected = key === 'next' ? definitions : definitions.filter(d => d.key === key);
  let result = null;
  for (let year = Math.max(parts[0], range.min); year <= range.max; year++) {
    selected.forEach(d => {
      const date = dateInYear(d.key, year);
      if (date && date >= base && (!result || date < result.date)) {
        result = { key: d.key, label: d.label, date };
      }
    });
    if (result) return result;
  }
  return null;
}

module.exports = { choices, range, definition, dateInYear, next, occurrences };
