Parse MockDB
=====================

Master Build Status: [![Circle CI](https://circleci.com/gh/HustleInc/parse-mockdb/tree/master.svg?style=svg)](https://circleci.com/gh/HustleInc/parse-mockdb/tree/master)

Provides a mocked Parse RESTController compatible with version `1.6+` **ONLY** of the JavaScript SDK.

## Installation and Usage

```js
npm install parse-mockdb --save-dev
```

```js
'use strict';
const Parse = require('parse-shim');
const ParseMockDB = require('parse-mockdb');

ParseMockDB.mockDB(); // Mock the Parse RESTController

// Perform saves, queries, updates, deletes, etc... using the Parse JS SDK

ParseMockDB.cleanUp(); // Clear the Database
ParseMockDB.unMockDB(); // Un-mock the Parse RESTController
```

## Tests

```sh
npm test
```
