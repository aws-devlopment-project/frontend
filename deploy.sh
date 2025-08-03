#!/bin/bash
set -e

echo "Starting deployment to S3..."
aws s3 sync dist/frontend/browser/ s3://project-s3-static/ --delete
echo "S3 sync completed"

echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id E22CPWL5EUIR76 --paths "/*"
echo "CloudFront invalidation started"

echo "Deployment completed successfully!"