package cn.rizimianmian.backend.reminders;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "reminder_tasks", indexes = {
        @Index(name = "idx_reminder_tasks_user_status", columnList = "user_id,status")
}, uniqueConstraints = {
        @jakarta.persistence.UniqueConstraint(name = "uk_reminder_task_idempotency",
                columnNames = {"event_id", "occurrence", "days_before"})
})
public class ReminderTaskEntity {
    @Id
    @Column(length = 36, nullable = false, updatable = false)
    private String id;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(name = "event_id", length = 36, nullable = false)
    private String eventId;

    @Column(nullable = false)
    private LocalDate occurrence;

    @Column(name = "days_before", nullable = false)
    private int daysBefore;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ReminderStatus status;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(nullable = false)
    private boolean authorized;

    @Column(name = "authorized_at")
    private Instant authorizedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ReminderTaskEntity() {}

    public ReminderTaskEntity(String userId, String eventId, LocalDate occurrence, int daysBefore) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.eventId = eventId;
        this.occurrence = occurrence;
        this.daysBefore = daysBefore;
        this.status = ReminderStatus.pending;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public static String idempotencyKey(String eventId, LocalDate occurrence, int daysBefore) {
        return eventId + ":" + occurrence + ":" + daysBefore;
    }

    public void markAuthorized() {
        this.authorized = true;
        this.authorizedAt = Instant.now();
        this.status = ReminderStatus.pending;
        this.lastError = null;
        this.updatedAt = Instant.now();
    }

    public boolean isDue(java.time.LocalDate today) {
        return occurrence.minusDays(daysBefore).equals(today);
    }

    public void markSent() {
        this.status = ReminderStatus.sent;
        this.lastError = null;
        this.sentAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public void markFailed(String message) {
        this.status = ReminderStatus.failed;
        this.lastError = message;
        this.updatedAt = Instant.now();
    }

    public void markNeedsAuthorization(String message) {
        this.status = ReminderStatus.needs_authorization;
        this.lastError = message;
        this.updatedAt = Instant.now();
    }

    public void markPending() {
        this.status = ReminderStatus.pending;
        this.lastError = null;
        this.updatedAt = Instant.now();
    }

    public boolean isAuthorized() { return authorized; }
    public Instant getAuthorizedAt() { return authorizedAt; }

    public void markCancelled() {
        this.status = ReminderStatus.cancelled;
        this.updatedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getUserId() { return userId; }
    public String getEventId() { return eventId; }
    public LocalDate getOccurrence() { return occurrence; }
    public int getDaysBefore() { return daysBefore; }
    public ReminderStatus getStatus() { return status; }
    public String getLastError() { return lastError; }
    public Instant getSentAt() { return sentAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}