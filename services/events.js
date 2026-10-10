const auth = require('./auth');
const dates = require('../utils/date');
const KEY = 'days_guest_events_v1';
function initializeGuest() {
  const raw=wx.getStorageSync(KEY);
  if(raw && Array.isArray(raw.events)) return;
  const base=dates.today(), year=Number(base.slice(0,4));
  const plus=n=>{const p=base.split('-').map(Number);const d=new Date(Date.UTC(p[0],p[1]-1,p[2]+n));return dates.dateString(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());};
  const birthday=plus(12), anniversary=plus(39), dad=plus(29);
  const inYear=(s,y)=>{const p=s.split('-').map(Number);return dates.dateString(y,p[1],Math.min(p[2],new Date(Date.UTC(y,p[1],0)).getUTCDate()));};
  const list=[
    {id:'sample-mom',name:'妈妈的生日',date:inYear(birthday,1970),category:'birthday',mode:'countdown',repeat:'yearly',icon:'cake',tint:'pink',note:'提前订好蛋糕，再给妈妈一个拥抱。',pin:true},
    {id:'sample-anniversary',name:'我们的结婚纪念日',date:inYear(anniversary,Math.min(2020,year)),category:'anniversary',mode:'countdown',repeat:'yearly',icon:'heart',tint:'pink',note:'每一年，都继续认真地喜欢你。'},
    {id:'sample-dad',name:'爸爸的生日',date:inYear(dad,1968),category:'birthday',mode:'countdown',repeat:'yearly',icon:'cake',tint:'blue',note:'记得陪爸爸吃一顿饭。'},
    {id:'sample-smoke',name:'坚持戒烟',date:plus(-119),category:'other',mode:'countup',repeat:'none',icon:'leaf',tint:'mint',note:'每天，都离更好的自己近一点。'},
    {id:'sample-spring',name:'下一次春节',date:'2027-02-06',category:'holiday',mode:'countdown',repeat:'none',icon:'lantern',tint:'yellow',note:'记录正月初一，不代表假期开始日。'},
    {id:'sample-life',name:'来到世界的日子',date:'1997-08-21',category:'other',mode:'countup',repeat:'none',icon:'flower',tint:'mint',note:'普通的每一天，也有自己的闪光。'}
  ].map(e=>Object.assign(e,{calendarType:'solar',reminder:'不提醒',sample:true}));
  wx.setStorageSync(KEY,{events:list});
}
function isGuest(){return !auth.currentUser();}
// 旧成长分类只归一化展示/后续保存，不删除记录，也不在读取时重写用户存储。
function list(){initializeGuest();return wx.getStorageSync(KEY).events.map(e=>Object.assign({},e,{category:e.category==='growth'?'other':e.category}));}
function get(id){return list().find(e=>e.id===id);}
function save(record){const all=list();if(record.pin)all.forEach(e=>e.pin=false);const r=Object.assign({},record,{sample:false});if(!r.id)r.id='event-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);const i=all.findIndex(e=>e.id===r.id);if(i>=0)all[i]=r;else all.push(r);wx.setStorageSync(KEY,{events:all});return r;}
function remove(id){wx.setStorageSync(KEY,{events:list().filter(e=>e.id!==id)});}
function togglePin(id){const all=list();const e=all.find(e=>e.id===id);if(!e)return;const pin=!e.pin;all.forEach(e=>e.pin=false);e.pin=pin;wx.setStorageSync(KEY,{events:all});return pin;}
function clearSamples(){wx.setStorageSync(KEY,{events:list().filter(e=>!e.sample)});}
module.exports={initializeGuest,isGuest,list,get,save,remove,togglePin,clearSamples};
