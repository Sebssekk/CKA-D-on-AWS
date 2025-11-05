#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Cdk4CkaAwsStack } from '../lib/cdk4_cka_aws-stack';

const app = new cdk.App();
new Cdk4CkaAwsStack(app, 'Cdk4CkaAwsStack');
