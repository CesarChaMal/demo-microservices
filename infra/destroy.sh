#!/bin/bash
set -e

echo "Checking required environment variables..."
for VAR in AWS_REGION AWS_ACCOUNT_ID APP ENV VER; do
  if [ -z "${!VAR}" ]; then
    echo "$VAR environment variable is not set"
    exit 1
  fi
done

export BUCKET_STATE="aws-s3-bucket-state-$APP"
KEY="terraform.tfstate"

# Clean up previous state
rm -rf .terraform
rm -f .terraform.lock.hcl

# Check if the bucket exists
if aws s3 ls --region $AWS_REGION "s3://$BUCKET_STATE" 2>&1 | grep -q 'NoSuchBucket\|AllAccessDisabled'; then
  echo "Bucket does not exist, creating new bucket"
  aws s3 mb "s3://$BUCKET_STATE" --region $AWS_REGION
fi

cd infra
if ! terraform workspace select "$ENV" 2>/dev/null; then
    terraform workspace new "$ENV"
fi
#terraform workspace new "$ENV" || terraform workspace select "$ENV"
terraform init -force-copy && terraform destroy -auto-approve -var-file=$APP.tfvars
#rm -rf .terraform/
