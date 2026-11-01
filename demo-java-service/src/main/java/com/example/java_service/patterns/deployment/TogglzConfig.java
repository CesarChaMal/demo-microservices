package com.example.java_service.patterns.deployment;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.togglz.core.user.SimpleFeatureUser;
import org.togglz.core.user.UserProvider;

/**
 * Togglz needs a UserProvider to build its FeatureManager bean. This demo has no
 * authentication, so every caller is treated as a feature admin — which also
 * keeps the Togglz console and the pattern controllers fully operable.
 */
@Configuration
public class TogglzConfig {

    @Bean
    public UserProvider userProvider() {
        return () -> new SimpleFeatureUser("demo-user", true);
    }
}
