package cn.rizimianmian.backend.reminders;

import cn.rizimianmian.backend.config.WeChatTlsDiagnostics;
import cn.rizimianmian.backend.events.EventEntity;
import cn.rizimianmian.backend.events.EventOccurrenceCalculator;
import cn.rizimianmian.backend.events.EventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;

@Component
public class ReminderScheduler {
    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final EventRepository events;
    private final ReminderTaskService tasks;
    private final EventOccurrenceCalculator occurrences;
    private final Clock clock;
    private final WeChatTlsDiagnostics diagnostics;

    /** 同时存在测试用构造函数，必须显式标注让 Spring 选用这一个。 */
    @Autowired
    public ReminderScheduler(EventRepository events, ReminderTaskService tasks,
                             EventOccurrenceCalculator occurrences, WeChatTlsDiagnostics diagnostics) {
        this(events, tasks, occurrences, Clock.systemDefaultZone(), diagnostics);
    }

    ReminderScheduler(EventRepository events, ReminderTaskService tasks,
                      EventOccurrenceCalculator occurrences, Clock clock, WeChatTlsDiagnostics diagnostics) {
        this.events = events;
        this.tasks = tasks;
        this.occurrences = occurrences;
        this.clock = clock;
        this.diagnostics = diagnostics;
    }

    @Scheduled(cron = "${app.reminder.cron:0 0 2 * * *}")
    public void scanDaily() {
        scan(LocalDate.now(clock));
    }

    /**
     * 每天扫一次。日志前缀统一用 REMINDER_，方便在云托管日志里按关键词过滤：
     * - REMINDER_SCAN    ：本次扫描概况（开了提醒的日子数、今天命中数、下一次提醒日）
     * - REMINDER_MATCH   ：今天命中了哪条（说明"该发的确实被挑出来了"）
     * 注意：容器缩容到 0 实例时本方法不会执行，日志也会一起消失，这本身就是个信号。
     */
    public void scan(LocalDate today) {
        // 顺手再打一遍出网自检：启动那几行很快会被定时日志刷走，
        // 云托管日志页常常搜不到启动日志，这样保证关键信息一定可见。
        if (diagnostics != null) {
            diagnostics.logSummary();
        }

        int enabledEvents = 0;
        int matchedToday = 0;
        LocalDate nextDue = null;
        for (EventEntity event : events.findByReminderEnabledTrue()) {
            enabledEvents++;
            LocalDate occurrence = occurrences.nextOccurrence(event, today);
            if (occurrence == null) {
                continue;
            }
            // 该条日子真正应该发提醒的那一天 = 发生日 - 提前天数
            LocalDate due = occurrence.minusDays(event.getReminderDaysBefore());
            if (due.isBefore(today)) {
                continue;
            }
            if (due.equals(today)) {
                matchedToday++;
                tasks.ensurePending(event.getUserId(), event.getId(), occurrence, event.getReminderDaysBefore());
                log.info("REMINDER_MATCH eventId={} occurrence={} daysBefore={} 今天到期，已进入待发送队列",
                        event.getId(), occurrence, event.getReminderDaysBefore());
                continue;
            }
            if (nextDue == null || due.isBefore(nextDue)) {
                nextDue = due;
            }
        }
        tasks.dispatchDueTasks(today);
        log.info("REMINDER_SCAN date={} enabledEvents={} matchedToday={} nextDue={}",
                today, enabledEvents, matchedToday, nextDue);
    }
}
