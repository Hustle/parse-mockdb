'use strict';

const assert = require("assert");
const ParseMockDB = require('../src/parse-mockdb');
const Parse = require('parse/node');

class Brand extends Parse.Object {
  constructor(attributes, options) {
    super('Brand', attributes, options);
  }
}
Parse.Object.registerSubclass('Brand', Brand);

class Item extends Parse.Object {
  constructor(attributes, options) {
    super('Item', attributes, options);
  }
}
Parse.Object.registerSubclass('Item', Item);

class Store extends Parse.Object {
  constructor(attributes, options) {
    super('Store', attributes, options);
  }
}
Parse.Object.registerSubclass('Store', Store);

class CustomUserSubclass extends Parse.User { };

function createBrandP(name) {
  const brand = new Brand();
  brand.set("name", name);
  return brand.save();
}

function createItemP(price, brand) {
  const item = new Item();
  item.set("price", price);

  if (brand) {
    item.set("brand", brand);
  }
  return item.save();
}

function createStoreWithItemP(item) {
  const store = new Store();
  store.set("item", item);
  return store.save();
}

function createUserP(name) {
  const user = new CustomUserSubclass();
  user.set('name', name);
  return user.save();
}

function itemQueryP(price) {
  const query = new Parse.Query(Item);
  query.equalTo("price", price);
  return query.find();
}

function behavesLikeParseObjectOnBeforeSave(typeName, ParseObjectOrUserSubclass) {
  context('when object has beforeSave hook registered', function() {

    function beforeSavePromise(request) {
      const object = request.object;
      if (object.get("error")) {
        return Parse.Promise.error("whoah");
      }
      object.set('cool', true);
      return Parse.Promise.as(object);
    }

    it('runs the hook before saving the model and persists the object', function() {
      ParseMockDB.registerHook(typeName, 'beforeSave', beforeSavePromise);

      const object = new ParseObjectOrUserSubclass();
      assert(!object.has('cool'));

      return object.save().then(function(savedObject) {
        assert(savedObject.has('cool'));
        assert(savedObject.get('cool'));

        return new Parse.Query(ParseObjectOrUserSubclass).first().then(function(queriedObject) {
          assert(queriedObject.has('cool'));
          assert(queriedObject.get('cool'));
        });
      });
    });

    it('rejects the save if there is a problem', function() {
      ParseMockDB.registerHook(typeName, 'beforeSave', beforeSavePromise);

      const object = new ParseObjectOrUserSubclass({error: true});

      return object.save().then(function(savedObject) {
        assert.fail(null, null, "should not have saved");
      }, function(error) {
        assert.equal(error, "whoah");
      });
    });
  });
}

function behavesLikeParseObjectOnBeforeDelete(typeName, ParseObjectOrUserSubclass) {

  context('when object has beforeDelete hook registered', function() {

    var beforeDeleteWasRun;

    beforeEach(function() {
      beforeDeleteWasRun = false;
    });

    function beforeDeletePromise(request) {
      const object = request.object;
      if (object.get("error")) {
        return Parse.Promise.error("whoah");
      }
      beforeDeleteWasRun = true;
      return Parse.Promise.as();
    }

    it('runs the hook before deleting the object', function() {
      ParseMockDB.registerHook(typeName, 'beforeDelete', beforeDeletePromise);

      const promises = [];

      promises.push(new ParseObjectOrUserSubclass()
          .save()
          .done(function(savedParseObjectOrUserSubclass) {
        return Parse.Object.destroyAll([savedParseObjectOrUserSubclass]);
      }).done(function() {
        assert(beforeDeleteWasRun);
      }));

      promises.push(new Parse.Query(ParseObjectOrUserSubclass)
        .find()
        .done(function(results) {
          assert.equal(results.length, 0);
        }));

      return Parse.Promise.when(promises);
    });

    it('rejects the delete if there is a problem', function() {
      ParseMockDB.registerHook(typeName, 'beforeDelete', beforeDeletePromise);

      const object = new ParseObjectOrUserSubclass({error: true});
      return object.save().done(function(savedParseObjectOrUserSubclass) {
        return Parse.Object.destroyAll([savedParseObjectOrUserSubclass]);
      }).then(function(deletedParseObjectOrUserSubclass) {
        assert.fail(null, null, "should not have deleted");
      }, function(error) {
        assert.equal(error, "whoah");
        return new Parse.Query(ParseObjectOrUserSubclass).find();
      }).done(function(results) {
        assert.equal(results.length, 1);
      });
    });
  });
};

