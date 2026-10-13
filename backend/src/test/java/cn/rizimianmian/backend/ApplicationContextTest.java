package cn.rizimianmian.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 启动完整 Spring 上下文（H2 内存库、关闭 Flyway）。
 *
 * 单元测试不会发现「同一个类存在多个构造函数导致 Spring 无法选择」这类问题，
 * 这个测试用来兜住整个 Bean 装配链路，避免线上才暴露。
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {
                "spring.datasource.url=jdbc:h2:mem:contextcheck;MODE=MySQL;DB_CLOSE_DELAY=-1",
                "spring.datasource.username=sa",
                "spring.datasource.password=",
                "spring.datasource.driver-class-name=org.h2.Driver",
                "spring.jpa.hibernate.ddl-auto=create-drop",
                "spring.flyway.enabled=false",
                "app.jwt.secret=context-check-secret-at-least-32-bytes-long",
                "app.wechat.app-secret=context-check-secret",
                "app.wechat.subscribe-template-id="
        })
class ApplicationContextTest {

    @Test
    void contextLoads() {
        // 上下文能启动即通过
    }
}
