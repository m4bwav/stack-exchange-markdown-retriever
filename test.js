import test from 'ava';
import stackExchangeMarkdownRetriever from './';

global.Promise = Promise;

test.cb('Can retrieve an average answer\'s markdown', function (t) {
  var options = {
    site: 'scifi.stackexchange.com',
    isForAnswer: true,
    entityId: 1010
  };

  stackExchangeMarkdownRetriever.retrieveMarkdown(options, function (markdown) {
    t.true(Boolean(markdown));
    t.true(markdown.length > 0);
    t.end();
  });
});

test.cb('Can retrieve an average question\'s markdown', function (t) {
  var options = {
    site: 'scifi.stackexchange.com',
    entityId: 127968
  };

  stackExchangeMarkdownRetriever.retrieveMarkdown(options, function (markdown) {
    t.true(Boolean(markdown));
    t.end();
  });
});

test('Needs to have an entity id', function (t) {
  var options = {
    site: 'scifi.stackexchange.com'
  };

  t.throws(function () {
    stackExchangeMarkdownRetriever.retrieveMarkdown(options, function () {
      t.fail();
    });
  });
});
