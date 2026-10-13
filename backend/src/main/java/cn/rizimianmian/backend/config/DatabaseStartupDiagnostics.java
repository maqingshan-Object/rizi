package cn.rizimianmian.backend.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Driver;
import java.sql.DriverManager;
import java.util.Enumeration;

/**
 * 启动时输出与数据库连接有关的非敏感诊断信息，方便在云托管日志中直接确认
 * 实际生效的驱动版本和 characterEncoding 参数。
 * 不会输出密码、账号或完整连接串。
 */
@Component
public class DatabaseStartupDiagnostics implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DatabaseStartupDiagnostics.class);

    private final JdbcTemplate jdbcTemplate;
    private final String datasourceUrl;

    public DatabaseStartupDiagnostics(JdbcTemplate jdbcTemplate,
                                      @Value("${spring.datasource.url:}") String datasourceUrl) {
        this.jdbcTemplate = jdbcTemplate;
        this.datasourceUrl = datasourceUrl;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("DB_DIAGNOSTIC_DRIVER={}", mysqlDriverVersion());
        log.info("DB_DIAGNOSTIC_CHARACTER_ENCODING={}", characterEncoding(datasourceUrl));
        log.info("DB_DIAGNOSTIC_TARGET={}", target(datasourceUrl));
        Integer probe = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        log.info("DB_DIAGNOSTIC_SELECT1={}", probe == null ? "null" : probe);
    }

    private String mysqlDriverVersion() {
        Enumeration<Driver> drivers = DriverManager.getDrivers();
        while (drivers.hasMoreElements()) {
            Driver driver = drivers.nextElement();
            if (driver.getClass().getName().contains("mysql")) {
                return driver.getClass().getName() + " " + driver.getMajorVersion() + "." + driver.getMinorVersion();
            }
        }
        return "mysql-driver-not-registered";
    }

    private String characterEncoding(String url) {
        if (url == null) {
            return "url-missing";
        }
        java.util.regex.Matcher matcher =
                java.util.regex.Pattern.compile("(?i)characterEncoding\\s*=\\s*([^&]*)").matcher(url);
        return matcher.find() ? matcher.group(1) : "not-set";
    }

    /** 只保留协议与主机端口，隐藏库名、参数和任何凭证。 */
    private String target(String url) {
        if (url == null) {
            return "url-missing";
        }
        int schemeEnd = url.indexOf("//");
        if (schemeEnd < 0) {
            return "url-unparsable";
        }
        String rest = url.substring(schemeEnd + 2);
        int slash = rest.indexOf('/');
        String authority = slash < 0 ? rest : rest.substring(0, slash);
        int at = authority.lastIndexOf('@');
        String host = at < 0 ? authority : authority.substring(at + 1);
        return host.isBlank() ? "host-missing" : host;
    }
}
