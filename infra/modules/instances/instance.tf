resource "aws_instance" "instance" {
  ami           = var.AMI_ID
  instance_type = var.INSTANCE_TYPE

  # the VPC subnet
  subnet_id = element(var.PUBLIC_SUBNETS, 0)

  # the security group
  vpc_security_group_ids = [aws_security_group.allow-ssh.id, aws_security_group.apache.id]

  user_data = "#!/bin/bash\nsudo echo \"127.0.0.1 $(hostname)\" >> /etc/hosts"

  # the public SSH key
  key_name = aws_key_pair.mykeypair.key_name

  tags = {
    Name         = "${var.APP}-${var.ENV}-instance"
    Environmnent = var.ENV
    Application = var.APP
  }
}

