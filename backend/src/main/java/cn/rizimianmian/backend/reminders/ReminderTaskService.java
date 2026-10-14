package cn.rizimianmian.backend.reminders;

import cn.rizimianmian.backend.auth.UserEntity;
import cn.rizimianmian.backend.auth.UserRepository;
import cn.rizimianmian.backend.events.EventEntity;
import cn.rizimianmian.backend.events.EventRepository;
import cn.rizimianmian.backend.events.EventOccurrenceCalculator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ReminderTaskService {
    private static final Logger log = LoggerFactory.getLogger(ReminderTaskService.class);

    /** 同一进程内每个任务的重试上限，防止永久性失败每分钟刷接口/刷日志。容器重启即清零。 */
    private static final int MAX_ATTEMPTS_PER_RUN = 3;

    private final Map<String, Integer> attempts = new ConcurrentHashMap<>();

    private final ReminderTaskRepository tasks;
    private final EventRepository events;
    private final UserRepository users;
    private final WeChatSubscribeMessageClient wechat;
    private final EventOccurrenceCalculator occurrences;
    private final Clock clock;

    /** 同时存在测试用构造函数，必须显式标注让 Spring 选用这一个。 */
    @Autowired
    public ReminderTaskService(ReminderTaskRepository tasks, EventRepository events, UserRepository users,
                               WeChatSubscribeMessageClient wechat, EventOccurrenceCalculator occurrences) {
        this(tasks, events, users, wechat, occurrences, Clock.systemDefaultZone());
    }

    ReminderTaskService(ReminderTaskRepository tasks, EventRepository events, UserRepository users,
                        WeChatSubscribeMessageClient wechat, EventOccurrenceCalculator occurrences, Clock clock) {
        this.tasks = tasks;
        this.events = events;
        this.users = users;
        this.wechat = wechat;
        this.occurrences = occurrences;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ReminderDtos.ReminderView> list(String userId) {
        return tasks.findByUserIdOrderByOccurrenceAscCreatedAtAsc(userId).stream()
                .map(ReminderDtos.ReminderView::from).toList();
    }

    @Transactional
    public ReminderTaskEntity ensurePending(String userId, String eventId, LocalDate occurrence, int daysBefore) {
        return tasks.findByEventIdAndOccurrenceAndDaysBefore(eventId, occurrence, daysBefore)
                .orElseGet(() -> tasks.save(new ReminderTaskEntity(userId, eventId, occurrence, daysBefore)));
    }

    @Transactional
    public void replaceForEvent(String userId, EventEntity event) {
        cancelForEvent(userId, event.getId());
        if (!event.isReminderEnabled() || event.getMode() == null || !"countdown".equals(event.getMode())) return;
        LocalDate occurrence = occurrences.nextOccurrence(event, LocalDate.now(clock));
        if (occurrence != null) ensurePending(userId, event.getId(), occurrence, event.getReminderDaysBefore());
    }

    @Transactional
    public List<ReminderDtos.ReminderView> authorize(String userId, ReminderDtos.TaskIdsRequest request) {
        List<ReminderDtos.ReminderView> authorized = markAuthorized(userId, request,
                List.of(ReminderStatus.needs_authorization, ReminderStatus.pending));
        // 这条日志用来证明"用户点了授权，且请求真的到了后端"。
        log.info("REMINDER_AUTHORIZE user={} tasks={}", userId, authorized.size());
        return authorized;
    }

    /**
     * 派发今天到期的任务，返回**发送成功**的任务 id（供 {@link #preScheduleNextOccurrences} 预建下一次）。
     */
    @Transactional
    public List<String> dispatchDueTasks(LocalDate today) {
        int due = 0;
        List<String> sentTaskIds = new ArrayList<>();
        // 除 pending 外，一并捞「已授权但被打回 needs_authorization / failed」的任务。
        // 原因：像"未配置 WECHAT_SUBSCRIBE_TEMPLATE_ID"、"访问微信接口证书校验失败"这类
        // **服务端自身问题**也会把任务打回 needs_authorization 或 failed。如果只捞 pending，
        // 配置修好之后这些任务就永远躺在库里，用户明明授权过却还要重新点一次。
        for (ReminderTaskEntity task : tasks.findByStatusInAndAuthorizedTrue(
                List.of(ReminderStatus.pending, ReminderStatus.needs_authorization, ReminderStatus.failed))) {
            if (!task.isDue(today)) {
                continue;
            }
            // 同一进程内对同一任务最多重试 3 次：失败若是永久性的（如模板字段错配），
            // 不至于每分钟刷接口、刷日志；容器重启即清零，修好配置后自然会再试。
            int tried = attempts.getOrDefault(task.getId(), 0);
            if (tried >= MAX_ATTEMPTS_PER_RUN) {
                continue;
            }
            attempts.put(task.getId(), tried + 1);
            due++;
            ReminderTaskEntity attempted = attempt(task, task.getUserId());
            if (attempted.getStatus() == ReminderStatus.sent) {
                sentTaskIds.add(attempted.getId());
            }
            // 每个命中任务都留一行结果：SENT / FAILED / NEEDS_AUTHORIZATION，失败时带原因。
            log.info("REMINDER_DISPATCH taskId={} eventId={} occurrence={} attempt={} result={} error={}",
                    attempted.getId(), attempted.getEventId(), attempted.getOccurrence(),
                    tried + 1, attempted.getStatus(), attempted.getLastError());
        }
        if (due > 0) {
            log.info("REMINDER_DISPATCH_DONE date={} due={}", today, due);
        }
        return sentTaskIds;
    }

    /**
     * 发送成功后立刻为「下一次发生日」预建任务（状态 pending、authorized=false）。
     *
     * <p>为什么必须提前建：订阅消息是<b>一次性</b>的，发一条就消耗掉一次授权；
     * 而 {@code ReminderScheduler} 原来只在"到期当天"才 ensurePending 下一年度的任务 ——
     * 当天授权已经赶不上 02:00 的派发，结果是<b>每年重复的日子第二年起再也收不到提醒</b>。
     * 预建之后，首页的"提醒还没开启"提示条就能提前几个月提醒用户去重新授权。
     *
     * <p>独立事务、在派发事务提交之后执行，避免与派发时的行锁互相纠缠；
     * 一次性事件（repeat=none）算不出下一次发生日，自然会被跳过。
     */
    @Transactional
    public void preScheduleNextOccurrences(List<String> sentTaskIds) {
        if (sentTaskIds == null || sentTaskIds.isEmpty()) {
            return;
        }
        for (String taskId : sentTaskIds) {
            ReminderTaskEntity sent = tasks.findById(taskId).orElse(null);
            if (sent == null) {
                continue;
            }
            EventEntity event = events.findByIdAndUserId(sent.getEventId(), sent.getUserId()).orElse(null);
            if (event == null || !event.isReminderEnabled()) {
                continue;
            }
            LocalDate next = occurrences.nextOccurrence(event, sent.getOccurrence().plusDays(1));
            if (next == null) {
                continue;
            }
            ReminderTaskEntity created = ensurePending(sent.getUserId(), event.getId(), next,
                    event.getReminderDaysBefore());
            log.info("REMINDER_PRESCHEDULE eventId={} previous={} next={} daysBefore={} taskStatus={}",
                    event.getId(), sent.getOccurrence(), next, event.getReminderDaysBefore(), created.getStatus());
        }
    }

    @Transactional
    public void cancelForEvent(String userId, String eventId) {
        tasks.findByEventIdAndUserId(eventId, userId).forEach(task -> {
            task.markCancelled();
            tasks.save(task);
        });
    }

    @Transactional
    public ReminderTaskEntity attempt(ReminderTaskEntity task, String userId) {
        if (!task.getUserId().equals(userId) || task.getStatus() == ReminderStatus.sent
                || task.getStatus() == ReminderStatus.cancelled) {
            return task;
        }
        EventEntity event = events.findByIdAndUserId(task.getEventId(), userId).orElse(null);
        UserEntity user = users.findById(userId).orElse(null);
        if (event == null || user == null) {
            task.markCancelled();
            return tasks.save(task);
        }
        WeChatSubscribeMessageClient.SendResult result = wechat.send(user.getOpenId(), event, task.getOccurrence());
        switch (result.status()) {
            case SENT -> task.markSent();
            case FAILED -> task.markFailed(result.message());
            case NEEDS_AUTHORIZATION -> task.markNeedsAuthorization(result.message());
        }
        return tasks.save(task);
    }

    private List<ReminderDtos.ReminderView> markAuthorized(String userId, ReminderDtos.TaskIdsRequest request,
                                                             List<ReminderStatus> allowedStatuses) {
        List<ReminderTaskEntity> selected = request == null || request.taskIds() == null || request.taskIds().isEmpty()
                ? tasks.findByUserIdAndStatusInOrderByOccurrenceAsc(userId, allowedStatuses)
                : request.taskIds().stream().map(id -> tasks.findByIdAndUserId(id, userId).orElse(null))
                .filter(task -> task != null && allowedStatuses.contains(task.getStatus())).toList();
        selected.forEach(task -> {
            task.markAuthorized();
            tasks.save(task);
        });
        return selected.stream().map(ReminderDtos.ReminderView::from).toList();
    }
}
