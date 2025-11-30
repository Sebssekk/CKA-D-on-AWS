$instanceIds = aws ec2 describe-instances --filters "Name=tag:Name,Values=k8s*,CKA-access-vm" "Name=instance-state-name,Values=stopped" --query "Reservations[].Instances[].InstanceId" --output text
$instanceIds -split "`t" | ForEach-Object { aws ec2 start-instances --instance-ids $_ }

# Wait for CKA-access-vm to be in the running state
Write-Host "Waiting for CKA-access-vm to be running..."
aws ec2 wait instance-running --filters "Name=tag:Name,Values=CKA-access-vm"

Write-Host "[>] Editor starting at $PUBLIC_IP"