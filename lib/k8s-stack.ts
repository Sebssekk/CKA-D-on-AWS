import { Duration, NestedStack, Stack, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { K8sStackProps } from "./types";
import { BlockDeviceVolume, CloudFormationInit, InitCommand, InitConfig, Instance, InstanceClass, InstanceSize, InstanceType, MachineImage, SubnetType, UserData } from "aws-cdk-lib/aws-ec2";
import { ManagedPolicy, PolicyDocument, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

export class K8sStack extends Stack {
    constructor(scope: Construct, id: string, props: K8sStackProps) {
        super(scope, id, props);
        
        const initData = CloudFormationInit.fromConfigSets({
            configSets: {
                k8sPrep: ['aws','osPrep', 'cilium', 'etcd','kernelPrep','kubeStart'],
                k8sCP: ['masterInit'],
                k8sW: ['workerInit']
            },
            configs:{
                aws: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo snap install amazon-ssm-agent --classic 
                        sudo snap start amazon-ssm-agent
                        sudo wget https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb 
                        sudo dpkg -i -E ./amazon-cloudwatch-agent.deb
                        sudo rm ./amazon-cloudwatch-agent.deb
                        sudo snap install aws-cli --classic
                        `)
                ]),
                osPrep: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo apt-get -y update && sudo apt-get -y upgrade
                        sudo systemctl stop unattended-upgrades
                        sudo apt-get -y purge unattended-upgrades
                        
                        sudo swapoff -a && sed -i '/ swap / s/^\\(.*\\)$/#\\1/g' /etc/fstab

                        sudo apt-get install -y curl nfs-utils gnupg2 software-properties-common apt-transport-https ca-certificates python3-pip jq

                        sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmour -o /etc/apt/trusted.gpg.d/docker.gpg && sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" && sudo apt-get update
                        sudo apt-get install -y containerd.io
                        containerd config default | sudo tee /etc/containerd/config.toml >/dev/null 2>&1
                        # sudo sed -i 's/SystemdCgroup \\= false/SystemdCgroup \\= true/g' /etc/containerd/config.toml
                        sudo systemctl enable containerd

                        sudo curl -fsSL https://pkgs.k8s.io/core:/stable:/v$K8S_VERSION/deb/Release.key |  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
                        echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v$K8S_VERSION/deb/ /" | sudo  tee /etc/apt/sources.list.d/kubernetes.list
                        sudo apt-get update && sudo apt-get install -y kubelet kubeadm kubectl && sudo apt-mark hold kubelet kubeadm kubectl
                        # sudo sed -i s"/KUBELET_EXTRA_ARGS=/KUBELET_EXTRA_ARGS=\"--fail-swap-on=false\"/" /etc/default/kubelet
                        sudo systemctl enable kubelet
                        `,{
                            env: {
                                K8S_VERSION: props.K8S_VERSION
                            }
                        }),
                ]),
                cilium: new InitConfig([
                    InitCommand.shellCommand(`
                       CILIUM_CLI_VERSION=$(curl -s https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt)
                       curl -L --fail --remote-name-all https://github.com/cilium/cilium-cli/releases/download/$CILIUM_CLI_VERSION/cilium-linux-amd64.tar.gz
                       sudo tar xzvfC cilium-linux-amd64.tar.gz /usr/local/bin
                       rm cilium-linux-amd64.tar.gz
                       `)
                ]),
                etcd: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo curl -SLO https://github.com/etcd-io/etcd/releases/download/$\{ETCD_VERSION\}/etcd-$\{ETCD_VERSION\}-linux-amd64.tar.gz
                        sudo tar -xzvf etcd-$\{ETCD_VERSION\}-linux-amd64.tar.gz
                        sudo cp etcd-$\{ETCD_VERSION\}-linux-amd64/etcd* /usr/bin/
                        sudo rm etcd-$\{ETCD_VERSION\}-linux-amd64.tar.gz
                        sudo rm -r etcd-$\{ETCD_VERSION\}-linux-amd64
                        `, {
                            env: {
                                ETCD_VERSION: props.ETCD_VERSION
                            }
                        })
                ]),
                kernelPrep: new InitConfig([
                    InitCommand.shellCommand(`
                        echo 1024 | sudo tee /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages
                        echo vm.nr_hugepages = 1024 | sudo tee -a /etc/sysctl.conf
                        cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
nvme-tcp
EOF
                        sudo modprobe overlay
                        sudo modprobe br_netfilter
                        sudo modprobe nvme_tcp
                        cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
                        sudo systemctl restart systemd-modules-load.service
                        sudo sysctl --system`)
                ]),
                kubeStart: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo systemctl start containerd
                        sudo systemctl start kubelet
                        sleep 10
                        sudo systemctl restart containerd`)
                ]),
                masterInit: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo kubeadm init --pod-network-cidr 172.16.0.0/16
                        sudo mkdir -p /home/ubuntu/.kube/
                        sudo cp /etc/kubernetes/admin.conf /home/ubuntu/.kube/config
                        sudo chown -R ubuntu:ubuntu /home/ubuntu/.kube
                        sudo su ubuntu -c "cilium install --version $CILIUM_VERSION --set ipam.mode=kubernetes"
                        sudo kubeadm token create --print-join-command | sudo tee /tmp/join.me
                        sudo chown ubuntu:ubuntu /tmp/join.me
                        `, {env: {
                            CILIUM_VERSION: props.CILIUM_VERSION
                        }}),
                    ]),
                workerInit: new InitConfig([
                    InitCommand.shellCommand(`
                        TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
                        USER=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/USER)
                        X=$(echo "$USER" | cut -c 5-)
                        aws ec2 wait instance-running --region ${props.REGION} --filters "Name=tag:Name,Values=k8s-cp$X"
                        CP_IP=$(aws ec2 describe-instances \
                            --region ${props.REGION} \
                            --filters "Name=tag:Name,Values=k8s-cp$X" "Name=instance-state-name,Values=running" \
                            --query 'Reservations[].Instances[].PrivateIpAddress' \
                            --output text )
                        sudo aws ssm get-parameter --region ${props.REGION} --name '/ec2/keypair/${props.keyPair.keyPairId}' --with-decryption --query 'Parameter.Value' --output text | sudo tee /tmp/key 
                        sudo chmod 600 /tmp/key
                        
                        ATTEMPT_COUNT=1
                        while true; do
                            if [ $ATTEMPT_COUNT -ge 12 ]; then
                                echo "Maximum attempts reached. Target file not found. Exiting."
                                 exit 1
                            fi
                            sudo ssh -o "StrictHostKeyChecking no" -i /tmp/key ubuntu@$\{CP_IP\} "test -f /tmp/join.me"
        
                            if [ $? -eq 0 ]; then
                                break 
                            fi
    
                            ATTEMPT_COUNT=$((ATTEMPT_COUNT + 1))
                                sleep 10
                        done
                        sudo scp -o "StrictHostKeyChecking no" -i /tmp/key ubuntu@$\{CP_IP\}:/tmp/join.me /tmp/join.me
                        sudo chmod +x /tmp/join.me
                        sudo /tmp/join.me
                        `)            
                ])
            }
        })

        
        
        const role = new Role(this, "CKAInstanceRole", {
            roleName: "CKA-K8s-Node-role",
            assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
                ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEBSCSIDriverPolicy'),
                ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEFSCSIDriverPolicy'),
            ],
            inlinePolicies: {
                // POLICY FOR LB/INGRESS
                "CKALBPolicy": PolicyDocument.fromJson({
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Action": [
                                "iam:CreateServiceLinkedRole"
                            ],
                            "Resource": "*",
                            "Condition": {
                                "StringEquals": {
                                    "iam:AWSServiceName": "elasticloadbalancing.amazonaws.com"
                                }
                            }
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "ec2:DescribeAccountAttributes",
                                "ec2:DescribeAddresses",
                                "ec2:DescribeAvailabilityZones",
                                "ec2:DescribeInternetGateways",
                                "ec2:DescribeVpcs",
                                "ec2:DescribeVpcPeeringConnections",
                                "ec2:DescribeSubnets",
                                "ec2:DescribeSecurityGroups",
                                "ec2:DescribeInstances",
                                "ec2:DescribeNetworkInterfaces",
                                "ec2:DescribeTags",
                                "ec2:GetCoipPoolUsage",
                                "ec2:DescribeCoipPools",
                                "ec2:GetSecurityGroupsForVpc",
                                "ec2:DescribeIpamPools",
                                "ec2:DescribeRouteTables",
                                "elasticloadbalancing:DescribeLoadBalancers",
                                "elasticloadbalancing:DescribeLoadBalancerAttributes",
                                "elasticloadbalancing:DescribeListeners",
                                "elasticloadbalancing:DescribeListenerCertificates",
                                "elasticloadbalancing:DescribeSSLPolicies",
                                "elasticloadbalancing:DescribeRules",
                                "elasticloadbalancing:DescribeTargetGroups",
                                "elasticloadbalancing:DescribeTargetGroupAttributes",
                                "elasticloadbalancing:DescribeTargetHealth",
                                "elasticloadbalancing:DescribeTags",
                                "elasticloadbalancing:DescribeTrustStores",
                                "elasticloadbalancing:DescribeListenerAttributes",
                                "elasticloadbalancing:DescribeCapacityReservation"
                            ],
                            "Resource": "*"
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "cognito-idp:DescribeUserPoolClient",
                                "acm:ListCertificates",
                                "acm:DescribeCertificate",
                                "iam:ListServerCertificates",
                                "iam:GetServerCertificate",
                                "waf-regional:GetWebACL",
                                "waf-regional:GetWebACLForResource",
                                "waf-regional:AssociateWebACL",
                                "waf-regional:DisassociateWebACL",
                                "wafv2:GetWebACL",
                                "wafv2:GetWebACLForResource",
                                "wafv2:AssociateWebACL",
                                "wafv2:DisassociateWebACL",
                                "shield:GetSubscriptionState",
                                "shield:DescribeProtection",
                                "shield:CreateProtection",
                                "shield:DeleteProtection"
                            ],
                            "Resource": "*"
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "ec2:AuthorizeSecurityGroupIngress",
                                "ec2:RevokeSecurityGroupIngress"
                            ],
                            "Resource": "*"
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "ec2:CreateSecurityGroup"
                            ],
                            "Resource": "*"
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "ec2:CreateTags"
                            ],
                            "Resource": "arn:aws:ec2:*:*:security-group/*",
                            "Condition": {
                                "StringEquals": {
                                    "ec2:CreateAction": "CreateSecurityGroup"
                                },
                                "Null": {
                                    "aws:RequestTag/elbv2.k8s.aws/cluster": "false"
                                }
                            }
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "ec2:CreateTags",
                                "ec2:DeleteTags"
                            ],
                            "Resource": "arn:aws:ec2:*:*:security-group/*",
                            "Condition": {
                                "Null": {
                                    "aws:RequestTag/elbv2.k8s.aws/cluster": "true",
                                    "aws:ResourceTag/elbv2.k8s.aws/cluster": "false"
                                }
                            }
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "ec2:AuthorizeSecurityGroupIngress",
                                "ec2:RevokeSecurityGroupIngress",
                                "ec2:DeleteSecurityGroup"
                            ],
                            "Resource": "*",
                            "Condition": {
                                "Null": {
                                    "aws:ResourceTag/elbv2.k8s.aws/cluster": "false"
                                }
                            }
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "elasticloadbalancing:CreateLoadBalancer",
                                "elasticloadbalancing:CreateTargetGroup"
                            ],
                            "Resource": "*",
                            "Condition": {
                                "Null": {
                                    "aws:RequestTag/elbv2.k8s.aws/cluster": "false"
                                }
                            }
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "elasticloadbalancing:CreateListener",
                                "elasticloadbalancing:DeleteListener",
                                "elasticloadbalancing:CreateRule",
                                "elasticloadbalancing:DeleteRule"
                            ],
                            "Resource": "*"
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "elasticloadbalancing:AddTags",
                                "elasticloadbalancing:RemoveTags"
                            ],
                            "Resource": [
                                "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*",
                                "arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*",
                                "arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*"
                            ],
                            "Condition": {
                                "Null": {
                                    "aws:RequestTag/elbv2.k8s.aws/cluster": "true",
                                    "aws:ResourceTag/elbv2.k8s.aws/cluster": "false"
                                }
                            }
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "elasticloadbalancing:AddTags",
                                "elasticloadbalancing:RemoveTags"
                            ],
                            "Resource": [
                                "arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*",
                                "arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*",
                                "arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*",
                                "arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*"
                            ]
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "elasticloadbalancing:ModifyLoadBalancerAttributes",
                                "elasticloadbalancing:SetIpAddressType",
                                "elasticloadbalancing:SetSecurityGroups",
                                "elasticloadbalancing:SetSubnets",
                                "elasticloadbalancing:DeleteLoadBalancer",
                                "elasticloadbalancing:ModifyTargetGroup",
                                "elasticloadbalancing:ModifyTargetGroupAttributes",
                                "elasticloadbalancing:DeleteTargetGroup",
                                "elasticloadbalancing:ModifyListenerAttributes",
                                "elasticloadbalancing:ModifyCapacityReservation",
                                "elasticloadbalancing:ModifyIpPools"
                            ],
                            "Resource": "*",
                            "Condition": {
                                "Null": {
                                    "aws:ResourceTag/elbv2.k8s.aws/cluster": "false"
                                }
                            }
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "elasticloadbalancing:AddTags"
                            ],
                            "Resource": [
                                "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*",
                                "arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*",
                                "arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*"
                            ],
                            "Condition": {
                                "StringEquals": {
                                    "elasticloadbalancing:CreateAction": [
                                        "CreateTargetGroup",
                                        "CreateLoadBalancer"
                                    ]
                                },
                                "Null": {
                                    "aws:RequestTag/elbv2.k8s.aws/cluster": "false"
                                }
                            }
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "elasticloadbalancing:RegisterTargets",
                                "elasticloadbalancing:DeregisterTargets"
                            ],
                            "Resource": "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*"
                        },
                        {
                            "Effect": "Allow",
                            "Action": [
                                "elasticloadbalancing:SetWebAcl",
                                "elasticloadbalancing:ModifyListener",
                                "elasticloadbalancing:AddListenerCertificates",
                                "elasticloadbalancing:RemoveListenerCertificates",
                                "elasticloadbalancing:ModifyRule",
                                "elasticloadbalancing:SetRulePriorities"
                            ],
                            "Resource": "*"
                        }
                    ]
                }),
                "K8sGetSSHKey": PolicyDocument.fromJson({
                    "Version": "2012-10-17",
                    "Statement": [{
                      "Effect": "Allow",
                      "Action": [
                          "ssm:GetParameter"
                      ],
                      "Resource": [
                          `arn:aws:ssm:*:*:parameter/ec2/keypair/${props.keyPair.keyPairId}`
                      ]
                    },{
                      "Effect": "Allow", 
                      "Action": [
                        "kms:Decrypt"
                      ],
                      "Resource": "arn:aws:kms:*:*:key/alias/aws/ssm"
                    }]
                }) ,
                "K8sDescribeInstances": PolicyDocument.fromJson({
                    "Version": "2012-10-17",
                    "Statement": [{
                      "Effect": "Allow",
                      "Action": [
                          "ec2:DescribeInstances",
                          "ec2:DescribeTags"
                      ],
                      "Resource": "*"
                    }]
                })   
            }
        })
        
        const userDataString = `sudo apt-get update
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 ; do
    echo "Waiting for other apt-get instances to exit"
    sleep 2
