'use strict';

var assert = require("assert")
var ParseMockDB = require('../src/parse-mockdb');
var Parse = require('parse/node');

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

function createBrandP(name) {
  var brand = new Brand();
  brand.set("name", name);
  return brand.save();
}

function createItemP(price, brand) {
  var item = new Item();
  item.set("price", price);

  if (brand) {
    item.set("brand", brand);
  }
  return item.save();
}

function createStoreWithItemP(item) {
  var store = new Store();
  store.set("item", item);
  return store.save();
}

function itemQueryP(price) {
  var query = new Parse.Query(Item);
  query.equalTo("price", price);
  return query.find();
}

describe('ParseMock', function(){
  beforeEach(function() {
    Parse.MockDB.mockDB();
  });

  afterEach(function() {
    Parse.MockDB.cleanUp();
  });

  it("should save correctly", function(done) {
    createItemP(30).then(function(item) {
      assert(item.get("price") == 30);
      done();
    });
  });

  it("should come back with createdAt", function(done) {
    var createdAt;
    createItemP(30).then(function(item) {
      assert(item.createdAt);
      createdAt = item.createdAt;
      return (new Parse.Query(Item)).first();
    }).then((fetched) => {
      assert.equal(createdAt.getTime(), fetched.createdAt.getTime());
      done();
    })
  })

  it("should get a specific ID correctly", function(done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.get(item.id).then(function(fetchedItem) {
        assert(fetchedItem.id == item.id);
        done();
      });
    });
  });

  it("should match a correct equalTo query on price", function(done) {
    createItemP(30).then(function(item) {
      itemQueryP(30).then(function(results) {
        assert(results[0].id == item.id);
        assert(results[0].get("price") == item.get("price"));
        done();
      });
    });
  });

  it('should save and find an item', function (done) {
    var item = new Item();
    item.set("price", 30);
    item.save().then(function(item) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 30);
      return query.first().then(function(item) {
        assert(item.get("price") == 30);
        done();
      });
    });
  });

  it('should save and find an item via object comparison', function(done) {
    var item = new Item({cool: {awesome: true } });
    item.save().then(function(item) {
      var query = new Parse.Query(Item);
      query.equalTo('cool', {awesome: true});
      return query.first().then(function(item) {
        assert(item.get('cool').awesome);
        done();
      })
    })
  })

  it('should support increment', function (done) {
    createItemP(30).then(function(item) {
      item.increment("price", 5);
      return item.save();
    }).then(function(item) {
      assert.equal(item.get("price"), 35);
      done();
    });
  });

  it('should support negative increment', function (done) {
    createItemP(30).then(function(item) {
      item.increment("price", -5);
      return item.save();
    }).then(function(item) {
      assert.equal(item.get("price"), 25);
      done();
    });
  });

  it('should support unset', function (done) {
    createItemP(30).then(function(item) {
      item.unset("price");
      return item.save();
    }).then(function(item) {
      assert(!item.has("price"));
      done();
    });
  });

  it('should support add', function (done) {
    createItemP(30).then(function(item) {
      item.add("languages", "JS");
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["JS"]);
      done();
    });
  });

  it('should support addUnique', function (done) {
    createItemP(30).then(function(item) {
      item.add("languages", "JS");
      item.add("languages", "Ruby")
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["JS", "Ruby"]);
      item.addUnique("JS");
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["JS", "Ruby"]);
      done();
    });
  });

  it('should support remove', function (done) {
    createItemP(30).then(function(item) {
      item.add("languages", "JS");
      item.add("languages", "JS");
      item.add("languages", "Ruby")
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["JS", "JS", "Ruby"]);
      item.remove("languages", "JS");
      return item.save();
    }).then(function(item) {
      assert.deepEqual(item.get("languages"), ["Ruby"]);
      done();
    });
  });

  it('should saveAll and find 2 items', function (done) {
    var item = new Item();
    item.set("price", 30);

    var item2 = new Item();
    item2.set("price", 30);
    Parse.Object.saveAll([item, item2]).then(function(items) {
      assert(items.length === 2);
      var query = new Parse.Query(Item);
      query.equalTo("price", 30);
      return query.find().then(function(items) {
        assert(items.length === 2);
        assert(items[0].get("price") === 30);
        assert(items[1].get("price") === 30);
        done();
      });
    });
  });

  it('should find an item matching an or query', function (done) {
    var Item = Parse.Object.extend("Item");
    var item = new Item();
    item.set("price", 30);
    item.save().then(function(item) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 30);

      var otherQuery = new Parse.Query(Item);
      otherQuery.equalTo("name", "Chicken");

      var orQuery = Parse.Query.or(query, otherQuery);
      return orQuery.find().then(function(items) {
        assert(items[0].id == item.id);
        done();
      });
    });
  });

  it('should not find any items if they do not match an or query', function (done) {
    var Item = Parse.Object.extend("Item");
    var item = new Item();
    item.set("price", 30);
    item.save().then(function(item) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 50);

      var otherQuery = new Parse.Query(Item);
      otherQuery.equalTo("name", "Chicken");

      var orQuery = Parse.Query.or(query, otherQuery);
      return orQuery.find().then(function(items) {
        assert(items.length == 0);
        done();
      });
    });
  });

  it('should save 2 items and get one for a first() query', function (done) {
    Parse.Promise.when(createItemP(30), createItemP(20)).then(function(item1, item2) {
      var query = new Parse.Query(Item);
      return query.first().then(function(item) {
        assert(item.get("price") == 30);
        done();
      });
    });
  });

  it("should handle nested includes", function(done) {
    createBrandP("Acme").then(function(brand) {
      createItemP(30, brand).then(function(item) {
        var brand = item.get("brand");
        createStoreWithItemP(item).then(function(savedStore) {
          var query = new Parse.Query(Store);
          query.include("item");
          query.include("item.brand");
          query.first().then(function(result) {
            var resultItem = result.get("item");
            var resultBrand = resultItem.get("brand");
            assert(resultItem.id == item.id);
            assert(resultBrand.get("name") == "Acme");
            assert(resultBrand.id == brand.id);
            done();
          });
        });
      });
    });
  });

  it("should handle multiple nested includes", function(done) {
    var a1, a2, b, c;
    Parse.Promise.when(
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
      assert(loadedC.id == c.id);
      assert(loadedC.get('b').id == b.id);
      assert(loadedC.get('b').get('a1').id == a1.id);
      assert(loadedC.get('b').get('a2').id == a2.id);
      assert(loadedC.get('b').get('a1').get('value') == a1.get('value'));
      assert(loadedC.get('b').get('a2').get('value') == a2.get('value'));

      done();
    })
    .then(null, function(err) {
      done(err);
    })
  });

  it('should handle includes over arrays of pointers', function(done) {
    var item1 = new Item({cool: true});
    var item2 = new Item({cool: false});
    var items = [item1, item2];
    Parse.Object.saveAll(items).then(function(savedItems) {
      var brand = new Brand({
        items: items
      });
      return brand.save();
    }).then(function() {
      var q = new Parse.Query(Brand).include('items');
      return q.first();
    }).then(function(brand) {
      assert(brand.get('items')[0].get('cool'));
      assert(!brand.get('items')[1].get('cool'));
      done();
    })
  })

  it('should handle nested includes over arrays of pointers', function(done) {
    var store = new Store({location: "SF"});
    var item1 = new Item({cool: true, store: store});
    var item2 = new Item({cool: false});
    var items = [item1, item2];
    Parse.Object.saveAll(items.concat([store])).then(function(savedItems) {
      var brand = new Brand({
        items: items
      });
      return brand.save();
    }).then(function() {
      var q = new Parse.Query(Brand).include('items,items.store');
      return q.first();
    }).then(function(brand) {
      assert.equal(brand.get('items')[0].get("store").get("location"), "SF");
      assert(!brand.get('items')[1].get('cool'));
      done();
    })
  })

  it('should handle includes where item is missing', function(done) {
    var item = new Item({cool: true});
    var brand1 = new Brand({});
    var brand2 = new Brand({item: item});
    Parse.Object.saveAll([item, brand1, brand2]).then(function() {
      var q = new Parse.Query(Brand).include('item');
      return q.find();
    }).then(function(brands) {
      assert(!brands[0].has('item'));
      assert(brands[1].has('item'));
      done();
    })
  })

  it('should handle includes where nested array item is missing', function(done) {
    var store = new Store({location: "SF"});
    var item1 = new Item({cool: true, store: store});
    var item2 = new Item({cool: false});
    var items = [item1, item2];
    Parse.Object.saveAll(items.concat([store])).then(function(savedItems) {
      var brand = new Brand({
        items: items
      });
      return brand.save();
    }).then(function() {
      var q = new Parse.Query(Brand).include('items,items.blah,wow');
      return q.first();
    }).then(function(brand) {
      assert(brand.get('items')[0].get('cool'));
      assert(!brand.get('items')[1].get('cool'));
      done();
    })
  })

  it('should handle delete', function(done) {
    var item = new Item();
    item.save().then(function(item) {
      return new Parse.Query(Item).first();
    }).then(function(foundItem) {
      assert(foundItem);
      return foundItem.destroy();
    }).then(function() {
      return new Parse.Query(Item).first();
    }).then(function(foundItem) {
      assert(!foundItem);
      done();
    })
  });

  it("should match a correct when exists query", function(done) {
    Parse.Promise.when(
      new Item().save({price: 30}),
      new Item().save({name: 'Device'})
    ).then(function(item1, item2) {
      var itemQuery = new Parse.Query(Item);
      itemQuery.exists('price');
      itemQuery.find().then(function(items) {
        assert(items.length === 1);
        assert(items[0].id === item1.id);
        done();
      });
    });
  });

  it("should match a correct when doesNotExist query", function(done) {
    Parse.Promise.when(
      new Item().save({price: 30}),
      new Item().save({name: 'Device'})
    ).then(function(item1, item2) {
      var itemQuery = new Parse.Query(Item);
      itemQuery.doesNotExist('price');
      itemQuery.find().then(function(itmes) {
        assert(itmes.length === 1);
        assert(itmes[0].id === item2.id);
        done();
      });
    });
  });

  it("should match a correct equalTo query for an object", function(done) {
    createItemP(30).then(function(item) {
      var store = new Store();
      store.set("item", item);
      store.save().then(function(savedStore) {
        var query = new Parse.Query(Store);
        query.equalTo("item", item);
        query.find().then(function(results) {
          assert.equal(results[0].id, savedStore.id);
          assert(results[0].id == savedStore.id);
          done();
        });
      });
    });
  });

  it("should not match an incorrect equalTo query on price", function(done) {
    createItemP(30).then(function(item) {
      itemQueryP(20).then(function(results) {
        assert.equal(results.length, 0);
        done();
      });
    });
  });

  it("should not match an incorrect equalTo query on price", function(done) {
    createItemP(30).then(function(item) {
      itemQueryP(20).then(function(results) {
        assert.equal(results.length, 0);
        done();
      });
    });
  });


  it("should not match an incorrect equalTo query on price and name", function(done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 30);
      query.equalTo("name", "pants");
      query.find().then(function(results) {
        assert.equal(results.length, 0);
        done();
      });
    });
  });

  it("should not match an incorrect containedIn query", function(done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.containedIn("price", [40, 90]);
      query.find().then(function(results) {
        assert.equal(results.length, 0);
        done();
      });
    });
  });

  it("should find 2 objects when there are 2 matches", function(done) {
    Parse.Promise.when(createItemP(20), createItemP(20)).then(function(item1, item2) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 20);
      query.find().then(function(results) {
        assert.equal(results.length, 2);
        done();
      });
    });
  });

  it("should first() 1 object when there are 2 matches", function(done) {
    Parse.Promise.when(createItemP(20), createItemP(20)).then(function(item1, item2) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 20);
      query.first().then(function(result) {
        assert.equal(result.id, item1.id);
        done();
      });
    });
  });

  it("should match a query with 1 objects when 2 objects are present", function(done) {
    Parse.Promise.when(createItemP(20), createItemP(30)).then(function(item1, item2) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 20);
      query.find().then(function(results) {
        assert.equal(results.length, 1);
        done();
      });
    });
  });

  it('should match a date', function(done) {
    var bornOnDate = new Date();
    var item = new Item({ bornOnDate: bornOnDate });

    item.save().then(function(item) {
      var query = new Parse.Query(Item);
      query.equalTo("bornOnDate", bornOnDate);
      query.first().then(function(result) {
        assert(result.get("bornOnDate", bornOnDate));
        done();
      })
    })
  })

  it('should properly handle date in query operator', function(done) {
    var bornOnDate = new Date();
    var middleDate = new Date();
    var expireDate = new Date();
    middleDate.setDate(bornOnDate.getDate() + 1);
    expireDate.setDate(bornOnDate.getDate() + 2);

    var item = new Item({
      bornOnDate: bornOnDate,
      expireDate: expireDate,
    });

    item.save().then(function(item) {
      var query = new Parse.Query(Item);
      query.lessThan("bornOnDate", middleDate);
      query.greaterThan("expireDate", middleDate);
      query.first().then(function(result) {
        assert(result);
        done();
      })
    })
  })

  it("should handle $nin", function(done) {
    Parse.Promise.when(createItemP(20), createItemP(30)).then(function(item1, item2) {
      var query = new Parse.Query(Item);
      query.notContainedIn("price", [30]);
      return query.find();
    }).then(function(results) {
      assert.equal(results.length, 1);
      assert.equal(results[0].get("price"), 20);
      done();
    }, function(error) {console.log(error)})
  })

  it("should handle $nin on objectId", function(done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.notContainedIn("objectId", [item.id]);
      return query.find();
    }).then(function(results) {
      assert.equal(results.length, 0);
      done();
    })
  })

  it("should handle $nin with an empty array", function(done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.notContainedIn("objectId", []);
      return query.find();
    }).then(function(results) {
      assert.equal(results.length, 1);
      done();
    })
  })

  it("should handle $regex queries", function(done) {
    createBrandP("Acme").then(function(item) {
      var query = new Parse.Query(Brand);
      query.startsWith("name", "Ac");
      return query.find();
    }).then(function(results) {
      assert.equal(results.length, 1);
      done();
    })
  })

