const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
const path = require('path')
const exec = require('child_process').exec
const aws4 = require('aws4')
const awscred = require('awscred')
const open = require('open')
const got = require('got')
const { listApps, listBranches, loginViaApp, loginViaUrl } = require('./spawnCommands')
const { PassThrough } = require('stream')
const { Readable } = require('stream')

jest.mock('awscred')
jest.mock('aws4')
jest.mock('open')
jest.mock('got')

jest.mock('aws-sdk', () => {
  return {
    ...jest.requireActual('aws-sdk'),
    Amplify: jest.fn(),
    STS: jest.fn(),
    config: {
      region: 'us-east-2'
    },
  }
})

const { Amplify, STS, config } = require('aws-sdk')
jest.mock('axios')

const MOCK_SIGNED_PATH = '/signedPath?signature=v3'
beforeEach(() => {
  awscred.loadCredentials.mockImplementation((cb) => {
    cb(null, {
      credentials: {},
    })
  })
})

test('listApps', async () => {
  Amplify.mockImplementation(() => {
    return {
      listApps(obj) {
        expect(obj).toEqual(
          expect.objectContaining({
            maxResults: 100,
            nextToken: null,
          }),
        )
        return {
          promise: () => {
            return new Promise((resolve) =>
              resolve({
                apps: [
                  {
                    appId: '123',
                    name: 'test app',
                    repository: 'https://github.com/sprocs',
                    defaultDomain: 'https://sprocs.com',
                  },
                ],
              }),
            )
          },
        }
      },
    }
  })
  const table = jest.spyOn(console, 'table').mockImplementation(() => {})
  await listApps()
  expect(table).toBeCalledWith([
    {
      amplifyAppId: '123',
      amplifyAppName: 'test app',
      created: 'just now',
      defaultDomain: 'https://sprocs.com',
      repository: 'https://github.com/sprocs',
      updated: 'just now',
    },
  ])
  table.mockReset()
})

test('listBranches', async () => {
  Amplify.mockImplementation(() => {
    return {
      listBranches(obj) {
        expect(obj).toEqual(
          expect.objectContaining({
            appId: 'APPID',
            maxResults: 50,
          }),
        )
        return {
          promise: () => {
            return new Promise((resolve) =>
              resolve({
                branches: [
                  {
                    branchName: 'branchName',
                    displayName: 'displayName',
                    branchArn: 'branchArn',
                  },
                ],
              }),
            )
          },
        }
      },
    }
  })
  const table = jest.spyOn(console, 'table').mockImplementation(() => {})
  await listBranches('APPID')
  expect(table).toBeCalledWith([
    {
      branchArn: 'branchArn',
      branchName: 'branchName',
      defaultUrl: 'https://branchName.APPID.amplifyapp.com',
      displayName: 'displayName',
    },
  ])
  table.mockReset()
})

