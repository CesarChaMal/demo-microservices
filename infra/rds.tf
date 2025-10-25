resource "aws_db_subnet_group" "this" {
  name       = "${var.APP}-${var.ENV}-db-subnets"
  subnet_ids = module.main-vpc.private_subnets
}

resource "aws_security_group" "rds" {
  name        = "${var.APP}-${var.ENV}-rds-sg"
  description = "Allow MySQL from app subnets/SGs"
  vpc_id      = module.main-vpc.vpc_id

  # Restrict this to your app/task SGs or CIDRs later
  ingress {
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"] # placeholder – tighten this!
  }
  egress { from_port = 0 to_port = 0 protocol = "-1" cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_db_instance" "mysql" {
  identifier               = "${var.APP}-${var.ENV}-mysql"
  engine                   = "mysql"
  engine_version           = "8.0"
  instance_class           = "db.t4g.micro"         # often CHEAPEST paid option
  allocated_storage        = 20                     # keep small
  max_allocated_storage    = 20                     # disable auto storage growth
  storage_type             = "gp3"                  # cheaper than gp2
  username                 = var.db_username
  password                 = var.db_password
  db_subnet_group_name     = aws_db_subnet_group.this.name
  vpc_security_group_ids   = [aws_security_group.rds.id]
  publicly_accessible      = false
  multi_az                 = false
  backup_retention_period  = 0                      # disables automated backups (cheaper)
  deletion_protection      = false
  skip_final_snapshot      = true
  auto_minor_version_upgrade = true
  apply_immediately        = true
}

#resource "aws_db_instance" "mysql" {
#  identifier              = "${var.APP}-${var.ENV}-mysql"
#  engine                  = "mysql"
#  engine_version          = "8.0"
#  instance_class          = "db.t3.micro"
#  allocated_storage       = 20
#  username                = var.db_username
#  password                = var.db_password
#  db_subnet_group_name    = aws_db_subnet_group.this.name
#  vpc_security_group_ids  = [aws_security_group.rds.id] # create an SG for RDS
#  publicly_accessible     = false
#  skip_final_snapshot     = true
#  apply_immediately       = true
#}

