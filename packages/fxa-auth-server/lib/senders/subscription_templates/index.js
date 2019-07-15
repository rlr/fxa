/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const LIB_DIR = '../..';

const error = require(`${LIB_DIR}/error`);
const fs = require('fs');
const handlebars = {
  html: require('handlebars').create(),
  txt: require('handlebars').create(),
};
const path = require('path');
const Promise = require(`${LIB_DIR}/promise`);

const readDir = Promise.promisify(fs.readdir);
const readFile = Promise.promisify(fs.readFile);

const TEMPLATE_FILE = /(.+)\.(html|txt)$/;
const TEMPLATES_DIR = __dirname;
const LAYOUTS_DIR = path.join(TEMPLATES_DIR, 'layouts');
const PARTIALS_DIR = path.join(TEMPLATES_DIR, 'partials');

module.exports = init;

function init(log, translator) {
  if (!log || !translator) {
    log.error('templates.init.invalidArg', {
      log: !!log,
      translator: !!translator,
    });
    throw error.unexpectedError();
  }

  handlebars.html.registerHelper('t', translate);
  handlebars.txt.registerHelper('t', translate);

  forEachTemplate(PARTIALS_DIR, (template, name, type) => {
    handlebars[type].registerPartial(name, template);
  });

  const templates = new Map();
  forEachTemplate(TEMPLATES_DIR, compile(templates));

  const layouts = new Map();
  forEachTemplate(LAYOUTS_DIR, compile(layouts));

  return render;

  function translate(...args) {
    return translator.format(translator.gettext(...args));
  }

  function render(templateName, layoutName, data) {
    const template = templates.get(templateName);
    const layout = layouts.get(layoutName);

    if (!template || !layout) {
      log.error('templates.render.invalidArg', {
        templateName,
        layoutName,
        data,
      });
      throw error.unexpectedError();
    }

    let html, text;

    if (template.html && layout.html) {
      html = layout.html({
        ...data,
        body: template.html(data),
      });
    }

    if (template.txt && layout.txt) {
      text = layout.txt({
        ...data,
        body: template.txt(data),
      });
    }

    return { html, text };
  }
}

async function forEachTemplate(dir, action) {
  const files = await readDir(dir);
  files.forEach(async file => {
    const parts = TEMPLATE_FILE.exec(file);
    if (parts) {
      const template = await readFile(path.join(__dirname, file), {
        encoding: 'utf8',
      });
      action(template, parts[1], parts[2]);
    }
  });
}

function compile(map) {
  return (template, name, type) => {
    const item = map.get(name) || {};
    item[type] = handlebars[type].compile(template);
    map.set(item);
  };
}
