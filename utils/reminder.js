// 提醒档位的唯一定义处：标签 ↔ 提前天数 的映射。
//
// ⚠️ 标签刻意沿用旧写法（不带空格，如「提前3天提醒」）：
// 老记录里存的就是这个字符串，换成「提前 3 天」会让历史数据识别不出来，需要额外迁移。
// 所有需要判断"有没有开提醒""提前几天"的地方都必须用这里的函数，不要再硬编码字符串。
const OPTIONS = [
  { label: '不提醒', days: 0 },
  { label: '提前1天提醒', days: 1 },
  { label: '提前3天提醒', days: 3 },
  { label: '提前7天提醒', days: 7 }
];

const LABELS = OPTIONS.map(item => item.label);

/** 标签 → 提前天数；未知标签（含 '不提醒'）一律返回 0。 */
function daysFor(label) {
  const hit = OPTIONS.find(item => item.label === label);
  return hit ? hit.days : 0;
}

/** 提前天数 → 标签；匹配不到时退回「不提醒」。 */
function labelFor(days) {
  const value = Number(days);
  const hit = OPTIONS.find(item => item.days === value);
  return hit ? hit.label : OPTIONS[0].label;
}

/** 是否真的开了提醒（提前天数 > 0）。 */
function enabledFor(label) {
  return daysFor(label) > 0;
}

/** 是否是本模块认识的标签（用于表单校验，防止脏数据）。 */
function isKnown(label) {
  return OPTIONS.some(item => item.label === label);
}

module.exports = { OPTIONS, LABELS, daysFor, labelFor, enabledFor, isKnown };
