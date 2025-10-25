locals {
  ami_id        = lookup(var.AMIS, var.AWS_REGION)
  ecs_ami_id    = lookup(var.ECS_AMIS, var.AWS_REGION)
  win_ami_id    = lookup(var.WIN_AMIS, var.AWS_REGION)
  common_tags = {
    Environment = var.ENV
    Application = var.APP
  }
}
