# stack-exchange-markdown-retriever

<p align="center">>
[![npm package](https://nodei.co/npm/stack-exchange-markdown-retriever.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/stack-exchange-markdown-retriever/)
![NPM Version](https://img.shields.io/npm/v/stack-exchange-markdown-retriever.svg?branch=master)
![downloads](https://img.shields.io/npm/dt/stack-exchange-markdown-retriever.svg)
[![Build Status](https://img.shields.io/travis/m4bwav/stack-exchange-markdown-retriever/master.svg)](https://travis-ci.org/m4bwav/stack-exchange-markdown-retriever)
[![Dependency Status](https://img.shields.io/david/m4bwav/stack-exchange-markdown-retriever.svg)](https://david-dm.org/m4bwav/stack-exchange-markdown-retriever)
[![Coverage Status](https://img.shields.io/coveralls/m4bwav/stack-exchange-markdown-retriever/master.svg)](https://coveralls.io/github/m4bwav/stack-exchange-markdown-retriever?branch=master)
[![Known Vulnerabilities](https://snyk.io/test/npm/stack-exchange-markdown-retriever/badge.svg?style=flat-square)](https://snyk.io/test/npm/stack-exchange-markdown-retriever)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![Gitter](https://badges.gitter.im/m4bwav/stack-exchange-markdown-retriever.svg)](https://gitter.im/m4bwav/stack-exchange-markdown-retriever?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)
</p>

Retrieves the markdown for a question or answer on a stack exchange site.

## Installation

Installation is easiest through npm:

`npm install stack-exchange-markdown-retriever --save`


## Usage

**stack-exchange-markdown-retriever** can be included as a reference.

```
var stackExchangeMarkdownRetriever = require('stack-exchange-markdown-retriever');

var options = {
    site: 'scifi.stackexchange.com',
    entityId: 127968
 };
  
stackExchangeMarkdownRetriever.retrieveMarkdown(options, function(markdown){
  console.log(markdown);
});
```

## CLI

```
$ npm install --global stack-exchange-markdown-retriever
```

```
$ stack-exchange-markdown-retriever --help

  Usage
    $ stack-exchange-markdown-retriever [-k <key>]  [-a] -s "<site>" <id>

  Example
    $ stack-exchange-markdown-retriever -s "scifi.stackexchange.com" 127968
```
## License

MIT © [Mark Rogers](http://www.markdavidrogers.com)
  
[![NPM](https://nodei.co/npm-dl/stack-exchange-markdown-retriever.png?months=3)](https://nodei.co/npm/stack-exchange-markdown-retriever/)