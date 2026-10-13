const config = require('../config/backend');

const TOKEN_KEY = 'days_auth_access_token_v1';

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

function toError(body, statusCode, fallback) {
  const error = new Error((body && body.message) || fallback);
  error.code = (body && body.code) || `HTTP_${statusCode}`;
  error.statusCode = statusCode;
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
    throw toError(body, statusCode, '云托管服务返回异常。');
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
        reject(toError(body, response.statusCode, '请求后端服务失败，请稍后重试。'));
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

  const token = wx.getStorageSync(TOKEN_KEY);
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
