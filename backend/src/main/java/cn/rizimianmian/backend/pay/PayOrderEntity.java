package cn.rizimianmian.backend.pay;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * 一笔虚拟支付订单。
 *
 * <p>状态流转：{@code pending} →（微信回调或主动查单确认）→ {@code paid} → 发货置 {@code delivered=true}。
 * 发货必须幂等：同一个订单一而再地收到回调时，只能发一次货。
 */
@Entity
@Table(name = "pay_orders", indexes = {
        @Index(name = "idx_pay_orders_user", columnList = "user_id,created_at")
}, uniqueConstraints = {
        @jakarta.persistence.UniqueConstraint(name = "uk_pay_orders_out_trade_no", columnNames = {"out_trade_no"})
})
public class PayOrderEntity {

    /** 订单状态。 */
    public enum Status { pending, paid, failed }

    @Id
    @Column(length = 36, nullable = false, updatable = false)
    private String id;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(name = "product_id", length = 64, nullable = false)
    private String productId;

    /** 商户订单号：8–32 位，只含数字/字母/_-,微信侧唯一标识一笔交易。 */
    @Column(name = "out_trade_no", length = 32, nullable = false)
    private String outTradeNo;

    @Column(name = "price_cents", nullable = false)
    private int priceCents;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status;

    /** android / ios / dev —— 便于排查"iOS 走 Apple 支付"的差异。 */
    @Column(length = 16)
    private String platform;

    /** 是否已发货（发过权益）。回调幂等就靠它。 */
    @Column(nullable = false)
    private boolean delivered;

    @Column(name = "raw_notify", length = 2000)
    private String rawNotify;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PayOrderEntity() {
    }

    public PayOrderEntity(String userId, String productId, String outTradeNo, int priceCents, String platform) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.productId = productId;
        this.outTradeNo = outTradeNo;
        this.priceCents = priceCents;
        this.platform = platform;
        this.status = Status.pending;
        this.delivered = false;
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** 标记支付成功（回调或查单确认后调用）。返回是否从"未支付"变成了"已支付"。 */
    public boolean markPaid(String rawNotify) {
        boolean first = this.status != Status.paid;
        this.status = Status.paid;
        if (this.paidAt == null) {
            this.paidAt = Instant.now();
        }
        if (rawNotify != null) {
            this.rawNotify = rawNotify.length() > 2000 ? rawNotify.substring(0, 2000) : rawNotify;
        }
        this.updatedAt = Instant.now();
        return first;
    }

    public void markFailed(String rawNotify) {
        this.status = Status.failed;
        if (rawNotify != null) {
            this.rawNotify = rawNotify.length() > 2000 ? rawNotify.substring(0, 2000) : rawNotify;
        }
        this.updatedAt = Instant.now();
    }

    public void markDelivered() {
        this.delivered = true;
        this.updatedAt = Instant.now();
    }

    public String getId() { return id; }

    public String getUserId() { return userId; }

    public String getProductId() { return productId; }

    public String getOutTradeNo() { return outTradeNo; }

    public int getPriceCents() { return priceCents; }

    public Status getStatus() { return status; }

    public String getPlatform() { return platform; }

    public boolean isDelivered() { return delivered; }

    public Instant getCreatedAt() { return createdAt; }

    public Instant getPaidAt() { return paidAt; }
}
