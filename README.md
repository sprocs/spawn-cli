## Overview

[sprocs](https://sprocs.com) spawn-cli is a **passwordless login cli** used to assume AWS roles and login to the app web UI's for sprocs apps.

Most sprocs apps contain an `admin` and `user` AWS IAM Role that can be assumed
by a local AWS profile with permission to do so. spawn-cli uses your current AWS
profile or access key/secret to generate temporary credentials for the desired sprocs app role (ie. `raincloud-env-user` or `raincloud-env-admin`) that grants temporary (8 hour default) access to the app web UI/API's

## Setup

You must have [AWS CLI](https://aws.amazon.com/cli/) credentials setup, see [AWS profile/credentials](#aws-profilecredentials) for instructions.

Alternatively, you can use [AWS CloudShell](https://aws.amazon.com/cloudshell/)
from within the AWS Console which has both node installed and grants your
permissions according to the user you are logged-in as.

## Getting Started

Basic login usage via a sprocs app frontend URL:

```
npx @sprocs/spawn login https://myappid123.amplifyapp.com
```

This command will retrieve the sprocs environment configuration (sprocs app name, Amplify backend name, Amplify frontend name, AWS region) from `meta` tags on the page and launch this URL with the signed STS token to login.

You can retrieve you app URL from the Amplify Console within AWS console
(`Services -> AWS
Amplify -> YOUR APP NAME -> Frontend environments (tab)`)

```
Usage: spawn login [options] <appUrl>

login to a sprocs app via url

Arguments:
  appUrl, sprocs app url

Options:
  -r, --role-arn <roleArn>, override default role arn
  -s, --session-duration <sessionDuration>, override default 8 hour session duration (in seconds)
  -a, --admin, login with the admin role instead of the default user role
  -p, --print-only, do not open browser but just print signed spawn URL as output
  -v, --verbose, verbose mode, show logging
  -h, --help, display help for command
```

## AWS profile/credentials

The spawn client uses [aws-sdk](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/) and [awscred](https://github.com/mhart/awscred#awscredloadcredentialsandregionoptions-cb) to load your AWS credentials and sign requests (sigv4) to access your sprocs apps (to assume IAM roles for admin/user).

The spawn client AWS profile/credentials will need the IAM permission to `sts:AssumeRole` the role you intend.

As an example, sprocs `raincloud` app generates `raincloud-env-admin` and `raincloud-env-user` IAM roles which grant access to run queries against the raincloud API's with respective roles.

A respective policy that grants access to assume the admin role would look like:

```
{
  "Version": "2012-10-17",
  "Statement": {
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::ACCOUNT-ID-WITHOUT-HYPHENS:role/raincloud-dev-admin"
  }
}
```

Once you setup a policy and associate it with a user, you can specify the `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
or `AWS_PROFILE` while running the spawn cli.

Standard environment variables or AWS profiles are the best way to provide
credentials to your client. AWS Credentials can be provided to the client in standard ways:

```
# via profiles:
AWS_PROFILE=my-aws-profile npx @sprocs/spawn ...

# via keys:
AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=AKIA... AWS_SECRET_ACCESS_KEY=2Yd4z... npx @sprocs/spawn ...

# or specified in your shell config .bashrc/.zshrc/etc...
```

## Commands

```
Usage: spawn [options] [command]

Options:
  -V, --version, output the version number
  -h, --help, display help for command

Commands:
  apps, list Amplify apps to find amplifyAppId
  branches <amplifyAppId>, list Amplify App branches
  login [options] <appUrl>, login to a sprocs app via url
  login-via-id [options] <sprocsAppName> <amplifyAppId>, login to a sprocs app via Amplify App Id
  help [command], display help for command
```

## SAML Alternative

You can also setup users with an identity provider via SAML integration. sprocs
apps have been tested with SSO providers such as AWS SSO, Okta, Google Apps/GSuite, and Ping Identity. See [sprocs docs/authentication](https://github.com/sprocs/docs/blob/main/authentication.md)
