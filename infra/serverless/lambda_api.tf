# IAM role for Lambdas
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals { type = "Service", identifiers = ["lambda.amazonaws.com"] }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${local.name_prefix}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Java Lambda
resource "aws_lambda_function" "java" {
  count         = var.DEPLOY_SERVERLESS ? 1 : 0
  function_name = "${local.name_prefix}-java"
  role          = aws_iam_role.lambda_exec.arn
  filename      = var.JAVA_LAMBDA_ZIP
  handler       = "org.springframework.cloud.function.adapter.aws.FunctionInvoker::handleRequest"
  runtime       = "java21"
  memory_size   = 1024
  timeout       = 15
  environment { variables = { APP_NAME = "java-service" } }
}

# Node Lambda
resource "aws_lambda_function" "node" {
  count         = var.DEPLOY_SERVERLESS ? 1 : 0
  function_name = "${local.name_prefix}-node"
  role          = aws_iam_role.lambda_exec.arn
  filename      = var.NODE_LAMBDA_ZIP
  handler       = "index.handler"   # adjust to your handler
  runtime       = "nodejs22.x"
  memory_size   = 512
  timeout       = 15
  environment { variables = { APP_NAME = "node-service" } }
}

# Python Lambda
resource "aws_lambda_function" "python" {
  count         = var.DEPLOY_SERVERLESS ? 1 : 0
  function_name = "${local.name_prefix}-python"
  role          = aws_iam_role.lambda_exec.arn
  filename      = var.PYTHON_LAMBDA_ZIP
  handler       = "app.lambda_handler"  # adjust to your handler
  runtime       = "python3.11"
  memory_size   = 512
  timeout       = 15
  environment { variables = { APP_NAME = "python-service" } }
}

# One HTTP API for all functions
resource "aws_apigatewayv2_api" "http" {
  count         = var.DEPLOY_SERVERLESS ? 1 : 0
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
}

# Integrations
resource "aws_apigatewayv2_integration" "java"   { count = var.DEPLOY_SERVERLESS ? 1 : 0
  api_id = aws_apigatewayv2_api.http[0].id  integration_type = "AWS_PROXY"
  integration_uri = aws_lambda_function.java[0].invoke_arn   payload_format_version = "2.0"
}
resource "aws_apigatewayv2_integration" "node"   { count = var.DEPLOY_SERVERLESS ? 1 : 0
  api_id = aws_apigatewayv2_api.http[0].id  integration_type = "AWS_PROXY"
  integration_uri = aws_lambda_function.node[0].invoke_arn   payload_format_version = "2.0"
}
resource "aws_apigatewayv2_integration" "python" { count = var.DEPLOY_SERVERLESS ? 1 : 0
  api_id = aws_apigatewayv2_api.http[0].id  integration_type = "AWS_PROXY"
  integration_uri = aws_lambda_function.python[0].invoke_arn payload_format_version = "2.0"
}

# Routes (adjust to how you want to map)
resource "aws_apigatewayv2_route" "java_calculate" {
  count    = var.DEPLOY_SERVERLESS ? 1 : 0
  api_id   = aws_apigatewayv2_api.http[0].id
  route_key = "POST /calculate"
  target    = "integrations/${aws_apigatewayv2_integration.java[0].id}"
}
resource "aws_apigatewayv2_route" "node_process" {
  count    = var.DEPLOY_SERVERLESS ? 1 : 0
  api_id   = aws_apigatewayv2_api.http[0].id
  route_key = "POST /process"
  target    = "integrations/${aws_apigatewayv2_integration.node[0].id}"
}
resource "aws_apigatewayv2_route" "python_process" {
  count    = var.DEPLOY_SERVERLESS ? 1 : 0
  api_id   = aws_apigatewayv2_api.http[0].id
  route_key = "POST /py-process"
  target    = "integrations/${aws_apigatewayv2_integration.python[0].id}"
}
resource "aws_apigatewayv2_route" "info" {
  count    = var.DEPLOY_SERVERLESS ? 1 : 0
  api_id   = aws_apigatewayv2_api.http[0].id
  route_key = "GET /info"
  target    = "integrations/${aws_apigatewayv2_integration.node[0].id}" # or python/java if you prefer
}

resource "aws_apigatewayv2_stage" "default" {
  count       = var.DEPLOY_SERVERLESS ? 1 : 0
  api_id      = aws_apigatewayv2_api.http[0].id
  name        = "$default"
  auto_deploy = true
}

# Allow API Gateway to invoke the functions
resource "aws_lambda_permission" "allow_api_java" {
  count         = var.DEPLOY_SERVERLESS ? 1 : 0
  statement_id  = "AllowAPIGwInvokeJava"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.java[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http[0].execution_arn}/*/*"
}
resource "aws_lambda_permission" "allow_api_node" {
  count         = var.DEPLOY_SERVERLESS ? 1 : 0
  statement_id  = "AllowAPIGwInvokeNode"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.node[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http[0].execution_arn}/*/*"
}
resource "aws_lambda_permission" "allow_api_python" {
  count         = var.DEPLOY_SERVERLESS ? 1 : 0
  statement_id  = "AllowAPIGwInvokePython"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.python[0].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http[0].execution_arn}/*/*"
}

output "serverless_api_url" {
  value = var.DEPLOY_SERVERLESS ? aws_apigatewayv2_api.http[0].api_endpoint : null
}
