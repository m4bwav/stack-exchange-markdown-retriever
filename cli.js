var program = require('commander');
var markdownRetriever = require('./index.js');

program
  .usage('[options] <entityId>')
  .option('-a, --answer', 'Retrieve the markdown of an answer, rather than a question')
  .option('-s, --site [site]', 'The base url for stack exchange site that you wish to query (ie. "scifi.stackexchange.com")')
  .option('-k, --apiKey [key]', 'Use an api key when accessing the stack api, which should allow more downloads')
  .parse(process.argv);

function logResultToConsole(result) {
  console.log(result);
}

program.entityId = program.args[0];
markdownRetriever.retrieveMarkdown(program, logResultToConsole);
