#!/bin/bash
set -e

echo "Starting deployment to S3..."
aws s3 rm s3://project-s3-static/ --recursive
aws s3 sync dist/frontend/browser/ s3://project-s3-static/ --delete
echo "S3 sync completed"

echo "Deployment completed successfully!"