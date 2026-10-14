package cn.rizimianmian.backend.capsules;

import java.util.List;

/** 时间胶囊的传输对象。 */
public final class CapsuleDtos {

    private CapsuleDtos() {
    }

    /**
     * 胶囊视图。
     *
     * <p>⚠️ {@code content} 只在**已启封**（或到启封日）时才有值；封存中一律为 null ——
     * 页面用 content 是否为空来判断"打码/展开"，服务端不给出正文，前端无法偷看。
     */
    public record CapsuleView(String id, String kind, String title, String status, String openOn,
                              long daysLeft, boolean openable, String recipientName, String content,
                              String createdAt, String publicToken) {
    }

    /**
     * 数量汇总：给「我的」页与首页提示条用。
     *
     * <p>额度是**通用**的（不区分自用/送人）：{@code quota} 是剩余个数，
     * {@code costSelf}/{@code costGift} 是两种用法各自的消耗（自己写 1、送人 2）。
     */
    public record CountsView(int sealed, int openable, int quota, int costSelf, int costGift) {
    }

    public record ListView(List<CapsuleView> capsules, CountsView counts) {
    }

    public record CreateRequest(String kind, String title, String content, String openOn, String recipientName) {
    }

    /** 领取卡（公开、免登录）：未到期时只给称呼与倒计时，不给正文。 */
    public record GiftView(String title, String senderName, String openOn, long daysLeft,
                           boolean openable, boolean claimed, String content) {
    }

    public record ClaimView(String capsuleId, boolean grantedGiftQuota, String message) {
    }
}
