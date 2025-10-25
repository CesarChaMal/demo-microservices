variable "AWS_ACCESS_KEY" {
  description = "AWS Access Key ID for authentication"
  type        = string
  sensitive   = true
}

variable "AWS_SECRET_KEY" {
  description = "AWS Secret Access Key for authentication"
  type        = string
  sensitive   = true
}

variable "AWS_REGION" {
  type = string
}

variable "AWS_ACCOUNT_ID" {
  type = string
}

variable "VER" {
  type = string
}

variable "ENV" {
  type = string
}

variable "APP" {
  type = string
}

variable "AMIS" {
  type = map(string)
  default = {
    eu-central-1 = "ami-074a2642e2a3737d2"
    eu-west-1    = "ami-008320af74136c628"
    eu-west-2    = "ami-004c1e61ae5d76090"
  }
}

variable "WIN_AMIS" {
  type = map(string)
  default = {
    eu-central-1 = "ami-065377970c7b7369b"
    eu-west-1    = "ami-0e59f5ff8749f81c8"
    eu-west-2    = "ami-05cf35bf39c3c0d6d"
  }
}

variable "ECS_AMIS" {
  type = map(string)
  default = {
    eu-central-1 = "ami-0b34f371a12d673de"
    eu-west-1    = "ami-060fdc00b63abc251"
    eu-west-2    = "ami-04fca4396558d03bf"
  }
}
