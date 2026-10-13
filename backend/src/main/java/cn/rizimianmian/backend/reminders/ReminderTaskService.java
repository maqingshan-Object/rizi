package cn.rizimianmian.backend.reminders;

import cn.rizimianmian.backend.auth.UserEntity;
import cn.rizimianmian.backend.auth.UserRepository;
import cn.rizimianmian.backend.events.EventEntity;
import cn.rizimianmian.backend.events.EventRepository;
import cn.rizimianmian.backend.events.EventOccurrenceCalculator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

@Service
public class ReminderTaskService {
    private final ReminderTaskRepository tasks;
    private final EventRepository events;
    private final UserRepository users;
    private final WeChatSubscribeMessageClient wechat;
    private final EventOccurrenceCalculator occurrences;
    private final Clock clock;

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
        return markAuthorized(userId, request, List.of(ReminderStatus.needs_authorization, ReminderStatus.pending));
    }

    @Transactional
    public List<ReminderDtos.ReminderView> retry(String userId, ReminderDtos.TaskIdsRequest request) {
        return markAuthorized(userId, request, List.of(ReminderStatus.failed, ReminderStatus.needs_authorization));
    }

    @Transactional
    public void dispatchDueTasks(LocalDate today) {
        tasks.findByStatusAndAuthorizedTrue(ReminderStatus.pending).stream()
                .filter(task -> task.isDue(today))
                .forEach(task -> attempt(task, task.getUserId()));
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
