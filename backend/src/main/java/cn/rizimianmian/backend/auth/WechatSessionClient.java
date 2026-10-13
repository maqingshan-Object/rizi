package cn.rizimianmian.backend.auth;

import cn.rizimianmian.backend.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class WechatSessionClient {
    private final RestClient restClient;
    private final AppProperties properties;

    public WechatSessionClient(RestClient.Builder restClientBuilder, AppProperties properties) {
        this.restClient = restClientBuilder.build();
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
