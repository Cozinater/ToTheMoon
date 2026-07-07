resource "aws_dynamodb_table" "main" {
  name           = "tothemoon"
  billing_mode   = "PROVISIONED" # stays inside the always-free 25 RCU/WCU ceiling
  read_capacity  = 5
  write_capacity = 5
  hash_key       = "pk"
  range_key      = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}
