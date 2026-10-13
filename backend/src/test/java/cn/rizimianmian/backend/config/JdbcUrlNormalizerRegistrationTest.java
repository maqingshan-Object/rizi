package cn.rizimianmian.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.boot.SpringApplication;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcUrlNormalizerRegistrationTest {

    @Test
    void isRegisteredAsEnvironmentPostProcessor() throws IOException {
        ClassPathResource resource = new ClassPathResource("META-INF/spring.factories");
        assertTrue(resource.exists(), "spring.factories must exist so the post processor runs at startup");
        try (InputStream input = resource.getInputStream()) {
            String content = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(content.contains("org.springframework.boot.env.EnvironmentPostProcessor"),
                    "spring.factories must declare EnvironmentPostProcessor");
            assertTrue(content.contains(JdbcUrlNormalizer.class.getName()),
                    "spring.factories must register JdbcUrlNormalizer");
        }
    }

    @Test
    void overridesDatasourceUrlAtHighestPrecedence() {
        ConfigurableEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new org.springframework.core.env.MapPropertySource(
                "testEnv",
                java.util.Map.of("spring.datasource.url",
                        "jdbc:mysql://db.example.com:20353/days?characterEncoding=utf8mb4")));

        new JdbcUrlNormalizer().postProcessEnvironment(environment, new SpringApplication());

        assertEquals("jdbc:mysql://db.example.com:20353/days?characterEncoding=UTF-8",
                environment.getProperty("spring.datasource.url"));
        PropertySource<?> first = environment.getPropertySources().iterator().next();
        assertEquals(JdbcUrlNormalizer.OVERRIDE_SOURCE_NAME, first.getName());
    }

    @Test
    void leavesEnvironmentUntouchedWhenNothingToNormalize() {
        ConfigurableEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new org.springframework.core.env.MapPropertySource(
                "testEnv",
                java.util.Map.of("spring.datasource.url",
                        "jdbc:mysql://db.example.com:20353/days?characterEncoding=UTF-8")));

        new JdbcUrlNormalizer().postProcessEnvironment(environment, new SpringApplication());

        assertEquals("jdbc:mysql://db.example.com:20353/days?characterEncoding=UTF-8",
                environment.getProperty("spring.datasource.url"));
        assertNotNull(environment.getPropertySources().get("testEnv"));
    }
}
