// 2026 official holiday schedule: State Council General Office, 2025-11-04.
const holidays = {};
function rest(m,start,end,name){for(let d=start;d<=end;d++)holidays[`2026-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`]={type:'rest',name};}
rest(1,1,3,'元旦');rest(2,15,23,'春节');rest(4,4,6,'清明');rest(5,1,5,'劳动节');rest(6,19,21,'端午');rest(9,25,27,'中秋');rest(10,1,7,'国庆');
['2026-01-04','2026-02-14','2026-02-28','2026-05-09','2026-09-20','2026-10-10'].forEach(s=>holidays[s]={type:'work',name:'调休补班'});
module.exports=holidays;
