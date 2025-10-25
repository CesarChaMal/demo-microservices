# ECR (only created if you don’t pass prebuilt image URIs)
resource "aws_ecr_repository" "java" { count = var.DEPLOY_CONTAINERS && var.JAVA_IMAGE == "" ? 1 : 0 name = "${local.name_prefix}-java" }
resource "aws_ecr_repository" "node" { count = var.DEPLOY_CONTAINERS && var.NODE_IMAGE == "" ? 1 : 0 name = "${local.name_prefix}-node" }
resource "aws_ecr_repository" "py"   { count = var.DEPLOY_CONTAINERS && var.PYTHON_IMAGE == "" ? 1 : 0 name = "${local.name_prefix}-python" }

resource "aws_ecs_cluster" "this" {
  count = var.DEPLOY_CONTAINERS ? 1 : 0
  name  = local.name_prefix
}

# Task execution role
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals { type = "Service", identifiers = ["ecs-tasks.amazonaws.com"] }
  }
}
resource "aws_iam_role" "ecs_task_exec" {
  count              = var.DEPLOY_CONTAINERS ? 1 : 0
  name               = "${local.name_prefix}-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}
resource "aws_iam_role_policy_attachment" "ecs_exec_attach" {
  count      = var.DEPLOY_CONTAINERS ? 1 : 0
  role       = aws_iam_role.ecs_task_exec[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# SG
resource "aws_security_group" "svc" {
  count       = var.DEPLOY_CONTAINERS ? 1 : 0
  name        = "${local.name_prefix}-svc"
  description = "Allow HTTP from VPC"
  vpc_id      = var.VPC_ID

  ingress { from_port = 8080 to_port = 8080 protocol = "tcp" cidr_blocks = ["10.0.0.0/16"] }
  ingress { from_port = 3000 to_port = 3000 protocol = "tcp" cidr_blocks = ["10.0.0.0/16"] }
  ingress { from_port = 5001 to_port = 5001 protocol = "tcp" cidr_blocks = ["10.0.0.0/16"] }
  egress  { from_port = 0 to_port = 0     protocol = "-1"  cidr_blocks = ["0.0.0.0/0"] }
}

# Resolve image URIs
locals {
  java_image_uri   = var.JAVA_IMAGE   != "" ? var.JAVA_IMAGE   : (length(aws_ecr_repository.java) > 0 ? aws_ecr_repository.java[0].repository_url   : "")
  node_image_uri   = var.NODE_IMAGE   != "" ? var.NODE_IMAGE   : (length(aws_ecr_repository.node) > 0 ? aws_ecr_repository.node[0].repository_url   : "")
  python_image_uri = var.PYTHON_IMAGE != "" ? var.PYTHON_IMAGE : (length(aws_ecr_repository.py)   > 0 ? aws_ecr_repository.py[0].repository_url     : "")
}

# Java task + service
resource "aws_ecs_task_definition" "java" {
  count                    = var.DEPLOY_CONTAINERS ? 1 : 0
  family                   = "${local.name_prefix}-java"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_task_exec[0].arn

  container_definitions = jsonencode([{
    name  = "java"
    image = local.java_image_uri
    essential = true
    portMappings = [{ containerPort = 8080, protocol = "tcp" }]
    environment = [
      { name = "EUREKA_CLIENT_SERVICEURL_DEFAULTZONE", value = var.EUREKA_URL }
    ]
  }])
}

resource "aws_ecs_service" "java" {
  count           = var.DEPLOY_CONTAINERS ? 1 : 0
  name            = "${local.name_prefix}-java"
  cluster         = aws_ecs_cluster.this[0].id
  task_definition = aws_ecs_task_definition.java[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = var.PRIVATE_SUBNETS
    security_groups  = [aws_security_group.svc[0].id]
    assign_public_ip = false
  }
}

# Node
resource "aws_ecs_task_definition" "node" {
  count                    = var.DEPLOY_CONTAINERS ? 1 : 0
  family                   = "${local.name_prefix}-node"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_exec[0].arn

  container_definitions = jsonencode([{
    name  = "node"
    image = local.node_image_uri
    essential = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "EUREKA_CLIENT_SERVICEURL_DEFAULTZONE", value = var.EUREKA_URL }
    ]
  }])
}

resource "aws_ecs_service" "node" {
  count           = var.DEPLOY_CONTAINERS ? 1 : 0
  name            = "${local.name_prefix}-node"
  cluster         = aws_ecs_cluster.this[0].id
  task_definition = aws_ecs_task_definition.node[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = var.PRIVATE_SUBNETS
    security_groups  = [aws_security_group.svc[0].id]
    assign_public_ip = false
  }
}

# Python
resource "aws_ecs_task_definition" "python" {
  count                    = var.DEPLOY_CONTAINERS ? 1 : 0
  family                   = "${local.name_prefix}-python"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_task_exec[0].arn

  container_definitions = jsonencode([{
    name  = "python"
    image = local.python_image_uri
    essential = true
    portMappings = [{ containerPort = 5001, protocol = "tcp" }]
    environment = [
      { name = "EUREKA_CLIENT_SERVICEURL_DEFAULTZONE", value = var.EUREKA_URL }
    ]
  }])
}

resource "aws_ecs_service" "python" {
  count           = var.DEPLOY_CONTAINERS ? 1 : 0
  name            = "${local.name_prefix}-python"
  cluster         = aws_ecs_cluster.this[0].id
  task_definition = aws_ecs_task_definition.python[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = var.PRIVATE_SUBNETS
    security_groups  = [aws_security_group.svc[0].id]
    assign_public_ip = false
  }
}
