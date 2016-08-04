'use strict';

const Parse = require('parse-shim');
const _ = require('lodash');

const DEFAULT_LIMIT = 100;
const HARD_LIMIT = 1000;
const MAX_SKIP = 10000;
const QUOTE_REGEXP = /(\\Q|\\E)/g;

const CONFIG = {
  DEBUG: process.env.DEBUG_DB
}

const HANDLERS = {
  GET: handleGetRequest,
  POST: handlePostRequest,
  PUT: handlePutRequest,
  DELETE: handleDeleteRequest,
}

var db = {};
var hooks = {};
var masks = {};

var indirect = null;
var outOfBandResults = null;
var default_controller = null;
var mocked = false;

/**
 * Mocks a Parse API server, by intercepting requests and storing/querying data locally
 * in an in-memory DB.
 */
function mockDB() {
  if (!mocked) {
    default_controller = Parse.CoreManager.getRESTController();
    mocked = true;
    Parse.CoreManager.setRESTController(MockRESTController);
  }
}

/**
 * Restores the original RESTController.
 */
function unMockDB() {
  if (mocked) {
    Parse.CoreManager.setRESTController(default_controller);
    mocked = false;
  }
}

/**
 * Clears the MockDB and any registered hooks.
 */
function cleanUp() {
  db = {};
  hooks = {};
}

/**
 * Registers a hook on a class denoted by className.
 *
 * @param {string} className The name of the class to register hook on.
 * @param {string} hookType One of 'beforeSave', 'afterSave', 'beforeDelete', 'afterDelete'
 * @param {function} hookFn Function that will be called with `this` bound to hydrated model.
 *                          Must return a promise.
 *
 * @note Only supports beforeSave and beforeDelete at the moment.
 */
function registerHook(className, hookType, hookFn) {
  if (!hooks[className]) {
    hooks[className] = {};
  }

  hooks[className][hookType] = hookFn;
};

/**
 * Retrieves a previously registered hook.
 *
 * @param {string} className The name of the class to get the hook on.
 * @param {string} hookType One of 'beforeSave', 'afterSave', 'beforeDelete', 'afterDelete'
 */
function getHook(className, hookType) {
  if (hooks[className] && hooks[className][hookType]) {
    return hooks[className][hookType];
  }
}

/**
 * Executes a registered hook with data provided.
 *
 * Hydrates the data into an instance of the class named by `className` param and binds it to the
 * function to be run.
 *
 * @param {string} className The name of the class to get the hook on.
 * @param {string} hookType One of 'beforeSave', 'afterSave', 'beforeDelete', 'afterDelete'
 * @param {Object} data The Data that is to be hydrated into an instance of className class.
 */
function runHook(className, hookType, data) {
  const hook = getHook(className, hookType);
  if (hook) {
    const modelData = Object.assign(new Object, data, {className});
    const model = Parse.Object.fromJSON(modelData);

    // TODO Stub out Parse.Cloud.useMasterKey() so that we can report the correct 'master'
    // value here.
    return hook(makeRequestObject(model, false)).done((beforeSaveOverrideValue) => {
      debugPrint('HOOK', { beforeSaveOverrideValue });

      // Unlike BeforeDeleteResponse, BeforeSaveResponse might specify
      var objectToProceedWith = model;
      if (hookType === 'beforeSave' && beforeSaveOverrideValue) {
        objectToProceedWith = beforeSaveOverrideValue.toJSON();
      }

      return Parse.Promise.as(_.omit(objectToProceedWith, "ACL"));
    });
  }
  return Parse.Promise.as(data);
}

function makeRequestObject(model, useMasterKey) {
  return {
      installationId: 'parse-mockdb',
      master: useMasterKey,
      object: model,
      user: "ParseMockDB doesn't define request.user."
    };
}

// Destructive. Takes data for update operation and removes all atomic operations.
// Returns the extracted ops.
function extractOps(data) {
  var ops = new Object();

  for (var key in data) {
    var attribute = data[key];
    if (isOp(attribute)) {
      ops[key] = attribute;
      delete data[key];
    }
  }

  return ops;
}

