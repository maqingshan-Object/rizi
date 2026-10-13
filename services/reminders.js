const config = require('../config/backend');
const auth = require('./auth');
const http = require('./http');

function result(ok, status, message, data) {
  return { ok, status, message, data: data === undefined ? null : data };
}

function isBackendReady() {
  return config.configured === true && !!config.baseUrl;
}

function canRequestSubscription() {
  return !!auth.currentUser() && isBackendReady() && config.subscribeEnabled === true && !!config.subscribeTemplateId;
}

function loginRequired() {
  return result(false, 'UNAUTHORIZED', '请先登录，再开启或查看云端提醒。');
}

function backendRequired() {
  return result(false, 'BACKEND_NOT_CONFIGURED', '提醒服务待接通，当前不会申请订阅，也不会声称已发送提醒。');
}

function subscriptionUnavailable() {
  return result(false, 'MISSING_TEMPLATE', '提醒订阅开关或模板尚未配置，当前不会调用微信订阅授权；请稍后重新授权。');
}

function requestSubscription() {
  if (!auth.currentUser()) return Promise.resolve(loginRequired());
  if (!isBackendReady()) return Promise.resolve(backendRequired());
  if (config.subscribeEnabled !== true || !config.subscribeTemplateId) {
    return Promise.resolve(subscriptionUnavailable());
  }
  if (typeof wx.requestSubscribeMessage !== 'function') {
    return Promise.resolve(result(false, 'API_UNAVAILABLE', '当前微信环境不支持订阅授权，请在正式小程序环境重试。'));
  }
  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: [config.subscribeTemplateId],
      success(response) {
        const status = response && response[config.subscribeTemplateId];
        if (status === 'accept') {
          resolve(result(true, 'ACCEPTED', '已获得微信订阅授权，正在提交云端提醒状态。', response));
          return;
        }
        if (status === 'reject') {
          resolve(result(false, 'REJECTED', '你拒绝了提醒授权；日子已保存，请重新授权后才会继续处理提醒。', response));
          return;
        }
        resolve(result(false, 'REJECTED', '提醒授权未完成；日子已保存，请重新授权后再试。', response));
      },
      fail(error) {
        resolve(result(false, 'REJECTED', '提醒授权未完成；日子已保存，请重新授权后再试。', error));
      }
    });
  });
}

function list() {
  if (!auth.currentUser()) return Promise.resolve(loginRequired());
  if (!isBackendReady()) return Promise.resolve(backendRequired());
  return http.get('/api/reminders')
    .then(data => result(true, 'LISTED', '已读取云端提醒状态。', Array.isArray(data) ? data : []))
    .catch(error => result(false, error.code || 'LIST_FAILED', error.message || '云端提醒状态读取失败。'));
}

function authorize(taskIds) {
  if (!auth.currentUser()) return Promise.resolve(loginRequired());
  if (!isBackendReady()) return Promise.resolve(backendRequired());
  const body = Array.isArray(taskIds) && taskIds.length ? { taskIds } : undefined;
  return http.post('/api/reminders/authorize', body)
    .then(data => result(true, 'AUTHORIZED', '已提交云端提醒授权状态；实际发送以服务端状态为准，不代表消息已经送达。', Array.isArray(data) ? data : []))
    .catch(error => result(false, error.code || 'AUTHORIZE_FAILED', error.message || '云端提醒授权状态提交失败。'));
}

async function authorizeForEvent(eventId) {
  const listed = await list();
  if (!listed.ok) return listed;
  const taskIds = listed.data.filter(item => item && item.eventId === eventId).map(item => item.id).filter(Boolean);
  if (!taskIds.length) return result(false, 'NO_TASK', '云端还没有这个日子的提醒任务，请先完成事件云端同步。');
  return authorize(taskIds);
}

function statusForEvent(eventId) {
  if (!eventId) return Promise.resolve(result(false, 'INVALID_EVENT', '缺少日子记录，无法读取提醒状态。'));
  return list().then(response => {
    if (!response.ok) return response;
    const tasks = response.data.filter(item => item && item.eventId === eventId);
    if (!tasks.length) {
      return result(true, 'NO_TASK', '云端还没有这个日子的提醒任务；本机偏好不代表提醒已开启。', null);
    }
    const task = tasks[0];
    const labels = {
      pending: '等待订阅授权，尚未确认开启',
      needs_authorization: '需要重新授权提醒',
      sent: '服务端已处理，实际送达以微信为准',
      failed: '服务端处理失败，可重新授权',
      cancelled: '提醒任务已取消'
    };
    return result(true, 'TASK', labels[task.status] || '云端已有提醒任务，请以服务端状态为准。', task);
  });
}

async function subscribeForEvent(eventId) {
  if (!auth.currentUser()) return loginRequired();
  if (!isBackendReady()) return backendRequired();
  const listed = await list();
  if (!listed.ok) return listed;
  const tasks = listed.data.filter(item => item && item.eventId === eventId);
  if (!tasks.length) {
    return result(false, 'NO_TASK', '云端还没有这个日子的提醒任务，请先完成事件云端同步；本机记录仍然保留。');
  }
  const subscription = await requestSubscription();
  if (!subscription.ok) return subscription;
  const authorized = await authorize(tasks.map(item => item.id).filter(Boolean));
  if (authorized.ok) authorized.message = '已提交这个日子的提醒授权状态；实际发送以服务端状态为准，不代表消息已经送达。';
  return authorized;
}

module.exports = {
  canRequestSubscription,
  requestSubscription,
  list,
  authorize,
  authorizeForEvent,
  statusForEvent,
  subscribeForEvent
};
