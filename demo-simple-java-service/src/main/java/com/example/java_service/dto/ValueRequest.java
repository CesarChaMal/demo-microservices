package com.example.java_service.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public class ValueRequest {

    @Schema(description = "Numeric value to be processed", example = "10", required = true)
    private Integer value;

    public Integer getValue() {
        return value;
    }

    public void setValue(Integer value) {
        this.value = value;
    }
}
