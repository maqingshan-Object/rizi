package cn.rizimianmian.smoke;

import org.springframework.boot.ApplicationArguments;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DatabaseConnectionRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DatabaseConnectionRunner.class);
    private final JdbcTemplate jdbcTemplate;

    public DatabaseConnectionRunner(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        Integer result = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        if (result == null || result != 1) {
            throw new IllegalStateException("Database connection test returned an unexpected result");
        }
        log.info("DB_SMOKE_TEST=PASS");
    }
}
