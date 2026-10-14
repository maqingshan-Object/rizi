package cn.rizimianmian.backend.capsules;

import cn.rizimianmian.backend.auth.UserEntity;
import cn.rizimianmian.backend.auth.UserRepository;
import cn.rizimianmian.backend.reminders.WeChatSubscribeMessageClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

/**
 * 时间胶囊到期提醒：**发送方与接收方都要通知**。
 *
 * <p>每天扫一次「今天到期且仍未启封」的胶囊：
 * <ul>
 *   <li>给发送方：「你写给 XX 的胶囊今天可以打开了」</li>
 *   <li>给接收方（如果她收下过）：「XX 写给你的话今天可以打开了」</li>
 * </ul>
 *
 * <p>⚠️ 一次性订阅的规则：1 次授权只能发 1 条。授权在**封存/收下那一刻**申请
 * （那时意愿最高），所以这里只负责"该发的时候发"，没有次数时会返回 NEEDS_AUTHORIZATION
 * 并被记进日志，不会反复重试刷爆日志。
 * <p>查询按 open_on = 今天，天然做到"一天最多发一次"，重复部署也不会多发。
 */
@Component
public class CapsuleReminderScheduler {
    private static final Logger log = LoggerFactory.getLogger(CapsuleReminderScheduler.class);
    /** 点通知后落到哪一页：胶囊列表（登录后就能看到可启封的那张卡）。 */
    private static final String LIST_PAGE = "pages/capsules/capsules";

    private final CapsuleRepository capsules;
    private final UserRepository users;
    private final WeChatSubscribeMessageClient messages;

    public CapsuleReminderScheduler(CapsuleRepository capsules, UserRepository users,
                                    WeChatSubscribeMessageClient messages) {
        this.capsules = capsules;
        this.users = users;
        this.messages = messages;
    }

    @Scheduled(cron = "${app.capsule.reminder-cron:0 0 9 * * *}")
    public void scan() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        List<CapsuleEntity> due = capsules.findByOpenOnAndStatus(today, CapsuleEntity.Status.sealed);
        if (due.isEmpty()) {
            return;
        }
        log.info("CAPSULE_REMINDER_SCAN date={} count={}", today, due.size());
        for (CapsuleEntity capsule : due) {
            boolean gift = capsule.getKind() == CapsuleEntity.Kind.gift;
            String title = capsule.getTitle() == null || capsule.getTitle().isBlank()
                    ? (gift ? "一段封存的话" : "写给未来的一段话") : capsule.getTitle();
            // ① 发送方
            String ownerName = gift ? "你送给" + safe(capsule.getRecipientName()) + "的「" + title + "」"
                    : "你写给未来的「" + title + "」";
            notifyUser(capsule.getUserId(), ownerName, capsule.getOpenOn(), "发送方");
            // ② 接收方（收下过才发）
            if (capsule.getClaimedBy() != null && !capsule.getClaimedBy().equals(capsule.getUserId())) {
                notifyUser(capsule.getClaimedBy(), "有人给你留的「" + title + "」", capsule.getOpenOn(), "接收方");
            }
        }
    }

    private void notifyUser(String userId, String name, LocalDate openOn, String role) {
        Optional<UserEntity> user = users.findById(userId);
        if (user.isEmpty() || user.get().getOpenId() == null || user.get().getOpenId().isBlank()) {
            log.warn("CAPSULE_REMINDER_NO_OPENID user={} role={}", userId, role);
            return;
        }
        WeChatSubscribeMessageClient.SendResult result =
                messages.sendCapsule(user.get().getOpenId(), name, openOn, LIST_PAGE);
        log.info("CAPSULE_REMINDER_SENT user={} role={} status={} message={}",
                userId, role, result.status(), result.message());
    }

    private String safe(String value) {
        return value == null || value.isBlank() ? "对方" : value;
    }
}
