package cn.rizimianmian.backend.events;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "events", indexes = {
        @Index(name = "idx_events_user_date", columnList = "user_id,date")
})
public class EventEntity {
    @Id
    @Column(length = 36, nullable = false, updatable = false)
    private String id;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 2000)
    private String note;

    @Column(nullable = false)
    private LocalDate date;

    @Column(length = 40)
    private String category;

    @Column(length = 40)
    private String mode;

    @Column(name = "repeat_rule", length = 20, nullable = false)
    private String repeat;

    @Column(name = "calendar_type", length = 20)
    private String calendarType;

    @Column(name = "holiday_key", length = 80)
    private String holidayKey;

    private Integer lunarMonth;
    private Integer lunarDay;
    private Boolean lunarLeap;

    @Column(length = 60)
    private String icon;

    @Column(length = 60)
    private String tint;

    @Column(nullable = false)
    private boolean pin;

    @Column(length = 60)
    private String reminder;

    @Column(name = "reminder_enabled", nullable = false)
    private boolean reminderEnabled;

    @Column(name = "reminder_days_before", nullable = false)
    private int reminderDaysBefore;

    @Column(name = "reminder_time")
    private LocalTime reminderTime;

    @Column(nullable = false)
    private boolean sample;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    protected EventEntity() {}

    public EventEntity(String userId) {
        this(UUID.randomUUID().toString(), userId);
    }

    public EventEntity(String id, String userId) {
        this.id = id;
        this.userId = userId;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
        this.repeat = "none";
        this.reminderDaysBefore = 3;
        this.reminderTime = LocalTime.of(9, 0);
    }

    public void update(EventDtos.EventRequest request) {
        this.name = request.name().trim();
        this.note = request.note();
        this.date = request.date();
        this.category = request.category();
        this.mode = request.mode();
        this.repeat = request.repeat() == null || request.repeat().isBlank() ? "none" : request.repeat();
        this.calendarType = request.calendarType();
        this.holidayKey = request.holidayKey();
        this.lunarMonth = request.lunarMonth();
        this.lunarDay = request.lunarDay();
        this.lunarLeap = request.lunarLeap();
        this.icon = request.icon();
        this.tint = request.tint();
        this.pin = Boolean.TRUE.equals(request.pin());
        this.reminder = request.reminder();
        this.reminderEnabled = request.reminderEnabled() != null
                ? request.reminderEnabled()
                : request.reminder() != null && !"不提醒".equals(request.reminder());
        this.reminderDaysBefore = request.reminderDaysBefore() == null
                ? 3 : Math.max(0, request.reminderDaysBefore());
        this.reminderTime = request.reminderTime() == null ? LocalTime.of(9, 0) : request.reminderTime();
        this.sample = Boolean.TRUE.equals(request.sample());
        this.updatedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getUserId() { return userId; }
    public String getName() { return name; }
    public String getNote() { return note; }
    public LocalDate getDate() { return date; }
    public String getCategory() { return category; }
    public String getMode() { return mode; }
    public String getRepeat() { return repeat; }
    public String getCalendarType() { return calendarType; }
    public String getHolidayKey() { return holidayKey; }
    public Integer getLunarMonth() { return lunarMonth; }
    public Integer getLunarDay() { return lunarDay; }
    public Boolean getLunarLeap() { return lunarLeap; }
    public String getIcon() { return icon; }
    public String getTint() { return tint; }
    public boolean isPin() { return pin; }
    public String getReminder() { return reminder; }
    public boolean isReminderEnabled() { return reminderEnabled; }
    public int getReminderDaysBefore() { return reminderDaysBefore; }
    public LocalTime getReminderTime() { return reminderTime; }
    public boolean isSample() { return sample; }
}