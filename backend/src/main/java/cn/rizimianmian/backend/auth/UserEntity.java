package cn.rizimianmian.backend.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "users")
public class UserEntity {
    @Id
    @Column(length = 36, nullable = false, updatable = false)
    private String id;

    @Column(name = "openid", length = 64, nullable = false, unique = true)
    private String openId;

    @Column(name = "unionid", length = 64)
    private String unionId;

    @Column(length = 64)
    private String nickname;

    @Column(name = "avatar_url", length = 1024)
    private String avatarUrl;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    protected UserEntity() {}

    public UserEntity(String id, String openId, String unionId) {
        this.id = id;
        this.openId = openId;
        this.unionId = unionId;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public void updateProfile(String nickname, String avatarUrl) {
        this.nickname = nickname;
        this.avatarUrl = avatarUrl;
        this.updatedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getOpenId() { return openId; }
    public String getUnionId() { return unionId; }
    public String getNickname() { return nickname; }
    public String getAvatarUrl() { return avatarUrl; }
}
