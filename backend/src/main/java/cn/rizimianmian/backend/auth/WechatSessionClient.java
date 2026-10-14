package cn.rizimianmian.backend.auth;

import cn.rizimianmian.backend.config.AppProperties;
import cn.rizimianmian.backend.config.TrustStoreSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import javax.net.ssl.HttpsURLConnection;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * 用临时 code 换 openid / session_key。
 *
 * <p>⚠️ 这里刻意用 {@link HttpsURLConnection} + 显式 {@code setSSLSocketFactory}，
 * 与 {@code WeChatTlsDiagnostics} 的 TLS 自检**完全同一套写法**。
 *
 * <p>原因：云托管「云调用」会用自签证书终止 {@code api.weixin.qq.com} 的 TLS。
 * 实测把 SSLContext 交给 RestClient / JDK HttpClient 的请求工厂，在本环境仍会报
 * {@code PKIX path building failed}（即使 TRUSTSTORE_SERVED_CHAIN_TRUST 已为 on）；
 * 而下面这套写法是线上 TLS 自检一直能通过的。这个接口是虚拟支付的必需依赖
 * （要用 session_key 算用户态签名），必须稳。
 */
@Component
public class WechatSessionClient {
    private static final int TIMEOUT_MILLIS = 10_000;

    private final AppProperties properties;
    private final ObjectMapper objectMapper;

    public WechatSessionClient(AppProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public WechatSession exchangeCode(String code) {
        String uri = UriComponentsBuilder.fromUriString(properties.wechat().sessionUrl())
                .queryParam("appid", properties.wechat().appId())
                .queryParam("secret", properties.wechat().appSecret())
                .queryParam("js_code", code)
                .queryParam("grant_type", "authorization_code")
                .build(true)
                .toUriString();
        try {
            WechatSession response = objectMapper.readValue(get(uri), WechatSession.class);
            if (response == null || response.errcode() != null || response.openid() == null || response.openid().isBlank()) {
                throw new IllegalArgumentException("微信身份验证失败，请稍后重试");
            }
            return response;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("微信身份验证失败，请稍后重试：" + exception.getMessage(), exception);
        }
    }

    /** GET 并返回响应体；出错时读错误流，便于把微信的错误码带进日志。 */
    private String get(String uri) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) URI.create(uri).toURL().openConnection();
        connection.setSSLSocketFactory(TrustStoreSupport.sslContext().getSocketFactory());
        connection.setConnectTimeout(TIMEOUT_MILLIS);
        connection.setReadTimeout(TIMEOUT_MILLIS);
        connection.setRequestMethod("GET");
        try (InputStream in = connection.getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            InputStream error = connection.getErrorStream();
            if (error == null) {
                throw exception;
            }
            try (InputStream in = error) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
        }
    }

    public record WechatSession(String openid, String unionid, String session_key, Integer errcode, String errmsg) {}
}
