# One ECR repository per container-image service.
#
# Naming: ${APP}-<service> — matches the repo directories (demo-java-service,
# ...) and the REPO="${APP}-${SVC}" convention in infra/create.sh's image
# build/push block, so scripts and CI address the same repos.

resource "aws_ecr_repository" "services" {
  for_each = toset(local.service_repos)

  name = each.value

  # Tags are immutable — a pushed tag can never be silently overwritten.
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "services" {
  for_each = aws_ecr_repository.services

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the last 10 images, expire the rest"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "sha-", "latest"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