/**
 *  see: https://github.com/ParsePlatform/Parse-SDK-JS/issues/91
 *
  it("should not overwrite included objects after a save", function(done) {
    createBrandP("Acme").then(function(brand) {
      createItemP(30, brand).then(function(item) {
        createStoreWithItemP(item).then(function(store) {
          var query = new Parse.Query(Store);
          query.include("item");
          query.include("item.brand");
          query.first().then(function(str) {
            str.set("lol", "wut");
            str.save().then(function(newStore) {
              assert(str.get("item").get("brand").get("name") === brand.get("name"));
              done();
            });
          });
        });
      });
    });
  });
*/

/**
 *  see: https://github.com/ParsePlatform/Parse-SDK-JS/issues/91
 *
  it("should update an existing object correctly", function(done) {
    Parse.Promise.when(createItemP(30), createItemP(20)).then(function(item1, item2) {
      createStoreWithItemP(item1).then(function(store) {
        item2.set("price", 10);
        store.set("item", item2);
        store.save().then(function(store) {
          assert(store.has("item"));
          assert(store.get("item").get("price") === 10);
          done();
        });
      });
    });
  });
  */

  it("should support a nested query", function() {
    var brand = new Brand();
    brand.set("name", "Acme");
    brand.set("country", "US");
    return brand.save().then(function(brand) {
      var item = new Item();
      item.set("price", 30);
      item.set("country_code", "US");
      item.set("state", "CA");
      item.set("brand", brand);
      return item.save();
    }).then(function(item) {
      var store = new Store();
      store.set("state", "CA");
      return store.save();
    }).then(function(store) {
      var brandQuery = new Parse.Query(Brand);
      brandQuery.equalTo("name", "Acme");

      var itemQuery = new Parse.Query(Item);
      itemQuery.matchesKeyInQuery("country_code", "country", brandQuery);

      var storeQuery = new Parse.Query(Store);
      storeQuery.matchesKeyInQuery("state", "state", itemQuery);
      return Parse.Promise.when(storeQuery.find(), Parse.Promise.as(store));
    }).then(function(storeMatches, store) {
      assert(storeMatches.length == 1);
      assert(storeMatches[0].id == store.id);
    });
  });

  it('should find items not filtered by a notContainedIn', function (done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 30);
      query.notContainedIn("objectId", [234]);
      query.find().then(function(items) {
        assert(items.length == 1);
        done();
      });
    });
  });

  it('should find not items filtered by a notContainedIn', function (done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.equalTo("price", 30);
      query.notContainedIn("objectId", [item.id]);
      query.find().then(function(items) {
        assert(items.length == 0);
        done();
      });
    });
  });

  it('should handle a lessThan query', function (done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.lessThan("createdAt", new Date("2024-01-01T23:28:56.782Z"));
      query.find().then(function(items) {
        assert(items.length == 1);
        var newQuery = new Parse.Query(Item);
        newQuery.greaterThan("createdAt", new Date());
        newQuery.find().then(function(moreItems) {
          assert(moreItems.length === 0);
          done();
        });
      });
    });
  });

  it('should handle a lessThanOrEqualTo query', function (done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.lessThanOrEqualTo("price", 30);
      query.find().then(function(items) {
        assert(items.length == 1);
        query.lessThanOrEqualTo("price", 20);
        query.find().then(function(moreItems) {
          assert(moreItems.length === 0);
          done();
        });
      });
    });
  });

  it('should handle a greaterThan query', function (done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.greaterThan("price", 20);
      query.find().then(function(items) {
        assert(items.length == 1);
        query.greaterThan("price", 50);
        query.find().then(function(moreItems) {
          assert(moreItems.length === 0);
          done();
        });
      });
    });
  });

  it('should handle a greaterThanOrEqualTo query', function (done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.greaterThanOrEqualTo("price", 30);
      query.find().then(function(items) {
        assert(items.length == 1);
        query.greaterThanOrEqualTo("price", 50);
        query.find().then(function(moreItems) {
          assert(moreItems.length === 0);
          done();
        });
      });
    });
  });

  it('should handle multiple conditions for a single key', function(done) {
    createItemP(30).then(function(item) {
      var query = new Parse.Query(Item);
      query.greaterThan("price", 20);
      query.lessThan("price", 40);
      query.find().then(function(items) {
        assert(items.length == 1);
        query.greaterThan("price", 30);
        query.find().then(function(moreItems) {
          assert(moreItems.length === 0);
          done();
        });
      });
    });
  });

  it('should correcly handle matchesQuery', function(done) {
    createBrandP("Acme").then(function(brand) {
      createItemP(30, brand).then(function(item) {
        createStoreWithItemP(item).then(function(store) {
          var brandQuery = new Parse.Query(Brand);
          brandQuery.equalTo("name", "Acme");

          var itemQuery = new Parse.Query(Item);
          itemQuery.matchesQuery("brand", brandQuery);

          var storeQuery = new Parse.Query(Store);
          storeQuery.matchesQuery("item", itemQuery);

          storeQuery.find().then(function(store) {
            assert(store);
            done();
          })
        });
      })
    })
  })

  it('should correctly count items in a matchesQuery', function (done) {
    createBrandP("Acme").then(function(brand) {
      createItemP(30, brand).then(function(item) {
        createStoreWithItemP(item).then(function(store) {
          var itemQuery = new Parse.Query(Item);
          itemQuery.equalTo("price", 30);

          var storeQuery = new Parse.Query(Store);
          storeQuery.matchesQuery("item", itemQuery);
          storeQuery.count().then(function(storeCount) {
            assert(storeCount === 1);
            done();
          });
        });
      });
    });
  });

  it('should skip and limit items appropriately', function (done) {
    createBrandP("Acme").then(function(brand) {
      createBrandP("Acme 2").then(function(brand2) {
        var brandQuery = new Parse.Query(Brand);
        brandQuery.limit(1);
        brandQuery.find().then(function(brands) {
          assert(brands.length === 1);
          var brandQuery2 = new Parse.Query(Brand);
          brandQuery2.limit(1);
          brandQuery2.skip(1);
          brandQuery2.find().then(function(moreBrands) {
            assert(moreBrands.length === 1);
            assert(moreBrands[0].id !== brands[0].id);
            done();
          });
        });
      });
    });
  });

  // See github issue: https://github.com/ParsePlatform/Parse-SDK-JS/issues/89
  // and uncomment, delete or rewrite when resolved
