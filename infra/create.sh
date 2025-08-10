#!/bin/bash
set -e

echo "Checking required environment variables..."
for VAR in AWS_REGION AWS_ACCOUNT_ID APP ENV VER; do
  if [ -z "${!VAR}" ]; then
    echo "$VAR environment variable is not set"
    exit 1
  fi
done

# Set environment variables
export AWS_REGION=$AWS_REGION
export AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID
export APP=$APP
export ENV=$ENV
export VER=$VER
export BUCKET_STATE="aws-s3-bucket-state-$APP"
KEY="terraform.tfstate"
#export TF_VAR_aws_region="$AWS_REGION"
#export TF_VAR_aws_account_id="$AWS_ACCOUNT_ID"
#export TF_VAR_app="$APP"
#export TF_VAR_env="$ENV"

# Check if the bucket exists
if aws s3 ls --region $AWS_REGION "s3://$BUCKET_STATE" 2>&1 | grep -q 'NoSuchBucket\|AllAccessDisabled'; then
  echo "Bucket does not exist, creating new bucket"
  aws s3 mb "s3://$BUCKET_STATE" --region $AWS_REGION
fi

# Install dependencies and build the project
npm install
rm -rf dist/
npm run export

cd infra

# Set the backend configuration
cat <<EOF > backend.hcl
bucket = "$BUCKET_STATE"
key    = "$KEY"
region = "$AWS_REGION"
EOF

cat <<EOF > $APP.tfvars
AWS_REGION = "$AWS_REGION"
AWS_ACCOUNT_ID = "$AWS_ACCOUNT_ID"
APP = "$APP"
ENV = "$ENV"
VER = "$VER"
EOF

# Initialize Terraform for the correct workspace
#terraform init -backend-config=backend.hcl
terraform init -force-copy -backend-config=backend.hcl -var backend_bucket_name=$BUCKET_STATE -var backend_bucket_key=$KEY -var backend_bucket_region=$AWS_REGION

# Select or create the workspace
if ! terraform workspace select "$ENV" 2>/dev/null; then
    terraform workspace new "$ENV"
fi
terraform workspace new "$ENV" || terraform workspace select "$ENV"
#terraform init -force-copy -backend-config="bucket=$BUCKET_STATE" -backend-config="key=$KEY" -backend-config="region=$AWS_REGION"
#terraform init -force-copy -backend-config=backend.hcl -var backend_bucket_name=$BUCKET_STATE -var backend_bucket_key=$KEY -var backend_bucket_region=$AWS_REGION

# Format the code
terraform fmt

# Validate syntax
terraform validate


# Apply the configuration
#terraform plan -var="aws_region=$AWS_REGION" -var="aws_account_id=$AWS_ACCOUNT_ID" -var="app=$APP" -var="env=$ENV" -out out.terraform && terraform apply -auto-approve out.terraform
terraform plan -var-file=$APP.tfvars -out out.terraform && terraform apply -auto-approve out.terraform

# Get the S3 bucket name
export BUCKET=$(aws s3 ls --region $AWS_REGION | grep aws-s3-bucket-$APP | tail -n1 |cut -d ' ' -f3)
#. ~/.bash_profile
echo "Bucket name: $BUCKET"

# Run the application
cd ..
npm start
