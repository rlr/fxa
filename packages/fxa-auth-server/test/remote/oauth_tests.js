/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { assert } = require('chai');
const TestServer = require('../test_server');
const Client = require('../client')();
const config = require('../../config').getProperties();
const error = require('../../lib/error');
const testUtils = require('../lib/util');
const oauthServerModule = require('../../fxa-oauth-server/lib/server');

const PUBLIC_CLIENT_ID = '3c49430b43dfba77';
const OAUTH_CLIENT_NAME = 'Android Components Reference Browser';
const MOCK_CODE_VERIFIER = 'abababababababababababababababababababababa';
const MOCK_CODE_CHALLENGE = 'YPhkZqm08uTfwjNSiYcx80-NPT9Zn94kHboQW97KyV0';

const JWT_ACCESS_TOKEN_CLIENT_ID = '325b4083e32fe8e7'; //321 Done
const JWT_ACCESS_TOKEN_SECRET =
  'a084f4c36501ea1eb2de33258421af97b2e67ffbe107d2812f4a14f3579900ef';

function decodeJWT(b64) {
  var jwt = b64.split('.');
  return {
    header: JSON.parse(Buffer.from(jwt[0], 'base64').toString('utf-8')),
    claims: JSON.parse(Buffer.from(jwt[1], 'base64').toString('utf-8')),
  };
}

