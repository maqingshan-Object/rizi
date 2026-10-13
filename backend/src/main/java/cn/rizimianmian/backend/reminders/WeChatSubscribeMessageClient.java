package cn.rizimianmian.backend.reminders;

import cn.rizimianmian.backend.config.AppProperties;
import cn.rizimianmian.backend.events.EventEntity;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class WeChatSubscribeMessageClient {
    private final RestClient restClient;
    private final AppProperties properties;

    public WeChatSubscribeMessageClient(RestClient.Builder restClientBuilder, AppProperties properties) {
        this.restClient = restClientBuilder.build();
        this.properties = properties;
    }

    public SendResult send(String openId, EventEntity event, LocalDate occurrence) {
        String templateId = properties.wechat().subscribeTemplateId();
        if (templateId == null || templateId.isBlank()) {
            return SendResult.needsAuthorization("未配置 WECHAT_SUBSCRIBE_TEMPLATE_ID");
        }

        String accessToken = properties.wechat().accessToken();
        if (accessToken == null || accessToken.isBlank()) {
            if (properties.wechat().appId().isBlank() || properties.wechat().appSecret().isBlank()) {
                return SendResult.needsAuthorization("未配置微信 access token，且 WECHAT_APP_ID/WECHAT_APP_SECRET 不完整");
            }
            try {
                AccessTokenResponse token = restClient.get()
                        .uri(UriComponentsBuilder.fromUriString(properties.wechat().accessTokenUrl())
                                .queryParam("grant_type", "client_credential")
                                .queryParam("appid", properties.wechat().appId())
                                .queryParam("secret", properties.wechat().appSecret())
                                .build(true).toUriString())
                        .retrieve().body(AccessTokenResponse.class);
                if (token == null || token.accessToken() == null || token.accessToken().isBlank()) {
                    return SendResult.failed(token == null ? "微信 access token 响应为空" : token.errmsg());
                }
                accessToken = token.accessToken();
            } catch (RestClientException exception) {
                return SendResult.failed("获取微信 access token 失败：" + exception.getMessage());
            }
        }

        try {
            Map<String, Map<String, String>> data = new LinkedHashMap<>();
            data.put(properties.wechat().templateNameField(), Map.of("value", shorten(event.getName(), 20)));
            data.put(properties.wechat().templateDateField(), Map.of("value", occurrence.toString()));
            data.put(properties.wechat().templateNoteField(), Map.of("value", shorten(event.getNote() == null ? "还有 3 天" : event.getNote(), 20)));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("touser", openId);
            body.put("template_id", templateId);
            body.put("data", data);
            WechatMessageResponse response = restClient.post()
                    .uri(UriComponentsBuilder.fromUriString(properties.wechat().subscribeMessageUrl())
                            .queryParam("access_token", accessToken).build(true).toUriString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(WechatMessageResponse.class);
            if (response == null || response.errcode() == null) {
                return SendResult.failed("微信订阅消息响应缺少 errcode，未确认发送成功");
            }
            if (response.errcode() != 0) {
                return SendResult.failed("微信订阅消息发送失败：" + response.errmsg());
            }
            return SendResult.sent();
        } catch (RestClientException exception) {
            return SendResult.failed("微信订阅消息请求失败：" + exception.getMessage());
        }
    }

    private String shorten(String value, int maxLength) {
        String text = value == null ? "" : value.trim();
        return text.length() <= maxLength ? text : text.substring(0, maxLength);
    }

    public record SendResult(ResultStatus status, String message) {
        static SendResult sent() { return new SendResult(ResultStatus.SENT, null); }
        static SendResult failed(String message) { return new SendResult(ResultStatus.FAILED, message == null ? "微信接口返回失败" : message); }
        static SendResult needsAuthorization(String message) { return new SendResult(ResultStatus.NEEDS_AUTHORIZATION, message); }
    }

    public enum ResultStatus { SENT, FAILED, NEEDS_AUTHORIZATION }
    private record AccessTokenResponse(String access_token, Integer errcode, String errmsg) {
        String accessToken() { return access_token; }
    }
    private record WechatMessageResponse(Integer errcode, String errmsg) {}
}
