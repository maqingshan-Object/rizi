package cn.rizimianmian.backend.config;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证带诊断日志的迁移策略不会改变迁移结果，
 * 并且在“库非空 + 历史表被其他项目污染”时仍能把 V1/V2 执行完。
 */
class FlywayConfigStrategyTest {

    @Test
    void strategyStillAppliesAllMigrationsOnPollutedSchema() throws Exception {
        String url = "jdbc:h2:mem:flywayconfig;MODE=MySQL;DB_CLOSE_DELAY=-1";
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("CREATE TABLE flyway_schema_history ("
                        + "installed_rank INT PRIMARY KEY, version VARCHAR(20), description VARCHAR(100),"
                        + "type VARCHAR(20), script VARCHAR(200), checksum INT, success BOOLEAN)");
                statement.execute("INSERT INTO flyway_schema_history VALUES "
                        + "(1, '1', 'smoke probe', 'SQL', 'V1__smoke_probe.sql', 42, TRUE)");
            }
        }

        Flyway flyway = Flyway.configure()
                .dataSource(url, "sa", "")
                .locations("classpath:db/testmigration")
                .table("days_schema_history")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load();

        FlywayConfig.migrateWithDiagnostics(flyway);

        Set<String> tables = new HashSet<>();
        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             ResultSet rs = connection.getMetaData().getTables(null, null, "%", new String[]{"TABLE"})) {
            while (rs.next()) {
                tables.add(rs.getString("TABLE_NAME").toUpperCase(Locale.ROOT));
            }
        }
        assertTrue(tables.contains("PROBE_ONE"), "实际表：" + tables);
        assertTrue(tables.contains("PROBE_TWO"), "实际表：" + tables);
        assertEquals(0, flyway.migrate().migrationsExecuted, "重复执行应为 0");
    }
}
