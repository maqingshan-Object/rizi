package cn.rizimianmian.backend.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
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
 * 覆盖“库非空 + 历史表是新表”这一真实场景：
 * days 库里残留了其他项目写入的 flyway_schema_history，正式项目改用 days_schema_history。
 * 必须保证 V1 不会被基线跳过，否则 users 表不会创建，JPA validate 会失败。
 */
class FlywayBaselineStrategyTest {

    @Test
    void appliesVersionOneWhenSchemaIsNotEmptyAndHistoryTableIsNew() throws Exception {
        String url = "jdbc:h2:mem:flywaybaseline1;MODE=MySQL;DB_CLOSE_DELAY=-1";
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            try (Statement statement = connection.createStatement()) {
                // 模拟 days 库里已有的其他项目残留表
                statement.execute("CREATE TABLE flyway_smoke_probe (id BIGINT PRIMARY KEY)");
                statement.execute("CREATE TABLE flyway_schema_history (installed_rank INT PRIMARY KEY, version VARCHAR(20))");
                statement.execute("INSERT INTO flyway_schema_history VALUES (1, '1')");
            }
        }

        MigrateResult result = flyway(url).migrate();

        assertEquals(2, result.migrationsExecuted, "V1 与 V2 都必须真正执行，不能被基线跳过");
        Set<String> tables = tables(url);
        assertTrue(tables.contains("PROBE_ONE"), "V1 应已执行，实际表：" + tables);
        assertTrue(tables.contains("PROBE_TWO"), "V2 应已执行，实际表：" + tables);
        assertTrue(tables.contains("DAYS_SCHEMA_HISTORY"), "应使用独立的历史表，实际表：" + tables);
    }

    @Test
    void isIdempotentOnSecondRun() throws Exception {
        String url = "jdbc:h2:mem:flywaybaseline2;MODE=MySQL;DB_CLOSE_DELAY=-1";
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("CREATE TABLE flyway_smoke_probe (id BIGINT PRIMARY KEY)");
            }
        }

        Flyway flyway = flyway(url);
        assertEquals(2, flyway.migrate().migrationsExecuted);
        assertEquals(0, flyway.migrate().migrationsExecuted, "重复启动不应再次执行迁移");
        flyway.validate();
    }

    @Test
    void pollutedLegacyHistoryTableDoesNotBlockStartup() throws Exception {
        String url = "jdbc:h2:mem:flywaybaseline3;MODE=MySQL;DB_CLOSE_DELAY=-1";
        try (Connection connection = DriverManager.getConnection(url, "sa", "")) {
            try (Statement statement = connection.createStatement()) {
                // 旧版本被测试项目污染的默认历史表：V1 的描述与正式项目完全不同
                statement.execute("CREATE TABLE flyway_schema_history ("
                        + "installed_rank INT PRIMARY KEY, version VARCHAR(20), description VARCHAR(100),"
                        + "type VARCHAR(20), script VARCHAR(200), checksum INT, success BOOLEAN)");
                statement.execute("INSERT INTO flyway_schema_history VALUES "
                        + "(1, '1', 'smoke probe', 'SQL', 'V1__smoke_probe.sql', 123456789, TRUE)");
            }
        }

        Flyway flyway = flyway(url);
        assertEquals(2, flyway.migrate().migrationsExecuted);
        flyway.validate();
        Set<String> tables = tables(url);
        assertTrue(tables.contains("PROBE_ONE"), "被污染的旧历史表不应阻止 V1 执行，实际表：" + tables);
        assertTrue(tables.contains("DAYS_SCHEMA_HISTORY"), "实际表：" + tables);
    }

    private Flyway flyway(String url) {
        return Flyway.configure()
                .dataSource(url, "sa", "")
                .locations("classpath:db/testmigration")
                .table("days_schema_history")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load();
    }

    /** 列出全部用户表名并统一为大写，避免不同数据库对标识符大小写处理不一致。 */
    private Set<String> tables(String url) throws Exception {
        Set<String> names = new HashSet<>();
        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             ResultSet rs = connection.getMetaData().getTables(null, null, "%", new String[]{"TABLE"})) {
            while (rs.next()) {
                names.add(rs.getString("TABLE_NAME").toUpperCase(Locale.ROOT));
            }
        }
        return names;
    }
}
