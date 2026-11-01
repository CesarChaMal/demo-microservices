-- Schema mounted into MySQL via docker-compose (./db/init:/docker-entrypoint-initdb.d)
-- Runs once, on first container start with an empty data volume.
CREATE TABLE IF NOT EXISTS calculations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    input_value INT NOT NULL,
    result_value INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