done
sudo apt-get install -y python3-pip
mkdir -p /opt/aws/bin
pip install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz --break-system-packages
ln -s /usr/local/bin/cfn-* /opt/aws/bin/
`

        for (let x = 1; x <= props.CLUSTERS_NUM; x++) {
            
            let cpUserData = UserData.forLinux()
            cpUserData.addCommands(userDataString)
            
            let cpVm = new Instance(this, `K8sCP${x}`, {  
                vpc: props.vpc,
                instanceName: `k8s-cp${x}`,
                role: role,
                keyPair: props.keyPair,
                machineImage: MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'),
                instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
                securityGroup: props.sg,
                vpcSubnets: {
                  subnetType: SubnetType.PRIVATE_WITH_EGRESS
                },
                blockDevices: [
                  {
                    deviceName: '/dev/sda1',
                    volume: BlockDeviceVolume.ebs(20)
                  }
                ],
                userData: cpUserData,
                init: initData,
                initOptions: {
                    timeout: Duration.minutes(15),
                    configSets: ['k8sPrep', ...props.CLUSTERS_READY ? ['k8sCP'] : []],
                    ignoreFailures: true
                }
            })
            cpVm.instance.metadataOptions = { ...cpVm.instance.metadataOptions, httpPutResponseHopLimit: 3,instanceMetadataTags: "enabled"}
            Tags.of(cpVm).add("USER", `user${x}`)

            for (let y = 1; y <= props.WORKERS_NUM; y++) {
              
              let wUserData = UserData.forLinux()
              wUserData.addCommands(userDataString)
              
              let wVm = new Instance(this, `K8sW${x}${y}`, {
                vpc: props.vpc,
                instanceName: `k8s-w${x}-${y}`,
                role: role,
                keyPair: props.keyPair,
                machineImage: MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'),
                instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
                securityGroup: props.sg,
                vpcSubnets: {
                  subnetType: SubnetType.PRIVATE_WITH_EGRESS
                },
                blockDevices: [
                  {
                    deviceName: '/dev/sda1',
                    volume: BlockDeviceVolume.ebs(20)
                  }
                ],
                userData: wUserData,
                init: initData,
                initOptions: {
                    timeout: Duration.minutes(15),
                    configSets: ['k8sPrep', ...props.CLUSTERS_READY ? ['k8sW']: []],
                    ignoreFailures: true
                }
              })
              wVm.instance.metadataOptions = { ...cpVm.instance.metadataOptions, httpPutResponseHopLimit: 3,instanceMetadataTags: "enabled"}
              Tags.of(wVm).add("USER", `user${x}`)
            }
        }
    }
}