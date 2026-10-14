const { prepare, notify } = require('../../utils/page');
const events = require('../../services/events');
const eventView = require('../../utils/event-view');

/** 海报设计尺寸（逻辑像素）。导出时按设备像素比放大，保证文字锐利。 */
const POSTER_W = 600;
const POSTER_H = 900;
/**
 * 小程序码：从公众平台「小程序码」下载后放到这个路径，海报会自动印上。
 * 文件不存在时自动退化为「微信搜一搜」文字，不会画出半个空框。
 */
const MINI_CODE_PATH = '/assets/mini-code.png';
const COLORS = {
  paper: '#faf6eb',
  ink: '#3a332a',
  accent: '#876c42',
  muted: '#998667',
  line: 'rgba(135, 108, 66, 0.35)'
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 太长就逐步缩字号，缩到下限仍装不下则截断加省略号（保证海报永远不溢出）。 */
function fitText(ctx, text, maxWidth, startSize, minSize, weight) {
  const content = String(text || '');
  const w = weight || 600;
  let size = startSize;
  ctx.font = `${w} ${size}px sans-serif`;
  while (size > minSize && ctx.measureText(content).width > maxWidth) {
    size -= 2;
    ctx.font = `${w} ${size}px sans-serif`;
  }
  if (ctx.measureText(content).width <= maxWidth) return { size, text: content };
  let cut = content;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
  return { size, text: cut + '…' };
}

function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed: ' + src));
    image.src = src;
  });
}

