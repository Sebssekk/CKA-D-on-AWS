$instanceIds = aws ec2 describe-instances --filters "Name=tag:Name,Values=k8s*,CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].InstanceId" --output text

if (-not $instanceIds) {
    Write-Host "No running instances found to stop."
    return
}

$instanceIds -split "`t" | ForEach-Object { aws ec2 stop-instances --instance-ids $_ }
