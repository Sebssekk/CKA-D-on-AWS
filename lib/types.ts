import { StackProps } from "aws-cdk-lib";
import { KeyPair, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Role } from "aws-cdk-lib/aws-iam";

export interface AccessStackProps extends StackProps {
    ACCESS_NUM: number,
    REGION: string,
    ACCESS_PSW: string,
    CLUSTERS_NUM: number,
    keyPair: KeyPair,
    sg: SecurityGroup,
    vpc: Vpc,
    CLUSTERS_READY: boolean

}

export interface K8sStackProps extends StackProps {
    K8S_VERSION: string,
    ETCD_VERSION: string , 
    CILIUM_VERSION: string,
    CLUSTERS_NUM: number,
    WORKERS_NUM: number,
    REGION: string,
    vpc: Vpc,
    keyPair: KeyPair,
    sg: SecurityGroup,
    CLUSTERS_READY: boolean
}

export interface NetworkStackProps extends StackProps {
    ACCESS_NUM: number,
}