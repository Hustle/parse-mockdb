Parse MockDB
=====================

Master Build Status: [![Circle CI](https://circleci.com/gh/HustleInc/parse-mockdb/tree/master.svg?style=svg)](https://circleci.com/gh/HustleInc/parse-mockdb/tree/master)

Provides a mocked Parse RESTController compatible with version `1.6+` of the JavaScript SDK.

### Installation and Usage

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

### Completeness

 - [x] Basic CRUD (save, destroy, fetch)
 - [x] Query operators ($exists, $in, $nin, $eq, $ne, $lt, $lte, $gt, $gte, $regex, $select, $inQuery, $all, $nearSphere)
 - [x] Update operators (Increment, Add, AddUnique, Remove, Delete)
 - [x] Parse.Relation (AddRelation, RemoveRelation)
 - [x] Parse query dotted notation matching eg `{ "name.first": "Tyler" })`
 - [ ] Parse class level permissions
 - [ ] Parse.ACL (row level permissions)
 - [ ] Parse special classes (Parse.User, Parse.Role, ...)
 - [ ] Parse lifecycle hooks (beforeSave - done, afterSave, beforeDelete - done, afterDelete)

### Tests

```sh
npm test
```
