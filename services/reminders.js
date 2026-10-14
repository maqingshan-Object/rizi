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
  return result(false, 'BACKEND_NOT_CONFIGURED', '提醒服务暂时不可用，当前不会申请订阅，也不会声称已发送提醒。');
}

function subscriptionUnavailable() {
  return result(false, 'MISSING_TEMPLATE', '提醒服务还在准备中，稍后再点一次「开启提醒」试试。');
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
    .then(data => result(true, 'AUTHORIZED', '授权记下了，到时候会按安排发给你。', Array.isArray(data) ? data : []))
    .catch(error => result(false, error.code || 'AUTHORIZE_FAILED', error.message || '授权没记上，稍后再试一次。'));
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
      return result(true, 'NO_TASK', '这个日子还没排上提醒，回头再点一次「开启提醒」试试。', null);
    }
    // 一个日子可能同时有两条任务：「本次已发出」+「为下一次预建、尚未授权」。
    // 优先展示还没授权的那条 —— 那才是用户接下来要处理的；没有就取最近的一条。
    const task = tasks.find(item => item.authorized !== true) || tasks[tasks.length - 1];
    const labels = {
      needs_authorization: '需要重新授权提醒',
      sent: '已经发出，留意微信通知',
      failed: '这次没能发出，可以重新开启',
      cancelled: '提醒任务已取消'
    };
    // ⚠️ 后端的 status=pending 有两种完全不同的含义：
    //    ① 刚创建、用户还没授权  ② 用户已授权、等待到期自动发送
    //    必须靠 authorized 字段区分。之前只看 status，导致授权成功后仍显示
    //    "等待订阅授权，尚未确认开启"，看起来像失败（实际已经开启）。
    if (task.status === 'pending') {
      if (task.authorized === true) {
        return result(true, 'AUTHORIZED', '提醒已开启，到时候会给你发一条服务通知。', task);
      }
      const pending = result(true, 'PENDING', '还没确认开启，点一下「开启提醒」就好', task);
      // 旧版后端不返回 authorized 字段，无法区分上面两种含义；标记出来，
      // 让调用方在"刚授权成功"时不要用这条模糊文案覆盖成功提示。
      pending.ambiguous = typeof task.authorized !== 'boolean';
      return pending;
    }
    return result(true, 'TASK', labels[task.status] || '已经有一条提醒安排了', task);
  });
}

/**
 * 汇总「已开启提醒、但云端任务还没完成授权」的日子（首页提示用）。
 *
 * 判定只看云端任务：authorized !== true 且未发出、未取消，才算"还没开启"。
 * 这样提示的口径和「服务端到底会不会发」完全一致，不会给出安慰性的假结论。
 * 返回 items: [{ task, event }]；日期排序与剩余天数交给调用方算（这里不依赖日期工具）。
 */
function pendingAuthorization(events) {
  if (!auth.currentUser()) return Promise.resolve(loginRequired());
  if (!isBackendReady()) return Promise.resolve(backendRequired());
  return list().then(response => {
    if (!response.ok) return response;
    const byId = {};
    (Array.isArray(events) ? events : []).forEach(item => {
      if (item && item.id) byId[item.id] = item;
    });
    const items = (response.data || [])
      .filter(task => task && task.authorized !== true
        && ['pending', 'needs_authorization', 'failed'].indexOf(task.status) >= 0)
      .map(task => ({ task, event: byId[task.eventId] || null }))
      .filter(item => item.event);
    return result(true, 'PENDING_AUTHORIZATION', '已读取待授权的提醒。', items);
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
    authorized.message = '提醒开好了，日子也存进云端了。到那天会给你发一条服务通知。';
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
  pendingAuthorization,
  subscribeForEvent
};
