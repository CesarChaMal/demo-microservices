package com.example.eurekaserver;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;
import org.springframework.context.annotation.Bean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.HashMap;

@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication {

	public static void main(String[] args) {
		SpringApplication.run(EurekaServerApplication.class, args);
	}

	@RestController
	static class InfoController {
		@GetMapping("/info")
		public Map<String, Object> info() {
			Map<String, Object> info = new HashMap<>();
			info.put("app", "eureka-server");
			info.put("status", "running");
			info.put("version", "1.0.0");
			info.put("patterns", new String[]{"service-discovery", "health-check", "security"});
			return info;
		}
	}

	@Component
	static class EurekaHealthIndicator implements HealthIndicator {
		@Override
		public Health health() {
			return Health.up()
				.withDetail("service", "eureka-server")
				.withDetail("status", "operational")
				.build();
		}
	}
}
