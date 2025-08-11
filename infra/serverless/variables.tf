variable "AWS_REGION"     { type = string }
variable "AWS_ACCOUNT_ID" { type = string }
variable "APP"            { type = string }
variable "ENV"            { type = string }
variable "VER"            { type = string }

# Flags (default true so your current plan works)
variable "DEPLOY_SERVERLESS" { type = bool  default = true }

# Zip artifacts (can be overridden from tfvars if needed)
variable "JAVA_LAMBDA_ZIP"   { type = string default = "artifacts/java-service.zip" }
variable "NODE_LAMBDA_ZIP"   { type = string default = "artifacts/node-service.zip" }
variable "PYTHON_LAMBDA_ZIP" { type = string default = "artifacts/python-service.zip" }
