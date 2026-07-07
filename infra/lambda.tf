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

  environment {
    variables = {
      TABLE_NAME          = aws_dynamodb_table.main.name
      TWELVE_DATA_API_KEY = var.twelve_data_api_key
      ORIGIN_SECRET       = var.origin_secret
    }
  }
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE" # protected by the origin-secret header check inside the app
}
