#!/bin/bash
echo "Starting deployment process..."

# S3에 파일 업로드
if [ ! -z "$S3_BUCKET_NAME" ]; then
    echo "Uploading files to S3 bucket: $S3_BUCKET_NAME"
    aws s3 sync dist/frontend/browser/ s3://$S3_BUCKET_NAME --delete
else
    echo "S3 bucket name not set"
fi

echo "Deployment process completed!"