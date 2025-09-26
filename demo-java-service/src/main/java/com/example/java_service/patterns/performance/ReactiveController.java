package com.example.java_service.reactive;

import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

@RestController
@RequestMapping("/api/reactive")
public class ReactiveController {
    
    @PostMapping("/process")
    public Mono<Map<String, Object>> processReactive(@RequestBody Map<String, Integer> request) {
        return Mono.fromCallable(() -> {
            Integer value = request.get("value");
            return Map.of(
                "result", value * 2,
                "type", "reactive",
                "thread", Thread.currentThread().getName()
            );
        }).delayElement(Duration.ofMillis(100));
    }
    
    @GetMapping("/stream")
    public Flux<Map<String, Object>> streamData() {
        return Flux.interval(Duration.ofSeconds(1))
            .take(10)
            .map(i -> Map.of(
                "sequence", i,
                "value", i * 10,
                "timestamp", System.currentTimeMillis()
            ));
    }
    
    @GetMapping("/backpressure")
    public Flux<Integer> backpressureDemo() {
        return Flux.range(1, 1000)
            .delayElements(Duration.ofMillis(10))
            .onBackpressureBuffer(100);
    }
}