const auth = require('../../services/auth');
const events = require('../../services/events');
const { prepare, notify } = require('../../utils/page');

Page({
  data: {
    theme: 'cream',
    user: null,
    guest: true,
    configured: false,
    agreed: false,
    signingIn: false,
    saving: false,
    error: '',
    errorCode: '',
    profileError: '',
    profileErrorCode: '',
    nickname: '',
    avatarPath: '',
    avatarPreview: '/assets/cat.png',
    profileSaved: false
  },

  onShow() {
    this.syncIdentity(true);
  },

  syncIdentity(resetDraft) {
    prepare(this, 2);
    const user = auth.currentUser();
    const configured = typeof auth.isConfigured === 'function' ? auth.isConfigured() : auth.isConfigured === true;
    const data = { user, guest: !user, configured };
    if (!user || resetDraft) {
      data.nickname = user ? (user.nickname || '') : '';
      data.avatarPath = '';
      data.avatarPreview = user && user.avatarUrl ? user.avatarUrl : '/assets/cat.png';
      data.profileSaved = false;
    }
    this.setData(data);
  },

  changeAgreement(event) {
    this.setData({ agreed: event.detail.value.indexOf('privacy') !== -1, error: '', errorCode: '' });
  },

  openPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy', fail: notify });
  },

  continueGuest() {
    if (this.data.signingIn || this.data.saving) return;
    wx.switchTab({ url: '/pages/days/days', fail: notify });
  },

  async signIn() {
    if (this.data.signingIn) return;
    if (!this.data.agreed) {
      this.setData({ error: '请先阅读并勾选隐私说明，再尝试登录。', errorCode: '' });
      return;
    }
    if (auth.currentUser()) {
      this.syncIdentity(true);
      return;
    }
    this.setData({ signingIn: true, error: '', errorCode: '', profileError: '', profileErrorCode: '' });
    try {
      await auth.signIn();
      // 只认可服务验证后的身份，不使用登录返回值或开发者工具账号伪造用户。
      if (!auth.currentUser()) throw new Error('登录未建立有效身份，仍处于访客模式。');
      let migrated = 0;
      let migrationFailed = false;
      try {
        if (typeof events.remoteReady === 'function' && events.remoteReady()) {
          const localRecords = events.list().filter(record => !record.sample);
          if (localRecords.length) {
            await events.syncRemote(localRecords);
            migrated = localRecords.length;
          }
        }
      } catch (migrationError) {
        migrationFailed = true;
      }
      this.syncIdentity(true);
      if (migrated) wx.showToast({ title: `已同步 ${migrated} 个日子`, icon: 'none' });
      else if (migrationFailed) wx.showToast({ title: '已登录，日子云端同步稍后重试', icon: 'none' });
    } catch (error) {
      this.syncIdentity(false);
      this.setData({ error: error.message || '登录失败，未建立有效身份。', errorCode: error.code || '' });
      notify(error);
    } finally {
      this.setData({ signingIn: false });
    }
  },

  chooseAvatar(event) {
    if (this.data.saving) return;
    if (!auth.currentUser()) {
      this.syncIdentity(false);
      this.setData({ error: '请先完成真实身份登录，再选择头像。' });
      return;
    }
    const avatarPath = event.detail.avatarUrl;
    if (!avatarPath) return;
    this.setData({ avatarPath, avatarPreview: avatarPath, profileSaved: false, profileError: '', profileErrorCode: '' });
  },

  getWechatProfile() {
    if (this.data.saving || !auth.currentUser()) {
      this.setData({ profileError: '请先完成真实身份登录，再获取微信头像和昵称。', profileErrorCode: '' });
      return;
    }
    if (typeof wx.getUserProfile !== 'function') {
      this.setData({ profileError: '当前基础库不支持获取微信资料，请手动填写昵称。', profileErrorCode: 'WECHAT_PROFILE_UNSUPPORTED' });
      return;
    }
    wx.getUserProfile({
      desc: '用于完善日子绵绵账号资料',
      lang: 'zh_CN',
      success: result => {
        const userInfo = result && result.userInfo ? result.userInfo : {};
        const nickname = String(userInfo.nickName || '').trim();
        const avatarUrl = String(userInfo.avatarUrl || '').trim();
        this.setData({
          nickname: nickname || this.data.nickname,
          avatarPath: avatarUrl,
          avatarPreview: avatarUrl || this.data.avatarPreview,
          profileSaved: false,
          profileError: '',
          profileErrorCode: ''
        });
      },
      fail: error => {
        const code = error && error.errMsg && error.errMsg.indexOf('deny') >= 0 ? 'WECHAT_PROFILE_DENIED' : 'WECHAT_PROFILE_FAILED';
        this.setData({ profileError: code === 'WECHAT_PROFILE_DENIED' ? '你拒绝了微信资料授权，仍可以手动填写昵称。' : '获取微信头像和昵称失败，请稍后重试。', profileErrorCode: code, profileSaved: false });
      }
    });
  },

  avatarError() {
    this.setData({ avatarPreview: '/assets/cat.png', avatarPath: '', profileSaved: false });
  },

  async submitProfile(event) {
    if (this.data.saving) return;
    if (!auth.currentUser()) {
      this.syncIdentity(false);
      this.setData({ error: '尚未登录，不能保存账号资料。', errorCode: '' });
      return;
    }
    if (!this.data.agreed) {
      this.setData({ profileError: '请先阅读并勾选隐私说明。', profileErrorCode: '', profileSaved: false });
      return;
    }
    const nickname = String(event.detail.value.nickname || '').trim();
    if (!nickname || nickname.length > 20) {
      this.setData({ profileError: '请填写 1—20 个字符的昵称。', profileErrorCode: '', profileSaved: false });
      return;
    }
    this.setData({ saving: true, nickname, profileError: '', profileErrorCode: '', profileSaved: false });
    try {
      await auth.updateProfile({ nickname, avatarUrl: this.data.avatarPath || undefined });
      if (!auth.currentUser()) throw new Error('登录身份已失效，无法确认资料保存，请重新登录。');
      this.syncIdentity(false);
      this.setData({ profileSaved: true, avatarPath: '' });
      wx.showToast({ title: '资料已保存', icon: 'success' });
    } catch (error) {
      if (!auth.currentUser()) this.syncIdentity(false);
      this.setData({ profileError: error.message || '资料保存失败，请重试。', profileErrorCode: error.code || '', profileSaved: false });
      notify(error);
    } finally {
      this.setData({ saving: false });
    }
  }
});