Page({
  data: {
    theme: 'cream',
    guest: true,
    event: null,
    posterPath: '',
    rendering: true,
    error: '',
    saved: false,
    displayScale: 1,
    displayWidth: POSTER_W,
    displayHeight: POSTER_H
  },

  onLoad(options) {
    this._id = options && options.id ? String(options.id) : '';
    try { prepare(this, -1); } catch (error) { notify(error); }

    // 600px 宽的海报装不进手机屏幕，按可用宽度等比缩放预览（画布内部坐标不变）
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const available = Math.max(240, (info.windowWidth || 375) - 48);
    const scale = Math.min(1, available / POSTER_W);

    let event = null;
    try {
      const record = this._id ? events.get(this._id) : null;
      if (record && record.id === this._id) event = eventView.build(record);
    } catch (error) {
      notify(error);
    }

    this.setData({
      event,
      displayScale: scale,
      // 舞台按缩放后的实际尺寸写死并居中：盒子比父容器宽时 margin auto 是居不中的
      displayWidth: Math.round(POSTER_W * scale),
      displayHeight: Math.round(POSTER_H * scale),
      rendering: !!event
    });
  },

  onReady() {
    if (this.data.event) this.draw();
  },

  onShow() {
    // 转发 + 分享到朋友圈（朋友圈入口需要本页定义了 onShareTimeline 才会出现）
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  onBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/days/days' }) });
  },

  onRedraw() {
    if (this.data.rendering) return;
    this.draw();
  },

  /** 点一下看大图：全屏预览里长按同样能保存或转发。 */
  onPreview() {
    if (!this.data.posterPath) return;
    wx.previewImage({ urls: [this.data.posterPath], current: this.data.posterPath });
  },

  draw() {
    const event = this.data.event;
    if (!event) return;
    this.setData({ rendering: true, error: '', saved: false, posterPath: '' });
    wx.createSelectorQuery().in(this).select('#poster').fields({ node: true }).exec(result => {
      const canvas = result && result[0] && result[0].node;
      if (!canvas) {
        this.setData({ rendering: false, error: '画布还没准备好，可以点下面的「重新生成」。' });
        return;
      }
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const dpr = info.pixelRatio || 2;
      canvas.width = Math.round(POSTER_W * dpr);
      canvas.height = Math.round(POSTER_H * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      this.paint(ctx, canvas, event)
        .then(() => this.exportPoster(canvas, dpr))
        .catch(() => this.setData({ rendering: false, error: '海报没画出来，可以点下面的「重新生成」。' }));
    });
  },

  async paint(ctx, canvas, event) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 卡片底 + 内层虚线边框（呼应小程序里的 paper 卡片质感）
    roundRect(ctx, 0, 0, POSTER_W, POSTER_H, 34);
    ctx.fillStyle = COLORS.paper;
    ctx.fill();
    ctx.save();
    ctx.setLineDash([9, 11]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.line;
    roundRect(ctx, 26, 26, POSTER_W - 52, POSTER_H - 52, 24);
    ctx.stroke();
    ctx.restore();

    // 品牌
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 22px sans-serif';
    ctx.fillText('日 子 绵 绵', POSTER_W / 2, 62);

    // 分类插画（加载失败不影响其它内容）
    if (event.backgroundSrc) {
      try {
        const art = await loadImage(canvas, event.backgroundSrc);
        ctx.drawImage(art, (POSTER_W - 240) / 2, 96, 240, 240);
      } catch (ignored) {}
    }

    // 日子名称
    const name = fitText(ctx, event.name, POSTER_W - 130, 46, 28, 600);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${name.size}px sans-serif`;
    ctx.fillText(name.text, POSTER_W / 2, 390);

    // 状态说明
    ctx.fillStyle = COLORS.muted;
    ctx.font = '24px sans-serif';
    ctx.fillText(event.statusText, POSTER_W / 2, 432);

    // 天数：整张卡片的视觉主角，数字与单位作为整体居中
    const numberText = event.countText || '—';
    ctx.font = '700 144px sans-serif';
    const numberWidth = ctx.measureText(numberText).width;
    const unitGap = 16;
    ctx.font = '500 36px sans-serif';
    const unitWidth = event.unitText ? ctx.measureText(event.unitText).width + unitGap : 0;
    const startX = (POSTER_W - numberWidth - unitWidth) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.accent;
    ctx.font = '700 144px sans-serif';
    ctx.fillText(numberText, startX, 528);
    if (event.unitText) {
      ctx.font = '500 36px sans-serif';
      ctx.fillText(event.unitText, startX + numberWidth + unitGap, 562);
    }
    ctx.textAlign = 'center';

    // 日期（只留这一行信息，分类与重复方式不上海报：那是设置，不是内容）
    ctx.fillStyle = COLORS.ink;
    ctx.font = '28px sans-serif';
    ctx.fillText(event.targetDateText, POSTER_W / 2, 636);

    // 留在心上的那句话
    const phrase = fitText(ctx, event.phrase, POSTER_W - 130, 22, 18, 400);
    ctx.fillStyle = COLORS.accent;
    ctx.font = `400 ${phrase.size}px sans-serif`;
    ctx.fillText(phrase.text, POSTER_W / 2, 688);

    // 分隔线
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(140, 716);
    ctx.lineTo(POSTER_W - 140, 716);
    ctx.stroke();
    ctx.restore();

    // 底部：有小程序码就印在白卡片上（下载到的是白底图，直接贴会露出方块），没有就用文字兜底
    let drewCode = false;
    try {
      const code = await loadImage(canvas, MINI_CODE_PATH);
      const size = 96;
      const pad = 8;
      const x = (POSTER_W - size) / 2;
      const y = 730 + pad;
      // 白卡片：既让白底小程序码不突兀，也保证扫码所需的对比度
      roundRect(ctx, x - pad, y - pad, size + pad * 2, size + pad * 2, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(135, 108, 66, 0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.drawImage(code, x, y, size, size);
      drewCode = true;
    } catch (ignored) {}

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.muted;
    if (drewCode) {
      ctx.font = '19px sans-serif';
      ctx.fillText('长按识别，开始记录你的日子', POSTER_W / 2, 858);
    } else {
      ctx.font = '500 26px sans-serif';
      ctx.fillStyle = COLORS.accent;
      ctx.fillText('微信搜一搜「日子绵绵」', POSTER_W / 2, 780);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '21px sans-serif';
      ctx.fillText('把你的日子，也慢慢记下来', POSTER_W / 2, 820);
    }
  },

  exportPoster(canvas, dpr) {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: POSTER_W,
      height: POSTER_H,
      destWidth: Math.round(POSTER_W * dpr),
      destHeight: Math.round(POSTER_H * dpr),
      fileType: 'jpg',
      quality: 0.94,
      success: result => this.setData({ posterPath: result.tempFilePath, rendering: false, error: '' }),
      fail: () => this.setData({ rendering: false, error: '导出图片失败，可以点下面的「重新生成」。' })
    }, this);
  },

  onSave() {
    if (this._saving || !this.data.posterPath) return;
    this._saving = true;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterPath,
      success: () => {
        this.setData({ saved: true });
        wx.showToast({ title: '已存到相册', icon: 'success' });
      },
      fail: error => {
        const raw = String((error && error.errMsg) || '');
        // 用户拒绝过相册权限时，只能引导去设置里重新打开
        if (raw.indexOf('auth') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存图片需要你允许「保存到相册」。也可以在设置里打开后，回来再存一次。',
            confirmText: '去设置',
            cancelText: '知道了',
            success: result => { if (result.confirm) wx.openSetting({}); }
          });
          return;
        }
        notify(new Error('保存没成功，可以长按上面的卡片直接保存。'));
      },
      complete: () => { this._saving = false; }
    });
  },

  onShareAppMessage() {
    const event = this.data.event;
    if (!event) return { title: '日子绵绵 · 把重要的日子慢慢放在心上', path: '/pages/days/days' };
    return {
      title: eventView.shareTitle(event),
      path: `/pages/event-detail/event-detail?id=${event.id}`,
      // 转发出去的封面直接用刚生成的海报
      imageUrl: this.data.posterPath || undefined
    };
  },

  onShareTimeline() {
    const event = this.data.event;
    if (!event) return { title: '日子绵绵 · 把重要的日子慢慢放在心上' };
    return { title: eventView.shareTitle(event), query: `id=${event.id}` };
  }
});
