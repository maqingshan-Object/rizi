package cn.rizimianmian.backend.pay;

import java.util.List;

/** 虚拟支付相关的传输对象。 */
public final class PayDtos {

    private PayDtos() {
    }

    /** 商品列表项。owned 用于前端直接显示"已拥有"。 */
    public record ProductView(String productId, String name, String description, int priceCents, boolean owned) {
    }

    /** 下单请求：code 是前端 wx.login 拿到的临时凭证，用来换 session_key。 */
    public record OrderRequest(String productId, String code, String platform) {
    }

    /**
     * 下单结果。signData / paySig / signature 三者一起交给
     * {@code wx.requestVirtualPayment}。**前端必须原样传 signData，不能再 JSON.stringify 一次。**
     */
    public record OrderView(String outTradeNo, String productId, String signData, String paySig, String signature,
                            String mode, int priceCents, String status, boolean configured, String message) {
    }

    public record EntitlementView(String itemType, String itemKey, int quantity) {
    }

    /** 我的权益汇总：已购主题 + 胶囊余额，前端一次拿全。 */
    public record MyStoreView(List<ProductView> products, List<EntitlementView> entitlements, boolean configured) {
    }
}
