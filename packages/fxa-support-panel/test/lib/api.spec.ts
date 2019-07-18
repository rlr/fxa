/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as hapi from '@hapi/hapi';
import { assert as cassert } from 'chai';
import 'mocha';
import { Logger } from 'mozlog';
import * as nock from 'nock';
import { assert, SinonSpy } from 'sinon';
import * as sinon from 'sinon';
import { stubInterface } from 'ts-sinon';

import Config from '../../config';
import {
  AccountResponse,
  DevicesResponse,
  SubscriptionResponse,
  TotpTokenResponse
} from '../../lib/api';
import * as supportServer from '../../lib/server';

const uid = 'asdf12345';

type MockCallResponse<T> = {
  status: number;
  response: T;
};

type MockCallsResponse = {
  account: MockCallResponse<AccountResponse>;
  devices: MockCallResponse<DevicesResponse>;
  subscriptions: MockCallResponse<SubscriptionResponse>;
  totp: MockCallResponse<TotpTokenResponse>;
};

function createDefaults(): MockCallsResponse {
  const now = new Date().getTime();
  return {
    account: {
      response: {
        createdAt: now,
        email: 'test@example.com',
        emailVerified: true,
        locale: 'en-us'
      },
      status: 200
    },
    devices: {
      response: [],
      status: 200
    },
    subscriptions: {
      response: [],
      status: 200
    },
    totp: {
      response: {
        enable: true,
        epoch: now,
        sharedSecret: '',
        verified: true
      },
      status: 200
    }
  };
}

describe('Support Controller', () => {
  let logger: Logger;
  let server: hapi.Server;

  const mockCalls = (obj: MockCallsResponse) => {
    nock('http://authdb.firefox.com')
      .get(`/account/${uid}`)
      .reply(obj.account.status, obj.account.response);
    nock('http://authdb.firefox.com')
      .get(`/account/${uid}/devices`)
      .reply(obj.devices.status, obj.devices.response);
    nock('http://authdb.firefox.com')
      .get(`/account/${uid}/subscriptions`)
      .reply(obj.subscriptions.status, obj.subscriptions.response);
    nock('http://authdb.firefox.com')
      .get(`/totp/${uid}`)
      .reply(obj.totp.status, obj.totp.response);
  };

  beforeEach(async () => {
    logger = stubInterface<Logger>();

    server = await supportServer.init(
      {
        authdb_url: 'http://authdb.firefox.com',
        listen: {
          host: 'localhost',
          port: 8099
        }
      },
      logger
    );
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('has a heartbeat', async () => {
    const result = await server.inject({
      method: 'GET',
      url: '/__lbheartbeat__'
    });
    cassert.equal(result.statusCode, 200);
  });

  it('returns the default user template', async () => {
    mockCalls(createDefaults());
    const result = await server.inject({
      method: 'GET',
      url: `/?uid=${uid}`
    });
    cassert.equal(result.statusCode, 200);
  });

  it('gracefully handles 404s', async () => {
    const defaults = createDefaults();
    defaults.account.status = 404;
    mockCalls(defaults);
    const result = await server.inject({
      method: 'GET',
      url: `/?uid=${uid}`
    });
    cassert.equal(result.statusCode, 404);
  });
});
