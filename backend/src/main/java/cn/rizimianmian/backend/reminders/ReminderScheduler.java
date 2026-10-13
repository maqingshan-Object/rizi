package cn.rizimianmian.backend.reminders;

import cn.rizimianmian.backend.events.EventEntity;
import cn.rizimianmian.backend.events.EventOccurrenceCalculator;
import cn.rizimianmian.backend.events.EventRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;

@Component
public class ReminderScheduler {
    private final EventRepository events;
    private final ReminderTaskService tasks;
    private final EventOccurrenceCalculator occurrences;
    private final Clock clock;

    public ReminderScheduler(EventRepository events, ReminderTaskService tasks,
                             EventOccurrenceCalculator occurrences) {
        this(events, tasks, occurrences, Clock.systemDefaultZone());
    }

    ReminderScheduler(EventRepository events, ReminderTaskService tasks,
                      EventOccurrenceCalculator occurrences, Clock clock) {
        this.events = events;
        this.tasks = tasks;
        this.occurrences = occurrences;
        this.clock = clock;
    }

    @Scheduled(cron = "${app.reminder.cron:0 0 2 * * *}")
    public void scanDaily() {
        scan(LocalDate.now(clock));
    }

    public void scan(LocalDate today) {
        for (EventEntity event : events.findByReminderEnabledTrue()) {
            LocalDate occurrence = occurrences.nextOccurrence(event, today);
            if (occurrence == null || !occurrence.minusDays(event.getReminderDaysBefore()).equals(today)) {
                continue;
            }
            tasks.ensurePending(event.getUserId(), event.getId(), occurrence, event.getReminderDaysBefore());
        }
        tasks.dispatchDueTasks(today);
    }
}
