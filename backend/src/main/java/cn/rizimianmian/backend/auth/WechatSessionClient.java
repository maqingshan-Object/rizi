package cn.rizimianmian.backend.auth;

import cn.rizimianmian.backend.config.AppProperties;
import cn.rizimianmian.backend.config.TrustStoreSupport;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class WechatSessionClient {
    private final RestClient restClient;
    private final AppProperties properties;

    public WechatSessionClient(RestClient.Builder restClientBuilder, AppProperties properties) {
        // ⚠️ 必须显式把信任库绑到出网客户端上。
        // 云托管「云调用」会用自签证书终止 https://api.weixin.qq.com，不绑就会报
        // "PKIX path building failed: unable to find valid certification path"。
        // 提醒客户端早就这么做了；这里当初漏了 —— 而登录在云托管下走内网协议
        // （X-WX-OPENID），code2Session 从没被真正调用过，直到虚拟支付需要它。
        this.restClient = restClientBuilder
                .requestFactory(TrustStoreSupport.httpsRequestFactory(java.time.Duration.ofSeconds(10)))
                .build();
        this.properties = properties;
    }

    public WechatSession exchangeCode(String code) {
        String uri = UriComponentsBuilder.fromUriString(properties.wechat().sessionUrl())
                .queryParam("appid", properties.wechat().appId())
                .queryParam("secret", properties.wechat().appSecret())
                .queryParam("js_code", code)
                .queryParam("grant_type", "authorization_code")
                .build(true)
                .toUriString();
        WechatSession response = restClient.get().uri(uri).retrieve().body(WechatSession.class);
        if (response == null || response.errcode() != null || response.openid() == null || response.openid().isBlank()) {
            throw new IllegalArgumentException("微信身份验证失败，请稍后重试");
        }
        return response;
    }

    public record WechatSession(String openid, String unionid, String session_key, Integer errcode, String errmsg) {}
}
