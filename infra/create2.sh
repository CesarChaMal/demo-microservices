#!/bin/bash
set -e

# Set environment variables
export AWS_REGION="eu-central-1"
export AWS_ACCOUNT_ID="774145483743"
export APP="simple-backend-assignment-ts"
export ENV="dev"
export BUCKET_STATE="aws-s3-bucket-state-$APP"
export KEY="terraform.tfstate"

# Check if the bucket exists
if aws s3 ls --region $AWS_REGION "s3://$BUCKET_STATE" 2>&1 | grep -q 'NoSuchBucket\|AllAccessDisabled'; then
  echo "Bucket does not exist, creating new bucket"
  aws s3 mb "s3://$BUCKET_STATE" --region $AWS_REGION
fi

# Install dependencies and build the project
npm install
npm run export

cd infra

# Set the backend configuration
cat <<EOF > backend.hcl
bucket = "$BUCKET_STATE"
key    = "terraform.tfstate"
region = "$AWS_REGION"
EOF

cat <<EOF > $APP.tfvars
AWS_REGION = "$AWS_REGION"
AWS_ACCOUNT_ID = "$AWS_ACCOUNT_ID"
APP = "$APP"
ENV = "$ENV"
EOF

# Initialize Terraform for the correct workspace
terraform init -force-copy -backend-config=backend.hcl -var backend_bucket_name=$BUCKET_STATE -var backend_bucket_key=$KEY -var backend_bucket_region=$AWS_REGION

# Apply the configuration
terraform plan -var-file=$APP.tfvars -out out.terraform && terraform apply -auto-approve out.terraform

# Get the S3 bucket name
export BUCKET=$(aws s3 ls --region $AWS_REGION | grep aws-s3-bucket-$APP | tail -n1 | cut -d ' ' -f3)

echo "Bucket name: $BUCKET"

# Run the application
cd ..
npm start
