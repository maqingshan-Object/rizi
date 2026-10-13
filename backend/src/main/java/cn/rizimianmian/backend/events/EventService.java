package cn.rizimianmian.backend.events;

import cn.rizimianmian.backend.reminders.ReminderTaskService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class EventService {
    private final EventRepository events;
    private final ReminderTaskService reminders;

    public EventService(EventRepository events, ReminderTaskService reminders) {
        this.events = events;
        this.reminders = reminders;
    }

    @Transactional(readOnly = true)
    public List<EventDtos.EventView> list(String userId) {
        return events.findAllByUserIdOrderByDateAscCreatedAtAsc(userId).stream()
                .map(EventDtos.EventView::from).toList();
    }

    @Transactional
    public EventDtos.EventView create(String userId, EventDtos.EventRequest request) {
        String id = request.id() == null || request.id().isBlank() ? UUID.randomUUID().toString() : request.id();
        if (events.findById(id).isPresent()) {
            throw new IllegalArgumentException("事件 ID 已存在");
        }
        EventEntity event = new EventEntity(id, userId);
        event.update(request);
        EventEntity saved = events.save(event);
        reminders.replaceForEvent(userId, saved);
        return EventDtos.EventView.from(saved);
    }

    @Transactional
    public EventDtos.EventView update(String userId, String id, EventDtos.EventRequest request) {
        EventEntity event = events.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("事件不存在"));
        event.update(request);
        EventEntity saved = events.save(event);
        reminders.replaceForEvent(userId, saved);
        return EventDtos.EventView.from(saved);
    }

    @Transactional
    public void delete(String userId, String id) {
        EventEntity event = events.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new IllegalArgumentException("事件不存在"));
        reminders.cancelForEvent(userId, event.getId());
        events.delete(event);
    }

    @Transactional
    public List<EventDtos.EventView> sync(String userId, List<EventDtos.EventRequest> requests) {
        return requests.stream().map(request -> syncOne(userId, request)).toList();
    }

    private EventDtos.EventView syncOne(String userId, EventDtos.EventRequest request) {
        EventEntity event;
        if (request.id() == null || request.id().isBlank()) {
            event = new EventEntity(userId);
        } else {
            event = events.findByIdAndUserId(request.id(), userId).orElse(null);
            if (event == null && events.findById(request.id()).isPresent()) {
                throw new IllegalArgumentException("事件 ID 不属于当前用户");
            }
            if (event == null) {
                event = new EventEntity(request.id(), userId);
            }
        }
        event.update(request);
        EventEntity saved = events.save(event);
        reminders.replaceForEvent(userId, saved);
        return EventDtos.EventView.from(saved);
    }
}
