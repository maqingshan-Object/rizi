/**
 * 把一个日子记录（本机存储的原始对象）整理成页面要显示的样子。
 *
 * 详情页与分享海报都用这里的 build()，保证"页面上看到的天数"和"海报上印的天数"
 * 永远来自同一套计算，不会出现两边对不上的情况。
 */
const auth = require('../services/auth');
const dates = require('./date');
const lunar = require('./lunar');
const reminderOptions = require('./reminder');

const categoryNames = { birthday: '生日', anniversary: '纪念日', holiday: '节日', other: '其他' };
const iconNames = ['heart', 'cake', 'leaf', 'lantern', 'flower'];
const tintNames = ['pink', 'mint', 'yellow', 'blue'];
const repeatNames = { yearly: '每年重复', monthly: '每月重复' };

/** 分类中文名（海报、卡片、详情共用一套说法）。 */
function categoryName(category) {
  return categoryNames[category] || '其他';
}

/** 倒计时是否已经过去（正计时永远算"走过"）。 */
function build(record) {
  const annotated = dates.annotate(record);
  const target = dates.nextDate(record);
  const available = dates.validDate(target);
  const base = dates.today();
  const count = available
    ? (record.mode === 'countup' ? dates.daysBetween(record.date, base) : dates.daysBetween(base, target))
    : null;
  const past = count !== null && count < 0;
  let status = '日期换算超出支持范围';
  if (count !== null) {
    status = count === 0 ? '就在今天' : past ? '这一天已经过去' : record.mode === 'countup' ? '已经一起走过' : '距离这一天还有';
  }
  const detail = Object.assign({}, annotated, {
    id: record.id,
    name: record.name,
    note: record.note || '',
    categoryText: categoryName(record.category),
    modeText: record.mode === 'countup' ? '正计时' : '倒计时',
    repeatText: Object.assign({}, repeatNames, {
      festival: record.holidayKey === 'next' ? '自动跟随最近节日' : '自动跟随节日'
    })[record.repeat] || '不重复',
    monthlyHelp: record.repeat === 'monthly'
      ? `每月 ${Number(record.date.slice(8))} 日，小月份按当月最后一天；下月恢复原设定日号。` : '',
    calendarText: record.calendarType === 'lunar' ? '农历' : '公历',
    icon: iconNames.includes(record.icon) ? record.icon : 'heart',
    tint: tintNames.includes(record.tint) ? record.tint : 'pink',
    pin: !!record.pin,
    countText: count === null ? '—' : String(Math.abs(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    // 海报上要用的"纯数字"，与带千分位的 countText 区分开
    countNumber: count === null ? null : Math.abs(count),
    statusText: status,
    unitText: count === null ? '' : '天',
    targetDateText: available ? target.replace(/-/g, '.') : '无可换算日期',
    originalDateText: dates.validDate(record.date) ? record.date.replace(/-/g, '.') : '日期无效',
    dateLabel: record.mode === 'countup' ? '开始日期' : record.repeat !== 'none' ? '本次／下次日期' : '记录日期',
    lunarText: '',
    lunarHelp: '',
    unavailable: !available,
    reminder: record.reminder || '不提醒',
    reminderText: reminderOptions.isKnown(record.reminder) ? record.reminder : '不提醒',
    reminderStatus: reminderOptions.enabledFor(record.reminder)
      ? (auth.currentUser() ? '正在读取云端提醒状态…' : '请先登录，提醒偏好目前仅保存在本机。')
      : '未选择提醒；如需提醒请编辑这个日子。',
    reminderActionText: '开启提醒',
    phrase: record.category === 'birthday' ? '爱要记得，也要说出口。' : '每一天，都值得被认真记住。'
  });
  if (record.calendarType === 'lunar') {
    const month = Number(record.lunarMonth);
    const day = Number(record.lunarDay);
    detail.lunarText = month >= 1 && month <= 12 && day >= 1 && day <= 30
      ? `${record.lunarLeap ? '闰' : ''}${lunar.monthNames[month - 1]}${lunar.dayNames[day - 1]}`
      : '农历月日无效';
    detail.lunarHelp = `支持 ${lunar.range.min}—${lunar.range.max} 农历年。闰月无对应年时跳到下一个有对应闰月且日期有效的年份，不替换为普通月；无有效日期的年份也会跳过。`;
  }
  return detail;
}

/**
 * 转发文案：带上**具体天数**。
 *
 * "罗田的生日 · 还有 113 天" 比 "日子绵绵" 的点击率高得多 ——
 * 分享出去的是信息，不是一个名字。转发与朋友圈共用这一份文案。
 */
function shareTitle(event) {
  if (!event) return '日子绵绵 · 把重要的日子慢慢放在心上';
  if (event.unavailable || event.countNumber === null || event.countNumber === undefined) {
    return `${event.name}｜日子绵绵`;
  }
  if (event.countNumber === 0) return `${event.name} · 就是今天`;
  if (event.statusText === '这一天已经过去') return `${event.name} · 已经过去 ${event.countText} 天`;
  if (event.modeText === '正计时') return `${event.name} · 已经走过 ${event.countText} 天`;
  return `${event.name} · 还有 ${event.countText} 天`;
}

module.exports = { build, categoryName, shareTitle };
