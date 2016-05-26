'use strict';

var Stackexchange = require('stackexchange');
var exports = module.exports = {};

function initializeStackExchangeContext(options) {
  var site = options.site ? options.site.trim() : 'scifi.stackexchange.com/';

  var stackApiOptions = {
    version: 2.2,
    site: site
  };

  return new Stackexchange(stackApiOptions);
}

function retrieveMarkdown(options, callback) {
  var stackContext = initializeStackExchangeContext(options);

  if (!options.entityId) {
    throw new Error('Need an entity id to edit');
  }

  var filter = {
    // key: 'YOUR_API_KEY',
    order: 'asc',
    filter: options.filter
  };

  if (options.apiKey) {
    filter.key = options.apiKey;
  }
  var stackApiMethod = options.isForAnswer ?
	stackContext.answers.answers :
	stackContext.questions.questions;

	// Get all the questions (http://api.stackexchange.com/docs/questions)
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