// Destructive. Applys all the update `ops` to `data`.
// Throws on unknown update operator.
function applyOps(data, ops, className) {
  debugPrint('OPS', ops);
  for (var key in ops) {
    const value = ops[key];
    const operator = value["__op"];

    if (operator in UPDATE_OPERATORS) {
      UPDATE_OPERATORS[operator].bind(data)(key, value, className)
    } else {
      throw new Error("Unknown update operator:" + key);
    }

    if (MASKED_UPDATE_OPS.has(operator)) {
      getMask(className).add(key);
    }
  }
}

// Ensures `object` has an array at `key`. Creates array if `key` doesn't exist.
// Will throw if value for `key` exists and is not Array.
function ensureArray(object, key) {
  if (!object[key]) {
    object[key] = new Array();
  }
  if (!Array.isArray(object[key])) {
    throw new Error("Can't perform array operaton on non-array field");
  }
}

const MASKED_UPDATE_OPS = new Set(["AddRelation", "RemoveRelation"]);

/**
 * Operator functions assume binding to **object** on which update operator is to be applied.
 *
 * Params:
 *    key   - value to be modified in bound object.
 *    value - operator value, i.e. `{__op: "Increment", amount: 1}`
 */
const UPDATE_OPERATORS = {
  Increment: function(key, value) {
    if (this[key] === undefined) {
      this[key] = 0;
    }
    this[key] += value.amount;
  },
  Add: function(key, value) {
    ensureArray(this, key);
    value.objects.forEach(object => {
      this[key].push(object);
    })
  },
  AddUnique: function(key, value) {
    ensureArray(this, key);
    var array = this[key];
    value.objects.forEach(object => {
      if (array.indexOf(object) === -1) {
        array.push(object);
      }
    });
  },
  Remove: function(key, value) {
    ensureArray(this, key);
    var array = this[key];
    value.objects.forEach(object => {
      _.remove(array, item => objectsAreEqual(item, object));
    });
  },
  Delete: function(key, value) {
    delete this[key];
  },
  AddRelation: function(key, value, className) {
    ensureArray(this, key);
    var relation = this[key];
    value.objects.forEach(pointer => {
      relation.push(pointer);
    });
  },
  RemoveRelation: function(key, value, className) {
    ensureArray(this, key);
    var relation = this[key];
    value.objects.forEach(item => {
      _.remove(relation, pointer => objectsAreEqual(pointer, item));
    })
  }
}

function debugPrint(prefix, object) {
  if (CONFIG.DEBUG) {
    console.log(['[',']'].join(prefix), JSON.stringify(object, null, 4));
  }
}

function getCollection(collection) {
  if (!db[collection]) {
    db[collection] = {}
  }
  return db[collection];
}

function getMask(collection) {
  if (!masks[collection]) {
    masks[collection] = new Set();
  }
  return masks[collection];
}

var MockRESTController = {
  request: function(method, path, data, options) {
    var result;
    if (path === "batch") {
      debugPrint('BATCH', {method, path, data, options});
      result = handleBatchRequest(method, path, data);
    } else {
      debugPrint('REQUEST', {method, path, data, options});
      result = handleRequest(method, path, data);
    }

    return result.then(function(result) {
      // Status of database after handling request above
      debugPrint('DB', db);
      debugPrint('RESPONSE', result.response);
      return Parse.Promise.when(result.response, result.status);
    });
  },
  ajax: function() {
    /* no-op */
  }
}

/**
 * Batch requests have the following form: {
 *  requests: [
 *      { method, path, body },
 *   ]
 * }
 */
function handleBatchRequest(method, path, data) {
  const requests = data.requests;
  const getResults = requests.map(request => {
    var method = request.method;
    var path = request.path;
    var body = request.body;
    return handleRequest(method, path, body).then(result => {
      return Parse.Promise.as({ success: result.response });
    })
  })

  return Parse.Promise.when.apply(null, getResults).then(function(results) {
    return respond(200, arguments);
  })
}

// Batch requests have the API version included in path
function normalizePath(path) {
  return path.replace('/1/', '');
}

