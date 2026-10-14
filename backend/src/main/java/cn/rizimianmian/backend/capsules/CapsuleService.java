package cn.rizimianmian.backend.capsules;

import cn.rizimianmian.backend.auth.UserRepository;
import cn.rizimianmian.backend.pay.EntitlementEntity;
import cn.rizimianmian.backend.pay.EntitlementRepository;
import cn.rizimianmian.backend.pay.EntitlementType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 时间胶囊。
 *
 * <p>四条不可动摇的规则（改代码前先读一遍）：
 * <ol>
 *   <li><b>封存中不下发正文</b>：列表/详情在未到启封日时 content 一律为 null；</li>
 *   <li><b>启封只看服务端日期</b>：openableOn(今天) 用服务端 LocalDate，客户端改时间无效；</li>
 *   <li><b>受赠额度只能送人</b>：领到的记在 {@code capsule_gift}，不能用于自用；</li>
 *   <li><b>受赠一生一次</b>：靠一行永不扣减的 welcome 标记判断，不能自己领自己的。</li>
 * </ol>
 */
@Service
public class CapsuleService {
    private static final Logger log = LoggerFactory.getLogger(CapsuleService.class);

    /** 新用户赠送：1 个自用 + 1 个送人。 */
    private static final String WELCOME_KEY = "welcome";
    private static final int FREE_SELF = 1;
    private static final int FREE_GIFT = 1;
    private static final int MAX_CONTENT = 500;

    private final CapsuleRepository capsules;
    private final EntitlementRepository entitlements;
    private final UserRepository users;

    public CapsuleService(CapsuleRepository capsules, EntitlementRepository entitlements, UserRepository users) {
        this.capsules = capsules;
        this.entitlements = entitlements;
        this.users = users;
    }

    // ---------- 额度 ----------

    /** 发一次欢迎额度（1 自用 + 1 送人）。用 welcome 标记保证"一生一次"。 */
    @Transactional
    public void ensureWelcomeQuota(String userId) {
        if (entitlements.findByUserIdAndItemTypeAndItemKey(userId, EntitlementType.support, WELCOME_KEY).isPresent()) {
            return;
        }
        // 标记行（不参与扣减，只表示"已经发过欢迎额度"）
        entitlements.save(new EntitlementEntity(userId, EntitlementType.support, WELCOME_KEY, null));
        grant(userId, EntitlementType.capsule, FREE_SELF);
        grant(userId, EntitlementType.capsule_gift, FREE_GIFT);
        log.info("CAPSULE_WELCOME_GRANTED user={} self={} gift={}", userId, FREE_SELF, FREE_GIFT);
    }

    private void grant(String userId, EntitlementType type, int quantity) {
        EntitlementEntity entity = entitlements
                .findByUserIdAndItemTypeAndItemKey(userId, type, "capsule")
                .orElse(null);
        if (entity == null) {
            entitlements.save(new EntitlementEntity(userId, type, "capsule", null, quantity));
        } else {
            entity.increase(quantity);
            entitlements.save(entity);
        }
    }

    private int quotaOf(String userId, EntitlementType type) {
        return entitlements.findByUserIdAndItemTypeAndItemKey(userId, type, "capsule")
                .map(EntitlementEntity::getQuantity).orElse(0);
    }

    private void consume(String userId, EntitlementType type) {
        EntitlementEntity entity = entitlements.findByUserIdAndItemTypeAndItemKey(userId, type, "capsule")
                .orElseThrow(() -> new IllegalArgumentException(
                        type == EntitlementType.capsule ? "还没有自用胶囊额度，去商店看看" : "还没有可以送出的心意，去商店看看"));
        if (entity.getQuantity() <= 0) {
            throw new IllegalArgumentException(
                    type == EntitlementType.capsule ? "自用胶囊额度用完了，可以再买一个" : "这份心意已经送出去了，可以再买一份");
        }
        entity.increase(-1);
        entitlements.save(entity);
    }

    // ---------- 写 ----------

