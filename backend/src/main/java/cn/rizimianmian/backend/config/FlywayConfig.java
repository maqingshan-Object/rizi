package cn.rizimianmian.backend.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 在迁移前打印 Flyway 的完整状态（版本、状态、脚本、校验和、安装时间）。
 * 这样一旦出现 Validate failed，日志里就能直接看到到底是哪条迁移冲突，
 * 不需要再去猜。不改变迁移行为。
 */
@Configuration
public class FlywayConfig {
    private static final Logger log = LoggerFactory.getLogger(FlywayConfig.class);

    /** 构建标记：用于在云托管日志里确认当前运行的到底是哪个包。 */
    public static final String BUILD_MARKER = "days-backend-flyway-selfheal-v3";

    @Bean
    FlywayMigrationStrategy loggingFlywayMigrationStrategy() {
        return FlywayConfig::migrateWithDiagnostics;
    }

    static void migrateWithDiagnostics(Flyway flyway) {
        log.info("BUILD_MARKER={}", BUILD_MARKER);
        logConfiguration(flyway);
        try {
            MigrationInfo[] all = flyway.info().all();
            log.info("FLYWAY_STATE_TOTAL={}", all.length);
            for (MigrationInfo info : all) {
                log.info("FLYWAY_STATE version={} state={} script={} checksum={} installedOn={}",
                        info.getVersion(), info.getState(), info.getScript(),
                        info.getChecksum(), info.getInstalledOn());
            }
        } catch (RuntimeException diagnosticFailure) {
            log.warn("FLYWAY_STATE_UNAVAILABLE reason={}", diagnosticFailure.getMessage());
        }
        flyway.migrate();
    }

    /** 打印实际生效的 Flyway 配置，用于确认线上运行的包确实是修复后的版本。 */
    private static void logConfiguration(Flyway flyway) {
        try {
            var config = flyway.getConfiguration();
            log.info("FLYWAY_CONFIG table={} baselineVersion={} baselineOnMigrate={} validateOnMigrate={} locations={}",
                    config.getTable(), config.getBaselineVersion(), config.isBaselineOnMigrate(),
                    config.isValidateOnMigrate(), java.util.Arrays.toString(config.getLocations()));
        } catch (RuntimeException ignored) {
            log.warn("FLYWAY_CONFIG_UNAVAILABLE");
        }
    }
}