const SPECIAL_CLASS_NAMES = {
  roles: '_Role',
  users: '_User',
  push: '_Push'
}

function handleRequest(method, path, body) {
  const explodedPath = normalizePath(path).split('/');
  const start = explodedPath.shift();
  const className = start === 'classes' ? explodedPath.shift() : SPECIAL_CLASS_NAMES[start];

  const request = {
    method: method,
    className,
    data: body,
    objectId: explodedPath.shift(),
  };
  return HANDLERS[method](request);
}

function respond(status, response) {
  return {
    status: status,
    response: response
  };
}

/**
 * Handles a GET request (Parse.Query.find(), get(), first(), Parse.Object.fetch())
 */
function handleGetRequest(request) {
  const objId = request.objectId;
  var className = request.className;
  if (objId) {
    // Object.fetch() query
    const collection = getCollection(className);
    const currentObject = collection[objId];
    if (!currentObject) {
      return Parse.Promise.as(respond(404, {
        code: 101,
        error: 'object not found for update'
      }));
    }
    var match = _.cloneDeep(currentObject);
    return Parse.Promise.as(respond(200, match));
  }

  const data = request.data;
  indirect = data.redirectClassNameForKey

  var matches = recursivelyMatch(className, data.where);

  if (indirect) {
    matches = outOfBandResults;
  }

  if (request.data.count) {
    return Parse.Promise.as(respond(200, { count: matches.length}));
  }

  matches = queryMatchesAfterIncluding(matches, data.include);

  const toOmit = Array.from(getMask(className));
  matches = matches.map((match) =>  _.omit(match, toOmit));

  // TODO: Can we just call toJSON() in order to avoid this?
  matches.forEach(match => {
    if (match.createdAt) {
      match.createdAt = match.createdAt.toJSON();
    }
    if (match.updatedAt) {
      match.updatedAt = match.updatedAt.toJSON();
    }
  })

  var limit = data.limit || DEFAULT_LIMIT;
  var startIndex = data.skip || 0;
  var endIndex = startIndex + limit;
  var response = { results: matches.slice(startIndex, endIndex) };
  return Parse.Promise.as(respond(200, response));
}

/**
 * Handles a POST request (Parse.Object.save())
 */
function handlePostRequest(request) {
  const className = request.className;
  const collection = getCollection(className);

  return runHook(className, 'beforeSave', request.data).then(result => {
    const newId = _.uniqueId();
    const now = new Date();

    const ops = extractOps(result);

    var newObject = Object.assign(
      result,
      { objectId: newId, createdAt: now, updatedAt: now }
    );

    applyOps(newObject, ops, className);
    const toOmit = ['updatedAt'].concat(Array.from(getMask(className)));

    collection[newId] = newObject;

    var response = Object.assign(
      _.cloneDeep(_.omit(newObject, toOmit)),
      { createdAt: result.createdAt.toJSON() }
    );

    return Parse.Promise.as(respond(201, response));
  });
}

function handlePutRequest(request) {
  const className = request.className;
  const collection = getCollection(className);
  const objId = request.objectId;
  const currentObject = collection[objId];
  const now = new Date();
  const data = request.data || {};

  const ops = extractOps(data);

  if (!currentObject) {
    return Parse.Promise.as(respond(404, {
      code: 101,
      error: 'object not found for put'
    }));
  }

  var updatedObject = Object.assign(
    _.cloneDeep(currentObject),
    data,
    { updatedAt: now }
  );

  applyOps(updatedObject, ops, className);
  const toOmit = ['createdAt', 'objectId'].concat(Array.from(getMask(className)));;

  return runHook(className, 'beforeSave', updatedObject).then(result => {
    collection[request.objectId] = updatedObject;
    var response = Object.assign(
      _.cloneDeep(_.omit(result, toOmit)),
      { updatedAt: now }
    );
    return Parse.Promise.as(respond(200, response));
  });
}

function handleDeleteRequest(request) {
  const collection = getCollection(request.className);
  var objToDelete = collection[request.objectId];

  return runHook(request.className, 'beforeDelete', objToDelete).then(result => {
    delete collection[request.objectId];
    return Parse.Promise.as(respond(200, {}));
  });
}

