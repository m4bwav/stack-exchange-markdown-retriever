var program = require('commander');
var markdownRetriever = require('./index.js');

program
  .option('-a, --answer', 'Retrieve the markdown of an answer, rather than a question')
  .option('-k, --apiKey', 'Use an api key when accessing the stack api, which should allow more downloads')
  .parse(process.argv);

function logResultToConsole(result) {
  console.log(result);
}

markdownRetriever.retrieveMarkdown(program, logResultToConsole);