describe('ParseMock', function(){
  beforeEach(function() {
    Parse.MockDB.mockDB();
  });

  afterEach(function() {
    Parse.MockDB.cleanUp();
  });

  context('supports Parse.User subclasses', function() {

    it("should save user", function() {
      return createUserP('Tom').then(function(user) {
        assert.equal(user.get("name"), 'Tom');
      });
    });

    it('should save and find a user', function() {
      return createUserP('Tom').then(function(user) {
        const query = new Parse.Query(CustomUserSubclass);
        query.equalTo("name", 'Tom');
        return query.first().then(function(user) {
          assert.equal(user.get('name'), 'Tom');
        });
      });
    });

    behavesLikeParseObjectOnBeforeSave('_User', CustomUserSubclass);
    behavesLikeParseObjectOnBeforeDelete('_User', CustomUserSubclass);
  });

  it("should save correctly", function() {
    return createItemP(30).then(function(item) {
      assert.equal(item.get("price"), 30);
    });
  });

  it("should come back with createdAt", function() {
    var createdAt;
    return createItemP(30).then(function(item) {
      assert(item.createdAt);
      createdAt = item.createdAt;
      return (new Parse.Query(Item)).first();
    }).then((fetched) => {
      assert.equal(createdAt.getTime(), fetched.createdAt.getTime());
    });
  });

  it("should get a specific ID correctly", function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      return query.get(item.id).then(function(fetchedItem) {
        assert.equal(fetchedItem.id, item.id);
      });
    });
  });

  it("should match a correct equalTo query on price", function() {
    return createItemP(30).then(function(item) {
      return itemQueryP(30).then(function(results) {
        assert.equal(results[0].id, item.id);
        assert.equal(results[0].get("price"), item.get("price"));
      });
    });
  });

  it('should save and find an item', function() {
    const item = new Item();
    item.set("price", 30);
    return item.save().then(function(item) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 30);
      return query.first().then(function(item) {
        assert.equal(item.get("price"), 30);
      });
    });
  });

  it('should save and find an item via object comparison', function() {
    const item = new Item({ cool: {awesome: true} });
    return item.save().then(function(item) {
      const query = new Parse.Query(Item);
      query.equalTo('cool', {awesome: true});
      return query.first().then(function(item) {
        assert(item.get('cool').awesome);
      });
    });
  });

  it('should support increment', function() {
    return createItemP(30).then(function(item) {
      item.increment("price", 5);
      return item.save();
    }).then(function(item) {
      assert.equal(item.get("price"), 35);
    });
  });

  it('should support negative increment', function() {
    return createItemP(30).then(function(item) {
      item.increment("price", -5);
      return item.save();
    }).then(function(item) {
      assert.equal(item.get("price"), 25);
    });
  });

  it('should increment a non-existent field', function() {
    return createItemP(30).then(function(item) {
      return item
        .increment('foo')
        .save();
    }).then(function(item) {
      assert.equal(item.get('foo'), 1);
    });
  });

  it('should support unset', function() {
    return createItemP(30).then(function(item) {
      item.unset("price");
      return item.save();
    }).then(function(item) {
      assert(!item.has("price"));
    });
  });

  it('should support add', function() {
    return createItemP(30).then(function(item) {
      item.add("languages", "JS");
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["JS"]);
    });
  });

  it('should support addUnique', function() {
    return createItemP(30).then(function(item) {
      item.add("languages", "JS");
      item.add("languages", "Ruby");
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["JS", "Ruby"]);
      item.addUnique("languages", "JS");
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["JS", "Ruby"]);
    });
  });

  it('should support remove', function() {
    return createItemP(30).then(function(item) {
      item.add("languages", "JS");
      item.add("languages", "JS");
      item.add("languages", "Ruby");
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["JS", "JS", "Ruby"]);
      item.remove("languages", "JS");
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["Ruby"]);
    });
  });

  it('should saveAll and find 2 items', function() {
    const item = new Item();
    item.set("price", 30);

    const item2 = new Item();
    item2.set("price", 30);
    return Parse.Object.saveAll([item, item2]).then(function(items) {
      assert.equal(items.length, 2);
      const query = new Parse.Query(Item);
      query.equalTo("price", 30);
      return query.find().then(function(items) {
        assert.equal(items.length, 2);
        assert.equal(items[0].get("price"), 30);
        assert.equal(items[1].get("price"), 30);
      });
    });
  });

  it('should find an item matching an or query', function() {
    const Item = Parse.Object.extend("Item");
    const item = new Item();
    item.set("price", 30);
    return item.save().then(function(item) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 30);

      const otherQuery = new Parse.Query(Item);
      otherQuery.equalTo("name", "Chicken");

      const orQuery = Parse.Query.or(query, otherQuery);
      return orQuery.find().then(function(items) {
        assert.equal(items[0].id, item.id);
      });
    });
  });

  it('should not find any items if they do not match an or query', function() {
    const Item = Parse.Object.extend("Item");
    const item = new Item();
    item.set("price", 30);
    return item.save().then(function(item) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 50);

      const otherQuery = new Parse.Query(Item);
      otherQuery.equalTo("name", "Chicken");

      const orQuery = Parse.Query.or(query, otherQuery);
      return orQuery.find().then(function(items) {
        assert.equal(items.length, 0);
      });
    });
  });

  it('should save 2 items and get one for a first() query', function() {
    return Parse.Promise.when(createItemP(30), createItemP(20)).then(function(item1, item2) {
      const query = new Parse.Query(Item);
      return query.first().then(function(item) {
        assert.equal(item.get("price"), 30);
      });
    });
  });

  it("should handle nested includes", function() {
    return createBrandP("Acme").then(function(brand) {
      return createItemP(30, brand).then(function(item) {
        const brand = item.get("brand");
        return createStoreWithItemP(item).then(function(savedStore) {
          const query = new Parse.Query(Store);
          query.include("item");
          query.include("item.brand");
          return query.first().then(function(result) {
            const resultItem = result.get("item");
            const resultBrand = resultItem.get("brand");
            assert.equal(resultItem.id, item.id);
            assert.equal(resultBrand.get("name"), "Acme");
            assert.equal(resultBrand.id, brand.id);
          });
        });
      });
    });
  });

  it("should return invalid pointers if they are not included", function() {
    const item = new Item();
    item.id = "ZZZZZZZZ";
    return createStoreWithItemP(item).then(function(savedStore) {
      const query = new Parse.Query(Store);
      return query.first().then(function(result) {
        assert.strictEqual(result.get("item").id, item.id);
      });
    });
  });

  it("should leave includes of invalid pointers undefined", function() {
    const item = new Item();
    item.id = "ZZZZZZZZ";
    return createStoreWithItemP(item).then(function(savedStore) {
      const query = new Parse.Query(Store);
      query.include("item");
      query.include("item.brand");
      return query.first().then(function(result) {
        assert.strictEqual(result.get("item"), undefined);
      });
    });
  });

  it("should handle multiple nested includes", function() {
    var a1, a2, b, c;
    return Parse.Promise.when(
        new Parse.Object('a', {value: '1'}).save(),
        new Parse.Object('a', {value: '2'}).save())
    .then(function(savedA1, savedA2) {
      a1 = savedA1;
      a2 = savedA2;
      return new Parse.Object('b', {a1, a2}).save();
    })
    .then(function(savedB) {
      b = savedB;
      return new Parse.Object('c', {b}).save();
    })
    .then(function(savedC) {
      c = savedC;
      return new Parse.Query('c')
          .include('b')
          .include('b.a1')
          .include('b.a2')
          .first();
    })
    .then(function(loadedC) {
      assert.equal(loadedC.id, c.id);
      assert.equal(loadedC.get('b').id, b.id);
      assert.equal(loadedC.get('b').get('a1').id, a1.id);
      assert.equal(loadedC.get('b').get('a2').id, a2.id);
      assert.equal(loadedC.get('b').get('a1').get('value'), a1.get('value'));
      assert.equal(loadedC.get('b').get('a2').get('value'), a2.get('value'));
    });
  });

  it('should handle includes over arrays of pointers', function() {
    const item1 = new Item({cool: true});
    const item2 = new Item({cool: false});
    const items = [item1, item2];
    return Parse.Object.saveAll(items).then(function(savedItems) {
      const brand = new Brand({
        items: items
      });
      return brand.save();
    }).then(function() {
      const q = new Parse.Query(Brand).include('items');
      return q.first();
    }).then(function(brand) {
      assert(brand.get('items')[0].get('cool'));
      assert(!brand.get('items')[1].get('cool'));
    });
  });

  it('should handle nested includes over arrays of pointers', function() {
    const store = new Store({location: "SF"});
    const item1 = new Item({cool: true, store: store});
    const item2 = new Item({cool: false});
    const items = [item1, item2];
    return Parse.Object.saveAll(items.concat([store])).then(function(savedItems) {
      const brand = new Brand({
        items: items
      });
      return brand.save();
    }).then(function() {
      const q = new Parse.Query(Brand).include('items,items.store');
      return q.first();
    }).then(function(brand) {
      assert.equal(brand.get('items')[0].get("store").get("location"), "SF");
      assert(!brand.get('items')[1].get('cool'));
    });
  });

  it('should handle includes where item is missing', function() {
    const item = new Item({cool: true});
    const brand1 = new Brand({});
    const brand2 = new Brand({item: item});
    return Parse.Object.saveAll([item, brand1, brand2]).then(function() {
      const q = new Parse.Query(Brand).include('item');
      return q.find();
    }).then(function(brands) {
      assert(!brands[0].has('item'));
      assert(brands[1].has('item'));
    });
  });

  it('should handle includes where nested array item is missing', function() {
    const store = new Store({location: "SF"});
    const item1 = new Item({cool: true, store: store});
    const item2 = new Item({cool: false});
    const items = [item1, item2];
    return Parse.Object.saveAll(items.concat([store])).then(function(savedItems) {
      const brand = new Brand({
        items: items
      });
      return brand.save();
    }).then(function() {
      const q = new Parse.Query(Brand).include('items,items.blah,wow');
      return q.first();
    }).then(function(brand) {
      assert(brand.get('items')[0].get('cool'));
      assert(!brand.get('items')[1].get('cool'));
    });
  });

  it('should handle delete', function() {
    const item = new Item();
    return item.save().then(function(item) {
      return new Parse.Query(Item).first();
    }).then(function(foundItem) {
      assert(foundItem);
      return foundItem.destroy();
    }).then(function() {
      return new Parse.Query(Item).first();
    }).then(function(foundItem) {
      assert(!foundItem);
    });
  });

  it("should do a fetch query", function() {
    let savedItem;
    return new Item().save({price: 30}).then(function(item1) {
      savedItem = item1;
      return Item.createWithoutData(item1.id).fetch();
    }).then(function(fetched) {
      assert.equal(fetched.id, savedItem.id);
      assert.equal(fetched.get('price'), 30);
    });
  });

  it("should find with objectId", function() {
    let savedItem;
    return new Item().save({price: 30}).then(function(item1) {
      savedItem = item1;
      return new Parse.Query(Item).equalTo('objectId', item1.id).first();
    }).then(function(fetched) {
      assert.equal(fetched.id, savedItem.id);
      assert.equal(fetched.get('price'), 30);
    });
  });

  it("should get objectId", function() {
    let savedItem;
    return new Item().save({price: 30}).then(function(item1) {
      savedItem = item1;
      return new Parse.Query(Item).get(item1.id);
    }).then(function(fetched) {
      assert.equal(fetched.id, savedItem.id);
      assert.equal(fetched.get('price'), 30);
    });
  });

  it("should find with objectId and where", function() {
    return Parse.Promise.when(
      new Item().save({price: 30}),
      new Item().save({name: 'Device'})
    ).then(function(item1, item2) {
      const itemQuery = new Parse.Query(Item);
      itemQuery.exists('nonExistant');
      itemQuery.equalTo('objectId', item1.id);
      return itemQuery.find().then(function(items) {
        assert.equal(items.length, 0);
      });
    });
  });

  it("should match a correct when exists query", function() {
    return Parse.Promise.when(
      new Item().save({price: 30}),
      new Item().save({name: 'Device'})
    ).then(function(item1, item2) {
      const itemQuery = new Parse.Query(Item);
      itemQuery.exists('price');
      return itemQuery.find().then(function(items) {
        assert.equal(items.length, 1);
        assert.equal(items[0].id, item1.id);
      });
    });
  });

  it("should match a correct when doesNotExist query", function() {
    return Parse.Promise.when(
      new Item().save({price: 30}),
      new Item().save({name: 'Device'})
    ).then(function(item1, item2) {
      const itemQuery = new Parse.Query(Item);
      itemQuery.doesNotExist('price');
      return itemQuery.find().then(function(itmes) {
        assert.equal(itmes.length, 1);
        assert.equal(itmes[0].id, item2.id);
      });
    });
  });

  it("should match a correct equalTo query for an object", function() {
    return createItemP(30).then(function(item) {
      const store = new Store();
      store.set("item", item);
      return store.save().then(function(savedStore) {
        const query = new Parse.Query(Store);
        query.equalTo("item", item);
        return query.find().then(function(results) {
          assert.equal(results[0].id, savedStore.id);
        });
      });
    });
  });

  xit("should handle an equalTo null query for an object without a null field", function() {
    return createItemP(30).then(function(item) {
      const store = new Store();
      store.set("item", item);
      return store.save().then(function(savedStore) {
        const query = new Parse.Query(Store);
        query.equalTo("item", null);
        return query.find().then(function(results) {
          assert.equal(results.length, 0);
        });
      });
    });
  });

  it("should handle an equalTo null query for an object with a null field", function() {
    const store = new Store();
    return store.save().then(function(savedStore) {
      const query = new Parse.Query(Store);
      query.equalTo("item", null);
      return query.find().then(function(results) {
        assert.equal(results[0].id, savedStore.id);
      });
    });
  });

  it("should handle a notEqualTo null query for an object without a null field", function() {
    return createItemP(30).then(function(item) {
      const store = new Store();
      store.set("item", item);
      return store.save().then(function(savedStore) {
        const query = new Parse.Query(Store);
        query.notEqualTo("item", null);
        return query.find().then(function(results) {
          assert.equal(results[0].id, savedStore.id);
        });
      });
    });
  });

  it("should handle a notEqualTo null query for an object with a null field", function() {
    const store = new Store();
    return store.save().then(function(savedStore) {
      const query = new Parse.Query(Store);
      query.notEqualTo("item", null);
      return query.find().then(function(results) {
        assert.equal(results.length, 0);
      });
    });
  });

  it("should not match an incorrect equalTo query on price", function() {
    return createItemP(30).then(function(item) {
      return itemQueryP(20).then(function(results) {
        assert.equal(results.length, 0);
      });
    });
  });

  it("should not match an incorrect equalTo query on price and name", function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 30);
      query.equalTo("name", "pants");
      return query.find().then(function(results) {
        assert.equal(results.length, 0);
      });
    });
  });

  it("should not match an incorrect containedIn query", function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.containedIn("price", [40, 90]);
      return query.find().then(function(results) {
        assert.equal(results.length, 0);
      });
    });
  });

  it("should find 2 objects when there are 2 matches", function() {
    return Parse.Promise.when(createItemP(20), createItemP(20)).then(function(item1, item2) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 20);
      return query.find().then(function(results) {
        assert.equal(results.length, 2);
      });
    });
  });

  it("should first() 1 object when there are 2 matches", function() {
    return Parse.Promise.when(createItemP(20), createItemP(20)).then(function(item1, item2) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 20);
      return query.first().then(function(result) {
        assert.equal(result.id, item1.id);
      });
    });
  });

  it("should match a query with 1 objects when 2 objects are present", function() {
    return Parse.Promise.when(createItemP(20), createItemP(30)).then(function(item1, item2) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 20);
      return query.find().then(function(results) {
        assert.equal(results.length, 1);
      });
    });
  });

  it('should match a date', function() {
    const bornOnDate = new Date();
    const item = new Item({bornOnDate: bornOnDate});

    return item.save().then(function(item) {
      const query = new Parse.Query(Item);
      query.equalTo("bornOnDate", bornOnDate);
      return query.first().then(function(result) {
        assert(result.get("bornOnDate", bornOnDate));
      });
    });
  });

  it('should properly handle date in query operator', function() {
    const bornOnDate = new Date();
    const middleDate = new Date();
    const expireDate = new Date();
    middleDate.setDate(bornOnDate.getDate() + 1);
    expireDate.setDate(bornOnDate.getDate() + 2);

    const item = new Item({
      bornOnDate: bornOnDate,
      expireDate: expireDate,
    });

    return item.save().then(function(item) {
      const query = new Parse.Query(Item);
      query.lessThan("bornOnDate", middleDate);
      query.greaterThan("expireDate", middleDate);
      return query.first().then(function(result) {
        assert(result);
      });
    });
  });

  it("should handle $nin", function() {
    return Parse.Promise.when(createItemP(20), createItemP(30)).then(function(item1, item2) {
      const query = new Parse.Query(Item);
      query.notContainedIn("price", [30]);
      return query.find();
    }).then(function(results) {
      assert.equal(results.length, 1);
      assert.equal(results[0].get("price"), 20);
    });
  });

  it("should handle $nin on objectId", function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.notContainedIn("objectId", [item.id]);
      return query.find();
    }).then(function(results) {
      assert.equal(results.length, 0);
    });
  });

  it("should handle $nin with an empty array", function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.notContainedIn("objectId", []);
      return query.find();
    }).then(function(results) {
      assert.equal(results.length, 1);
    });
  });

  it("should handle $regex queries", function() {
    return createBrandP("Acme").then(function(item) {
      const query = new Parse.Query(Brand);
      query.startsWith("name", "Ac");
      return query.find();
    }).then(function(results) {
      assert.equal(results.length, 1);
    });
  });

