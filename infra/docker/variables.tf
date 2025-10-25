variable "AWS_REGION"     { type = string }
variable "AWS_ACCOUNT_ID" { type = string }
variable "APP"            { type = string }
variable "ENV"            { type = string }
variable "VER"            { type = string }

# Flags (default true so your current plan works)
variable "DEPLOY_CONTAINERS" { type = bool  default = true }

# Optional image URIs (leave empty to let TF create ECR repos)
variable "JAVA_IMAGE"   { type = string default = "" }
variable "NODE_IMAGE"   { type = string default = "" }
variable "PYTHON_IMAGE" { type = string default = "" }

# For Eureka URL into your containers (if you deploy Eureka separately)
variable "EUREKA_URL" { type = string default = "" }
