/*
data "archive_file" "lambda_function_01" {
    type        = "zip"
    source_file = "${path.module}/../dist/simple-backend-assignment-ts.zip"
    output_path = "${path.module}/../dist/simple-backend-assignment-ts.zip"
}
*/

resource "aws_lambda_function" "my_lambda_function_01" {
  #  filename         = data.archive_file.lambda_function_01.output_path
  filename      = "${path.module}/../dist/aws-${var.APP}-${var.ENV}-${var.VER}.zip"
  function_name = "my-lambda-function-parse-lines-${var.APP}-${var.ENV}"
  handler       = "dist/lambdas/S3ToSQS.s3ToSqsHandler"
  runtime       = "nodejs18.x"
  role          = aws_iam_role.my_lambda_role.arn
  timeout       = 10
  memory_size   = 256
  #    source_code_hash = filebase64sha256(data.archive_file.lambda_function_01.output_path)
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

resource "aws_lambda_permission" "test" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.my_lambda_function_01.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = "arn:aws:s3:::${aws_s3_bucket.my_bucket.id}"
}
