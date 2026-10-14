package cn.rizimianmian.backend.pay;

import cn.rizimianmian.backend.auth.WechatSessionClient;
import cn.rizimianmian.backend.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * 虚拟支付：商品、下单签名、发货、权益查询。
 *
 * <p>⚠️ 三条来自官方/实战的硬规则，改动前先看一眼：
 * <ol>
 *   <li>前端 {@code success} 只算"弱确认"，**最终以后端订单状态为准**（前端下单成功后要来查单）；</li>
 *   <li>发货必须**幂等** —— 回调可能重复到达，同一个订单只能发一次货；</li>
 *   <li>AppKey 与 session_key **只能留在服务端**，任何情况下都不下发给前端。</li>
 * </ol>
 */
@Service
public class StoreService {
    private static final Logger log = LoggerFactory.getLogger(StoreService.class);

    /** wx.requestVirtualPayment 的道具直购模式。 */
    private static final String MODE_GOODS = "short_series_goods";

    private final PayOrderRepository orders;
    private final EntitlementRepository entitlements;
    private final WechatSessionClient sessions;
    private final AppProperties properties;
    private final ObjectMapper objectMapper;

    public StoreService(PayOrderRepository orders, EntitlementRepository entitlements,
                        WechatSessionClient sessions, AppProperties properties, ObjectMapper objectMapper) {
        this.orders = orders;
        this.entitlements = entitlements;
        this.sessions = sessions;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    private AppProperties.VirtualPay pay() {
        AppProperties.VirtualPay config = properties.virtualPay();
        return config == null ? new AppProperties.VirtualPay(null, null, null, 0, null) : config;
    }

    public boolean configured() {
        return pay().configured();
    }

    /** 商品列表（带"是否已拥有"，前端可直接打上"已拥有"标记）。 */
    @Transactional(readOnly = true)
    public List<PayDtos.ProductView> products(String userId) {
        List<EntitlementEntity> owned = userId == null ? List.of() : entitlements.findByUserIdOrderByCreatedAtAsc(userId);
        List<PayDtos.ProductView> views = new ArrayList<>();
        for (StoreProduct product : StoreProduct.values()) {
            views.add(new PayDtos.ProductView(product.productId(), product.productName(),
                    product.description(), product.priceCents(), isOwned(product, owned)));
        }
        return views;
    }

    private boolean isOwned(StoreProduct product, List<EntitlementEntity> owned) {
        if (product.grants().isEmpty()) {
            return false;
        }
        // 只要有一项权益还没拿到，就算"未拥有"（合集要两套都到手才算拥有）
        for (StoreProduct.Grant grant : product.grants()) {
            if (grant.type() != EntitlementType.theme) {
                return false;
            }
            boolean found = owned.stream().anyMatch(item -> item.getItemType() == EntitlementType.theme
                    && item.getItemKey().equals(grant.itemKey()) && item.getQuantity() > 0);
            if (!found) {
                return false;
            }
        }
        return true;
    }

    @Transactional(readOnly = true)
    public List<PayDtos.EntitlementView> entitlements(String userId) {
        return entitlements.findByUserIdOrderByCreatedAtAsc(userId).stream()
                .map(item -> new PayDtos.EntitlementView(item.getItemType().name(), item.getItemKey(), item.getQuantity()))
                .toList();
    }

    /**
     * 建单并算出两个签名。
     *
     * <p>用前端传来的临时 code 现场换 session_key，**不落库** —— 少存一份敏感数据，
     * 也避免 session_key 过期导致的签名失败。
     */
    @Transactional
    public PayDtos.OrderView createOrder(String userId, PayDtos.OrderRequest request) {
        StoreProduct product = StoreProduct.byProductId(request == null ? null : request.productId());
        if (product == null) {
            throw new IllegalArgumentException("没有找到这个商品");
        }
        if (!configured()) {
            // 后台还没填 OfferID / AppKey：不报错，明确告诉前端"支付未配置"，避免用户看到技术错误
            return new PayDtos.OrderView(null, product.productId(), null, null, null, MODE_GOODS,
                    product.priceCents(), "unconfigured", false, "支付还没配置好，等配置完成后就能购买");
        }
        String code = request.code() == null ? "" : request.code().trim();
        if (code.isEmpty()) {
            throw new IllegalArgumentException("登录状态已失效，请重新进入小程序再试");
        }
        WechatSessionClient.WechatSession session = sessions.exchangeCode(code);
        String sessionKey = session.session_key();
        if (sessionKey == null || sessionKey.isBlank()) {
            throw new IllegalArgumentException("没能拿到支付所需的会话信息，请重试");
        }

        String outTradeNo = newOutTradeNo();
        PayOrderEntity order = new PayOrderEntity(userId, product.productId(), outTradeNo,
                product.priceCents(), normalizePlatform(request.platform()));
        orders.save(order);

        String signData = buildSignData(product, outTradeNo);
        String appKey = pay().activeAppKey();
        String paySig = VirtualPaySigner.paySig(appKey, signData);
        String signature = VirtualPaySigner.signature(sessionKey, signData);
        log.info("VIRTUAL_PAY_ORDER user={} product={} outTradeNo={} price={} env={}",
                userId, product.productId(), outTradeNo, product.priceCents(), pay().resolvedEnv());
        return new PayDtos.OrderView(outTradeNo, product.productId(), signData, paySig, signature, MODE_GOODS,
                product.priceCents(), order.getStatus().name(), true, null);
    }

    /**
     * 用固定字段顺序拼 signData —— 必须与签名时**完全一致**的字符串传给前端，
     * 前端原样转交微信。改变字段顺序或再序列化一次都会导致验签失败。
     */
    private String buildSignData(StoreProduct product, String outTradeNo) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("offerId", pay().offerId());
        data.put("buyQuantity", product.buyQuantity());
        data.put("env", pay().resolvedEnv());
        data.put("currencyType", "CNY");
        data.put("productId", product.productId());
        data.put("goodsPrice", product.priceCents());
        data.put("outTradeNo", outTradeNo);
        data.put("attach", "");
        try {
            return objectMapper.writeValueAsString(data);
        } catch (Exception exception) {
            throw new IllegalStateException("组装支付参数失败：" + exception.getMessage(), exception);
        }
    }

