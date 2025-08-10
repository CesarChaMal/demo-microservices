resource "aws_dynamodb_table" "my_table" {
  name         = "cars_brands-${var.APP}-${var.ENV}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "brand"
    type = "S"
  }

  global_secondary_index {
    name            = "brand-index"
    hash_key        = "brand"
    projection_type = "ALL"
    write_capacity  = 1
    read_capacity   = 1
  }

  tags = {
    Environment = "cars_brands-${var.APP}-${var.ENV}"
  }
}
