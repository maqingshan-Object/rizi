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
import java.util.List;

@Service
public class ReminderTaskService {
    private static final Logger log = LoggerFactory.getLogger(ReminderTaskService.class);

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

    @Transactional
    public List<ReminderDtos.ReminderView> retry(String userId, ReminderDtos.TaskIdsRequest request) {
        List<ReminderDtos.ReminderView> retried = markAuthorized(userId, request,
                List.of(ReminderStatus.failed, ReminderStatus.needs_authorization));
        log.info("REMINDER_RETRY user={} tasks={}", userId, retried.size());
        return retried;
    }

    @Transactional
    public void dispatchDueTasks(LocalDate today) {
        int due = 0;
        for (ReminderTaskEntity task : tasks.findByStatusAndAuthorizedTrue(ReminderStatus.pending)) {
            if (!task.isDue(today)) {
                continue;
            }
            due++;
            ReminderTaskEntity attempted = attempt(task, task.getUserId());
            // 每个命中任务都留一行结果：SENT / FAILED / NEEDS_AUTHORIZATION，失败时带原因。
            log.info("REMINDER_DISPATCH taskId={} eventId={} occurrence={} result={} error={}",
                    attempted.getId(), attempted.getEventId(), attempted.getOccurrence(),
                    attempted.getStatus(), attempted.getLastError());
        }
        if (due > 0) {
            log.info("REMINDER_DISPATCH_DONE date={} due={}", today, due);
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