function makePointer(className, id) {
  return {
    __type: "Pointer",
    className: className,
    objectId: id,
  }
}

function isOp(object) {
  return object && typeof object === "object" && "__op" in object;
}

function isPointer(object) {
  return object && object.__type === "Pointer";
}

function isDate(object) {
  return object && object.__type === "Date";
}

/**
 * Given a set of matches of a GET query (e.g. find()), returns fully
 * fetched Parse Objects that include the nested objects requested by
 * Parse.Query.include()
 */
function queryMatchesAfterIncluding(matches, includeClause) {
  if (!includeClause) {
    return matches;
  }

  var includeClauses = includeClause.split(",");
  matches = _.map(matches, function(match) {
    for (var i = 0; i < includeClauses.length; i++) {
      var paths = includeClauses[i].split(".");
      match = includePaths(match, paths);
    }
    return match;
  });

  return matches;
}

/**
 * Recursive function that traverses an include path and replaces pointers
 * with fully fetched objects
 */
function includePaths(object, pathsRemaining) {
  debugPrint('INCLUDE', {object, pathsRemaining})
  const path = pathsRemaining.shift();
  const target = object && object[path];

  if (target) {
    if (Array.isArray(target)) {
      object[path] = target.map(pointer => {
        const fetched = fetchObjectByPointer(pointer);
        includePaths(fetched, _.cloneDeep(pathsRemaining));
        return fetched;
      })
    } else {
      if (object[path].__type == 'Pointer') {
        object[path] = fetchObjectByPointer(target);
      }
      includePaths(object[path], pathsRemaining);
    }
  }

  return object;
};

/**
 * Given an object, a pointer, or a JSON representation of a Parse Object,
 * return a fully fetched version of the Object.
 */
function fetchObjectByPointer(pointer) {
  const collection = getCollection(pointer.className);
  const storedItem = collection[pointer.objectId];

  if (storedItem === undefined) {
    return undefined;
  }

  return Object.assign(
    { __type: "Object", className: pointer.className },
    _.cloneDeep(storedItem)
  );
}

/**
 * Given a class name and a where clause, returns DB matches by applying
 * the where clause (recursively if nested)
 */
function recursivelyMatch(className, where) {
  debugPrint('MATCH', {className, where});
  const collection = getCollection(className);
  const matches = _.filter(_.values(collection), queryFilter(where));
  debugPrint('MATCHES', {matches});
  return _.cloneDeep(matches); // return copies instead of originals
}

/**
 * Returns a function that filters query matches on a where clause
 */
function queryFilter(where) {
  if (where["$or"]) {
    return function(object) {
      return _.reduce(where["$or"], function(result, subclause) {
        return result || queryFilter(subclause)(object);
      }, false);
    }
  }

  return function(object) {
    // Go through each key in where clause
    return _.reduce(where, function(result, whereParams, key) {
      var match = evaluateObject(object, whereParams, key);
      return result && match;
    }, true);
  };
}

function evaluateObject(object, whereParams, key) {
  let nestedKeys = key.split('.');
  if (nestedKeys.length > 1) {
    for (let i = 0; i < nestedKeys.length - 1; i++) {
      if (!object[nestedKeys[i]]) {
        // key not found
        return false;
      }
      object = object[nestedKeys[i]];
      key = nestedKeys[i+1];
    }
  }

  if (typeof whereParams === "object") {
    // Handle objects that actually represent scalar values
    if (isPointer(whereParams) || isDate(whereParams)) {
      return QUERY_OPERATORS['$eq'].apply(object[key], [whereParams]);
    }

    if (key in QUERY_OPERATORS) {
      return QUERY_OPERATORS[key].apply(object, [whereParams]);
    }

    // Process each key in where clause to determine if we have a match
    return _.reduce(whereParams, function(matches, value, constraint) {
      var keyValue = deserializeQueryParam(object[key]);
      var param = deserializeQueryParam(value);

      // Constraint can take the form form of a query operator OR an equality match
      if (constraint in QUERY_OPERATORS) {  // { age: {$lt: 30} }
        return matches && QUERY_OPERATORS[constraint].apply(keyValue, [param]);
      } else {                              // { age: 30 }
        return matches && QUERY_OPERATORS['$eq'].apply(keyValue[constraint], [param]);
      }
    }, true);
  }

  return QUERY_OPERATORS['$eq'].apply(object[key], [whereParams]);
}

