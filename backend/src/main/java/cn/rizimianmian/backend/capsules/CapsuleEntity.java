package cn.rizimianmian.backend.capsules;

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

/**
 * 一个时间胶囊：写一段话，指定未来某天启封。
 *
 * <p>⚠️ 正文在任何"未到期"的场景下都不得通过网络下发（含发送方自己）——
 * 这是这个功能全部的意义所在；接口层负责裁剪，实体层只管存。
 */
@Entity
@Table(name = "capsules", indexes = {
        @Index(name = "idx_capsules_user", columnList = "user_id,status,open_on")
}, uniqueConstraints = {
        @jakarta.persistence.UniqueConstraint(name = "uk_capsules_token", columnNames = {"public_token"})
})
public class CapsuleEntity {

    /** self 自用 ／ gift 送人。 */
    public enum Kind { self, gift }

    /** sealed 封存中 ／ opened 已启封。 */
    public enum Status { sealed, opened }

    @Id
    @Column(length = 36, nullable = false, updatable = false)
    private String id;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Kind kind;

    @Column(length = 120)
    private String title;

    @Column(nullable = false, length = 1000)
    private String content;

    /** 启封日：只有 <= 今天才允许打开。 */
    @Column(name = "open_on", nullable = false)
    private LocalDate openOn;

    @Column(name = "recipient_name", length = 60)
    private String recipientName;

    /** 送人专用领取码；谁拿到谁能看（像一封信）。 */
    @Column(name = "public_token", length = 64)
    private String publicToken;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    /** 传递链来源：谁送出的这份心意。 */
    @Column(name = "source_capsule_id", length = 36)
    private String sourceCapsuleId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "opened_at")
    private Instant openedAt;

    protected CapsuleEntity() {
    }

    public CapsuleEntity(String userId, Kind kind, String title, String content, LocalDate openOn,
                         String recipientName, String sourceCapsuleId) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.kind = kind;
        this.title = title;
        this.content = content;
        this.openOn = openOn;
        this.recipientName = recipientName;
        this.status = Status.sealed;
        this.sourceCapsuleId = sourceCapsuleId;
        this.createdAt = Instant.now();
        // 只有送人的才需要领取码
        this.publicToken = kind == Kind.gift ? randomToken() : null;
    }

    private static String randomToken() {
        return (UUID.randomUUID().toString() + UUID.randomUUID().toString()).replace("-", "").substring(0, 32);
    }

    /** 到启封日了吗（服务端日期为准）。 */
    public boolean openableOn(LocalDate today) {
        return status == Status.sealed && !openOn.isAfter(today);
    }

    public void markOpened() {
        this.status = Status.opened;
        this.openedAt = Instant.now();
    }

    public String getId() { return id; }

    public String getUserId() { return userId; }

    public Kind getKind() { return kind; }

    public String getTitle() { return title; }

    public String getContent() { return content; }

    public LocalDate getOpenOn() { return openOn; }

    public String getRecipientName() { return recipientName; }

    public String getPublicToken() { return publicToken; }

    public Status getStatus() { return status; }

    public String getSourceCapsuleId() { return sourceCapsuleId; }

    public Instant getCreatedAt() { return createdAt; }

    public Instant getOpenedAt() { return openedAt; }
}
