const aws4 = require('aws4')
const awscred = require('awscred')
const queryString = require('query-string')
const crypto = require('crypto')
const consola = require('consola')
const chalk = require('chalk')
const AWS = require('aws-sdk')
const open = require('open')
const { format } = require('timeago.js')
const got = require('got')
const jsdom = require('jsdom')
const { JSDOM } = jsdom

let logger = consola.create({
  level: 3,
  defaults: {
    additionalColor: 'white',
  },
})

const printBranches = (branches, amplifyAppId) => {
  const structuredEnvs = branches
    .sort(function (a, b) {
      if (a.updateTime < b.updateTime) return 1
      if (a.updateTime > b.updateTime) return -1
      return 0
    })
    .map((app) => ({
      branchName: app.branchName,
      displayName: app.displayName,
      branchArn: app.branchArn,
      defaultUrl: `https://${app.branchName}.${amplifyAppId}.amplifyapp.com`,
    }))
  console.table(structuredEnvs)
}

const listApps = async (options) => {
  logger.debug(chalk.dim('listing Amplify Apps'))
  const amplify = new AWS.Amplify()
  let allApps = null
  let currentToken = null
  while (!allApps || currentToken) {
    const { apps, nextToken } = await amplify
      .listApps({
        maxResults: 100,
        nextToken: currentToken,
      })
      .promise()
    allApps = (allApps || []).concat(apps)
    currentToken = nextToken
  }
  const structuredApps = allApps
    .sort(function (a, b) {
      if (a.updateTime < b.updateTime) return 1
      if (a.updateTime > b.updateTime) return -1
      return 0
    })
    .map((app) => ({
      amplifyAppId: app.appId,
      amplifyAppName: app.name,
      repository: app.repository,
      defaultDomain: app.defaultDomain,
      created: format(app.createTime),
      updated: format(app.updateTime),
    }))
  console.table(structuredApps)
}

const listBranches = async (amplifyAppId, options) => {
  logger.debug(chalk.dim('listing Amplify App branches'))
  const amplify = new AWS.Amplify()
  const { branches } = await amplify
    .listBranches({ appId: amplifyAppId, maxResults: 50 })
    .promise()
  printBranches(branches, amplifyAppId)
}

const generateLoginSts = async (
  appHost,
  sprocsAppName,
  sprocsAppRegion,
  backendEnv,
  options = {},
) => {
  logger.debug(chalk.dim('using AWS region', sprocsAppRegion))
  const sts = new AWS.STS()
  logger.debug(chalk.dim('fetching AWS Account ID from current identity'))
  const { Arn, UserId, Account } = await sts.getCallerIdentity().promise()
  logger.debug(chalk.dim('found AWS Account ID', Account))

  logger.debug(chalk.dim('loading AWS credentials to sign spawn request'))
  awscred.loadCredentials(async (err, credentials) => {
    if (err || !credentials) {
      logger.error(
        'Could not load AWS credentials. Try using AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION or AWS_PROFILE.',
      )
      throw err
    }

    const roleArn =
      options.roleArn ||
      `arn:aws:iam::${Account}:role/${sprocsAppName}-${backendEnv}-${options.admin ? 'admin' : 'user'}`

    logger.debug(chalk.dim('signing STS request to assume role', roleArn))

    let queryStringStr = queryString.stringify({
      Version: '2011-06-15',
      Action: 'AssumeRole',
      RoleArn: roleArn,
      RoleSessionName: 'spawnLoginAssumedRole',
      DurationSeconds: options.sessionDuration || 3600 * 8, // 8 hours (need to change MaxSessionDuration for role)
    })

    const { host, path } = aws4.sign(
      {
        host: `sts.${sprocsAppRegion}.amazonaws.com`,
        path: `/?` + queryStringStr,
        region: sprocsAppRegion,
        service: 'sts',
        signQuery: true,
      },
      credentials,
    )
    const signedSpawnUrl = `https://${host}${path}`
    const stsB64 = Buffer.from(signedSpawnUrl).toString('base64')
    logger.debug(chalk.dim('signed STS url', signedSpawnUrl))

    const spawnOpenUrl = `${appHost}?spawnStsUrl=${stsB64}`
    if (options.printOnly) {
      console.log(spawnOpenUrl)
    } else {
      logger.info(chalk.dim('opening'), chalk.bold.underline(spawnOpenUrl))
      await open(spawnOpenUrl, { wait: false })
    }
  })
}

const loginViaUrl = async (appUrl, options) => {
  logger = consola.create({
    level: options.verbose ? 4 : 3,
    defaults: {
      additionalColor: 'white',
    },
  })

  logger.debug(chalk.dim('fetching app url', appUrl))
  const { body } = await got(appUrl)
  const dom = new JSDOM(body)
  let sprocsConfig = {}
  Array.from(
    dom.window.document.querySelectorAll('meta[name^=sprocs]'),
  ).forEach((e) => {
    sprocsConfig[e.getAttribute('name')] = e.getAttribute('content')
  })

  const sprocsAppName = sprocsConfig['sprocs-app'] || ''
  const backendEnv = sprocsConfig['sprocs-user-branch'] || ''
  const sprocsAppRegion = sprocsConfig['sprocs-region'] || ''
  if (sprocsAppName.length && backendEnv.length) {
    await generateLoginSts(appUrl, sprocsAppName, sprocsAppRegion, backendEnv, options)
  } else {
    logger.error('failed to parse sprocs meta tags from app url', appUrl)
    process.exit(1)
  }
}

