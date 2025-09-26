package com.example.java_service.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public class ValueRequest {

    @Schema(description = "Numeric value to be processed", example = "10", required = true)
    @NotNull(message = "Value cannot be null")
    @Positive(message = "Value must be positive")
    private Integer value;

    public Integer getValue() {
        return value;
    }

    public void setValue(Integer value) {
        this.value = value;
    }
}
