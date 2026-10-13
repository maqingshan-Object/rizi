package cn.rizimianmian.backend.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Flyway 自愈迁移策略。
 *
 * 云托管滚动发布时，新旧容器可能同时连同一个数据库启动，
 * 空库上两个实例会抢建历史表，或留下 success=0 的失败记录，
 * 之后每次启动都会 Validate failed。
 *
 * 处理顺序：
 * 1. 打印构建标记、实际生效配置、每条迁移状态
 * 2. repair()：清理失败记录、校正校验和
 * 3. migrate()
 * 4. 若失败：打印完整原因，再次 repair 后重试
 * 5. 若仍失败：用关闭校验的同一套配置做最后一次迁移
 *
 * 每一步都会在日志里留下 FLYWAY_ 前缀的记录，便于定位。
 */
@Configuration
public class FlywayConfig {
    private static final Logger log = LoggerFactory.getLogger(FlywayConfig.class);

    /** 构建标记：用于在云托管日志里确认当前运行的到底是哪个包。 */
    public static final String BUILD_MARKER = "days-backend-flyway-selfheal-v4";

    @Bean
    FlywayMigrationStrategy selfHealingFlywayMigrationStrategy() {
        return FlywayConfig::migrateWithDiagnostics;
    }

    static void migrateWithDiagnostics(Flyway flyway) {
        log.info("BUILD_MARKER={}", BUILD_MARKER);
        logConfiguration(flyway);
        logStates(flyway, "BEFORE");

        repairQuietly(flyway, "BEFORE_MIGRATE");

        try {
            flyway.migrate();
            log.info("FLYWAY_MIGRATE_OK attempt=1");
            return;
        } catch (RuntimeException firstFailure) {
            log.warn("FLYWAY_MIGRATE_FAILED attempt=1 reason={}", firstFailure.getMessage());
        }

        logStates(flyway, "AFTER_FAILURE");
        repairQuietly(flyway, "BEFORE_RETRY");

        try {
            flyway.migrate();
            log.info("FLYWAY_MIGRATE_OK attempt=2");
            return;
        } catch (RuntimeException secondFailure) {
            log.warn("FLYWAY_MIGRATE_FAILED attempt=2 reason={}", secondFailure.getMessage());
        }

        logStates(flyway, "BEFORE_RELAXED");
        log.warn("FLYWAY_RELAXED_MIGRATE start");
        Flyway relaxed = Flyway.configure()
                .configuration(flyway.getConfiguration())
                .validateOnMigrate(false)
                .load();
        relaxed.migrate();
        log.info("FLYWAY_MIGRATE_OK attempt=3 validateOnMigrate=false");
    }

    private static void repairQuietly(Flyway flyway, String phase) {
        try {
            var result = flyway.repair();
            log.info("FLYWAY_REPAIR_RESULT phase={} actions={}",
                    phase, result == null ? "none" : result.repairActions);
        } catch (RuntimeException repairFailure) {
            log.warn("FLYWAY_REPAIR_FAILED phase={} reason={}", phase, repairFailure.getMessage());
        }
    }

    private static void logStates(Flyway flyway, String phase) {
        try {
            MigrationInfo[] all = flyway.info().all();
            log.info("FLYWAY_STATE_TOTAL phase={} total={}", phase, all.length);
            for (MigrationInfo info : all) {
                log.info("FLYWAY_STATE phase={} version={} state={} script={} checksum={} installedOn={}",
                        phase, info.getVersion(), info.getState(), info.getScript(),
                        info.getChecksum(), info.getInstalledOn());
            }
        } catch (RuntimeException diagnosticFailure) {
            log.warn("FLYWAY_STATE_UNAVAILABLE phase={} reason={}", phase, diagnosticFailure.getMessage());
        }
    }

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
