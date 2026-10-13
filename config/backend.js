// 配置真实后端地址后再启用登录。不要把 AppSecret 放进小程序；它只存在于 Spring Boot 服务端环境变量。
module.exports = {
  configured: false,
  baseUrl: '',
  timeout: 10000,
  subscribeTemplateId: '',
  subscribeEnabled: false
};
