const config = require('../config/backend');

function request(method, path, data) {
  if (!config.configured || !config.baseUrl) {
    const error = new Error('后端服务地址尚未配置。');
    error.code = 'BACKEND_NOT_CONFIGURED';
    return Promise.reject(error);
  }
  const token = wx.getStorageSync('days_auth_access_token_v1');
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl.replace(/\/$/, '')}${path}`,
      method,
      data,
      timeout: config.timeout || 10000,
      header: Object.assign({ 'content-type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
      success(response) {
        const body = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(body);
          return;
        }
        const error = new Error(body.message || '请求后端服务失败，请稍后重试。');
        error.code = body.code || `HTTP_${response.statusCode}`;
        error.statusCode = response.statusCode;
        reject(error);
      },
      fail(reason) {
        const error = new Error('无法连接登录服务，请检查后端是否已启动或网络设置。');
        error.code = 'BACKEND_NETWORK_ERROR';
        error.cause = reason;
        reject(error);
      }
    });
  });
}

module.exports = { get: path => request('GET', path), post: (path, data) => request('POST', path, data) };
