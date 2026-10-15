const auth = require('./auth');
const http = require('./http');
const dates = require('../utils/date');
const reminderOptions = require('../utils/reminder');
const KEY = 'days_guest_events_v1';
function initializeGuest() {
  const raw=wx.getStorageSync(KEY);
  if(raw && Array.isArray(raw.events) && (raw.events.length || raw.samplesCleared)) return;
    // 示例记录已全部去掉（boss 要求）。这里只保证存储结构存在：
    // 否则 list() 读 .events 会 undefined 报错 ⚠️
    wx.setStorageSync(KEY,{events:[]});
  wx.setStorageSync(KEY,{events:list});
}
function isGuest(){return !auth.currentUser();}
// 旧成长分类只归一化展示/后续保存，不删除记录，也不在读取时重写用户存储。
function list(){initializeGuest();return wx.getStorageSync(KEY).events.map(e=>Object.assign({},e,{category:e.category==='growth'?'other':e.category}));}
function get(id){return list().find(e=>e.id===id);}
function save(record){const all=list();if(record.pin)all.forEach(e=>e.pin=false);const r=Object.assign({},record,{sample:false});if(!r.id)r.id='event-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);const i=all.findIndex(e=>e.id===r.id);if(i>=0)all[i]=r;else all.push(r);wx.setStorageSync(KEY,{events:all});return r;}
function remove(id){wx.setStorageSync(KEY,{events:list().filter(e=>e.id!==id)});}
function togglePin(id){const all=list();const e=all.find(e=>e.id===id);if(!e)return;const pin=!e.pin;all.forEach(e=>e.pin=false);e.pin=pin;wx.setStorageSync(KEY,{events:all});return pin;}
function clearSamples(){wx.setStorageSync(KEY,{events:list().filter(e=>!e.sample),samplesCleared:true});}
function remoteReady(){return !!auth.currentUser() && auth.isConfigured();}
function remotePayload(record){
  return {
    id: record.id,
    name: record.name,
    note: record.note || '',
    date: record.date,
    category: record.category,
    mode: record.mode,
    repeat: record.repeat,
    calendarType: record.calendarType,
    holidayKey: record.holidayKey,
    lunarMonth: record.lunarMonth,
    lunarDay: record.lunarDay,
    lunarLeap: record.lunarLeap,
    icon: record.icon,
    tint: record.tint,
    pin: !!record.pin,
    reminder: record.reminder || '不提醒',
    reminderEnabled: reminderOptions.enabledFor(record.reminder),
    reminderDaysBefore: reminderOptions.daysFor(record.reminder),
    reminderTime: '09:00:00',
    sample: !!record.sample
  };
}
function assertRemoteReady(){
  if(!auth.currentUser()){
    const error=new Error('请先登录，再同步云端事件。');
    error.code='UNAUTHORIZED';
    throw error;
  }
  if(!auth.isConfigured()){
    const error=new Error('后端服务尚未配置，事件仍只保存在本机。');
    error.code='BACKEND_NOT_CONFIGURED';
    throw error;
  }
}
function listRemote(){
  assertRemoteReady();
  return http.get('/api/events');
}
function syncRemote(records){
  assertRemoteReady();
  const items=Array.isArray(records)?records:[];
  return http.post('/api/events/sync',items.map(remotePayload));
}
function saveRemote(record){
  if(!record) return Promise.reject(new Error('缺少事件记录，无法同步云端。'));
  return syncRemote([record]).then(result=>Array.isArray(result)?result[0]:result);
}
function mergeRemote(records){
  const incoming = Array.isArray(records) ? records : [];
  const all = list();
  incoming.forEach(remote => {
    if (!remote || !remote.id) return;
    const local = Object.assign({}, remote, { sample: false });
    const index = all.findIndex(item => item.id === remote.id);
    if (index >= 0) all[index] = local;
    else all.push(local);
  });
  wx.setStorageSync(KEY, { events: all });
  return incoming.length;
}
function removeRemote(id){
  assertRemoteReady();
  if(!id) return Promise.reject(new Error('缺少事件编号，无法删除云端记录。'));
  return http.request ? http.request('DELETE', `/api/events/${encodeURIComponent(id)}`) : Promise.reject(new Error('网络服务不支持删除请求。'));
}
module.exports={initializeGuest,isGuest,list,get,save,remove,togglePin,clearSamples,remoteReady,listRemote,syncRemote,saveRemote,mergeRemote,removeRemote};