/**
 * Operator functions assume binding to **value** on which query operator is to be applied.
 *
 * Params:
 *    value - operator value, i.e. the number 30 in `age: {$lt: 30}`
 */
const QUERY_OPERATORS = {
  '$exists': function(value) {
    return !!this === value;
  },
  '$in': function(values) {
    return _.some(values, value => {
      return objectsAreEqual(this, value);
    });
  },
  '$nin': function(values) {
    return _.every(values, value => {
      return !objectsAreEqual(this, value);
    });
  },
  '$eq': function(value) {
    return objectsAreEqual(this, value);
  },
  '$ne': function(value) {
    return !objectsAreEqual(this, value);
  },
  '$lt': function(value) {
    return this < value;
  },
  '$lte': function(value) {
    return this <= value;
  },
  '$gt': function(value) {
    return this > value;
  },
  '$gte': function(value) {
    return this >= value;
  },
  '$regex': function(value) {
    const regex = _.clone(value).replace(QUOTE_REGEXP, "");
    return (new RegExp(regex).test(this))
  },
  '$select': function(value) {
    var foreignKey = value.key;
    var query = value.query;
    var matches = recursivelyMatch(query.className, query.where);
    var objectMatches = _.filter(matches, match => {
      return match[foreignKey] == this;
    });
    return objectMatches.length;
  },
  '$inQuery': function(query) {
    var matches = recursivelyMatch(query.className, query.where);
    return _.find(matches, match => {
      return this && match.objectId === this.objectId;
    });
  },
  '$all': function(value) {
    return _.every(value, obj1 => {
      return _.some(this, obj2 => {
        return objectsAreEqual(obj1, obj2);
      });
    });
  },
  '$relatedTo': function(value) {
    var object = value.object;
    var className = object.className;
    var id = object.objectId;
    var relatedKey = value.key;
    var relations = getCollection(className)[id][relatedKey];
    if (indirect) {
      outOfBandResults = relations.reduce((results, relation) => {
        var matches = recursivelyMatch(relations[0].className, {
          objectId: relation.objectId
        });
        return results.concat(matches);
      }, new Array());
    } else {
      return objectsAreEqual(relations, this);
    }
  },
}

/**
 * Deserializes an encoded query parameter if necessary
 */
function deserializeQueryParam(param) {
  if (!!param && (typeof param === "object")) {
    if (param.__type === "Date") {
      return new Date(param.iso);
    }
  }
  return param;
};

/**
 * Evaluates whether 2 objects are the same, independent of their representation
 * (e.g. Pointer, Object)
 */
function objectsAreEqual(obj1, obj2) {
  // scalar values (including null/undefined)
  if (obj1 == obj2) {
    return true;
  }

  // if any of those is null or undefined the other is not because
  // of above --> abort
  if (!obj1 || !obj2) {
    return false;
  }

  // objects
  if (_.isEqual(obj1, obj2)) {
    return true;
  }

  // both pointers
  if (obj1.objectId !== undefined && obj1.objectId == obj2.objectId) {
    return true;
  }

  // search through array
  if (Array.isArray(obj1)) {
    return _.some(obj1, obj => objectsAreEqual(obj, obj2));
  }

  // both dates
  if (isDate(obj1) && isDate(obj2)) {
    return deserializeQueryParam(obj1) === deserializeQueryParam(obj2);
  }

  return false;
}

// **HACK** Makes testing easier.
function promiseResultSync(promise) {
  var result;
  promise.then(function(res) {
    result = res;
  });
  return result;
}

Parse.MockDB = {
  mockDB: mockDB,
  unMockDB: unMockDB,
  cleanUp: cleanUp,
  promiseResultSync: promiseResultSync,
  registerHook: registerHook,
};

module.exports = Parse.MockDB;
