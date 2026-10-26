const { prepare, notify } = require('../../utils/page');
const auth = require('../../services/auth');
const store = require('../../services/store');

/** 商品按用途分组，顺序固定 —— 主题在前（最容易理解），赞赏在后。 */
const GROUPS = [
  { key: 'theme', title: '主题', hint: '一次购买，永久可用', match: id => id.indexOf('theme_') === 0 },
  { key: 'capsule', title: '时间胶囊', hint: '写一段话，指定未来某天启封', match: id => id.indexOf('capsule_') === 0 },
  { key: 'support', title: '支持作者', hint: '', match: id => id.indexOf('support_') === 0 }
];

// 胶囊开关关闭时从商店分组里去掉（商品仍在后台，只是不展示 ✅）
const GROUPS_VISIBLE = (function () {
  let on = true;
  try { on = require('../../config/backend').capsuleEnabled === true; } catch (error) { on = true; }
  return on ? GROUPS_VISIBLE : GROUPS_VISIBLE.filter(function (g) { return g.key !== 'capsule'; });
})();

function priceText(cents) {
  return '¥' + (Number(cents || 0) / 100).toFixed(2);
}

function currentPlatform() {
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    return String((info && info.platform) || '').toLowerCase();
  } catch (error) {
    return '';
  }
}

Page({
  data: {
    theme: 'cream',
    logged: false,
    configured: true,
    loading: true,
    buying: false,
    pendingId: '',
    error: '',
    groups: []
  },

  onShow() {
    try { prepare(this, -1); } catch (error) { notify(error); }
    this.refresh();
  },

  refresh() {
    const logged = !!auth.currentUser();
    this.setData({ logged });
    if (!logged) {
      this.setData({ loading: false, groups: [], configured: true, error: '' });
      return;
    }
    if (!store.isReady()) {
      this.setData({ loading: false, configured: false, groups: [], error: '' });
      return;
    }
    this.setData({ loading: true, error: '' });
    store.products().then(list => {
      const items = (list || []).map(item => Object.assign({}, item, { priceText: priceText(item.priceCents) }));
      const groups = GROUPS_VISIBLE.map(group => ({
        key: group.key,
        title: group.title,
        hint: group.hint,
        items: items.filter(item => group.match(item.productId || ''))
      })).filter(group => group.items.length);
      this.setData({ groups, configured: true, loading: false });
    }).catch(error => {
      this.setData({ loading: false, error: (error && error.message) || '商品列表暂时读不到，稍后再试' });
    });
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onRefresh() {
    if (this.data.loading) return;
    this.refresh();
  },

  onBuy(event) {
    const productId = event.currentTarget.dataset.id;
    if (this.data.buying || !productId) return;
    this.setData({ buying: true, pendingId: productId, error: '' });

    store.createOrder(productId, currentPlatform())
      .then(order => {
        if (!order || order.configured === false) {
          this.setData({ buying: false, pendingId: '' });
          notify(new Error((order && order.message) || '支付还没配置好'));
          return null;
        }
        return store.requestPayment(order).then(result => {
          if (!result.ok) {
            this.setData({ buying: false, pendingId: '' });
            // 用户主动取消不弹提示，避免打扰
            if (!result.cancelled) notify(new Error(result.message || '支付没有完成'));
            return null;
          }
          // 微信的 success 只是弱确认：以后端订单状态为准，轮询几次等回调到达
          wx.showLoading({ title: '确认支付中…', mask: true });
          return store.waitForPaid(order.outTradeNo).then(paid => {
            wx.hideLoading();
            this.setData({ buying: false, pendingId: '' });
            if (paid && paid.status === 'paid') {
              wx.showToast({ title: '已解锁，谢谢支持', icon: 'success' });
            } else {
              wx.showToast({ title: '支付确认中，稍后可点下方刷新', icon: 'none' });
            }
            this.refresh();
          });
        });
      })
      .catch(error => {
        this.setData({ buying: false, pendingId: '' });
        notify(error);
      });
  }
});
