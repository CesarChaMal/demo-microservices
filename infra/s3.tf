resource "aws_s3_bucket" "my_bucket" {
  bucket        = lower("aws-s3-bucket-${var.APP}-${random_string.suffix.result}")
  acl           = "private"
  force_destroy = true

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = lower("aws-s3-bucket-${var.APP}-${random_string.suffix.result}")
  }
}
