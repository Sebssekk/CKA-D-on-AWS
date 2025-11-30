#!/bin/bash

STACK_NAME=$(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE CREATE_IN_PROGRESS UPDATE_COMPLETE UPDATE_IN_PROGRESS ROLLBACK_COMPLETE ROLLBACK_IN_PROGRESS UPDATE_ROLLBACK_COMPLETE UPDATE_ROLLBACK_IN_PROGRESS \
                --query "StackSummaries[?starts_with(StackName, 'Cdk4CkaAwsStackCKAK8sStack')].StackName" \
                --output text)

POLL_INTERVAL=10 # Seconds
while true; do
    STATUS=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --query 'Stacks[0].StackStatus' \
        --output text)
    if [ "$STATUS" == "CREATE_COMPLETE" ] || [ "$STATUS" == "UPDATE_COMPLETE" ]; then
        break
    fi

    # Check for failure (any status containing 'FAIL' or 'ROLLBACK')
    if [[ "$STATUS" == *FAIL* ]] || [[ "$STATUS" == *ROLLBACK* ]]; then
        exit 1
    fi
    sleep $POLL_INTERVAL
done
INSTANCES=$(aws cloudformation list-stack-resources \
    --stack-name $STACK_NAME \
    --query "StackResourceSummaries[?ResourceType=='AWS::EC2::Instance'].[PhysicalResourceId]"  \
    --output text)

echo "user,CP,Workers" > /public/user-instances.csv

CPs=''
WKs=''

for x in $(seq 1 $CLUSTERS_NUM); do
    user="user$x"
    cp=$(aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" "Name=tag:USER,Values=$user" "Name=tag:Name,Values=k8s-cp$x"  --query "Reservations[].Instances[].PrivateIpAddress" --output text)
    workers=$(aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" "Name=tag:USER,Values=$user" "Name=tag:Name,Values=k8s-w$x-*" --query "Reservations[].Instances[].PrivateIpAddress" --output text | tr '\t' ' ')
    echo "$user,$cp,$workers" >> /public/user-instances.csv

    CPs="${CPs}m$x  ansible_host=${cp}\\n"
    worker_num=1
    for worker in $workers; do
        WKs="${WKs}w$x-$worker_num  ansible_host=$worker\\n"
        worker_num=$((worker_num+1))
    done
done

pip install ansible # --break-system-packages

sudo mkdir -p /etc/ansible

cat | sudo tee /etc/ansible/ansible.cfg << EOF
[defaults]
host_key_checking = False
inventory = /etc/ansible/inventory.ini
EOF

cat | sudo tee /etc/ansible/inventory.ini << EOF
[cps]
$CPs
[workers]
$WKs
[all:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=/public/k8s-key
EOF

sudo chmod +r /etc/ansible/*

echo "vm-name,private-ip,machine-id,region,zone,instance-type" > /public/k8s-instances.csv

aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" "Name=tag:Name,Values=k8s*" --query "Reservations[].Instances[].[Tags[?Key=='Name'].Value|[0],PrivateIpAddress,InstanceId,Placement.AvailabilityZone,InstanceType]" --output text | while read -r name ip id zone type; do
    region=${zone%?}
    echo "$name,$ip,$id,$region,$zone,$type" >> /public/k8s-instances.csv
done
