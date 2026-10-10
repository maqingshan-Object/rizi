const lunar = require('./lunar');
const holidays = require('./holidays');
const pad = n => String(n).padStart(2, '0');
const dateString = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function today() { const d = new Date(); return dateString(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function serial(s) { const p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; }
const daysBetween = (a, b) => Math.round(serial(b) - serial(a));
const display = s => s ? s.replace(/-/g, '.') : '';
function annualDate(e, y) {
  if (e.calendarType === 'lunar') return lunar.findDate(y, e.lunarMonth, e.lunarDay, e.lunarLeap);
  const p = e.date.split('-').map(Number);
  return dateString(y, p[1], Math.min(p[2], new Date(Date.UTC(y, p[1], 0)).getUTCDate()));
}
function nextDate(e, base = today()) {
  if (e.mode === 'countup' || e.repeat !== 'yearly') return e.date;
  const isLunar = e.calendarType === 'lunar';
  const startY = isLunar ? lunar.range.min : Number(e.date.slice(0, 4));
  let y = Math.max(Number(base.slice(0, 4)) - (isLunar ? 1 : 0), startY);
  const endY = isLunar ? lunar.range.max : 2100;
  for (; y <= endY; y++) {
    const s = annualDate(e, y); if (s && s >= base) return s;
  }
  return '';
}
function annotate(e, base = today()) {
  const next = nextDate(e, base);
  const count = next ? (e.mode === 'countup' ? daysBetween(e.date, base) : daysBetween(base, next)) : null;
  const past = count !== null && count < 0;
  return Object.assign({}, e, {
    nextDate: next, displayDate: display(next), count,
    countText: count === null ? '—' : String(Math.abs(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    unitLabel: count === 0 ? '就是今天' : past ? '天前' : e.mode === 'countup' ? '天了' : '天后',
    statusLabel: count === null ? '日期换算超出支持范围' : count === 0 ? '就在今天' : past ? '已经过去' : e.mode === 'countup' ? '已经' : '距离这一天还有',
    categoryName: ({birthday:'生日',anniversary:'纪念日',growth:'成长',holiday:'节日',other:'其他'})[e.category] || '其他',
    reminder: e.reminder || '不提醒', tint: e.tint || 'pink', icon: e.icon || 'heart'
  });
}
function occurrencesInMonth(year, month, events) {
  const results = [];
  events.forEach(e => {
    if (e.repeat === 'yearly' && e.calendarType !== 'lunar' && Number(e.date.slice(0,4)) > year) return;
    const candidates = e.repeat !== 'yearly' ? [e.date] : e.calendarType === 'lunar' ? [annualDate(e, year-1), annualDate(e, year)] : [annualDate(e, year)];
    candidates.forEach(occurrence => {
      if (!occurrence || occurrence.slice(0, 7) !== `${year}-${pad(month)}`) return;
      const a = annotate(e); const delta = daysBetween(today(), occurrence);
      results.push(Object.assign(a, { occurrence, day:Number(occurrence.slice(8)), month, delta, timeLabel: delta === 0 ? '今天' : delta > 0 ? `${delta} 天后` : '已过去' }));
    });
  });
  return results.sort((a,b) => a.occurrence.localeCompare(b.occurrence));
}
function monthCells(year, month, events, selectedDate) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let i=0; i<Math.ceil((offset+total)/7)*7; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - offset + i));
    const date = dateString(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate());
    const matches = occurrencesInMonth(d.getUTCFullYear(), d.getUTCMonth()+1, events).filter(e => e.occurrence === date);
    const h = holidays[date];
    cells.push({ key:date, date, day:d.getUTCDate(), current:d.getUTCMonth()+1===month, today:date===today(), selected:date===selectedDate,
      weekend:i%7>=5, holidayType:h?h.type:'', holidayName:h?h.name:'', lunarLabel:h&&h.type==='rest'?h.name:lunar.label(date),
      eventCount:matches.length, dots:matches.slice(0,3).map(e=>({id:e.id,tint:e.tint||'pink'})) });
  }
  return { cells, occurrences:occurrencesInMonth(year, month, events) };
}
const monthTitle = (y,m) => `${y} 年 ${m} 月`;
function formatToday() { const s=today();const d=new Date();return `${d.getFullYear()} 年 ${d.getMonth()+1} 月 ${d.getDate()} 日 · 星期${'日一二三四五六'[d.getDay()]}`; }
function validDate(s) { if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false; const p=s.split('-').map(Number);const d=new Date(serial(s)*86400000);return p[0]>=1900&&p[0]<=2100&&d.getUTCFullYear()===p[0]&&d.getUTCMonth()+1===p[1]&&d.getUTCDate()===p[2]; }
module.exports = { today, display, dateString, daysBetween, nextDate, annotate, monthCells, monthTitle, formatToday, validDate, annualDate };
