#!/bin/bash
set -e

if [ -z "$APP" ]; then
  echo "APP environment variable is not set"
  exit 1
fi

if [ -z "$ENV" ]; then
  echo "ENV environment variable is not set"
  exit 1
fi

if [ -z "$VER" ]; then
  echo "VER environment variable is not set"
  exit 1
fi

cd infra
terraform init -force-copy && terraform destroy -auto-approve -var-file=$APP.tfvars
#rm -rf .terraform/
