/**
 * 商店 / 虚拟支付。
 *
 * 三条不能忘的规则（写在这里，改的人先看）：
 *   1. signData 是服务端序列化好的字符串，**必须原样交给 wx.requestVirtualPayment**，
 *      再 JSON.stringify 一次会改变字段顺序 → 验签失败；
 *   2. 微信返回 success 只是"弱确认"，最终是否发货要问后端（queryOrderStatus）；
 *   3. AppKey / session_key 全程只在服务端，前端拿不到也不该拿。
 */
const auth = require('./auth');
const http = require('./http');

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });
}

function isReady() {
  return !!auth.currentUser() && http.isBackendReady();
}

function products() {
  return http.get('/api/store/products');
}

function entitlements() {
  return http.get('/api/store/entitlements');
}

/** 下单：顺手取一个临时 code，服务端用它换 session_key 来算签名。 */
async function createOrder(productId, platform) {
  const login = await wxLogin();
  if (!login || !login.code) {
    throw new Error('没能取到支付凭证，请重新进入小程序再试');
  }
  return http.post('/api/store/orders', {
    productId,
    code: login.code,
    platform: platform || ''
  });
}

function orderStatus(outTradeNo) {
  return http.get('/api/store/orders/' + encodeURIComponent(outTradeNo));
}

/**
 * 拉起收银台。
 * @returns {Promise<{ok:boolean, cancelled:boolean, message:string}>}
 */
function requestPayment(order) {
  return new Promise(resolve => {
    if (!order || !order.signData || !order.paySig || !order.signature) {
      resolve({ ok: false, cancelled: false, message: '订单参数不完整，请重试' });
      return;
    }
    if (typeof wx.requestVirtualPayment !== 'function' || !wx.canIUse('requestVirtualPayment')) {
      resolve({ ok: false, cancelled: false, message: '当前微信版本不支持支付，请升级微信后再试' });
      return;
    }
    wx.requestVirtualPayment({
      signData: order.signData,
      paySig: order.paySig,
      signature: order.signature,
      mode: order.mode || 'short_series_goods',
      success: () => resolve({ ok: true, cancelled: false, message: '' }),
      fail: error => {
        const raw = String((error && error.errMsg) || '');
        const cancelled = raw.indexOf('cancel') >= 0;
        resolve({ ok: false, cancelled, message: cancelled ? '' : (raw || '支付没有完成，请重试') });
      }
    });
  });
}

/** 支付成功后轮询后端订单状态：回调是异步的，可能晚一两秒才到。 */
function waitForPaid(outTradeNo, attempts, interval) {
  const total = attempts || 4;
  const gap = interval || 1200;
  return new Promise(resolve => {
    let tried = 0;
    const tick = () => {
      tried += 1;
      orderStatus(outTradeNo).then(order => {
        if (order && order.status === 'paid') {
          resolve(order);
          return;
        }
        if (tried >= total) {
          resolve(order || null);
          return;
        }
        setTimeout(tick, gap);
      }).catch(() => resolve(null));
    };
    tick();
  });
}

module.exports = {
  isReady,
  products,
  entitlements,
  createOrder,
  orderStatus,
  requestPayment,
  waitForPaid
};
