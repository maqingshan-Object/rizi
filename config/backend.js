// 微信云托管（推荐）：用 wx.cloud.callContainer 内网调用，不需要域名，也不需要配置 request 合法域名。
// 把 cloudEnv 填成云托管控制台的环境 ID，serviceName 填服务名称即可。
// 不要把 AppSecret 放进小程序；它只存在于 Spring Boot 服务端环境变量。
module.exports = {
  // 调用方式：'container' = 微信云托管内网调用；'request' = 普通 HTTPS 域名调用
  mode: 'container',

  // 微信云托管环境 ID（控制台 → 环境 → 环境 ID）
  cloudEnv: 'prod-d0gvz2c3x20f324f0',
  // 微信云托管服务名称（服务管理 → 服务列表 → 服务名称，必须与云托管控制台里的完全一致）
  serviceName: 'rizi',

  // mode 为 'request' 时才使用；必须是已备案的 HTTPS 域名
  configured: false,
  baseUrl: '',
  timeout: 10000,

  // 订阅消息模板 ID（在微信公众平台申请后填写，并同时把 subscribeEnabled 改为 true）
  // 时间胶囊开关：当前版本为了类目不冲突先关闭（代码全部保留，改回 true 即可重启）
  capsuleEnabled: false,
  subscribeTemplateId: 'lBn8jTXf4VIeSde5cW_G8mXlzZHbKzAOW0_7owNKqYo',
  subscribeEnabled: true
};
