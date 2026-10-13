const config = require('../config/backend');
const auth = require('./auth');
const http = require('./http');

function result(ok, status, message, data) {
  return { ok, status, message, data: data === undefined ? null : data };
}

function isBackendReady() {
  // 复用 http 模块的统一判定：云托管内网调用（container）或 HTTPS 域名调用（request）任选其一。
  // 之前这里用 config.configured / config.baseUrl 判断，属于 request 模式的条件，
  // 云托管模式下二者恒为空，会让提醒功能永远返回 BACKEND_NOT_CONFIGURED。
  return http.isBackendReady();
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
  // ⚠️ wx.requestSubscribeMessage 只能由「用户点击手势」同步触发：
  //    调用前不能出现任何 await（哪怕已 resolve），否则微信直接 fail
  //    "can only be invoked by user TAP gesture"，表现为"授权未完成"。
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
        // ban = 模板被后台封禁；filter = 模板标题同名被后台过滤；其余为未知返回。
        console.warn('[reminders] requestSubscribeMessage 返回非 accept/reject 状态：', status, response);
        resolve(result(false, 'ABNORMAL', `提醒授权未完成（微信返回：${status || '未知'}）；日子已保存，请稍后重试。`, response));
      },
      fail(error) {
        // 最常见原因是调用前出现了 await，导致点击手势失效。
        console.warn('[reminders] requestSubscribeMessage 调用失败：', error && error.errMsg, error);
        resolve(result(false, 'FAILED', '提醒授权未完成；日子已保存，请重新授权后再试。', error));
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
      needs_authorization: '需要重新授权提醒',
      sent: '服务端已发送，实际送达以微信为准',
      failed: '服务端处理失败，可重新授权',
      cancelled: '提醒任务已取消'
    };
    // ⚠️ 后端的 status=pending 有两种完全不同的含义：
    //    ① 刚创建、用户还没授权  ② 用户已授权、等待到期自动发送
    //    必须靠 authorized 字段区分。之前只看 status，导致授权成功后仍显示
    //    "等待订阅授权，尚未确认开启"，看起来像失败（实际已经开启）。
    if (task.status === 'pending') {
      if (task.authorized === true) {
        return result(true, 'AUTHORIZED', '已开启提醒：到期后由服务端自动发送，实际送达以微信为准。', task);
      }
      const pending = result(true, 'PENDING', '等待订阅授权，尚未确认开启', task);
      // 旧版后端不返回 authorized 字段，无法区分上面两种含义；标记出来，
      // 让调用方在"刚授权成功"时不要用这条模糊文案覆盖成功提示。
      pending.ambiguous = typeof task.authorized !== 'boolean';
      return pending;
    }
    return result(true, 'TASK', labels[task.status] || '云端已有提醒任务，请以服务端状态为准。', task);
  });
}

async function subscribeForEvent(eventId) {
  if (!auth.currentUser()) return loginRequired();
  if (!isBackendReady()) return backendRequired();
  // ★ 顺序很关键：授权必须放在所有网络请求之前。
  //   之前这里先 await list() 再授权，await 会让「用户点击手势」失效，
  //   微信因此拒绝弹窗并直接 fail，用户看到的就是"提醒授权未完成"。
  const subscription = await requestSubscription();
  if (!subscription.ok) return subscription;
  const listed = await list();
  if (!listed.ok) return listed;
  const tasks = listed.data.filter(item => item && item.eventId === eventId);
  if (!tasks.length) {
    return result(false, 'NO_TASK', '云端还没有这个日子的提醒任务，请先完成事件云端同步；本机记录仍然保留。');
  }
  const authorized = await authorize(tasks.map(item => item.id).filter(Boolean));
  if (authorized.ok) {
    // 能走到这里，说明微信侧已返回 accept（否则上面 if (!subscription.ok) 就返回了）。
    // ⚠️ 如果用户此前勾选过「总是保持以上选择」，微信不会再弹授权窗，而是静默返回成功 ——
    //    这是正常行为，且每次调用都会为该模板累加一次可发送条数，不是"没生效"。
    authorized.message = '微信订阅授权已获得，并已同步到云端。到期后由服务端自动发送，实际送达以微信为准。';
  }
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
