# Get the public IP of the CKA access VM
$PUBLIC_IP = aws ec2 describe-instances `
    --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" `
    --query "Reservations[].Instances[].PublicIpAddress" `
    --output text

Write-Host "[*] Copying node-patch.sh to remote host..."
$scriptPath = Join-Path $PSScriptRoot "node-patch.sh"
scp -i key.pem $scriptPath "ec2-user@${PUBLIC_IP}:/tmp/node-patch.sh"

Write-Host "[*] Setting execute permissions and running patch script..."
ssh -i key.pem "ec2-user@${PUBLIC_IP}" "chmod +x /tmp/node-patch.sh && sudo /tmp/node-patch.sh"

Write-Host "[*] Node patching completed"
