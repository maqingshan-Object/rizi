package cn.rizimianmian.backend.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {
    private final AppProperties properties;
    private final SecretKey signingKey;

    public JwtService(AppProperties properties) {
        this.properties = properties;
        this.signingKey = Keys.hmacShaKeyFor(properties.jwt().secret().getBytes(StandardCharsets.UTF_8));
    }

    public String issue(String userId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(userId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(properties.jwt().accessTokenMinutes() * 60)))
                .signWith(signingKey)
                .compact();
    }

    public String subject(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return claims.getSubject();
    }
}