/**
 *  see: https://github.com/ParsePlatform/Parse-SDK-JS/issues/91
 *  NOTE TEST IS DISABLED
 */
  xit("should not overwrite included objects after a save", function() {
    return createBrandP("Acme").then(function(brand) {
      return createItemP(30, brand).then(function(item) {
        return createStoreWithItemP(item).then(function(store) {
          const query = new Parse.Query(Store);
          query.include("item");
          query.include("item.brand");
          return query.first().then(function(str) {
            str.set("lol", "wut");
            return str.save().then(function(newStore) {
              assert.equal(str.get("item").get("brand").get("name"), brand.get("name"));
            });
          });
        });
      });
    });
  });

/**
 *  see: https://github.com/ParsePlatform/Parse-SDK-JS/issues/91
 *  NOTE TEST IS DISABLED
 */
  xit("should update an existing object correctly", function() {
    return Parse.Promise.when(createItemP(30), createItemP(20)).then(function(item1, item2) {
      return createStoreWithItemP(item1).then(function(store) {
        item2.set("price", 10);
        store.set("item", item2);
        return store.save().then(function(store) {
          assert(store.has("item"));
          assert(store.get("item").get("price") === 10);
        });
      });
    });
  });

  it("should support a nested query", function() {
    const brand = new Brand();
    brand.set("name", "Acme");
    brand.set("country", "US");
    return brand.save().then(function(brand) {
      const item = new Item();
      item.set("price", 30);
      item.set("country_code", "US");
      item.set("state", "CA");
      item.set("brand", brand);
      return item.save();
    }).then(function(item) {
      const store = new Store();
      store.set("state", "CA");
      return store.save();
    }).then(function(store) {
      const brandQuery = new Parse.Query(Brand);
      brandQuery.equalTo("name", "Acme");

      const itemQuery = new Parse.Query(Item);
      itemQuery.matchesKeyInQuery("country_code", "country", brandQuery);

      const storeQuery = new Parse.Query(Store);
      storeQuery.matchesKeyInQuery("state", "state", itemQuery);
      return Parse.Promise.when(storeQuery.find(), Parse.Promise.as(store));
    }).then(function(storeMatches, store) {
      assert.equal(storeMatches.length, 1);
      assert.equal(storeMatches[0].id, store.id);
    });
  });

  it('should find items not filtered by a notContainedIn', function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 30);
      query.notContainedIn("objectId", [234]);
      return query.find().then(function(items) {
        assert.equal(items.length, 1);
      });
    });
  });

  it('should find not items filtered by a notContainedIn', function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.equalTo("price", 30);
      query.notContainedIn("objectId", [item.id]);
      return query.find().then(function(items) {
        assert.equal(items.length, 0);
      });
    });
  });

  it('should handle a lessThan query', function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.lessThan("createdAt", new Date("2024-01-01T23:28:56.782Z"));
      return query.find().then(function(items) {
        assert.equal(items.length, 1);
        const newQuery = new Parse.Query(Item);
        newQuery.greaterThan("createdAt", new Date());
        return newQuery.find().then(function(moreItems) {
          assert.equal(moreItems.length, 0);
        });
      });
    });
  });

  it('should handle a lessThanOrEqualTo query', function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.lessThanOrEqualTo("price", 30);
      return query.find().then(function(items) {
        assert.equal(items.length, 1);
        query.lessThanOrEqualTo("price", 20);
        return query.find().then(function(moreItems) {
          assert.equal(moreItems.length, 0);
        });
      });
    });
  });

  it('should handle a greaterThan query', function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.greaterThan("price", 20);
      return query.find().then(function(items) {
        assert.equal(items.length, 1);
        query.greaterThan("price", 50);
        return query.find().then(function(moreItems) {
          assert.equal(moreItems.length, 0);
        });
      });
    });
  });

  it('should handle a greaterThanOrEqualTo query', function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.greaterThanOrEqualTo("price", 30);
      return query.find().then(function(items) {
        assert.equal(items.length, 1);
        query.greaterThanOrEqualTo("price", 50);
        return query.find().then(function(moreItems) {
          assert.equal(moreItems.length, 0);
        });
      });
    });
  });

  it('should handle multiple conditions for a single key', function() {
    return createItemP(30).then(function(item) {
      const query = new Parse.Query(Item);
      query.greaterThan("price", 20);
      query.lessThan("price", 40);
      return query.find().then(function(items) {
        assert.equal(items.length, 1);
        query.greaterThan("price", 30);
        return query.find().then(function(moreItems) {
          assert.equal(moreItems.length, 0);
        });
      });
    });
  });

  it('should correcly handle matchesQuery', function() {
    return createBrandP("Acme").then(function(brand) {
      return createItemP(30, brand).then(function(item) {
        return createStoreWithItemP(item).then(function(store) {
          const brandQuery = new Parse.Query(Brand);
          brandQuery.equalTo("name", "Acme");

          const itemQuery = new Parse.Query(Item);
          itemQuery.matchesQuery("brand", brandQuery);

          const storeQuery = new Parse.Query(Store);
          storeQuery.matchesQuery("item", itemQuery);

          return storeQuery.find().then(function(store) {
            assert(store);
          });
        });
      });
    });
  });

  it('should correctly count items in a matchesQuery', function() {
    return createBrandP("Acme").then(function(brand) {
      return createItemP(30, brand).then(function(item) {
        return createStoreWithItemP(item).then(function(store) {
          const itemQuery = new Parse.Query(Item);
          itemQuery.equalTo("price", 30);

          const storeQuery = new Parse.Query(Store);
          storeQuery.matchesQuery("item", itemQuery);
          return storeQuery.count().then(function(storeCount) {
            assert.equal(storeCount, 1);
          });
        });
      });
    });
  });

  it('should skip and limit items appropriately', function() {
    return createBrandP("Acme").then(function(brand) {
      return createBrandP("Acme 2").then(function(brand2) {
        const brandQuery = new Parse.Query(Brand);
        brandQuery.limit(1);
        return brandQuery.find().then(function(brands) {
          assert.equal(brands.length, 1);
          const brandQuery2 = new Parse.Query(Brand);
          brandQuery2.limit(1);
          brandQuery2.skip(1);
          return brandQuery2.find().then(function(moreBrands) {
            assert.equal(moreBrands.length, 1);
            assert.notEqual(moreBrands[0].id, brands[0].id);
          });
        });
      });
    });
  });

  // See github issue: https://github.com/ParsePlatform/Parse-SDK-JS/issues/89
  // and uncomment, delete or rewrite when resolved
  // NOTE TEST IS DISABLED
  xit('should deep save and update nested objects', function() {
    const brand = new Brand();
    brand.set("name", "Acme");
    brand.set("country", "US");
    const item = new Item();
    item.set("price", 30);
    item.set("country_code", "US");
    brand.set("items", [item]);
    return brand.save().then(function(savedBrand) {
      assert.equal(savedBrand.get("items")[0].get("price"), item.get("price"));

      const item2 = new Item();
      item2.set("price", 20);
      brand.set("items", [item2]);
      return brand.save().then(function(updatedBrand) {
        assert.equal(updatedBrand.get("items")[0].get("price"), 20);
      });
    });
  });


  context('when object has beforeSave hook registered', function() {
    behavesLikeParseObjectOnBeforeSave('Brand', Brand);
  });

  context('when object has beforeDelete hook registered', function() {
    behavesLikeParseObjectOnBeforeDelete('Brand', Brand);
  });

  it('successfully uses containsAll query', function() {
    return Parse.Promise.when(createItemP(30), createItemP(20)).then((item1, item2) => {
      const store = new Store({
        items: [item1.toPointer(), item2.toPointer()],
      });
      return store.save().then(savedStore => {
        const query = new Parse.Query(Store);
        query.containsAll("items", [item1.toPointer(), item2.toPointer()]);
        return query.find();
      }).then(stores => {
        assert.equal(stores.length, 1);
        const query = new Parse.Query(Store);
        query.containsAll("items", [item2.toPointer(), 4]);
        return query.find();
      }).then(stores => {
        assert.equal(stores.length, 0);
      });
    });
  });

  it('should handle relations', function() {
    const store = new Store();

    const paperTowels = createItemP(20, 'paper towels');
    const toothPaste = createItemP(30, 'tooth paste');
    const toothBrush = createItemP(50, 'tooth brush');

    return Parse.Promise.when(
      paperTowels,
      toothPaste,
      toothBrush
    ).then((paperTowels, toothPaste, toothBrush) => {
      const relation = store.relation('items');
      relation.add(paperTowels);
      relation.add(toothPaste);
      return store.save();
    }).then(() => {
      const relation = store.relation('items');
      const query = relation.query();
      return query.find();
    }).then((items) => {
      assert.equal(items.length, 2);
      const relation = store.relation('items');
      relation.remove(items[1]);
      return store.save();
    }).then((store) => {
      const relation = store.relation('items');
      return store.relation('items').query().find();
    }).then((items) => {
      assert.equal(items.length, 1);
    });
  });

  it('should handle a direct query on a relation field', function() {
    const store = new Store({name: "store 1"});
    const store2 = new Store({name: "store 2"});
    var tpId;

    const paperTowels = createItemP(20, 'paper towels');
    const toothPaste = createItemP(30, 'tooth paste');
    const toothBrush = createItemP(50, 'tooth brush');
    return Parse.Promise.when(
      paperTowels,
      toothPaste,
      toothBrush,
      store,
      store2
    ).then((paperTowels, toothPaste, toothBrush) => {
      tpId = toothPaste.id;
      const relation = store2.relation('items');
      relation.add(paperTowels);
      relation.add(toothPaste);
      return store2.save();
    }).then(() => {
      const query = new Parse.Query(Store);
      query.equalTo('items', Item.createWithoutData(tpId));
      return query.find();
    }).then((results) => {
      assert.equal(results.length, 1);
      assert.equal(results[0].get('name'), "store 2");
    });
  });

  it('should handle the User class', function() {
    const user = new Parse.User({name: "Turtle"});
    return user.save().then((savedUser) => {
      return (new Parse.Query(Parse.User).find());
    }).then((foundUsers) => {
      assert.equal(foundUsers.length, 1);
      assert.equal(foundUsers[0].get('name'), "Turtle");
    });
  });

  it('should handle the Role class', function() {
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const role = new Parse.Role("Turtle", roleACL);
    return role.save().then((savedRole) => {
      return (new Parse.Query(Parse.Role).find());
    }).then((foundRoles) => {
      assert.equal(foundRoles.length, 1);
      assert.equal(foundRoles[0].get('name'), "Turtle");
    });
  });

  it('should handle redirectClassNameForKey', function() {
    const user = new Parse.User({name: "T Rutlidge"});
    return user.save().then((savedUser) => {
      const roleACL = new Parse.ACL();
      roleACL.setPublicReadAccess(true);

      const role = new Parse.Role("Turtle", roleACL);
      role.getUsers().add(savedUser);
      return role.save();
    }).then((savedRole) => {
      return (new Parse.Query(Parse.Role)).equalTo('name', 'Turtle').first();
    }).then((foundRole) => {
      return foundRole.getUsers().query().find();
    }).then((foundUsers) => {
      assert.equal(foundUsers.length, 1);
      assert.equal(foundUsers[0].get('name'), "T Rutlidge");
    });
  });

  it('should correctly find nested object in a where query', function() {
    const store = new Store({
      name: "store 1",
      customOptions: {
        isOpenHolidays: true,
        weekendAvailability: {
          sat: true,
          sun: false,
        }
      },
    });
    return store.save().then(() => {
      let storeQuery = new Parse.Query(Store);
      storeQuery.equalTo("customOptions.isOpenHolidays", true);
      return storeQuery.count().then(function(storeCount) {
        assert.equal(storeCount, 1);
        storeQuery = new Parse.Query(Store);
        storeQuery.equalTo("customOptions.blah", true);
        return storeQuery.count();
      }).then(function(count) {
        assert.equal(count, 0);
        storeQuery = new Parse.Query(Store);
        storeQuery.equalTo("customOptions.weekendAvailability.sun", false);
        return storeQuery.count();
      }).then(function(count) {
        assert.equal(count, 1);
        storeQuery = new Parse.Query(Store);
        storeQuery.equalTo("customOptions.weekendAvailability.sun", true);
        return storeQuery.count();
      }).then(function(count) {
        assert.equal(count, 0);
      });
    });
  });

});
