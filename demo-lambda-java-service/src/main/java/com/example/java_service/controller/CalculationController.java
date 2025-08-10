package com.example.controller;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
public class CalculationController {

  @GetMapping("/info")
  public Map<String, String> info() {
    return Map.of("app", "java-service", "status", "running");
  }

  @PostMapping("/calculate")
  public Map<String, Object> calculate(@RequestBody Map<String, Object> req) {
    Object v = req.get("value");
    if (!(v instanceof Number)) throw new IllegalArgumentException("Value must be a number");
    double out = ((Number) v).doubleValue() * 2;
    return Map.of("result", out);
  }
}
