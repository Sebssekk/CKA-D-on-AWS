import { CfnOutput, Duration, NestedStack, Stack, StackProps } from "aws-cdk-lib";
import { AmazonLinuxCpuType, BlockDeviceVolume, CfnInstance, CloudFormationInit, InitCommand, InitConfig, InitFile, Instance, InstanceClass, InstanceSize, InstanceType, MachineImage, SubnetType, UserData } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { AccessStackProps } from "./types";
import { ManagedPolicy, PolicyDocument, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

export class AccessStack extends Stack {
    constructor(scope: Construct, id: string, props: AccessStackProps) {
        super(scope, id, props);
        
        const initData = CloudFormationInit.fromConfigSets({
            configSets: {
                access: ['codeServerService','aws','docker','kubernetes','tools','userInit','getClustersDetails']
            },
            configs:{
                codeServerService: new InitConfig([
                    InitFile.fromFileInline(
                        "/opt/setup-cert.sh",
                        "./code-server-services/setup-cert.sh",
                        {
                            mode: "0744",
                            owner: "root",
                            group: "root"
                        }),
                    InitFile.fromFileInline(
                        "/etc/systemd/system/cert-setup.service",
                        "./code-server-services/cert-setup.service",
                        {
                            mode: "0644",
                            owner: "root",
                            group: "root"
                        }),
                    InitFile.fromFileInline(
                        "/etc/systemd/system/code-server@.service",
                        "./code-server-services/code-server@.service",
                        {
                            mode: "0644",
                            owner: "root",
                            group: "root"
                        }),
                    InitCommand.shellCommand(`
                        sudo mkdir -p /public
                        sudo chmod 777 /public
                        sudo systemctl daemon-reload
                        sudo systemctl enable --now cert-setup.service
                        `,)
                ]),
                aws: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo dnf -y install amazon-cloudwatch-agent
                        sudo dnf install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_arm64/amazon-ssm-agent.rpm
                        sudo systemctl start amazon-ssm-agent
                        sudo curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
                        sudo unzip ./awscliv2.zip
                        sudo ./aws/install
                        sudo rm ./awscliv2.zip
                        sudo rm -rf ./aws
                        `
                    )
                ]),
                docker: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo dnf install -y docker
                        sudo systemctl enable --now docker
                        sudo usermod -a -G docker ec2-user`)
                ]),
                kubernetes: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/arm64/kubectl"
                        sudo mv ./kubectl /usr/local/bin/
                        sudo chmod +x /usr/local/bin/kubectl
                        sudo curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
                        sudo chmod 700 get_helm.sh
                        sudo ./get_helm.sh
                        sudo rm ./get_helm.sh`)
                ]),
                tools: new InitConfig([
                    InitCommand.shellCommand(`
                        sudo dnf install -y git python3-pip
                        wget https://github.com/coder/code-server/releases/download/v4.104.3/code-server-4.104.3-arm64.rpm
                        sudo dnf install -y ./code-server-4.104.3-arm64.rpm
                        rm ./code-server-4.104.3-arm64.rpm
                        `)
                ]),
                userInit: new InitConfig([
                    InitCommand.shellCommand(`
                        for x in $(seq 1 ${props.ACCESS_NUM}); do 
                            useradd user$x --create-home -s /bin/bash 
                            echo ${props.ACCESS_PSW} | sudo passwd user$x --stdin
                            sudo usermod -a -G docker user$x
                            sudo su user$x -c "echo -e 'source <(kubectl completion bash) \\nalias k=kubectl \\ncomplete -o default -F __start_kubectl k' >> /home/user$x/.bashrc"
                            sudo su user$x -c "aws ssm get-parameter --region ${props.REGION} --name '/ec2/keypair/${props.keyPair.keyPairId}' --with-decryption --query 'Parameter.Value' --output text > /home/user$x/k8s-key && chmod 600 /home/user$x/k8s-key"
                            sudo systemctl enable --now code-server@$x.service
                            sudo su user$x -c "code-server --install-extension ms-kubernetes-tools.vscode-kubernetes-tools"
                        done`)
                ]),
                getClustersDetails: new InitConfig([
                    InitFile.fromFileInline('/opt/get-clusters-details.sh',
                        './access-helpers/get-clusters-details.sh',
                        {
                            owner: 'root',
                            group: 'root',
                            mode: "0744"
                        }
                    ),
                    InitCommand.shellCommand('/opt/get-clusters-details.sh',{
                        env: {
                            CLUSTERS_NUM : props.CLUSTERS_NUM.toString()
                        }
                    }),
                    InitFile.fromFileInline('/public/aws-node-patch.sh',
                        './access-helpers/aws-node-patch.sh',
                        {
                            owner: 'root',
                            group: 'root',
                            mode: "0777"
                        }
                    )
                ])
            }
        })
        
        const role = new Role(this, "CKAInstanceRole", {
          roleName: "CKA-access-node-role",
          assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
          managedPolicies: [
            ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
            ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
            ],
          inlinePolicies: {
            // POLICY TO GET the SSH KEY
            "SSHkeyRetrive": PolicyDocument.fromJson({
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
            }),
            // POLICY TO GET CLOUDFORMATION RESOURCES
            "GET_CF_RESOURCES" : PolicyDocument.fromJson({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            "cloudformation:DescribeStacks",
                            "cloudformation:ListStacks",
                            "cloudformation:ListStackResources",
                            "cloudformation:DescribeStackEvents",
                            "ec2:DescribeInstances"
                        ],
                        "Resource": "*"
                    }
                ]
            }),
            // POLICY TO GET K8S Machines Details
          }
        })

        const vm = new Instance(this, "CKAAccessVM", {
          vpc: props.vpc,
          instanceName: "CKA-access-vm",
          role: role,
          keyPair: props.keyPair,
          machineImage: MachineImage.latestAmazonLinux2023({
            cpuType: AmazonLinuxCpuType.ARM_64,
          }),
          instanceType: InstanceType.of(InstanceClass.M8G, InstanceSize.XLARGE4),
          securityGroup: props.sg,
          vpcSubnets: {
            subnetType: SubnetType.PUBLIC
          },
          blockDevices: [
              {
                deviceName: '/dev/xvda',
                volume: BlockDeviceVolume.ebs(20)
              }
            ],
          init: initData,
          initOptions: {
            configSets: ['access'],
            timeout: Duration.minutes(15),
            ignoreFailures: true
          }
        })

        new CfnOutput(this, "CKAAccessInstanceIP", {
          value: vm.instancePublicIp,
          key: "publicIp"
        })
    }
}