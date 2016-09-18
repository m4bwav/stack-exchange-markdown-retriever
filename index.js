'use strict';

var url = require('url');
var zlib = require('zlib');
var request = require('request');

var exports = module.exports = {};

function generateRequestUrl(options) {
  var baseRequestUrl = options.isForAnswer ?
     '/2.2/answers/' + options.entityId :
     '/2.2/questions/' + options.entityId;

  var queryParams = {
    // key: 'YOUR_API_KEY',
    order: 'asc',
    filter: '!L_(I6pMIzdXP-hC1clc9EY'
  };

  if (options.apiKey) {
    queryParams.key = options.apiKey;
  }

  queryParams.site = options.site ? options.site : 'stackoverflow';

  return url.format({
    protocol: 'https:',
    host: 'api.stackexchange.com',
    pathname: baseRequestUrl,
    query: queryParams
  });
}

function performRetrieval(options, callback) {
  function prepareToCallback(err, results) {
    var markdown = results && results.items && results.items[0] ?
		results.items[0].body_markdown :
		null;

    if (results && results.error_message) {
      throw new Error(results.error_message);
    }
    callback(markdown, err);
  }

  var requestUrl = generateRequestUrl(options);

  request({url: requestUrl, encoding: null}, function processResponse(error, result) {
    if (error) {
      prepareToCallback(error);
    } else {
      var body = result.body;
      zlib.unzip(body, function handleUnzip(error, body) {
        try {
          var bodyObj = JSON.parse(body.toString());

          prepareToCallback(error, bodyObj);
        } catch (err) {
          prepareToCallback(err);
        }
      });
    }
  });
}

function retrieveMarkdown(options, callback) {
  if (!options.entityId) {
    throw new Error('Need an entity id to read');
  }

  performRetrieval(options, callback);
}

exports.retrieveMarkdown = retrieveMarkdown;
