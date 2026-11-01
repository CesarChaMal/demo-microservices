package com.example.gateway_service;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Context load smoke test. The Eureka client is disabled for the test run so
 * the context loads deterministically without a registry — `lb://` targets are
 * resolved per request at runtime, not at startup, so route config still
 * initialises and is exercised by `docker compose up` (Step 10 of the guide).
 */
@SpringBootTest(properties = "eureka.client.enabled=false")
class GatewayServiceApplicationTests {

	@Test
	void contextLoads() {
	}

}
