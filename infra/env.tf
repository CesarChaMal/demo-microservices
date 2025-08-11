module "instances-provisioner" {
  source         = "../modules/instances-provisioner"
  AMI_ID         = local.ami_id
  ENV            = var.ENV
  APP            = var.APP
  VPC_ID         = module.main-vpc.vpc_id
  PUBLIC_SUBNETS = module.main-vpc.public_subnets
}