/*
 *  it('should deep save and update nested objects', function (done) {
 *    var brand = new Brand();
 *    brand.set("name", "Acme");
 *    brand.set("country", "US");
 *    var item = new Item();
 *    item.set("price", 30);
 *    item.set("country_code", "US");
 *    brand.set("items", [item]);
 *    brand.save().then(function(savedBrand) {
 *      assert(savedBrand.get("items")[0].get("price") === item.get("price"));
 *
 *      var item2 = new Item();
 *      item2.set("price", 20);
 *      brand.set("items", [item2]);
 *      return brand.save().then(function(updatedBrand) {
 *        assert(updatedBrand.get("items")[0].get("price") === 20);
 *        done();
 *      });
 *    });
 *  });
 */

  context('when object has beforeSave hook registered', function() {
    function beforeSave() {
      if (this.get("error")) {
        return Parse.Promise.error("whoah");
      }
      this.set('cool', true);
      return Parse.Promise.as(this);
    }

    it('runs the hook before saving the model and persists the object', function() {
      ParseMockDB.registerHook('Brand', 'beforeSave', beforeSave);

      var brand = new Brand();
      assert(!brand.has('cool'));

      brand.save().then(savedBrand => {
        assert(savedBrand.has('cool'));
        assert(savedBrand.get('cool'));

        var q = new Parse.Query(Brand);
        q.first().then(queriedBrand => {
          assert(queriedBrand.has('cool'));
          assert(queriedBrand.get('cool'));
        });
      });
    })

    it('rejects the save if there is a problem', function(done) {
      ParseMockDB.registerHook('Brand', 'beforeSave', beforeSave);

      var brand = new Brand({error: true});

      brand.save().then(savedBrand => {
        throw new Error("should not have saved")
      }, error => {
        assert.equal(error, "whoah");
        done();
      });
    })
  })

  it('successfully uses containsAll query', function(done) {
    Parse.Promise.when(createItemP(30), createItemP(20)).then((item1, item2) => {
      const store = new Store({
        items: [item1.toPointer(), item2.toPointer()],
      });
      return store.save().then(savedStore => {
        const query = new Parse.Query(Store);
        query.containsAll("items", [item1.toPointer(), item2.toPointer()]);
        return query.find();
      }).then(stores => {
        assert(stores.length === 1);
        const query = new Parse.Query(Store);
        query.containsAll("items", [item2.toPointer(), 4]);
        return query.find();
      }).then(stores => {
        assert(stores.length === 0);
        done();
      });
    });
  });

  it('should handle relations', function(done) {
    var store = new Store();

    var paperTowels = createItemP(20, 'paper towels');
    var toothPaste = createItemP(30, 'tooth paste');
    var toothBrush = createItemP(50, 'tooth brush');

    Parse.Promise.when(
      paperTowels,
      toothPaste,
      toothBrush
    ).then((paperTowels, toothPaste, toothBrush) => {
      var relation = store.relation('items');
      relation.add(paperTowels);
      relation.add(toothPaste);
      return store.save();
    }).then(() => {
      var relation = store.relation('items');
      var query = relation.query();
      return query.find();
    }).then((items) => {
      assert.equal(items.length, 2);
      var relation = store.relation('items');
      relation.remove(items[1]);
      return store.save();
    }).then((store) => {
      var relation = store.relation('items');
      return store.relation('items').query().find();
    }).then((items) => {
      assert.equal(items.length, 1);
      done();
    });
  });

  it('should handle a direct query on a relation field', function(done) {
    var store = new Store({name: "store 1"});
    var store2 = new Store({name: "store 2"});
    var tpId;

    var paperTowels = createItemP(20, 'paper towels');
    var toothPaste = createItemP(30, 'tooth paste');
    var toothBrush = createItemP(50, 'tooth brush');
    Parse.Promise.when(
      paperTowels,
      toothPaste,
      toothBrush,
      store,
      store2
    ).then((paperTowels, toothPaste, toothBrush) => {
      tpId = toothPaste.id;
      var relation = store2.relation('items');
      relation.add(paperTowels);
      relation.add(toothPaste);
      return store2.save()
    }).then(() => {
      var query = new Parse.Query(Store);
      query.equalTo('items', Item.createWithoutData(tpId));
      return query.find();
    }).then((results) => {
      assert.equal(results.length, 1);
      assert.equal(results[0].get('name'), "store 2");
      done();
    });
  });

  it('should handle the User class', function(done) {
    var user = new Parse.User({name: "Turtle"});
    user.save().then((savedUser) => {
      return (new Parse.Query(Parse.User).find())
    }).then((foundUsers) => {
      assert.equal(foundUsers.length, 1);
      assert.equal(foundUsers[0].get('name'), "Turtle");
      done();
    })
  })

  it('should handle the Role class', function(done) {
    var roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    var role = new Parse.Role("Turtle", roleACL);
    role.save().then((savedRole) => {
      return (new Parse.Query(Parse.Role).find())
    }).then((foundRoles) => {
      assert.equal(foundRoles.length, 1);
      assert.equal(foundRoles[0].get('name'), "Turtle");
      done();
    })
  })

  it('should handle redirectClassNameForKey', function(done) {
    var user = new Parse.User({name: "T Rutlidge"})
    user.save().then((savedUser) => {
      var roleACL = new Parse.ACL();
      roleACL.setPublicReadAccess(true);

      var role = new Parse.Role("Turtle", roleACL);
      role.getUsers().add(savedUser);
      return role.save();
    }).then((savedRole) => {
      return (new Parse.Query(Parse.Role)).equalTo('name', 'Turtle').first();
    }).then((foundRole) => {
      return foundRole.getUsers().query().find();
    }).then((foundUsers) => {
      assert.equal(foundUsers.length, 1);
      assert.equal(foundUsers[0].get('name'), "T Rutlidge");
      done();
    });
  })

});
