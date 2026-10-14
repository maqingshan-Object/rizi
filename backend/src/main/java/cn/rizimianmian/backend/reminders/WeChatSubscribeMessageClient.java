package cn.rizimianmian.backend.reminders;

import cn.rizimianmian.backend.config.AppProperties;
import cn.rizimianmian.backend.config.TrustStoreSupport;
import cn.rizimianmian.backend.events.EventEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class WeChatSubscribeMessageClient {
    private static final Logger log = LoggerFactory.getLogger(WeChatSubscribeMessageClient.class);

    /** 云调用链路标识响应头：出现它表示请求确实走了微信云托管的开放接口服务。 */
    private static final String OPENAPI_SEQ_ID_HEADER = "x-openapi-seqid";
    /**
     * time 类型字段只接受带时间的格式（纯日期会触发 47003），
     * 提醒只关心"哪一天"，这里补一个固定时刻用于展示，可按需调整。
     */
    private static final DateTimeFormatter DISPLAY_DATE_TIME =
            DateTimeFormatter.ofPattern("yyyy年M月d日 HH:mm");
    private static final LocalTime DISPLAY_TIME = LocalTime.of(9, 0);

    /** 点击服务通知卡片后跳转的日子详情页；路径不存在会返回 41030。 */
    private static final String DETAIL_PAGE = "pages/event-detail/event-detail?id=";

    private final RestClient restClient;
    private final AppProperties properties;

    public WeChatSubscribeMessageClient(RestClient.Builder restClientBuilder, AppProperties properties) {
        // 显式把信任库绑到出网客户端上。
        // 只靠 -Djavax.net.ssl.trustStore 参数是不够确定的：容器里曾出现
        // "PKIX path building failed: unable to find valid certification path"，
        // 即调用微信接口时证书链无法被信任。这里直接构造 SSLContext 并交给 JDK HttpClient。
        this.restClient = restClientBuilder.requestFactory(httpsRequestFactory()).build();
        this.properties = properties;
    }

    private static ClientHttpRequestFactory httpsRequestFactory() {
        // 统一收在 TrustStoreSupport 里，新增微信接口客户端直接复用，别再各写一份
        return TrustStoreSupport.httpsRequestFactory(Duration.ofSeconds(10));
    }

    /**
     * 是否走微信云托管的「云调用」（容器内免鉴权调用微信开放接口）。
     * 判定：容器内存在云调用证书，或显式设置 WECHAT_CLOUD_CALL_ENABLED=true/false。
     * 云调用下不需要 access_token —— 鉴权由云托管的开放接口服务完成；
     * 反过来，如果接口没有配置在「云调用-微信令牌权限配置」里，开放接口服务会拦截并返回
     * 一个 "Copyright … WeChat CloudRun" 的纯文本页（这正是之前发送失败的原因）。
     */
    private static boolean cloudCallEnabled() {
        String flag = System.getenv("WECHAT_CLOUD_CALL_ENABLED");
        if (flag != null && !flag.isBlank()) {
            return "true".equalsIgnoreCase(flag.trim()) || "1".equals(flag.trim());
        }
        return TrustStoreSupport.cloudCallCertPresent();
    }

    public SendResult send(String openId, EventEntity event, LocalDate occurrence) {
        String templateId = properties.wechat().subscribeTemplateId();
        if (templateId == null || templateId.isBlank()) {
            return SendResult.needsAuthorization("未配置 WECHAT_SUBSCRIBE_TEMPLATE_ID");
        }

        boolean cloudCall = cloudCallEnabled();
        // 云调用免鉴权：不需要 access_token，也不要去调 cgi-bin/token。
        String accessToken = null;
        if (!cloudCall) {
            accessToken = properties.wechat().accessToken();
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
        }

        try {
            // thing：20 个字符以内；time：必须带时间部分；number：只能纯数字。
            Map<String, Map<String, String>> data = new LinkedHashMap<>();
            LocalTime displayTime = event.getReminderTime() == null ? DISPLAY_TIME : event.getReminderTime();
            data.put(properties.wechat().templateNameField(), Map.of("value", shorten(event.getName(), 20)));
            data.put(properties.wechat().templateDateField(),
                    Map.of("value", occurrence.atTime(displayTime).format(DISPLAY_DATE_TIME)));
            data.put(properties.wechat().templateDaysField(),
                    Map.of("value", String.valueOf(daysRemaining(occurrence))));
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("touser", openId);
            body.put("template_id", templateId);
            body.put("page", DETAIL_PAGE + event.getId());
            body.put("data", data);

            UriComponentsBuilder uri = UriComponentsBuilder.fromUriString(properties.wechat().subscribeMessageUrl());
            if (!cloudCall) {
                uri.queryParam("access_token", accessToken);
            }
            ResponseEntity<WechatMessageResponse> entity = restClient.post()
                    .uri(uri.build(true).toUriString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toEntity(WechatMessageResponse.class);

            String openApiSeqId = entity.getHeaders().getFirst(OPENAPI_SEQ_ID_HEADER);
            WechatMessageResponse response = entity.getBody();
            log.info("WECHAT_SUBSCRIBE_SEND cloudCall={} openApiSeqId={} errcode={}",
                    cloudCall, openApiSeqId, response == null ? null : response.errcode());

            if (response == null || response.errcode() == null) {
                return SendResult.failed("微信订阅消息响应缺少 errcode，未确认发送成功");
            }
            if (response.errcode() != 0) {
                // 43101 = 用户拒绝接收 / 可用的订阅次数已用完。
                // 这不是"发送失败"，而是"需要用户重新授权"：归类正确后，首页的
                // 「提醒还没开启」提示条会自动亮起，用户只要重新点一次「开启提醒」就能继续收到。
                if (response.errcode() == 43101) {
                    return SendResult.needsAuthorization("微信侧没有可用的订阅次数了（一次性订阅发一条消耗一次），"
                            + "到首页点「去开启」重新授权后即可继续收到提醒：" + response.errmsg());
                }
                String hint = cloudCall && openApiSeqId == null
                        ? "（响应头没有 x-openapi-seqid，说明本次没有走云调用链路）" : "";
                return SendResult.failed("微信订阅消息发送失败：" + response.errmsg() + hint);
            }
            return SendResult.sent();
        } catch (RestClientException exception) {
            String message = String.valueOf(exception.getMessage());
            if (message.contains("no suitable HttpMessageConverter")) {
                return SendResult.failed("微信接口返回了非 JSON 的纯文本响应，这是微信云托管「云调用」在拦截接口："
                        + "请到控制台「服务管理 → 云调用 → 微信令牌权限配置」中加入 cgi-bin/message/subscribe/send"
                        + "（建议同时加入 cgi-bin/token），打开「开放接口服务」开关，并重新构建版本使其生效。");
            }
            return SendResult.failed("微信订阅消息请求失败：" + message);
        }
    }

    /** number 类型只接受纯数字，负数会被判为不合法，这里统一兜底为 0。 */
    private long daysRemaining(LocalDate occurrence) {
        return Math.max(0L, ChronoUnit.DAYS.between(LocalDate.now(), occurrence));
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
