const config = require('../config/backend');
const session = require('./session');

function containerReady() {
  return config.mode === 'container' && !!config.cloudEnv && !!config.serviceName;
}

function requestModeReady() {
  return config.mode === 'request' && config.configured === true && !!config.baseUrl;
}

/** 后端是否可用：云托管内网调用或普通 HTTPS 调用任选其一。 */
function isBackendReady() {
  return containerReady() || requestModeReady();
}

/** 401/403 一律按"登录态失效"处理（JWT 默认有效期 120 分钟，过期后服务端就是这么回的）。 */
function isAuthFailure(statusCode) {
  return statusCode === 401 || statusCode === 403;
}

function toError(body, statusCode, fallback) {
  const error = new Error((body && body.message) || fallback);
  error.code = (body && body.code) || `HTTP_${statusCode}`;
  error.statusCode = statusCode;
  return error;
}

/**
 * 服务端拒绝访问：清掉本地登录态，让界面回到"未登录"，并给出可读原因。
 * 之前这里直接落到通用兜底文案「云托管服务返回异常。」，
 * 用户完全看不出是"后端挂了"还是"登录过期了"（实际是后者）。
 */
function toAuthError(body, statusCode) {
  session.clear();
  try { getApp().globalData.user = null; } catch (ignored) {}
  const error = new Error((body && body.message) || '登录已过期，请重新登录后再试。');
  error.code = (body && body.code) || 'AUTH_EXPIRED';
  error.statusCode = statusCode;
  error.authExpired = true;
  return error;
}

function viaContainer(method, path, data, header) {
  return wx.cloud.callContainer({
    config: { env: config.cloudEnv },
    path,
    method,
    data,
    header,
    // 不传 success/fail，让接口返回 Promise
  }).then(response => {
    const statusCode = response.statusCode || 0;
    const body = response.data === undefined ? {} : response.data;
    if (statusCode >= 200 && statusCode < 300) return body;
    if (isAuthFailure(statusCode) && session.token()) throw toAuthError(body, statusCode);
    // 兜底文案带上状态码，方便以后凭一句提示就能定位问题。
    throw toError(body, statusCode, `云托管服务返回异常（HTTP ${statusCode}）。`);
  }).catch(reason => {
    if (reason && reason.statusCode) throw reason;
    const error = new Error('云托管调用失败，请确认环境 ID、服务名称和基础库版本（需 2.23.0 以上）。');
    error.code = 'CONTAINER_CALL_FAILED';
    error.cause = reason;
    throw error;
  });
}

function viaRequest(method, path, data, header) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl.replace(/\/$/, '')}${path}`,
      method,
      data,
      timeout: config.timeout || 10000,
      header,
      success(response) {
        const body = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(body);
          return;
        }
        if (isAuthFailure(response.statusCode) && session.token()) {
          reject(toAuthError(body, response.statusCode));
          return;
        }
        reject(toError(body, response.statusCode, `请求后端服务失败（HTTP ${response.statusCode}），请稍后重试。`));
      },
      fail(reason) {
        const error = new Error('无法连接后端服务，请检查网络或后端是否已启动。');
        error.code = 'BACKEND_NETWORK_ERROR';
        error.cause = reason;
        reject(error);
      }
    });
  });
}

function request(method, path, data) {
  if (!isBackendReady()) {
    const error = new Error('后端服务尚未配置，请在 config/backend.js 填写云托管环境 ID 和服务名称。');
    error.code = 'BACKEND_NOT_CONFIGURED';
    return Promise.reject(error);
  }

  const token = session.token();
  const header = Object.assign(
    { 'content-type': 'application/json' },
    token ? { Authorization: `Bearer ${token}` } : {}
  );

  if (containerReady()) {
    if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') {
      const error = new Error('当前基础库不支持云托管调用，请将基础库最低版本设为 2.23.0 以上。');
      error.code = 'CONTAINER_UNAVAILABLE';
      return Promise.reject(error);
    }
    header['X-WX-SERVICE'] = config.serviceName;
    return viaContainer(method, path, data, header);
  }

  return viaRequest(method, path, data, header);
}

module.exports = {
  request,
  isBackendReady,
  containerReady,
  requestModeReady,
  get: path => request('GET', path),
  post: (path, data) => request('POST', path, data),
  put: (path, data) => request('PUT', path, data),
  delete: path => request('DELETE', path)
};
