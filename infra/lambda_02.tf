/*
data "archive_file" "lambda_function_02" {
    type        = "zip"
    source_file = "${path.module}/../dist/simple-backend-assignment-ts.zip"
    output_path = "${path.module}/../dist/simple-backend-assignment-ts.zip"
}
*/

resource "aws_lambda_function" "my_lambda_function_02" {
  #    filename         = data.archive_file.lambda_function_02.output_path
  filename      = "${path.module}/../dist/aws-${var.APP}-${var.ENV}-${var.VER}.zip"
  function_name = "my-lambda-function-save-dynamo-${var.APP}-${var.ENV}"
  handler       = "dist/lambdas/SQSProcessor.sqsProcessorHandler"
  runtime       = "nodejs18.x"
  role          = aws_iam_role.my_lambda_role.arn
  timeout       = 10
  memory_size   = 256
  #    source_code_hash = filebase64sha256(data.archive_file.lambda_function_02.output_path)
  source_code_hash = filebase64sha256("${path.module}/../dist/aws-${var.APP}-${var.ENV}-${var.VER}.zip")

  environment {
    variables = {
      "APP"            = var.APP,
      "ENV"            = var.ENV,
      "AWS_ACCOUNT_ID" = var.AWS_ACCOUNT_ID,
      "QUEUE_URL"      = aws_sqs_queue.my_sqs.url
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lambda_event_source_mapping" "my_event_source_mapping" {
  event_source_arn = aws_sqs_queue.my_sqs.arn
  function_name    = aws_lambda_function.my_lambda_function_02.function_name
  batch_size       = 10
}

resource "aws_lambda_permission" "allow_sqs" {
  statement_id  = "AllowExecutionFromSQS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.my_lambda_function_02.arn
  principal     = "sqs.amazonaws.com"
  source_arn    = aws_sqs_queue.my_sqs.arn
}

