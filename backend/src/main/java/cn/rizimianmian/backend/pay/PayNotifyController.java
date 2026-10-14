package cn.rizimianmian.backend.pay;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 虚拟支付发货回调。
 *
 * <p>⚠️ 这个地址要在公众平台「虚拟支付 → 道具管理 → 发货推送配置」里填上，
 * <b>不填的话支付成功了这里也收不到任何请求</b>（订单会一直停在待支付）。
 *
 * <p>本接口不参与 JWT 鉴权（微信服务器调用时没带我们的登录态），
 * 已在 SecurityConfig 里显式放行；安全性靠"订单号无法猜到 + 幂等发货"保证。
 */
@RestController
@RequestMapping("/api/pay")
public class PayNotifyController {
    private static final Logger log = LoggerFactory.getLogger(PayNotifyController.class);

    private final StoreService service;

    public PayNotifyController(StoreService service) {
        this.service = service;
    }

    /**
     * 微信保存推送地址时会先 GET 这个地址做校验：签名对得上就**原样回显 echostr**。
     * 这一步不通过，后台点保存会提示「Token 校验失败」。
     */
    @GetMapping(value = "/notify", produces = MediaType.TEXT_PLAIN_VALUE)
    public String verify(@RequestParam(required = false) String signature,
                         @RequestParam(required = false) String timestamp,
                         @RequestParam(required = false) String nonce,
                         @RequestParam(required = false) String echostr) {
        if (service.verifyNotifyToken(signature, timestamp, nonce)) {
            log.info("VIRTUAL_PAY_NOTIFY_VERIFY ok");
            return echostr == null ? "" : echostr;
        }
        log.warn("VIRTUAL_PAY_NOTIFY_VERIFY_FAILED signature={} timestamp={} nonce={}", signature, timestamp, nonce);
        return "invalid";
    }

    @PostMapping("/notify")
    public Object notify(@RequestBody(required = false) String body,
                         @RequestParam(required = false) String signature,
                         @RequestParam(required = false) String timestamp,
                         @RequestParam(required = false) String nonce,
                         @RequestHeader(value = "x-wx-source", required = false) String wxSource) {
        // ① 云托管「消息推送」配置时的路径检测：请求体是 {"action":"CheckContainerPath"}，
        //    官方要求回复 success（或空），且 HTTP 状态必须是 200，否则配置检查失败。
        if (body != null && body.contains("CheckContainerPath")) {
            log.info("VIRTUAL_PAY_NOTIFY_CHECK ok");
            return "success";
        }
        // ② 来源判断：云托管开了公网访问时，带 x-wx-source 头的才是微信侧推来的。
        //    这里先记录不强拦（订单号本身不可猜是主要防线），等看到真实推送再决定是否收紧。
        if (wxSource == null || wxSource.isBlank()) {
            log.warn("VIRTUAL_PAY_NOTIFY_NO_SOURCE_HEADER");
        }
        // ③ 带了签名参数就严格验签
        if (signature != null && !signature.isBlank() && !service.verifyNotifyToken(signature, timestamp, nonce)) {
            log.warn("VIRTUAL_PAY_NOTIFY_BAD_SIGNATURE");
            return Map.of("ErrCode", -1, "ErrMsg", "invalid signature");
        }
        try {
            service.handleDeliverNotify(body);
            // ⚠️ 字段名必须是 ErrCode / ErrMsg（官方应答格式）。
            // 写成 errcode/errmsg 会被判为"处理失败"，微信会一直重推同一条回调。
            return Map.of("ErrCode", 0, "ErrMsg", "success");
        } catch (Exception exception) {
            // 返回非 0 会让微信稍后重推 —— 对"暂时性问题"正是我们想要的
            log.warn("VIRTUAL_PAY_NOTIFY_FAILED {}", exception.getMessage());
            return Map.of("ErrCode", -1, "ErrMsg", String.valueOf(exception.getMessage()));
        }
    }
}
