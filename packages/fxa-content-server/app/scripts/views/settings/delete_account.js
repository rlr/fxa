/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import AuthErrors from '../../lib/auth-errors';
import Cocktail from 'cocktail';
import FormView from '../form';
import PasswordMixin from '../mixins/password-mixin';
import ServiceMixin from '../mixins/settings-panel-mixin';
import Session from '../../lib/session';
import SettingsPanelMixin from '../mixins/service-mixin';
import Template from 'templates/settings/delete_account.mustache';
import AttachedClients from '../../models/attached-clients';
import { CLIENT_TYPE_WEB_SESSION } from '../../lib/constants';

const t = msg => msg;

const LOADING_INDICATOR_BUTTON = '.settings-button.settings-unit-loading';
const DELETE_ACCOUNT_BUTTON = '.delete-account-button';
const UNIT_DETAILS = '.settings-unit-details';
const CHECKBOXES = '.delete-account-checkbox';

var View = FormView.extend({
  template: Template,
  className: 'delete-account',
  viewName: 'settings.delete-account',

  initialize(options) {
    this._attachedClients = options.attachedClients;
    if (!this._attachedClients) {
      this._attachedClients = new AttachedClients([], {
        notifier: options.notifier,
      });
    }
    this._activeSubscriptions = [];
  },

  _formatTitleAndScope(items) {
    return items.map(item => {
      item.title = item.name;

      if (item.scope) item.title += `- ${item.scope}`;

      if (item.clientType === CLIENT_TYPE_WEB_SESSION) {
        if (item.userAgent) {
          item.title = this.translate(t('Web Session, %(userAgent)s'), {
            userAgent: item.userAgent,
          });
        } else {
          item.title = t('Web Session');
        }
      }

      return item;
    });
  },

  setInitialContext(context) {
    const clients = this._attachedClients.toJSON();
    context.set({
      email: this.getSignedInAccount().get('email'),
      clients: this._formatTitleAndScope(clients),
      isPanelOpen: this.isPanelOpen(),
      subscriptions: this._activeSubscriptions,
    });
  },

  events: {
    'click .delete-account-checkbox': '_toggleEnableSubmit',
  },

  openPanel() {
    this.logViewEvent('open');
    this.$el.find(UNIT_DETAILS).hide();
    this.$el.find(LOADING_INDICATOR_BUTTON).show();

    return Promise.all([
      this._fetchAttachedClients(),
      this._fetchActiveSubscriptions(),
    ]).then(() => this.render());
  },

  _fetchActiveSubscriptions() {
    const account = this.getSignedInAccount();
    const start = Date.now();
    return account.fetchActiveSubscriptions().then(subscriptions => {
      this.logFlowEvent(`timing.subscriptions.fetch.${Date.now() - start}`);
      this._activeSubscriptions = subscriptions;
    });
  },

  _fetchAttachedClients() {
    const start = Date.now();
    return this._attachedClients.fetchClients(this.user).then(() => {
      this.logFlowEvent(`timing.clients.fetch.${Date.now() - start}`);
    });
  },

  _toggleEnableSubmit() {
    if (this._allCheckboxesAreChecked()) {
      this.$(DELETE_ACCOUNT_BUTTON).attr('disabled', false);
    } else {
      this.$(DELETE_ACCOUNT_BUTTON).attr('disabled', true);
    }
  },

  _allCheckboxesAreChecked() {
    return this.$(`${CHECKBOXES}:checked`).length === this.$(CHECKBOXES).length;
  },

  submit() {
    const account = this.getSignedInAccount();
    const password = this.getElementValue('.password');

    return this.user
      .deleteAccount(account, password)
      .then(() => {
        Session.clear();
        return this.invokeBrokerMethod('afterDeleteAccount', account);
      })
      .then(() => {
        // user deleted an account
        this.logViewEvent('deleted');

        this.navigate(
          'signup',
          {
            success: t('Account deleted successfully'),
          },
          {
            clearQueryParams: true,
          }
        );
      })
      .catch(err => {
        if (AuthErrors.is(err, 'INCORRECT_PASSWORD')) {
          return this.showValidationError(this.$('#password'), err);
        }
        throw err;
      });
  },
});

Cocktail.mixin(View, PasswordMixin, SettingsPanelMixin, ServiceMixin);

export default View;
