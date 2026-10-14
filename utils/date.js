const lunar = require('./lunar');
const holidays = require('./holidays');
const festivals = require('./festivals');
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
function monthlyDate(e, year, month) {
  year = Number(year); month = Number(month);
  if (!validDate(e.date) || !Number.isInteger(year) || year < 1900 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return '';
  const day = Number(e.date.slice(8));
  const occurrence = dateString(year, month, Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate()));
  return occurrence >= e.date ? occurrence : '';
}
function isFestival(e) {
  return e.category === 'holiday' && e.mode === 'countdown' && e.repeat === 'festival' && !!festivals.definition(e.holidayKey);
}
function nextDate(e, base = today()) {
  if (e.mode === 'countup') return e.date;
  if (isFestival(e)) {
    const holiday = festivals.next(e.holidayKey, base);
    return holiday ? holiday.date : '';
  }
  if (e.repeat === 'monthly') {
    if (!validDate(e.date) || !validDate(base)) return '';
    const start = base > e.date ? base : e.date;
    let year = Number(start.slice(0, 4)), month = Number(start.slice(5, 7));
    const occurrence = monthlyDate(e, year, month);
    if (occurrence && occurrence >= start) return occurrence;
    if (++month > 12) { month = 1; year++; }
    return monthlyDate(e, year, month);
  }
  if (e.repeat !== 'yearly') return e.date;
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
  const festival = isFestival(e);
  const resolvedHoliday = festival ? festivals.next(e.holidayKey, base) : null;
  const next = festival ? resolvedHoliday ? resolvedHoliday.date : '' : nextDate(e, base);
  const count = next ? (e.mode === 'countup' ? daysBetween(e.date, base) : daysBetween(base, next)) : null;
  const past = count !== null && count < 0;
  return Object.assign({}, e, {
    nextDate: next, displayDate: display(next), count,
    countText: count === null ? '—' : String(Math.abs(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    unitLabel: count === 0 ? '就是今天' : past ? '天前' : e.mode === 'countup' ? '天了' : '天后',
    statusLabel: count === null ? '日期换算超出支持范围' : count === 0 ? '就在今天' : past ? '已经过去' : e.mode === 'countup' ? '已经' : '距离这一天还有',
    categoryName: ({birthday:'生日',anniversary:'纪念日',holiday:'节日',other:'其他'})[e.category] || '其他',
    resolvedHolidayLabel: resolvedHoliday ? resolvedHoliday.label : '',
    festivalHelp: festival ? `按节日当天计算，支持 ${festivals.range.min}–${festivals.range.max} 年；不是放假起始日。` : '',
    backgroundSrc: ({birthday:'/assets/birthday-art.png',anniversary:'/assets/anniversary-art.png',holiday:'/assets/holiday-art.png',other:'/assets/other-art.png'})[e.category] || '',
    reminder: e.reminder || '不提醒', tint: e.tint || 'pink', icon: e.icon || 'heart'
  });
}
function sortEvents(events, base = today()) {
  const group = e => !Number.isFinite(e.count) ? 3 : e.mode === 'countup' ? 2 : e.count >= 0 ? 0 : 1;
  return events.map((e, index) => ({ event: annotate(e, base), index })).sort((a, b) => {
    const pin = Number(!!b.event.pin) - Number(!!a.event.pin);
    if (pin) return pin;
    const ga = group(a.event), gb = group(b.event);
    if (ga !== gb) return ga - gb;
    const delta = ga === 3 ? 0 : ga === 1 ? Math.abs(a.event.count) - Math.abs(b.event.count) : a.event.count - b.event.count;
    return delta || a.index - b.index;
  }).map(item => item.event);
}
function occurrencesInMonth(year, month, events) {
  const results = [];
  const base = today();
  events.forEach(e => {
    let candidates;
    if (e.mode === 'countup') candidates = [{ date: e.date }];
    else if (isFestival(e)) candidates = festivals.occurrences(e.holidayKey, year, month);
    else if (e.repeat === 'monthly') candidates = [{ date: monthlyDate(e, year, month) }];
    else if (e.repeat === 'yearly') {
      if (e.calendarType !== 'lunar' && Number(e.date.slice(0,4)) > year) return;
      candidates = (e.calendarType === 'lunar' ? [annualDate(e, year-1), annualDate(e, year)] : [annualDate(e, year)]).map(date => ({ date }));
    } else candidates = [{ date: e.date }];
    candidates.forEach(candidate => {
      const occurrence = candidate.date;
      if (!occurrence || occurrence.slice(0, 7) !== `${year}-${pad(month)}`) return;
      const a = annotate(e, base); const delta = daysBetween(base, occurrence);
      if (candidate.label) a.resolvedHolidayLabel = candidate.label;
      if (candidate.key) a.occurrenceHolidayKey = candidate.key;
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
module.exports = { today, display, dateString, daysBetween, nextDate, annotate, sortEvents, occurrencesInMonth, monthCells, monthTitle, formatToday, validDate, annualDate, monthlyDate };
