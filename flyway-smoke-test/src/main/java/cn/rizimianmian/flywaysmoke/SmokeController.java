package cn.rizimianmian.flywaysmoke;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class SmokeController {
    private final JdbcTemplate jdbcTemplate;

    public SmokeController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "flyway-smoke-test");
    }

    @GetMapping("/api/db-check")
    public Map<String, Object> check() {
        Integer result = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        return Map.of("database", "connected", "flyway", "migrated", "select1", result == null ? 0 : result);
    }
}
