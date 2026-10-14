const { prepare, notify } = require('../../utils/page');
const events = require('../../services/events');
const eventView = require('../../utils/event-view');

/** 海报设计尺寸（逻辑像素）。导出时按设备像素比放大，保证文字锐利。 */
const POSTER_W = 600;
const POSTER_H = 900;
/**
 * 转发封面单独一张，固定 5:4 —— 微信转发卡片只按 5:4 显示，
 * 把 2:3 的海报直接当封面，天数会被从中间切掉。
 * 所以横版重排一次：左边圆形插画、右边名称 + 天数 + 日期。
 */
const COVER_W = 600;
const COVER_H = 480;
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
  soft: 'rgba(135, 108, 66, 0.09)'
};

/**
 * 海报上的状态词要短。
 * 页面上写「距离这一天还有」很清楚，但印到卡片上就是噪音 —— 参考极简风格的
 * 倒数卡片，这里只留「还有 / 已经走过」这种两三个字。
 */
function posterStatus(event) {
  if (!event || event.unavailable) return '日期待换算';
  const short = {
    '距离这一天还有': '还有',
    '已经一起走过': '已经走过',
    '就在今天': '就在今天',
    '这一天已经过去': '已经过去'
  };
  return short[event.statusText] || event.statusText;
}

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
    coverPath: '',
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
    this.setData({ rendering: true, error: '', saved: false, posterPath: '', coverPath: '' });
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
        // 海报导出后再画一张 5:4 的转发封面（失败也不影响海报使用）
        .then(() => this.drawCover(event, dpr))
        .catch(() => this.setData({ rendering: false, error: '海报没画出来，可以点下面的「重新生成」。' }));
    });
  },

  async paint(ctx, canvas, event) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 卡片底：不加边框、不加分隔线 —— 极简风格靠留白和层级说话，不靠线
    roundRect(ctx, 0, 0, POSTER_W, POSTER_H, 36);
    ctx.fillStyle = COLORS.paper;
    ctx.fill();

    // ① 圆形浅底 + 分类插画
    const circleY = 162;
    ctx.beginPath();
    ctx.arc(POSTER_W / 2, circleY, 92, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.soft;
    ctx.fill();
    if (event.backgroundSrc) {
      try {
        const art = await loadImage(canvas, event.backgroundSrc);
        ctx.drawImage(art, (POSTER_W - 140) / 2, circleY - 70, 140, 140);
      } catch (ignored) {}
    }

    // ② 日子名称
    const name = fitText(ctx, event.name, POSTER_W - 140, 36, 24, 600);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${name.size}px sans-serif`;
    ctx.fillText(name.text, POSTER_W / 2, 300);

    // ③ 状态小胶囊（「还有」/「已经走过」）
    const statusText = posterStatus(event);
    ctx.font = '22px sans-serif';
    const pillWidth = ctx.measureText(statusText).width + 44;
    const pillHeight = 42;
    roundRect(ctx, (POSTER_W - pillWidth) / 2, 366 - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = COLORS.soft;
    ctx.fill();
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(statusText, POSTER_W / 2, 366);

    // ④ 天数：整张卡片绝对的主角。数字与单位同色、单位约为数字的四成，
    //    整组居中；位数多时自动缩字号，保证永远不出框。
    const number = fitText(ctx, event.countText || '—', POSTER_W - 160, 180, 110, 700);
    ctx.font = `700 ${number.size}px sans-serif`;
    const numberWidth = ctx.measureText(number.text).width;
    const unitSize = Math.round(number.size * 0.42);
    const unitGap = 12;
    ctx.font = `500 ${unitSize}px sans-serif`;
    const unitWidth = event.unitText ? ctx.measureText(event.unitText).width + unitGap : 0;
    const startX = (POSTER_W - numberWidth - unitWidth) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.accent;
    ctx.font = `700 ${number.size}px sans-serif`;
    ctx.fillText(number.text, startX, 492);
    if (event.unitText) {
      ctx.font = `500 ${unitSize}px sans-serif`;
      ctx.fillText(event.unitText, startX + numberWidth + unitGap, 492 + number.size * 0.22);
    }
    ctx.textAlign = 'center';

    // ⑤ 日期 + 目标日
    ctx.fillStyle = COLORS.ink;
    ctx.font = '28px sans-serif';
    ctx.fillText(event.targetDateText, POSTER_W / 2, 656);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '20px sans-serif';
    ctx.fillText('- 目标日 -', POSTER_W / 2, 696);

    // ⑥ 底部：有小程序码就印在白卡片上（下载到的是白底图，直接贴会露出方块），没有就用文字兜底
    let drewCode = false;
    try {
      const code = await loadImage(canvas, MINI_CODE_PATH);
      const size = 92;
      const pad = 7;
      const x = (POSTER_W - size) / 2;
      const y = 766;
      roundRect(ctx, x - pad, y - pad, size + pad * 2, size + pad * 2, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(135, 108, 66, 0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.drawImage(code, x, y, size, size);
      drewCode = true;
    } catch (ignored) {}

    if (!drewCode) {
      ctx.fillStyle = COLORS.accent;
      ctx.font = '500 26px sans-serif';
      ctx.fillText('微信搜一搜「日子绵绵」', POSTER_W / 2, 790);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '21px sans-serif';
      ctx.fillText('把你的日子，也慢慢记下来', POSTER_W / 2, 830);
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

  /** 画转发封面（5:4 横版）：左边圆形插画，右边名称 + 天数 + 日期。 */
  drawCover(event, dpr) {
    return new Promise(resolve => {
      wx.createSelectorQuery().in(this).select('#cover').fields({ node: true }).exec(result => {
        const canvas = result && result[0] && result[0].node;
        if (!canvas) {
          resolve();
          return;
        }
        canvas.width = Math.round(COVER_W * dpr);
        canvas.height = Math.round(COVER_H * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this.paintCover(ctx, canvas, event)
          .then(() => {
            wx.canvasToTempFilePath({
              canvas,
              x: 0,
              y: 0,
              width: COVER_W,
              height: COVER_H,
              destWidth: Math.round(COVER_W * dpr),
              destHeight: Math.round(COVER_H * dpr),
              fileType: 'jpg',
              quality: 0.94,
              success: result2 => { this.setData({ coverPath: result2.tempFilePath }); resolve(); },
              fail: () => resolve()
            }, this);
          })
          .catch(() => resolve());
      });
    });
  },

  async paintCover(ctx, canvas, event) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    roundRect(ctx, 0, 0, COVER_W, COVER_H, 28);
    ctx.fillStyle = COLORS.paper;
    ctx.fill();

    // 左：圆形浅底 + 分类插画
    const cx = 152;
    const cy = COVER_H / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 86, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.soft;
    ctx.fill();
    if (event.backgroundSrc) {
      try {
        const art = await loadImage(canvas, event.backgroundSrc);
        ctx.drawImage(art, cx - 65, cy - 65, 130, 130);
      } catch (ignored) {}
    }

    // 右：文字统一左对齐，天数依然是主角
    const left = 268;
    ctx.textAlign = 'left';
    const name = fitText(ctx, event.name, COVER_W - left - 40, 36, 24, 600);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${name.size}px sans-serif`;
    ctx.fillText(name.text, left, 148);

    ctx.fillStyle = COLORS.muted;
    ctx.font = '22px sans-serif';
    ctx.fillText(posterStatus(event), left, 194);

    const number = fitText(ctx, event.countText || '—', COVER_W - left - 90, 104, 70, 700);
    ctx.font = `700 ${number.size}px sans-serif`;
    const numberWidth = ctx.measureText(number.text).width;
    const unitSize = Math.round(number.size * 0.42);
    ctx.fillStyle = COLORS.accent;
    ctx.font = `700 ${number.size}px sans-serif`;
    ctx.fillText(number.text, left, 274);
    if (event.unitText) {
      ctx.font = `500 ${unitSize}px sans-serif`;
      ctx.fillText(event.unitText, left + numberWidth + 10, 274 + number.size * 0.22);
    }

    ctx.fillStyle = COLORS.muted;
    ctx.font = '24px sans-serif';
    ctx.fillText(event.targetDateText, left, 356);
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
      // 用专门的 5:4 封面：微信转发卡片按 5:4 显示，直接给竖版海报会把天数切掉
      imageUrl: this.data.coverPath || undefined
    };
  },

  onShareTimeline() {
    const event = this.data.event;
    if (!event) return { title: '日子绵绵 · 把重要的日子慢慢放在心上' };
    return { title: eventView.shareTitle(event), query: `id=${event.id}` };
  }
});
