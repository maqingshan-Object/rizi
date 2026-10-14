/**
 * 时间胶囊服务层。
 *
 * 三条前端必须守的约定：
 *   1. content 为空 = 封存中（服务端不给正文），页面据此显示打码，不要自己脑补内容；
 *   2. 启封由服务端按日期判定，前端只负责把 openable 当按钮开关；
 *   3. 领取卡（gift）读卡免登录，只有"收下"需要登录。
 */
const auth = require('./auth');
const http = require('./http');

function isReady() {
  return !!auth.currentUser() && http.isBackendReady();
}

function list() {
  return http.get('/api/capsules');
}

function create(payload) {
  return http.post('/api/capsules', payload);
}

function detail(id) {
  return http.get('/api/capsules/' + encodeURIComponent(id));
}

function open(id) {
  return http.post('/api/capsules/' + encodeURIComponent(id) + '/open', {});
}

function remove(id) {
  return http.delete('/api/capsules/' + encodeURIComponent(id));
}

/** 领取卡：免登录也能读（这是传播的关键）。 */
function giftView(token) {
  return http.get('/api/gift/' + encodeURIComponent(token));
}

function claim(token) {
  return http.post('/api/gift/' + encodeURIComponent(token) + '/claim', {});
}

module.exports = { isReady, list, create, detail, open, remove, giftView, claim };
