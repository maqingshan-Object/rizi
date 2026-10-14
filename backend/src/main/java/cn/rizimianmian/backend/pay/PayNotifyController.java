package cn.rizimianmian.backend.pay;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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

    @PostMapping(value = "/notify", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> notify(@RequestBody(required = false) String body) {
        try {
            service.handleDeliverNotify(body);
            return Map.of("errcode", 0, "errmsg", "ok");
        } catch (Exception exception) {
            // 返回非 0 会让微信稍后重推 —— 对"暂时性问题"正是我们想要的
            log.warn("VIRTUAL_PAY_NOTIFY_FAILED {}", exception.getMessage());
            return Map.of("errcode", 1, "errmsg", String.valueOf(exception.getMessage()));
        }
    }
}