    @Transactional
    public CapsuleDtos.CapsuleView create(String userId, CapsuleDtos.CreateRequest request, LocalDate today) {
        ensureWelcomeQuota(userId);
        CapsuleEntity.Kind kind = "gift".equalsIgnoreCase(request == null ? null : request.kind())
                ? CapsuleEntity.Kind.gift : CapsuleEntity.Kind.self;
        String content = request == null || request.content() == null ? "" : request.content().trim();
        if (content.isEmpty()) {
            throw new IllegalArgumentException("还没写内容呢");
        }
        if (content.length() > MAX_CONTENT) {
            throw new IllegalArgumentException("内容最多 " + MAX_CONTENT + " 字，现在有 " + content.length() + " 字");
        }
        LocalDate openOn = parseDate(request.openOn());
        if (!openOn.isAfter(today)) {
            throw new IllegalArgumentException("启封日要在明天以后 —— 时间胶囊的意义就是等一等");
        }
        String recipient = request.recipientName() == null ? "" : request.recipientName().trim();
        if (kind == CapsuleEntity.Kind.gift && recipient.isEmpty()) {
            throw new IllegalArgumentException("送给别人时，写一下对方的称呼吧");
        }
        consume(userId, kind == CapsuleEntity.Kind.gift ? EntitlementType.capsule_gift : EntitlementType.capsule);
        CapsuleEntity capsule = new CapsuleEntity(userId, kind, trim(request.title(), 120), content, openOn,
                recipient.isEmpty() ? null : trim(recipient, 60), null);
        capsules.save(capsule);
        log.info("CAPSULE_CREATED user={} kind={} openOn={}", userId, kind, openOn);
        return view(capsule, today, true);
    }

    // ---------- 读 ----------

    @Transactional
    public CapsuleDtos.ListView list(String userId, LocalDate today) {
        ensureWelcomeQuota(userId);
        List<CapsuleEntity> all = capsules.findByUserIdOrderByOpenOnAsc(userId);
        List<CapsuleDtos.CapsuleView> views = all.stream().map(item -> view(item, today, false)).toList();
        return new CapsuleDtos.ListView(views, counts(userId, all, today));
    }

    private CapsuleDtos.CountsView counts(String userId, List<CapsuleEntity> all, LocalDate today) {
        int sealed = 0;
        int openable = 0;
        for (CapsuleEntity item : all) {
            if (item.getStatus() == CapsuleEntity.Status.opened) {
                continue;
            }
            if (item.openableOn(today)) {
                openable++;
            } else {
                sealed++;
            }
        }
        return new CapsuleDtos.CountsView(sealed, openable, quotaOf(userId, EntitlementType.capsule),
                quotaOf(userId, EntitlementType.capsule_gift));
    }