    /** 8–32 位、只含数字字母与 _- ，微信对这个格式有硬要求。 */
    private String newOutTradeNo() {
        String body = UUID.randomUUID().toString().replace("-", "");
        return "R" + Instant.now().toEpochMilli() + "_" + body.substring(0, 8);
    }

    private String normalizePlatform(String platform) {
        if (platform == null) {
            return null;
        }
        String value = platform.trim().toLowerCase();
        return value.length() > 16 ? value.substring(0, 16) : value;
    }

    /** 前端支付返回后调它确认状态（弱确认 → 后端为准）。 */
    @Transactional
    public PayDtos.OrderView orderStatus(String userId, String outTradeNo) {
        PayOrderEntity order = orders.findByOutTradeNo(outTradeNo)
                .filter(item -> item.getUserId().equals(userId))
                .orElseThrow(() -> new IllegalArgumentException("没有找到这笔订单"));
        return new PayDtos.OrderView(order.getOutTradeNo(), order.getProductId(), null, null, null, MODE_GOODS,
                order.getPriceCents(), order.getStatus().name(), configured(), null);
    }

    /**
     * 处理发货回调（xpay_goods_deliver_notify）。
     *
     * <p>幂等：同一个订单重复到达时只发货一次；订单已发货则直接返回。
     */
    @Transactional
    public void handleDeliverNotify(String body) {
        if (!configured()) {
            throw new IllegalStateException("虚拟支付未配置，忽略回调");
        }
        String outTradeNo = extractOutTradeNo(body);
        if (outTradeNo == null || outTradeNo.isBlank()) {
            throw new IllegalArgumentException("回调里没有订单号");
        }
        Optional<PayOrderEntity> found = orders.findByOutTradeNo(outTradeNo);
        if (found.isEmpty()) {
            log.warn("VIRTUAL_PAY_NOTIFY unknown outTradeNo={}", outTradeNo);
            return;
        }
        PayOrderEntity order = found.get();
        boolean firstPaid = order.markPaid(body);
        if (firstPaid) {
            log.info("VIRTUAL_PAY_PAID user={} product={} outTradeNo={}", order.getUserId(), order.getProductId(), outTradeNo);
        }
        deliver(order);
    }

    /** 发货（幂等）。 */
    private void deliver(PayOrderEntity order) {
        if (order.isDelivered()) {
            orders.save(order);
            return;
        }
        StoreProduct product = StoreProduct.byProductId(order.getProductId());
        if (product != null) {
            for (StoreProduct.Grant grant : product.grants()) {
                Optional<EntitlementEntity> existing = entitlements
                        .findByUserIdAndItemTypeAndItemKey(order.getUserId(), grant.type(), grant.itemKey());
                if (existing.isPresent()) {
                    EntitlementEntity entity = existing.get();
                    entity.increase(grant.quantity());
                    entitlements.save(entity);
                } else {
                    entitlements.save(new EntitlementEntity(order.getUserId(), grant.type(), grant.itemKey(),
                            order.getId(), grant.quantity()));
                }
            }
        }
        order.markDelivered();
        orders.save(order);
        log.info("VIRTUAL_PAY_DELIVERED orderId={} product={}", order.getId(), order.getProductId());
    }

    /** 回调体里订单号的字段名可能是 OutTradeNo / out_trade_no，都兜一下。 */
    private String extractOutTradeNo(String body) {
        if (body == null) {
            return null;
        }
        for (String key : List.of("\"OutTradeNo\"", "\"outTradeNo\"", "\"out_trade_no\"")) {
            int index = body.indexOf(key);
            if (index < 0) {
                continue;
            }
            int colon = body.indexOf(':', index + key.length());
            if (colon < 0) {
                continue;
            }
            int start = body.indexOf('"', colon + 1);
            int end = start < 0 ? -1 : body.indexOf('"', start + 1);
            if (start >= 0 && end > start) {
                return body.substring(start + 1, end);
            }
        }
        return null;
    }
}
