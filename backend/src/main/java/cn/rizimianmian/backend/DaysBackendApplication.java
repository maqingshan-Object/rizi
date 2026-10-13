package cn.rizimianmian.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class DaysBackendApplication {
    public static void main(String[] args) {
        SpringApplication.run(DaysBackendApplication.class, args);
    }
}
