-- Create table for demo
CREATE TABLE IF NOT EXISTS calculations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    input_value INT NOT NULL,
    result_value INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO calculations (input_value, result_value)
VALUES (5, 10), (8, 16);


