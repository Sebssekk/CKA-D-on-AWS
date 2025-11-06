#!/bin/bash
set -x

# Delete remained volumes from pvc
volumes=$(aws ec2 describe-volumes --filters "Name=tag-key,Values=kubernetes.io/created-for/pvc/name" --query "Volumes[].VolumeId" --output text)

if [ -z "$volumes" ]; then
    echo "No volumes found to delete."
else
    for volume in $volumes; do
        aws ec2 delete-volume --volume-id "$volume"
    done
fi

# Delete remained load balancers created by Kubernetes
load_balancers=$(aws elbv2 describe-load-balancers --query "LoadBalancers[].LoadBalancerArn" --output text)

if [ -z "$load_balancers" ]; then
    echo "No load balancers found to delete."
else
    for lb in $load_balancers; do
        tags=$(aws elbv2 describe-tags --resource-arns "$lb" --query "TagDescriptions[0].Tags[?starts_with(Key, 'service.k8s.aws')].Key" --output text)
        if [ -n "$tags" ]; then
            aws elbv2 delete-load-balancer --load-balancer-arn "$lb"
        fi
    done
fi

