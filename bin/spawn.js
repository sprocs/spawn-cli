#!/usr/bin/env node

const { Command } = require('commander')
const { listBranches, listApps, loginViaApp, loginViaUrl } = require('./spawnCommands')

async function main() {
  const program = new Command()

  program.version('0.0.1')

  program
    .command('apps')
    .description('list Amplify apps to find amplifyAppId')
    .action(listApps)

  program
    .command('branches')
    .description('list Amplify App branches')
    .argument('<amplifyAppId>', 'AWS Amplify App ID')
    .action(listBranches)

  program
    .command('login')
    .description('login to a sprocs app via url')
    .argument('<appUrl>', 'sprocs app url')
    .option('-r, --role-arn <roleArn>', 'override default role arn')
    .option(
      '-s, --session-duration <sessionDuration>',
      'override default 8 hour session duration (in seconds)',
    )
    .option(
      '-a, --admin',
      'login with the admin role instead of the default user role',
    )
    .option(
      '-p, --print-only',
      'do not open browser but just print signed spawn URL as output',
    )
    .option('-v, --verbose', 'verbose mode, show logging')
    .action(loginViaUrl)

  program
    .command('login-app')
    .description('login to a sprocs app')
    .argument('<sprocsAppName>', 'sprocs app name (ie. "raincloud" or "spawn")')
    .argument('<amplifyAppId>', 'AWS Amplify App ID')
    .option(
      '-h, --host <host>',
      'app hostname to use instead of `<env>.<amplifyAppId>.amplifyapp.com`',
    )
    .option(
      '-b, --branch <branch>',
      'Specify an AWS Amplify branch if multiple branches. This is the frontend environment and is used to open the default app url.',
    )
    .option(
      '-e, --backend-env <backendEnv>',
      'Specify an AWS Amplify Backend environment',
    )
    .option('-r, --role-arn <roleArn>', 'override default role arn')
    .option(
      '-s, --session-duration <sessionDuration>',
      'override default 8 hour session duration (in seconds)',
    )
    .option(
      '-a, --admin',
      'login with the admin role instead of the default user role',
    )
    .option(
      '-p, --print-only',
      'do not open browser but just print signed spawn URL as output',
    )
    .option(
      '-d, --use-default-domain',
      'use default <amplifyAppId>.amplifyapp.com domain instead of querying Amplify domain associations',
    )
    .option('-v, --verbose', 'verbose mode, show logging')
    .action(loginViaApp)

  await program.parseAsync(process.argv)
}

if (process.env.NODE_ENV !== 'test') {
  ;(async () => {
    await main()
  })()
}