test('loginViaApp', async () => {
  aws4.sign.mockImplementation((obj) => {
    expect(obj).toEqual({
      host: 'sts.us-east-2.amazonaws.com',
      path:
        '/?Action=AssumeRole&DurationSeconds=28800&RoleArn=arn%3Aaws%3Aiam%3A%3A123%3Arole%2FraincloudUserRole-dev&RoleSessionName=spawnLoginAssumedRole&Version=2011-06-15',
      region: 'us-east-2',
      service: 'sts',
      signQuery: true,
    })
    return { path: MOCK_SIGNED_PATH, host: 'sts.us-east-2.amazonaws.com' }
  })
  STS.mockImplementation(() => ({
    getCallerIdentity: () => {
      return {
        promise: () => {
          return new Promise((resolve) =>
            resolve({
              Account: '123',
            }),
          )
        },
      }
    },
  }))
  Amplify.mockImplementation(() => {
    return {
      getApp(appId) {
        expect(appId).toEqual(
          expect.objectContaining({
            appId: 'APPID',
          }),
        )
        return {
          promise: () => {
            return new Promise((resolve) =>
              resolve({
                app: {
                  appId: 'APPID',
                  name: 'test app',
                  defaultDomain: 'https://sprocs.com',
                  productionBranch: {
                    lastDeployTime: '2021-06-29T11:58:25.123000-07:00',
                    status: 'FAILED',
                    thumbnailUrl:
                      'https://aws-amplify-prod-us-east-2-artifacts.s3.us-east-2.amazonaws.com/',
                    branchName: 'main',
                  },
                },
              }),
            )
          },
        }
      },
      listDomainAssociations(obj) {
        expect(obj).toEqual(
          expect.objectContaining({
            appId: 'APPID',
            maxResults: 50,
          }),
        )
        return {
          promise: () => {
            return new Promise((resolve) =>
              resolve({
                domainAssociations: [
                  {
                    domainAssociationArn:
                      'arn:aws:amplify:us-east-2:123:apps/APPID/domains/sprocs.com',
                    domainName: 'sprocs.com',
                    enableAutoSubDomain: false,
                    domainStatus: 'AVAILABLE',
                    subDomains: [
                      {
                        subDomainSetting: {
                          branchName: 'main',
                        },
                        verified: false,
                        dnsRecord: ' CNAME abc123.cloudfront.net',
                      },
                      {
                        subDomainSetting: {
                          prefix: 'www',
                          branchName: 'main',
                        },
                        verified: true,
                        dnsRecord: 'www CNAME abc123.cloudfront.net',
                      },
                    ],
                  },
                ],
              }),
            )
          },
        }
      },
      listBranches(obj) {
        expect(obj).toEqual(
          expect.objectContaining({
            appId: 'APPID',
            maxResults: 50,
          }),
        )
        return {
          promise: () => {
            return new Promise((resolve) =>
              resolve({
                branches: [
                  {
                    branchArn:
                      'arn:aws:amplify:us-east-2:123:apps/APPID/branches/main',
                    branchName: 'main',
                    tags: {},
                    stage: 'PRODUCTION',
                    displayName: 'main',
                    enableNotification: false,
                    createTime: '2021-06-26T14:44:32.586000-07:00',
                    updateTime: '2021-09-21T08:45:30.067000-07:00',
                    environmentVariables: {
                      USER_BRANCH: 'dev',
                    },
                    enableAutoBuild: true,
                    framework: 'React',
                    activeJobId: '0000000008',
                    totalNumberOfJobs: '0',
                    enableBasicAuth: true,
                    enablePerformanceMode: false,
                    basicAuthCredentials: 'dGVzdDp0ZXN0ZXIxMjM=',
                    ttl: '5',
                    enablePullRequestPreview: false,
                    backendEnvironmentArn:
                      'arn:aws:amplify:us-east-2:123:apps/APPID/backendenvironments/dev',
                  },
                ],
              }),
            )
          },
        }
      },
    }
  })
  open.mockImplementation((url) => {
    expect(url).toEqual(
      `https://www.sprocs.com?spawnStsUrl=${Buffer.from(
        `https://sts.us-east-2.amazonaws.com${MOCK_SIGNED_PATH}`,
      ).toString('base64')}`,
    )
  })
  await loginViaApp('raincloud', 'APPID', {})
})

test('loginViaUrl', async () => {
  aws4.sign.mockImplementation((obj) => {
    expect(obj).toEqual({
      host: 'sts.us-east-2.amazonaws.com',
      path:
        '/?Action=AssumeRole&DurationSeconds=28800&RoleArn=arn%3Aaws%3Aiam%3A%3A123%3Arole%2FraincloudUserRole-dev&RoleSessionName=spawnLoginAssumedRole&Version=2011-06-15',
      region: 'us-east-2',
      service: 'sts',
      signQuery: true,
    })
    return { path: MOCK_SIGNED_PATH, host: 'sts.us-east-2.amazonaws.com' }
  })
  got.mockImplementation((url) => {
    expect(url).toEqual(
      'https://www.sprocs.com',
    )
    return {
      body: '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#ffffff"><meta name="sprocs-user-branch" content="dev"><meta name="sprocs-aws-branch" content="develop"><meta name="sprocs-aws-app-id" content="d3dsdwa51kio1p"><meta name="sprocs-region" content="us-east-2"><meta name="sprocs-app" content="raincloud"><meta name="description" content="raincloud // serverless status page"/><title>raincloud</title></head><body><noscript>You need to enable JavaScript to run this app.</noscript></body></html>'
    }
  })
  STS.mockImplementation(() => ({
    getCallerIdentity: () => {
      return {
        promise: () => {
          return new Promise((resolve) =>
            resolve({
              Account: '123',
            }),
          )
        },
      }
    },
  }))
  open.mockImplementation((url) => {
    expect(url).toEqual(
      `https://www.sprocs.com?spawnStsUrl=${Buffer.from(
        `https://sts.us-east-2.amazonaws.com${MOCK_SIGNED_PATH}`,
      ).toString('base64')}`,
    )
  })
  await loginViaUrl('https://www.sprocs.com', {})
})
