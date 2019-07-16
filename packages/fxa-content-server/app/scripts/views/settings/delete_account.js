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
// import AttachedClients from '../../models/attached-clients';

const t = msg => msg;

const LOADING_INDICATOR_BUTTON = '.settings-button.settings-unit-loading';
const UNIT_DETAILS = '.settings-unit-details';

var View = FormView.extend({
  template: Template,
  className: 'delete-account',
  viewName: 'settings.delete-account',

  initialize(options) {
    // this._attachedClients = options.attachedClients;
    // this._activeSubscriptions = options.activeSubscriptions;

    // if (!this._attachedClients) {
    //   this._attachedClients = new AttachedClients([], {
    //     notifier: options.notifier,
    //   });
    // }
    this._activeSubscriptions = [];
  },

  setInitialContext(context) {
    // still up in the air: do I display anything from 'clients'? May need other
    // methods from clients.js if so (like _formatAccessTimeAndScope)

    context.set({
      email: this.getSignedInAccount().get('email'),
      // clients: this._attachedClients.toJSON(),
      isPanelOpen: this.isPanelOpen(),
      subscriptions: this._activeSubscriptions,
    });
  },

  openPanel() {
    this.logViewEvent('open');
    this.$el.find(UNIT_DETAILS).hide();
    this.$el.find(LOADING_INDICATOR_BUTTON).show();

    // return account.fetchActiveSubscriptions().then(subs => this.render());
    // return this._fetchAttachedClients().then(() => this.render());

    return Promise.all([
      // this._fetchAttachedClients(),
      this._fetchActiveSubscriptions(),
    ]).then(() => this.render());
  },

  _fetchActiveSubscriptions() {
    const account = this.getSignedInAccount();
    const start = Date.now();
    return account.fetchActiveSubscriptions().then(() => {
      // do I need to this up anywhere else or does this create `timing.subscriptions`?
      this.logFlowEvent(`timing.subscriptions.fetch.${Date.now() - start}`);
    });
  },

  _fetchAttachedClients() {
    const start = Date.now();
    return this._attachedClients.fetchClients(this.user).then(() => {
      this.logFlowEvent(`timing.clients.fetch.${Date.now() - start}`);
    });
  },

  submit() {
    var account = this.getSignedInAccount();
    var password = this.getElementValue('.password');

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
