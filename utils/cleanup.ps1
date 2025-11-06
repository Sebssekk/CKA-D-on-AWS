# Delete remained volumes from pvc
$volumes = aws ec2 describe-volumes --filters "Name=tag-key,Values=kubernetes.io/created-for/pvc/name" --query "Volumes[].VolumeId" --output text

if (-not $volumes) {
    Write-Host "No volumes found to delete."
} else {
    $volumes.Split() | ForEach-Object { aws ec2 delete-volume --volume-id $_ }
}

# Delete remained load balancers created by Kubernetes
$loadBalancers = aws elbv2 describe-load-balancers --query "LoadBalancers[].LoadBalancerArn" --output text

if (-not $loadBalancers) {
    Write-Host "No load balancers found to delete."
} else {
    $loadBalancers.Split() | ForEach-Object {
        $tags = aws elbv2 describe-tags --resource-arns $_ --query "TagDescriptions[0].Tags[?starts_with(Key, 'service.k8s.aws')].Key" --output text
        if ($tags) {
            aws elbv2 delete-load-balancer --load-balancer-arn $_
        }
    }
}