    @Transactional
    public CapsuleDtos.CapsuleView detail(String userId, String id, LocalDate today) {
        CapsuleEntity capsule = capsules.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("没有找到这个胶囊"));
        return view(capsule, today, false);
    }

    @Transactional
    public CapsuleDtos.CapsuleView open(String userId, String id, LocalDate today) {
        CapsuleEntity capsule = capsules.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("没有找到这个胶囊"));
        if (!capsule.openableOn(today)) {
            long left = Math.max(1, ChronoUnit.DAYS.between(today, capsule.getOpenOn()));
            throw new IllegalArgumentException("还没到启封日，还有 " + left + " 天");
        }
        capsule.markOpened();
        capsules.save(capsule);
        log.info("CAPSULE_OPENED user={} id={}", userId, id);
        return view(capsule, today, true);
    }

    @Transactional
    public void delete(String userId, String id) {
        CapsuleEntity capsule = capsules.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("没有找到这个胶囊"));
        capsules.delete(capsule);
        log.info("CAPSULE_DELETED user={} id={}", userId, id);
    }

    // ---------- 送人：领取 ----------

    /** 公开读领取卡（免登录）。未到启封日只给称呼与倒计时。 */
    @Transactional
    public CapsuleDtos.GiftView giftView(String token, LocalDate today) {
        CapsuleEntity capsule = capsules.findByPublicToken(token)
                .orElseThrow(() -> new IllegalArgumentException("这个领取卡已经失效了"));
        boolean openable = capsule.openableOn(today) || capsule.getStatus() == CapsuleEntity.Status.opened;
        String sender = users.findById(capsule.getUserId())
                .map(user -> user.getNickname() == null || user.getNickname().isBlank() ? "有人" : user.getNickname())
                .orElse("有人");
        long daysLeft = Math.max(0, ChronoUnit.DAYS.between(today, capsule.getOpenOn()));
        String title = capsule.getTitle() == null || capsule.getTitle().isBlank()
                ? (capsule.getRecipientName() == null ? "给你留了一段话" : "给" + capsule.getRecipientName() + "留了一段话")
                : capsule.getTitle();
        // 只有到启封日（或已启封）才给正文
        return new CapsuleDtos.GiftView(title, sender, capsule.getOpenOn().toString(), daysLeft, openable,
                capsule.getStatus() == CapsuleEntity.Status.opened, openable ? capsule.getContent() : null);
    }

    /**
     * 收下这份心意：加入自己的列表，并在**打开这一刻**发放一个"可传递的送人额度"。
     *
     * <p>门闩：受赠一生一次（占位判断）+ 不能领自己的 + 受赠额度只能送人。
     */
    @Transactional
    public CapsuleDtos.ClaimView claim(String userId, String token, LocalDate today) {
        CapsuleEntity gift = capsules.findByPublicToken(token)
                .orElseThrow(() -> new IllegalArgumentException("这个领取卡已经失效了"));
        if (gift.getUserId().equals(userId)) {
            throw new IllegalArgumentException("这是你自己送出的心意");
        }
        // 记下接收方：到期提醒要发给他
        if (gift.markClaimed(userId)) {
            capsules.save(gift);
        }
        boolean firstTime = entitlements
                .findByUserIdAndItemTypeAndItemKey(userId, EntitlementType.support, "gift_received").isEmpty();
        boolean granted = false;
        if (firstTime) {
            entitlements.save(new EntitlementEntity(userId, EntitlementType.support, "gift_received", null));
            grant(userId, EntitlementType.capsule_gift, 1);
            granted = true;
            log.info("CAPSULE_TRANSFER_GRANTED user={} from={}", userId, gift.getId());
        }
        return new CapsuleDtos.ClaimView(gift.getId(), granted,
                granted ? "你也有一份心意可以送出去了" : "已经收下，可以在「时间胶囊」里查看");
    }

    // ---------- 工具 ----------

    private CapsuleDtos.CapsuleView view(CapsuleEntity capsule, LocalDate today, boolean revealNow) {
        boolean openable = capsule.openableOn(today);
        boolean revealed = revealNow || capsule.getStatus() == CapsuleEntity.Status.opened || openable;
        long daysLeft = Math.max(0, ChronoUnit.DAYS.between(today, capsule.getOpenOn()));
        return new CapsuleDtos.CapsuleView(capsule.getId(), capsule.getKind().name(),
                capsule.getTitle() == null ? "" : capsule.getTitle(), capsule.getStatus().name(),
                capsule.getOpenOn().toString(), daysLeft, openable, capsule.getRecipientName(),
                revealed ? capsule.getContent() : null,
                capsule.getCreatedAt() == null ? "" : capsule.getCreatedAt().toString(),
                // 领取码只回给属主自己 —— 他要用它把卡片发出去
                capsule.getPublicToken());
    }

    private LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value == null ? "" : value.trim());
        } catch (Exception exception) {
            throw new IllegalArgumentException("启封日期格式不对，应该像 2027-02-04 这样");
        }
    }

    private String trim(String value, int max) {
        String text = value == null ? "" : value.trim();
        return text.length() > max ? text.substring(0, max) : text;
    }
}
