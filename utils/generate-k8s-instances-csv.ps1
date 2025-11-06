"vm-name,private-ip,machine-id,region,zone,instance-type" | Out-File -FilePath "k8s-instances.csv" -Encoding UTF8

$instances = aws ec2 describe-instances --filters "Name=tag:Name,Values=k8s*" --query "Reservations[].Instances[].[Tags[?Key=='Name'].Value|[0],PrivateIpAddress,InstanceId,Placement.AvailabilityZone,InstanceType]" --output text

$instances -split "`n" | ForEach-Object {
    if ($_ -match "^(.+?)\t(.+?)\t(.+?)\t(.+?)\t(.+?)$") {
        $name = $matches[1]
        $ip = $matches[2]
        $id = $matches[3]
        $zone = $matches[4]
        $type = $matches[5]
        $region = $zone.Substring(0, $zone.Length - 1)
        "$name,$ip,$id,$region,$zone,$type" | Add-Content -Path "k8s-instances.csv"
    }
}

# Generate key.pem
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& ${ScriptDir}/get-ssh-key.ps1
# Upload k8s-instances.csv to accss VM using scp
$PUBLIC_IP = aws ec2 describe-instances --filters "Name=tag:Name,Values=CKA-access-vm" "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].PublicIpAddress" --output text
scp -o "StrictHostKeyChecking no" -i key.pem k8s-instances.csv ec2-user@${PUBLIC_IP}:/public/k8s-instances.csv