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
 * 用户已经拿到手的权益。
 *
 * <p>同一个用户 + 同一种权益只保留一行，重复购买时 {@code quantity} 累加 ——
 * 这样"时间胶囊买 3 个"就是一个数字，不用存三行。
 */
@Entity
@Table(name = "user_entitlements", indexes = {
        @Index(name = "idx_user_entitlements_user", columnList = "user_id")
}, uniqueConstraints = {
        @jakarta.persistence.UniqueConstraint(name = "uk_user_entitlement",
                columnNames = {"user_id", "item_type", "item_key"})
})
public class EntitlementEntity {

    @Id
    @Column(length = 36, nullable = false, updatable = false)
    private String id;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false, length = 32)
    private EntitlementType itemType;

    /** 具体是哪一项：主题用主题 id（spring / autumn），胶囊用 capsule。 */
    @Column(name = "item_key", length = 64, nullable = false)
    private String itemKey;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "order_id", length = 36)
    private String orderId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected EntitlementEntity() {
    }

    public EntitlementEntity(String userId, EntitlementType itemType, String itemKey, String orderId) {
        this(userId, itemType, itemKey, orderId, 1);
    }

    public EntitlementEntity(String userId, EntitlementType itemType, String itemKey, String orderId, int quantity) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.itemType = itemType;
        this.itemKey = itemKey;
        this.quantity = Math.max(1, quantity);
        this.orderId = orderId;
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void increase(int delta) {
        this.quantity += delta;
        this.updatedAt = Instant.now();
    }

    public String getId() { return id; }

    public String getUserId() { return userId; }

    public EntitlementType getItemType() { return itemType; }

    public String getItemKey() { return itemKey; }

    public int getQuantity() { return quantity; }

    public String getOrderId() { return orderId; }
}
