# Feature flags
variable "DEPLOY_SERVERLESS" { type = bool  default = true }
variable "DEPLOY_CONTAINERS" { type = bool  default = true }

# VPC wiring (use outputs from your existing VPC module)
variable "VPC_ID"          { type = string }
variable "PRIVATE_SUBNETS" { type = list(string) }
variable "PUBLIC_SUBNETS"  { type = list(string) }

# Container images (optional; if empty, Terraform will just create ECR repos)
variable "JAVA_IMAGE"   { type = string default = "" }
variable "NODE_IMAGE"   { type = string default = "" }
variable "PYTHON_IMAGE" { type = string default = "" }

# Lambda artifacts (zip files you build)
variable "JAVA_LAMBDA_ZIP"   { type = string default = "artifacts/java-service.zip" }
variable "NODE_LAMBDA_ZIP"   { type = string default = "artifacts/node-service.zip" }
variable "PYTHON_LAMBDA_ZIP" { type = string default = "artifacts/python-service.zip" }

# Optional (only for ECS/Eureka mode)
variable "EUREKA_URL" { type = string default = "" }
