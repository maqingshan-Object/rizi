package cn.rizimianmian.backend.pay;

import java.util.List;

/**
 * 商品目录（代码即配置）。
 *
 * <p>⚠️ {@code productId} 必须与微信公众平台「虚拟支付 → 道具管理」里配置的道具 ID
 * <b>完全一致</b>，并且价格（分）也要一致 —— 否则拉起收银台时会校验失败。
 * 新增商品时，这里和后台要同时加。
 */
public enum StoreProduct {
    THEME_SPRING("theme_spring", "春日野餐主题", "把春天留在首页", 199, 1,
            List.of(new Grant(EntitlementType.theme, "spring", 1))),
    THEME_AUTUMN("theme_autumn", "秋日信笺主题", "暖纸与枫红", 199, 1,
            List.of(new Grant(EntitlementType.theme, "autumn", 1))),
    THEME_CHERRY("theme_cherry", "樱桃手账主题", "柔雾樱粉", 199, 1,
            List.of(new Grant(EntitlementType.theme, "cherry", 1))),
    THEME_MINT("theme_mint", "薄荷极简主题", "清新留白", 199, 1,
            List.of(new Grant(EntitlementType.theme, "mint", 1))),
    THEME_BUNDLE("theme_bundle", "主题合集（四套）", "春日野餐 + 秋日信笺 + 樱桃手账 + 薄荷极简", 499, 1,
            List.of(new Grant(EntitlementType.theme, "spring", 1),
                    new Grant(EntitlementType.theme, "autumn", 1),
                    new Grant(EntitlementType.theme, "cherry", 1),
                    new Grant(EntitlementType.theme, "mint", 1))),
    CAPSULE_SINGLE("capsule_single", "时间胶囊 ×1", "写一段话，指定未来某天启封", 399, 1,
            List.of(new Grant(EntitlementType.capsule, "capsule", 1))),
    CAPSULE_TRIPLE("capsule_triple", "时间胶囊 ×3", "三个一起带走更划算", 999, 1,
            List.of(new Grant(EntitlementType.capsule, "capsule", 3))),
    SUPPORT_COFFEE("support_coffee", "请作者喝杯奶茶", "支持日子绵绵继续更新", 600, 1,
            List.of(new Grant(EntitlementType.support, "coffee", 1)));

    /** 买到之后发放什么权益。 */
    public record Grant(EntitlementType type, String itemKey, int quantity) {
    }

    private final String productId;
    private final String name;
    private final String description;
    private final int priceCents;
    private final int buyQuantity;
    private final List<Grant> grants;

    StoreProduct(String productId, String name, String description, int priceCents, int buyQuantity, List<Grant> grants) {
        this.productId = productId;
        this.name = name;
        this.description = description;
        this.priceCents = priceCents;
        this.buyQuantity = buyQuantity;
        this.grants = grants;
    }

    public static StoreProduct byProductId(String productId) {
        for (StoreProduct product : values()) {
            if (product.productId.equals(productId)) {
                return product;
            }
        }
        return null;
    }

    public String productId() { return productId; }

    public String productName() { return name; }

    public String description() { return description; }

    public int priceCents() { return priceCents; }

    public int buyQuantity() { return buyQuantity; }

    public List<Grant> grants() { return grants; }
}
