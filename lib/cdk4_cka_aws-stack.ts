import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { Vpc, IpAddresses, SubnetType, Subnet, ISubnet, SecurityGroup, Peer, Port, Instance, KeyPair, KeyPairType, MachineImage, InstanceType, InstanceClass, InstanceSize, UserData, AmazonLinuxCpuType, KeyPairFormat, BlockDeviceVolume, CfnInstance } from 'aws-cdk-lib/aws-ec2';
import { ManagedPolicy, PolicyDocument, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class Cdk4CkaAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    const USERS : number = Number(process.env.ACCESS_NUM) || 10
    const WORKERS : number = Number(process.env.WORKERS_NUM) || 1
    const REGION: string = this.region
    const K8S_VERSION : string = process.env.K8S_VERSION || "1.33"
    const ACCESS_PSW : string = process.env.ACCESS_PSW || "lab123"

    const vpc = new Vpc(this, 'CKAVPC', {
      vpcName: "CKA-vpc",
      ipAddresses: IpAddresses.cidr('192.168.0.0/20'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 26,
          name: 'CKA-access',
          subnetType: SubnetType.PUBLIC
        },
        {
          cidrMask: 26,
          name: 'CKA-clusters',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS
        }
      ]
    })
    vpc.publicSubnets.forEach((sub:ISubnet) => 
      Tags.of(sub as Subnet).add("Name", "CKA-access")
    )

    const sg = new SecurityGroup(this, "CKAsg", {
      securityGroupName: "CKA-sg",
      vpc: vpc,
      allowAllOutbound: true,
    })
    sg.addIngressRule(Peer.anyIpv4(), Port.HTTP)
    sg.addIngressRule(Peer.anyIpv4(), Port.HTTPS)
    sg.addIngressRule(Peer.anyIpv4(), Port.SSH)
    sg.addIngressRule(sg,Port.allTraffic())

    for (let port = 1; port <= USERS; port++){
      sg.addIngressRule(Peer.anyIpv4(), Port.tcp(8080 + port))
    }

    const keyPair = new KeyPair(this, 'CKAAccessKey', {
      keyPairName: 'CKA-access-keypair',
      format: KeyPairFormat.PEM,
      type: KeyPairType.ED25519,
    })

    const role = new Role(this, "CKAInstanceRole", {
      roleName: "CKA-role",
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        // POLICY FOR SC (EBS-EFS)
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
        // POLICY TO GET the SSH KEY
        "SSHkeyRetrive": PolicyDocument.fromJson({
          "Version": "2012-10-17",
          "Statement": [{
            "Effect": "Allow",
            "Action": [
                "ssm:GetParameter"
            ],
            "Resource": [
                `arn:aws:ssm:*:*:parameter/ec2/keypair/${keyPair.keyPairId}`
            ]
          },{
            "Effect": "Allow", 
            "Action": [
              "kms:Decrypt"
            ],
            "Resource": "arn:aws:kms:*:*:key/alias/aws/ssm"
          }]
        })
      }
    })

    const userData = UserData.forLinux()
    userData.addCommands(
      'sudo dnf -y install amazon-cloudwatch-agent',
      'sudo dnf install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_arm64/amazon-ssm-agent.rpm',
      'sudo systemctl start amazon-ssm-agent',
      'sudo dnf install -y docker git',
      'sudo systemctl start docker',
      'sudo usermod -a -G docker ec2-user',
      'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/arm64/kubectl"',
      'sudo mv ./kubectl /usr/local/bin/',
      'sudo chmod +x /usr/local/bin/kubectl',
      'curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"',
      'unzip ./awscliv2.zip',
      'sudo ./aws/install',
      'curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3',
      'chmod 700 get_helm.sh',
      './get_helm.sh',
      'rm ./get_helm.sh',
      'wget https://github.com/coder/code-server/releases/download/v4.104.3/code-server-4.104.3-arm64.rpm',
      'sudo dnf install -y ./code-server-4.104.3-arm64.rpm',
      'rm ./code-server-4.104.3-arm64.rpm',
      `for x in $(seq 1 ${USERS}); do useradd user$x --create-home -s /bin/bash ; echo lab123 | sudo passwd user$x --stdin; sudo usermod -a -G docker user$x; done`,
      `for x in $(seq 1 ${USERS}); do sudo su user$x -c "echo -e 'source <(kubectl completion bash) \\nalias k=kubectl \\ncomplete -o default -F __start_kubectl k' >> /home/user$x/.bashrc"; done`,
      `for x in $(seq 1 ${USERS}); do sudo su user$x -c "aws ssm get-parameter --region ${REGION} --name '/ec2/keypair/${keyPair.keyPairId}' --with-decryption --query 'Parameter.Value' --output text > /home/user$x/k8s-key && chmod 600 /home/user$x/k8s-key"; done`,
      `for x in $(seq 1 ${USERS}); do sudo su user$x -c "cd /home/user$x && PASSWORD=${ACCESS_PSW} nohup code-server --auth password --bind-addr 0.0.0.0:$((8080+$x)) &"; echo "user$x CODE-SERVER RUNNING"; done`,
      `for x in $(seq 1 ${USERS}); do sudo su user$x -c "code-server --install-extension ms-kubernetes-tools.vscode-kubernetes-tools"; done`,
      'sudo mkdir -p /public; sudo chmod 777 /public',
    )    
    const vm = new Instance(this, "CKAAccessVM", {
      vpc: vpc,
      instanceName: "CKA-access-vm",
      role: role,
      keyPair: keyPair,
      machineImage: MachineImage.latestAmazonLinux2023({
        cpuType: AmazonLinuxCpuType.ARM_64,
      }),
      instanceType: InstanceType.of(InstanceClass.M8G, InstanceSize.XLARGE4),
      securityGroup: sg,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC
      },
      userData: userData
    })

    new CfnOutput(this, "CKAAccessInstanceIP", {
      value: vm.instancePublicIp,
      key: "publicIp"
    })
  
    const k8sInitUserData = UserData.forLinux()
    k8sInitUserData.addCommands(
      /// ADD SSM & CloudWatch
      'sudo snap install amazon-ssm-agent --classic && sudo snap start amazon-ssm-agent',
      'wget https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb && sudo dpkg -i -E ./amazon-cloudwatch-agent.deb && rm ./amazon-cloudwatch-agent.deb',
      // K8s preparation
      `export K8S_VERSION=${K8S_VERSION}`,   
      `sudo apt -y update && sudo apt -y upgrade`,
      // Get rid of unattended-upgrades`
      `sudo systemctl stop unattended-upgrades`,
      `sudo apt-get -y purge unattended-upgrades`,
      // Disable swap
      `sudo swapoff -a && sed -i '/ swap / s/^\\(.*\\)$/#\\1/g' /etc/fstab`,
      // Install pkgs
      `sudo apt install -y curl nfs-utils gnupg2 software-properties-common apt-transport-https ca-certificates python3-pip jq`,
      `sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmour -o /etc/apt/trusted.gpg.d/docker.gpg && sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" && sudo apt update`,
      `sudo apt install -y containerd.io`,
      'sudo curl -fsSL https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/Release.key |  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg',
      'echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v${K8S_VERSION}/deb/ /" | sudo  tee /etc/apt/sources.list.d/kubernetes.list',
      `sudo apt update && sudo apt install -y kubelet kubeadm kubectl && sudo apt-mark hold kubelet kubeadm kubectl`,
      `sudo sed -i s"/KUBELET_EXTRA_ARGS=/KUBELET_EXTRA_ARGS=\"--fail-swap-on=false\"/" /etc/default/kubelet`,
      'CILIUM_CLI_VERSION=$(curl -s https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt)',
      'curl -L --fail --remote-name-all https://github.com/cilium/cilium-cli/releases/download/${CILIUM_CLI_VERSION}/cilium-linux-amd64.tar.gz',
      'sudo tar xzvfC cilium-linux-amd64.tar.gz /usr/local/bin',
      'rm cilium-linux-amd64.tar.gz',
      // Adjust containerd
      `containerd config default | sudo tee /etc/containerd/config.toml >/dev/null 2>&1`,
      `sudo sed -i 's/SystemdCgroup \\= false/SystemdCgroup \\= true/g' /etc/containerd/config.toml `,
      // Enable CR & Kubelet
      `sudo systemctl enable containerd`,
      `sudo systemctl enable kubelet`,
      // Huge page support
      `echo 1024 | sudo tee /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages`,
      `echo vm.nr_hugepages = 1024 | sudo tee -a /etc/sysctl.conf`,
      // Kernel Params
      `cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf`,
      `overlay`,
      `br_netfilter`,
      `nvme-tcp`,
      `EOF`,
      `sudo modprobe overlay`,
      `sudo modprobe br_netfilter`,
      `sudo modprobe nvme_tcp`,
      `cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf`,
      `net.bridge.bridge-nf-call-iptables  = 1`,
      `net.bridge.bridge-nf-call-ip6tables = 1`,
      `net.ipv4.ip_forward                 = 1`,
      `EOF`,
      `sudo sysctl --system`,
      `sudo touch /READY`,
      `sleep 10`,
      `sudo reboot now`
    )
    
    for (let x = 1; x <= USERS; x++) {
      let cpVm = new Instance(this, `K8sCP${x}`, {
        vpc: vpc,
        instanceName: `k8s-cp${x}`,
        role: role,
        keyPair: keyPair,
        machineImage: MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'),
        instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
        securityGroup: sg,
        vpcSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS
        },
        blockDevices: [
          {
            deviceName: '/dev/sda1',
            volume: BlockDeviceVolume.ebs(20)
          }
        ],
        userData: k8sInitUserData
      })
      cpVm.instance.metadataOptions = { ...cpVm.instance.metadataOptions, httpPutResponseHopLimit: 3,}
      Tags.of(cpVm).add("USER", `user${x}`)

      for (let y = 1; y <= WORKERS; y++) {
        let wVm = new Instance(this, `K8sW${x}${y}`, {
          vpc: vpc,
          instanceName: `k8s-w${x}-${y}`,
          role: role,
          keyPair: keyPair,
          machineImage: MachineImage.fromSsmParameter('/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'),
          instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
          securityGroup: sg,
          vpcSubnets: {
            subnetType: SubnetType.PRIVATE_WITH_EGRESS
          },
          blockDevices: [
            {
              deviceName: '/dev/sda1',
              volume: BlockDeviceVolume.ebs(20)
            }
          ],
          userData: k8sInitUserData
        })
        wVm.instance.metadataOptions = { ...cpVm.instance.metadataOptions, httpPutResponseHopLimit: 3,}
        Tags.of(wVm).add("USER", `user${x}`)
      }
    }
  }
}
