# Overnight price prefetch: warms the day cache for every holding after the US
# market close, so the app opens to instant end-of-day prices with no user wait.
# Reuses the API Lambda's IAM role — it already grants GetItem (read holdings) and
# BatchWriteItem (write cache), which is all the prefetch needs.

resource "aws_lambda_function" "prefetch" {
  function_name    = "tothemoon-prefetch"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "prefetch.handler"
  filename         = "${path.module}/../dist-server/prefetch.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist-server/prefetch.zip")
  timeout          = 900 # up to 15 min: paces ~8 symbols/min to stay under the free-tier limit
  memory_size      = 256

  environment {
    variables = {
      TABLE_NAME          = aws_dynamodb_table.main.name
      TWELVE_DATA_API_KEY = var.twelve_data_api_key
    }
  }
}

# Daily at 23:00 UTC on weekdays = ~07:00 SGT, a few hours after the 16:00 ET close
# so end-of-day bars have settled. Weekends are skipped (no new close).
resource "aws_cloudwatch_event_rule" "prefetch_daily" {
  name                = "tothemoon-prefetch-daily"
  description         = "Warm the end-of-day price cache after US market close"
  schedule_expression = "cron(0 23 ? * MON-FRI *)"
}

resource "aws_cloudwatch_event_target" "prefetch" {
  rule = aws_cloudwatch_event_rule.prefetch_daily.name
  arn  = aws_lambda_function.prefetch.arn
}

resource "aws_lambda_permission" "prefetch_events" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.prefetch.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.prefetch_daily.arn
}
