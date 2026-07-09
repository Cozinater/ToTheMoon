data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "tothemoon-lambda"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "ddb" {
  statement {
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem",
      "dynamodb:Query", "dynamodb:BatchWriteItem",
    ]
    resources = [aws_dynamodb_table.main.arn]
  }
}

resource "aws_iam_role_policy" "ddb" {
  name   = "tothemoon-ddb"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.ddb.json
}

resource "aws_lambda_function" "api" {
  function_name    = "tothemoon-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = "${path.module}/../dist-server/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist-server/lambda.zip")
  timeout          = 15
  memory_size      = 256

  # Note: no reserved_concurrent_executions. This account's total Lambda
  # concurrency limit (10 by default on new accounts) already caps the blast
  # radius, and AWS forbids reserving concurrency when it would leave < 10
  # unreserved. Re-add a reservation here once AWS raises the account limit.

  environment {
    variables = {
      TABLE_NAME          = aws_dynamodb_table.main.name
      TWELVE_DATA_API_KEY = var.twelve_data_api_key
      ORIGIN_SECRET       = var.origin_secret
      APP_PASSWORD        = var.app_password
      SESSION_TOKEN       = var.session_token
    }
  }
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE" # protected by the origin-secret header check inside the app
}

resource "aws_lambda_permission" "public_url" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "public_url_invoke" {
  statement_id             = "FunctionURLInvokeAllowPublicAccess"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "*"
  invoked_via_function_url = true
}
