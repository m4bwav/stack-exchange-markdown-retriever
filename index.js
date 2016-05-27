'use strict';

var Stackexchange = require('stackexchange');
var exports = module.exports = {};

function initializeStackExchangeContext(options) {
  var stackApiOptions = {
    version: 2.2,
    site: options.site
  };

  return new Stackexchange(stackApiOptions);
}

function retrieveMarkdown(options, callback) {
  var stackContext = initializeStackExchangeContext(options);

  if (!options.entityId) {
    throw new Error('Need an entity id to read');
  }

  var filter = {
    // key: 'YOUR_API_KEY',
    order: 'asc',
    filter: '!L_(I6pMIzdXP-hC1clc9EY'
  };

  if (options.apiKey) {
    filter.key = options.apiKey;
  }
  var stackApiMethod = options.isForAnswer ?
	stackContext.answers.answers :
	stackContext.questions.questions;

  stackApiMethod(filter, function (err, results) {
    var markdown = results && results.items && results.items[0] ?
		results.items[0].body_markdown :
		null;

    if (results && results.error_message) {
      throw new Error(results.error_message);
    }
    callback(markdown, err);
  }, [options.entityId]);
}

exports.retrieveMarkdown = retrieveMarkdown;