const loginViaApp = async (sprocsAppName, amplifyAppId, options) => {
  logger = consola.create({
    level: options.verbose ? 4 : 3,
    defaults: {
      additionalColor: 'white',
    },
  })
  const amplify = new AWS.Amplify()

  let branch = options.branch
  let backendEnv = options.backendEnv
  let foundBranch = null
  let foundCustomDomain = null
  let amplifyApp = null
  if (!branch || (branch && !backendEnv)) {
    logger.debug(chalk.dim('listing Amplify App branches for', amplifyAppId))
    const { app } = await amplify.getApp({ appId: amplifyAppId }).promise()
    amplifyApp = app

    const { branches } = await amplify
      .listBranches({ appId: amplifyAppId, maxResults: 50 })
      .promise()

    if (branches.length === 0) {
      logger.error(
        chalk.red(
          'no branches/environments found for Amplify App',
          amplifyAppId,
        ),
      )
      process.exit(1)
    }

    if (!branch) {
      const productionBranch = branches.find(
        (b) => b.branchName === amplifyApp.productionBranch?.branchName,
      )
      if (productionBranch) {
        branch = productionBranch.branchName
        backendEnv = (productionBranch.environmentVariables || {}).USER_BRANCH
        foundBranch = productionBranch
      }
    }

    if (branches.length > 1 && !branch) {
      logger.error(
        'multiple branches/environments found for Amplify App',
        amplifyAppId,
      )
      logger.info(
        'rerun login command with',
        chalk.blue(`--branch <your selected branch here>`),
      )
      printBranches(branches, amplifyAppId)
      process.exit(1)
    }

    if (!branch) {
      foundBranch = branches[0]
      branch = foundBranch.branchName
    }

    if (!backendEnv) {
      if (!foundBranch) {
        foundBranch = branches.find((b) => b.branchName === branch)
      }
      if (foundBranch) {
        backendEnv = (foundBranch.environmentVariables || {}).USER_BRANCH
        if (!backendEnv) {
          logger.error(
            'Matching branch did not contain USER_BRANCH environment variable representing backendEnv. Provide it manually.',
          )
          process.exit(1)
        }
      } else {
        logger.error('Could not find matching branch', branch)
        process.exit(1)
      }
    }
  }

  logger.debug(
    'found Amplify App branch',
    chalk.green(branch),
    'and backend env',
    chalk.green(backendEnv),
  )

  if (!options.useDefaultDomain) {
    const { domainAssociations } = await amplify
      .listDomainAssociations({ appId: amplifyAppId, maxResults: 50 })
      .promise()
    const firstAvailableDomain = domainAssociations.find(
      (da) => da.domainStatus === 'AVAILABLE',
    )
    if (firstAvailableDomain) {
      const subdomainForBranch = (firstAvailableDomain.subDomains || []).find(
        (s) => s.subDomainSetting?.branchName === branch && s.verified,
      )
      if (subdomainForBranch) {
        foundCustomDomain = `${
          subdomainForBranch.subDomainSetting.prefix
            ? `${subdomainForBranch.subDomainSetting.prefix}.`
            : ''
        }${firstAvailableDomain.domainName}`
        logger.debug(
          'found custom domain association for branch',
          chalk.green(foundCustomDomain),
        )
      }
    }
  }

  let appHost = null
  if (options.host) {
    try {
      const parsedHost = new URL(options.host)
      appHost = `https://${parsedHost.host}`
      logger.debug('parsed provided host', chalk.green(appHost))
    } catch (e) {
      logger.error('failed to parse provided host', options.host, e)
      process.exit(1)
    }
  } else if (foundCustomDomain) {
    appHost = `https://${foundCustomDomain}`
    logger.debug(
      'using custom domain association for branch',
      chalk.green(appHost),
    )
  } else if (amplifyApp && amplifyApp.defaultDomain) {
    // && foundBranch && foundBranch.stage === 'PRODUCTION') {
    appHost = `https://${branch}.${amplifyApp.defaultDomain}`
    logger.debug('parsed Amplify App default domain', chalk.green(appHost))
  } else {
    appHost = `https://${branch}.${amplifyAppId}.amplifyapp.com`
    logger.debug(
      'using default Amplify App environment host',
      chalk.green(appHost),
    )
  }

  await generateLoginSts(appHost, sprocsAppName, AWS.config.region, backendEnv, options)
}

module.exports = {
  listApps,
  listBranches,
  loginViaApp,
  loginViaUrl,
}