describe('/oauth/ routes', function() {
  this.timeout(15000);
  let client;
  let email;
  let oauthServer;
  let password;
  let server;

  before(async () => {
    testUtils.disableLogs();
    oauthServer = await oauthServerModule.create();
    await oauthServer.start();
    server = await TestServer.start(config, false, { oauthServer });
  });

  after(async () => {
    await TestServer.stop(server);
    await oauthServer.stop();
    testUtils.restoreStdoutWrite();
  });

  beforeEach(async () => {
    email = server.uniqueEmail();
    password = 'test password';
    client = await Client.createAndVerify(
      config.publicUrl,
      email,
      password,
      server.mailbox
    );
  });

  it('successfully grants an authorization code', async () => {
    const res = await client.createAuthorizationCode({
      client_id: PUBLIC_CLIENT_ID,
      state: 'xyz',
      code_challenge: MOCK_CODE_CHALLENGE,
      code_challenge_method: 'S256',
    });
    assert.ok(res.redirect);
    assert.ok(res.code);
    assert.equal(res.state, 'xyz');
  });

  it('rejects invalid sessionToken', async () => {
    const sessionToken = client.sessionToken;
    await client.destroySession();
    client.sessionToken = sessionToken;
    try {
      await client.createAuthorizationCode({
        client_id: PUBLIC_CLIENT_ID,
        state: 'xyz',
        code_challenge: MOCK_CODE_CHALLENGE,
        code_challenge_method: 'S256',
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.errno, error.ERRNO.INVALID_TOKEN);
    }
  });

  it('rejects `assertion` parameter in /authorization request', async () => {
    try {
      await client.createAuthorizationCode({
        client_id: PUBLIC_CLIENT_ID,
        state: 'xyz',
        assertion: 'a~b',
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.errno, error.ERRNO.INVALID_PARAMETER);
      assert.equal(
        err.validation.keys[0],
        'assertion',
        'assertion param caught in validation'
      );
    }
  });

  it('rejects `resource` parameter in /authorization request', async () => {
    try {
      await client.createAuthorizationCode({
        client_id: PUBLIC_CLIENT_ID,
        state: 'xyz',
        code_challenge: MOCK_CODE_CHALLENGE,
        code_challenge_method: 'S256',
        resource: 'https://resource.server.com',
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.errno, error.ERRNO.INVALID_PARAMETER);
      assert.equal(
        err.validation.keys[0],
        'resource',
        'resource param caught in validation'
      );
    }
  });

  it('successfully grants tokens from sessionToken and notifies user', async () => {
    const SCOPE = 'https://identity.mozilla.com/apps/oldsync';

    let devices = await client.devices();
    assert.equal(devices.length, 0, 'no devices yet');

    const res = await client.grantOAuthTokensFromSessionToken({
      grant_type: 'fxa-credentials',
      client_id: PUBLIC_CLIENT_ID,
      access_type: 'offline',
      scope: SCOPE,
    });

    assert.ok(res.access_token);
    assert.ok(res.refresh_token);
    assert.equal(res.scope, SCOPE);
    assert.ok(res.auth_at);
    assert.ok(res.expires_in);
    assert.ok(res.token_type);

    // got an email notification
    const emailData = await server.mailbox.waitForEmail(email);
    assert.equal(
      emailData.headers['x-template-name'],
      'newDeviceLoginEmail',
      'correct template'
    );
    assert.equal(
      emailData.subject,
      `New sign-in to ${OAUTH_CLIENT_NAME}`,
      'has client name'
    );
    assert.equal(
      emailData.headers['x-service-id'],
      PUBLIC_CLIENT_ID,
      'has client id'
    );

    // added a new device
    devices = await client.devicesWithRefreshToken(res.refresh_token);
    assert.equal(devices.length, 1, 'new device');
    assert.equal(devices[0].name, OAUTH_CLIENT_NAME);
  });

  it('successfully grants tokens via authentication code flow, and refresh token flow', async () => {
    const SCOPE = 'https://identity.mozilla.com/apps/oldsync openid';

    let devices = await client.devices();
    assert.equal(devices.length, 0, 'no devices yet');

    let res = await client.createAuthorizationCode({
      client_id: PUBLIC_CLIENT_ID,
      state: 'abc',
      code_challenge: MOCK_CODE_CHALLENGE,
      code_challenge_method: 'S256',
      scope: SCOPE,
      access_type: 'offline',
    });
    assert.ok(res.code);

    devices = await client.devices();
    assert.equal(devices.length, 0, 'no devices yet');

    res = await client.grantOAuthTokens({
      client_id: PUBLIC_CLIENT_ID,
      code: res.code,
      code_verifier: MOCK_CODE_VERIFIER,
    });
    assert.ok(res.access_token);
    assert.ok(res.refresh_token);
    assert.ok(res.id_token);
    assert.equal(res.scope, SCOPE);
    assert.ok(res.auth_at);
    assert.ok(res.expires_in);
    assert.ok(res.token_type);

    devices = await client.devices();
    assert.equal(devices.length, 1, 'has a new device after the code grant');

    const res2 = await client.grantOAuthTokens({
      client_id: PUBLIC_CLIENT_ID,
      refresh_token: res.refresh_token,
      grant_type: 'refresh_token',
    });
    assert.ok(res.access_token);
    assert.equal(res.scope, SCOPE);
    assert.ok(res.expires_in);
    assert.ok(res.token_type);
    assert.notEqual(res.access_token, res2.access_token);

    devices = await client.devices();
    assert.equal(
      devices.length,
      1,
      'still only one device after a refresh_token grant'
    );
  });

  it('successfully grants JWT access tokens via authentication code flow, and refresh token flow', async () => {
    const SCOPE = 'openid';

    const codeRes = await client.createAuthorizationCode({
      client_id: JWT_ACCESS_TOKEN_CLIENT_ID,
      state: 'abc',
      scope: SCOPE,
      access_type: 'offline',
    });
    assert.ok(codeRes.code);
    const tokenRes = await client.grantOAuthTokens({
      client_id: JWT_ACCESS_TOKEN_CLIENT_ID,
      client_secret: JWT_ACCESS_TOKEN_SECRET,
      code: codeRes.code,
      ppid_seed: 100,
    });
    assert.ok(tokenRes.access_token);
    assert.ok(tokenRes.refresh_token);
    assert.ok(tokenRes.id_token);
    assert.equal(tokenRes.scope, SCOPE);
    assert.ok(tokenRes.auth_at);
    assert.ok(tokenRes.expires_in);
    assert.ok(tokenRes.token_type);

    const tokenJWT = decodeJWT(tokenRes.access_token);
    assert.ok(tokenJWT.claims.sub);

    const refreshTokenRes = await client.grantOAuthTokens({
      client_id: JWT_ACCESS_TOKEN_CLIENT_ID,
      client_secret: JWT_ACCESS_TOKEN_SECRET,
      refresh_token: tokenRes.refresh_token,
      grant_type: 'refresh_token',
      ppid_seed: 100,
      scope: SCOPE,
    });
    assert.ok(refreshTokenRes.access_token);
    assert.equal(refreshTokenRes.scope, SCOPE);
    assert.ok(refreshTokenRes.expires_in);
    assert.ok(refreshTokenRes.token_type);

    const refreshTokenJWT = decodeJWT(refreshTokenRes.access_token);

    assert.equal(tokenJWT.claims.sub, refreshTokenJWT.claims.sub);

    const clientRotatedRes = await client.grantOAuthTokens({
      client_id: JWT_ACCESS_TOKEN_CLIENT_ID,
      client_secret: JWT_ACCESS_TOKEN_SECRET,
      refresh_token: tokenRes.refresh_token,
      grant_type: 'refresh_token',
      ppid_seed: 101,
      scope: SCOPE,
    });
    assert.ok(clientRotatedRes.access_token);
    assert.equal(clientRotatedRes.scope, SCOPE);
    assert.ok(clientRotatedRes.expires_in);
    assert.ok(clientRotatedRes.token_type);

    const clientRotatedJWT = decodeJWT(clientRotatedRes.access_token);
    assert.notEqual(tokenJWT.claims.sub, clientRotatedJWT.claims.sub);
  });
});
