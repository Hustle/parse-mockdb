'use strict';

const assert = require('assert');
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

class CustomUserSubclass extends Parse.User { }

function createBrandP(name) {
  const brand = new Brand();
  brand.set('name', name);
  return brand.save();
}

function createItemP(price, brand, extra) {
  const item = new Item();
  item.set('price', price);

  if (brand) {
    item.set('brand', brand);
  }

  if (extra) {
    item.set(extra);
  }

  return item.save();
}

function createStoreWithItemP(item) {
  const store = new Store();
  store.set('item', item);
  return store.save();
}

function createUserP(name) {
  const user = new CustomUserSubclass();
  user.set('name', name);
  return user.save();
}

function itemQueryP(price) {
  const query = new Parse.Query(Item);
  query.equalTo('price', price);
  return query.find();
}

function behavesLikeParseObjectOnBeforeSave(typeName, ParseObjectOrUserSubclass) {
  context('when object has beforeSave hook registered', () => {
    function beforeSavePromise(request) {
      const object = request.object;
      if (object.get('error')) {
        return Parse.Promise.error('whoah');
      }
      object.set('cool', true);
      return Parse.Promise.as(object);
    }

    it('runs the hook before saving the model and persists the object', () => {
      ParseMockDB.registerHook(typeName, 'beforeSave', beforeSavePromise);

      const object = new ParseObjectOrUserSubclass();
      assert(!object.has('cool'));

      return object.save().then(savedObject => {
        assert(savedObject.has('cool'));
        assert(savedObject.get('cool'));

        return new Parse.Query(ParseObjectOrUserSubclass).first().then(queriedObject => {
          assert(queriedObject.has('cool'));
          assert(queriedObject.get('cool'));
        });
      });
    });

    it('rejects the save if there is a problem', () => {
      ParseMockDB.registerHook(typeName, 'beforeSave', beforeSavePromise);

      const object = new ParseObjectOrUserSubclass({ error: true });

      return object.save().then(() => {
        assert.fail(null, null, 'should not have saved');
      }, error => {
        assert.equal(error, 'whoah');
      });
    });
  });
}

function behavesLikeParseObjectOnBeforeDelete(typeName, ParseObjectOrUserSubclass) {
  context('when object has beforeDelete hook registered', () => {
    let beforeDeleteWasRun;

    beforeEach(() => {
      beforeDeleteWasRun = false;
    });

    function beforeDeletePromise(request) {
      const object = request.object;
      if (object.get('error')) {
        return Parse.Promise.error('whoah');
      }
      beforeDeleteWasRun = true;
      return Parse.Promise.as();
    }

    it('runs the hook before deleting the object', () => {
      ParseMockDB.registerHook(typeName, 'beforeDelete', beforeDeletePromise);

      const promises = [];

      promises.push(new ParseObjectOrUserSubclass()
        .save()
        .done(savedParseObjectOrUserSubclass =>
          Parse.Object.destroyAll([savedParseObjectOrUserSubclass]))
        .done(() => assert(beforeDeleteWasRun))
      );

      promises.push(new Parse.Query(ParseObjectOrUserSubclass)
        .find()
        .done(results => {
          assert.equal(results.length, 0);
        }));

      return Parse.Promise.when(promises);
    });

    it('rejects the delete if there is a problem', () => {
      ParseMockDB.registerHook(typeName, 'beforeDelete', beforeDeletePromise);

      const object = new ParseObjectOrUserSubclass({ error: true });
      return object.save().done(savedParseObjectOrUserSubclass =>
        Parse.Object.destroyAll([savedParseObjectOrUserSubclass])
      ).then(() => {
        assert.fail(null, null, 'should not have deleted');
      }, (error) => {
        assert.equal(error, 'whoah');
        return new Parse.Query(ParseObjectOrUserSubclass).find();
      }).done((results) => {
        assert.equal(results.length, 1);
      });
    });
  });
}

describe('ParseMock', () => {
  beforeEach(() => {
    Parse.MockDB.mockDB();
  });

  afterEach(() => {
    Parse.MockDB.cleanUp();
  });

  context('supports Parse.User subclasses', () => {
    it('should save user', () =>
      createUserP('Tom').then((user) => {
        assert.equal(user.get('name'), 'Tom');
      })
    );

    it('should save and find a user', () =>
      createUserP('Tom').then(() => {
        const query = new Parse.Query(CustomUserSubclass);
        query.equalTo('name', 'Tom');
        return query.first().then((user) => {
          assert.equal(user.get('name'), 'Tom');
        });
      })
    );

    behavesLikeParseObjectOnBeforeSave('_User', CustomUserSubclass);
    behavesLikeParseObjectOnBeforeDelete('_User', CustomUserSubclass);
  });

  it('should save correctly', () =>
    createItemP(30).then((item) => {
      assert.equal(item.get('price'), 30);
    })
  );

  it('should come back with createdAt', () => {
    let createdAt;
    return createItemP(30).then((item) => {
      assert(item.createdAt);
      createdAt = item.createdAt;
      return (new Parse.Query(Item)).first();
    }).then((fetched) => {
      assert.equal(createdAt.getTime(), fetched.createdAt.getTime());
    });
  });

  it('should get a specific ID correctly', () =>
    createItemP(30).then(item => {
      const query = new Parse.Query(Item);
      return query.get(item.id).then(fetchedItem => {
        assert.equal(fetchedItem.id, item.id);
      });
    })
  );

  it('should match a correct equalTo query on price', () =>
    createItemP(30)
      .then((item) => itemQueryP(30)
        .then(results => {
          assert.equal(results[0].id, item.id);
          assert.equal(results[0].get('price'), item.get('price'));
        })
    )
  );

  it('should match a query that uses equalTo as contains constraint', () =>
    createItemP(30)
      .then((item) =>
        new Parse.Object('Factory').save({
          items: [item],
        })
        .then(savedComp => new Parse.Query('Factory')
          .equalTo('items', item)
          .find()
          .then(results => {
            assert.equal(results[0].id, savedComp.id);
          })
        )
      )
  );

  it('should match a query that uses equalTo as contains constraint with 0 as parameter', () =>
    new Parse.Object('Factory').save({
      items: [0, 1],
    }).then(savedComp => new Parse.Query('Factory')
      .equalTo('items', 0)
      .find()
      .then(results => {
        assert.equal(results[0].id, savedComp.id);
      })
    )
  );

  it('should not allow array values as equalTo parameter for array columns', () =>
    new Parse.Object('Factory').save({
      items: [0, 1],
    }).then(() => new Parse.Query('Factory')
      .equalTo('items', [0, 1])
      .find()
      .then(() => Parse.Promise.error(
          new Error('Promise should have failed')),
        () => Parse.Promise.as(true))
    )
  );

  it('should not match objects with [] as field value and 0 as query parameter', () =>
    new Parse.Object('Factory').save({
      items: [],
    }).then(() => new Parse.Query('Factory')
      .equalTo('items', 0)
      .find()
      .then(results => {
        assert.equal(results.length, 0);
      })
    )
  );

  it('should not match objects with null as field value and \'\' as query parameter', () =>
    new Parse.Object('Factory').save({
      name: null,
    }).then(() => new Parse.Query('Factory')
      .equalTo('items', '')
      .find()
      .then(results => {
        assert.equal(results.length, 0);
      })
    )
  );

  it('should save and find an item', () => {
    const item = new Item();
    item.set('price', 30);
    return item.save()
      .then(() => {
        const query = new Parse.Query(Item);
        query.equalTo('price', 30);
        return query.first().then(returnedItem => {
          assert.equal(returnedItem.get('price'), 30);
        });
      });
  });

  it('should save and find an item via object comparison', () => {
    const startItem = new Item({ cool: { awesome: true } });
    return startItem.save().then(() => {
      const query = new Parse.Query(Item);
      query.equalTo('cool', { awesome: true });
      return query.first().then((item) => {
        assert(item.get('cool').awesome);
      });
    });
  });

  it('should save a nested item and return it with the save', () =>
    new Item().save({
      price: 45,
    }).then((item0) =>
      new Item().save({
        price: 50,
      }).then((item2) =>
        new Item({
          price: 55,
        }).save().then((item3) => {
          const brand = new Brand();
          const item1 = new Item();
          item1.id = item0.id; // create pointer to item0
          brand.set('items', [item1, item2, item3]);
          return brand.save();
        })
      )
    ).then((brand) => {
      assert.equal(brand.get('items')[0].get('price'), undefined);
      assert.equal(brand.get('items')[1].get('price'), 50);
      assert.equal(brand.get('items')[2].get('price'), 55);

      brand.get('items')[2].set('price', 30);
      brand.set('name', 'foo');
      return brand.save();
    })
    .then((sbrand) => {
      assert.equal(sbrand.get('items')[0].get('price'), undefined);
      assert.equal(sbrand.get('items')[1].get('price'), 50);
      assert.equal(sbrand.get('items')[2].get('price'), 30);
    })
  );

  it('should save a nested item and return it with the save even with a hook defined', () => {
    ParseMockDB.registerHook('Brand', 'beforeSave', request => {
      const object = request.object;
      object.set('name', 'bar');
      return Parse.Promise.as(object);
    });

    return new Item().save({
      price: 45,
    }).then((item0) =>
      new Item().save({
        price: 50,
      }).then((item2) =>
        new Item({
          price: 55,
        }).save().then((item3) => {
          const brand = new Brand();
          const item1 = new Item();
          item1.id = item0.id; // create pointer to item0
          brand.set('items', [item1, item2, item3]);
          return brand.save();
        })
      )
    ).then((brand) => {
      assert.equal(brand.get('items')[0].get('price'), undefined);
      assert.equal(brand.get('items')[1].get('price'), 50);
      assert.equal(brand.get('items')[2].get('price'), 55);

      brand.get('items')[2].set('price', 30);
      brand.set('name', 'foo');
      return brand.save();
    })
    .then((sbrand) => {
      assert.equal(sbrand.get('items')[0].get('price'), undefined);
      assert.equal(sbrand.get('items')[1].get('price'), 50);
      assert.equal(sbrand.get('items')[2].get('price'), 30);
    });
  });

  it('should support increment', () =>
    createItemP(30).then((item) => {
      item.increment('price', 5);
      return item.save();
    }).then((item) => {
      assert.equal(item.get('price'), 35);
    })
  );

  it('should support negative increment', () =>
    createItemP(30).then((item) => {
      item.increment('price', -5);
      return item.save();
    }).then((item) => {
      assert.equal(item.get('price'), 25);
    })
  );

  it('should increment a non-existent field', () =>
    createItemP(30).then((item) =>
      item
        .increment('foo')
        .save()
    ).then((item) => {
      assert.equal(item.get('foo'), 1);
    })
  );

  it('should match an item that is within a kilometer radius of a geo point', () =>
    // the used two points are 133.4 km away according to http://www.movable-type.co.uk/scripts/latlong.html
    new Item().save({
      location: new Parse.GeoPoint(49, 7),
    }).then(item =>
      new Parse.Query(Item)
        .withinKilometers('location', new Parse.GeoPoint(48, 8), 134)
        .find()
        .then(results => {
          assert.equal(results[0].id, item.id);
        })
    )
  );

  it('should not match an item that is not within a kilometer radius of a geo point', () =>
    // the used two points are 133.4 km away according to http://www.movable-type.co.uk/scripts/latlong.html
    new Item().save({
      location: new Parse.GeoPoint(49, 7),
    }).then(() =>
      new Parse.Query(Item)
        .withinKilometers('location', new Parse.GeoPoint(48, 8), 133)
        .find()
    ).then(results => {
      assert.equal(results.length, 0);
    })
  );

  xit('should sort matches of a geo query from nearest to furthest', () =>
    // the used two points are 133.4 km away according to http://www.movable-type.co.uk/scripts/latlong.html
    new Item().save({
      location: new Parse.GeoPoint(49, 7),
    }).then(item1 =>
      new Item().save({
        location: new Parse.GeoPoint(49, 8),
      }).then(item2 =>
        new Parse.Query(Item)
          .withinKilometers('location', new Parse.GeoPoint(48, 8), 134)
          .find()
          .then(results => {
            assert.equal(results[0].id, item2.id);
            assert.equal(results[1].id, item1.id);
          })
      )
    )
  );

  it('should use a custom order over ordering from nearest to furthest in a geo query', () =>
    // the used two points are 133.4 km away according to http://www.movable-type.co.uk/scripts/latlong.html
    new Item().save({
      price: 10,
      location: new Parse.GeoPoint(49, 7),
    }).then(item1 =>
      new Item().save({
        price: 20,
        location: new Parse.GeoPoint(49, 8),
      }).then(item2 =>
        new Parse.Query(Item)
          .withinKilometers('location', new Parse.GeoPoint(48, 8), 134)
          .ascending('price')
          .find()
          .then(results => {
            assert.equal(results[0].id, item1.id);
            assert.equal(results[1].id, item2.id);
          })
      )
    )
  );

  it('should support unset', () =>
    createItemP(30).then((item) => {
      item.unset('price');
      return item.save();
    }).then((item) => {
      assert(!item.has('price'));
    })
  );

  it('should support add', () =>
    createItemP(30).then((item) => {
      item.add('languages', 'JS');
      return item.save();
    }).then((item) => {
      assert.deepEqual(item.get('languages'), ['JS']);
    })
  );

  it('should support addUnique', () =>
    createItemP(30).then((item) => {
      item.add('languages', 'JS');
      item.add('languages', 'Ruby');
      return item.save();
    }).then((item) => {
      assert.deepEqual(item.get('languages'), ['JS', 'Ruby']);
      item.addUnique('languages', 'JS');
      return item.save();
    }).then((item) => {
      assert.deepEqual(item.get('languages'), ['JS', 'Ruby']);
    })
  );

  it('should support remove', () =>
    createItemP(30).then((item) => {
      item.add('languages', 'JS');
      item.add('languages', 'JS');
      item.add('languages', 'Ruby');
      return item.save();
    }).then((item) => {
      assert.deepEqual(item.get('languages'), ['JS', 'JS', 'Ruby']);
      item.remove('languages', 'JS');
      return item.save();
    }).then((item) => {
      assert.deepEqual(item.get('languages'), ['Ruby']);
    })
  );

  it('should saveAll and find 2 items', () => {
    const item = new Item();
    item.set('price', 30);

    const item2 = new Item();
    item2.set('price', 30);
    return Parse.Object.saveAll([item, item2]).then((items) => {
      assert.equal(items.length, 2);
      const query = new Parse.Query(Item);
      query.equalTo('price', 30);
      return query.find().then((finalItems) => {
        assert.equal(finalItems.length, 2);
        assert.equal(finalItems[0].get('price'), 30);
        assert.equal(finalItems[1].get('price'), 30);
      });
    });
  });

  it('should find an item matching an or query', () =>
    new Item()
      .set('price', 30)
      .save()
      .then(item => {
        const query = new Parse.Query(Item);
        query.equalTo('price', 30);

        const otherQuery = new Parse.Query(Item);
        otherQuery.equalTo('name', 'Chicken');

        const orQuery = Parse.Query.or(query, otherQuery);
        return orQuery.find().then((items) => {
          assert.equal(items[0].id, item.id);
        });
      })
  );

  it('should not find any items if they do not match an or query', () =>
    new Item()
      .set('price', 30)
      .save()
      .then(() => {
        const query = new Parse.Query(Item);
        query.equalTo('price', 50);

        const otherQuery = new Parse.Query(Item);
        otherQuery.equalTo('name', 'Chicken');

        const orQuery = Parse.Query.or(query, otherQuery);
        return orQuery.find().then((items) => {
          assert.equal(items.length, 0);
        });
      })
  );

  it('should save 2 items and get one for a first() query', () =>
    Parse.Promise.when(createItemP(30), createItemP(20)).then(() => {
      const query = new Parse.Query(Item);
      return query.first().then((item) => {
        assert.equal(item.get('price'), 30);
      });
    })
  );

  it('should handle nested includes', () =>
    createBrandP('Acme')
      .then((newBrand) =>
        createItemP(30, newBrand)
          .then((item) => {
            const brand = item.get('brand');
            return createStoreWithItemP(item).then(() => {
              const query = new Parse.Query(Store);
              query.include('item');
              query.include('item.brand');
              return query.first().then((result) => {
                const resultItem = result.get('item');
                const resultBrand = resultItem.get('brand');
                assert.equal(resultItem.id, item.id);
                assert.equal(resultBrand.get('name'), 'Acme');
                assert.equal(resultBrand.id, brand.id);
              });
            });
          })
    )
  );

  it('should return invalid pointers if they are not included', () => {
    const item = new Item();
    item.id = 'ZZZZZZZZ';
    return createStoreWithItemP(item).then(() => {
      const query = new Parse.Query(Store);
      return query.first().then((result) => {
        assert.strictEqual(result.get('item').id, item.id);
      });
    });
  });

  it('should leave includes of invalid pointers undefined', () => {
    const item = new Item();
    item.id = 'ZZZZZZZZ';
    return createStoreWithItemP(item).then(() => {
      const query = new Parse.Query(Store);
      query.include('item');
      query.include('item.brand');
      return query.first().then((result) => {
        assert.strictEqual(result.get('item'), undefined);
      });
    });
  });

  it('should handle multiple nested includes', () => {
    let a1;
    let a2;
    let b;
    let c;

    return Parse.Promise.when(
        new Parse.Object('a', { value: '1' }).save(),
        new Parse.Object('a', { value: '2' }).save())
    .then((savedA1, savedA2) => {
      a1 = savedA1;
      a2 = savedA2;
      return new Parse.Object('b', { a1, a2 }).save();
    })
    .then((savedB) => {
      b = savedB;
      return new Parse.Object('c', { b }).save();
    })
    .then((savedC) => {
      c = savedC;
      return new Parse.Query('c')
          .include('b')
          .include('b.a1')
          .include('b.a2')
          .first();
    })
    .then((loadedC) => {
      assert.equal(loadedC.id, c.id);
      assert.equal(loadedC.get('b').id, b.id);
      assert.equal(loadedC.get('b').get('a1').id, a1.id);
      assert.equal(loadedC.get('b').get('a2').id, a2.id);
      assert.equal(loadedC.get('b').get('a1').get('value'), a1.get('value'));
      assert.equal(loadedC.get('b').get('a2').get('value'), a2.get('value'));
    });
  });

  it('should handle includes over arrays of pointers', () => {
    const item1 = new Item({ cool: true });
    const item2 = new Item({ cool: false });
    const items = [item1, item2];
    return Parse.Object.saveAll(items).then(() => {
      const brand = new Brand({
        items,
      });
      return brand.save();
    }).then(() => {
      const q = new Parse.Query(Brand).include('items');
      return q.first();
    }).then((brand) => {
      assert(brand.get('items')[0].get('cool'));
      assert(!brand.get('items')[1].get('cool'));
    });
  });

  it('should handle nested includes over arrays of pointers', () => {
    const store = new Store({ location: 'SF' });
    const item1 = new Item({ cool: true, store });
    const item2 = new Item({ cool: false });
    const items = [item1, item2];
    return Parse.Object.saveAll(items.concat([store])).then(() => {
      const brand = new Brand({
        items,
      });
      return brand.save();
    }).then(() => {
      const q = new Parse.Query(Brand).include('items,items.store');
      return q.first();
    }).then((brand) => {
      assert.equal(brand.get('items')[0].get('store').get('location'), 'SF');
      assert(!brand.get('items')[1].get('cool'));
    });
  });

  it('should handle includes where item is missing', () => {
    const item = new Item({ cool: true });
    const brand1 = new Brand({});
    const brand2 = new Brand({ item });
    return Parse.Object.saveAll([item, brand1, brand2]).then(() => {
      const q = new Parse.Query(Brand).include('item');
      return q.find();
    }).then((brands) => {
      assert(!brands[0].has('item'));
      assert(brands[1].has('item'));
    });
  });

  it('should handle includes where nested array item is missing', () => {
    const store = new Store({ location: 'SF' });
    const item1 = new Item({ cool: true, store });
    const item2 = new Item({ cool: false });
    const items = [item1, item2];
    return Parse.Object.saveAll(items.concat([store])).then(() => {
      const brand = new Brand({
        items,
      });
      return brand.save();
    }).then(() => {
      const q = new Parse.Query(Brand).include('items,items.blah,wow');
      return q.first();
    }).then((brand) => {
      assert(brand.get('items')[0].get('cool'));
      assert(!brand.get('items')[1].get('cool'));
    });
  });

  it('should handle delete', () => {
    const item = new Item();
    return item.save().then(() => new Parse.Query(Item).first()
      ).then((foundItem) => {
        assert(foundItem);
        return foundItem.destroy();
      }).then(() => new Parse.Query(Item).first())
        .then((foundItem) => {
          assert(!foundItem);
        });
  });

  it('should do a fetch query', () => {
    let savedItem;
    return new Item().save({ price: 30 }).then((item1) => {
      savedItem = item1;
      return Item.createWithoutData(item1.id).fetch();
    }).then((fetched) => {
      assert.equal(fetched.id, savedItem.id);
      assert.equal(fetched.get('price'), 30);
    });
  });

  it('should find with objectId', () => {
    let savedItem;
    return new Item().save({ price: 30 }).then((item1) => {
      savedItem = item1;
      return new Parse.Query(Item).equalTo('objectId', item1.id).first();
    }).then((fetched) => {
      assert.equal(fetched.id, savedItem.id);
      assert.equal(fetched.get('price'), 30);
    });
  });

  it('should get objectId', () => {
    let savedItem;
    return new Item().save({ price: 30 }).then((item1) => {
      savedItem = item1;
      return new Parse.Query(Item).get(item1.id);
    }).then((fetched) => {
      assert.equal(fetched.id, savedItem.id);
      assert.equal(fetched.get('price'), 30);
    });
  });

  it('should find with objectId and where', () =>
     Parse.Promise.when(
      new Item().save({ price: 30 }),
      new Item().save({ name: 'Device' })
    ).then((item1) => {
      const itemQuery = new Parse.Query(Item);
      itemQuery.exists('nonExistent');
      itemQuery.equalTo('objectId', item1.id);
      return itemQuery.find().then((items) => {
        assert.equal(items.length, 0);
      });
    })
  );

  it('should match a correct when exists query', () =>
    Parse.Promise.when(
      new Item().save({ price: 30 }),
      new Item().save({ name: 'Device' })
    ).then((item1) => {
      const itemQuery = new Parse.Query(Item);
      itemQuery.exists('price');
      return itemQuery.find().then((items) => {
        assert.equal(items.length, 1);
        assert.equal(items[0].id, item1.id);
      });
    })
  );

  it('should match a correct when doesNotExist query', () =>
    Parse.Promise.when(
      new Item().save({ price: 30 }),
      new Item().save({ name: 'Device' })
    ).then((item1, item2) => {
      const itemQuery = new Parse.Query(Item);
      itemQuery.doesNotExist('price');
      return itemQuery.find().then((items) => {
        assert.equal(items.length, 1);
        assert.equal(items[0].id, item2.id);
      });
    })
  );

  it('should match a correct equalTo query for an object', () =>
    createItemP(30).then((item) => {
      const store = new Store();
      store.set('item', item);
      return store.save().then((savedStore) => {
        const query = new Parse.Query(Store);
        query.equalTo('item', item);
        return query.find().then((results) => {
          assert.equal(results[0].id, savedStore.id);
        });
      });
    })
  );

  it('should handle an equalTo null query for an object without a null field', () =>
    createItemP(30).then((item) => {
      const store = new Store();
      store.set('item', item);
      return store.save().then(() => {
        const query = new Parse.Query(Store);
        query.equalTo('item', null);
        return query.find().then((results) => {
          assert.equal(results.length, 0);
        });
      });
    })
  );

  it('should handle an equalTo null query for an object with a null field', () => {
    const store = new Store();
    return store.save().then((savedStore) => {
      const query = new Parse.Query(Store);
      query.equalTo('item', null);
      return query.find().then((results) => {
        assert.equal(results[0].id, savedStore.id);
      });
    });
  });

  it('should handle a notEqualTo null query for an object without a null field', () =>
    createItemP(30).then((item) => {
      const store = new Store();
      store.set('item', item);
      return store.save().then((savedStore) => {
        const query = new Parse.Query(Store);
        query.notEqualTo('item', null);
        return query.find().then((results) => {
          assert.equal(results[0].id, savedStore.id);
        });
      });
    })
  );

  it('should handle a notEqualTo null query for an object with a null field', () => {
    const store = new Store();
    return store.save().then(() => {
      const query = new Parse.Query(Store);
      query.notEqualTo('item', null);
      return query.find().then((results) => {
        assert.equal(results.length, 0);
      });
    });
  });

  it('should not match an incorrect equalTo query on price', () =>
    createItemP(30).then(() =>
      itemQueryP(20).then((results) => {
        assert.equal(results.length, 0);
      })
    )
  );

  it('should not match an incorrect equalTo query on price and name', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.equalTo('price', 30);
      query.equalTo('name', 'pants');
      return query.find().then((results) => {
        assert.equal(results.length, 0);
      });
    })
  );

  it('should match a containedIn query', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.containedIn('price', [40, 30, 90]);
      return query.find().then((results) => {
        assert.equal(results.length, 1);
      });
    })
  );

  it('should not match an incorrect containedIn query', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.containedIn('price', [40, 90]);
      return query.find().then((results) => {
        assert.equal(results.length, 0);
      });
    })
  );

  it('should match a containedIn query on array of items', () =>
    createItemP(30, 'Cereal', { languages: ['ruby', 'js', 'python'] }).then(() => {
      const query = new Parse.Query(Item);
      query.containedIn('languages', ['ruby']);
      return query.find().then((results) => {
        assert.equal(results.length, 1);
      });
    })
  );

  it('should find 2 objects when there are 2 matches', () =>
    Parse.Promise.when(createItemP(20), createItemP(20)).then(() => {
      const query = new Parse.Query(Item);
      query.equalTo('price', 20);
      return query.find().then((results) => {
        assert.equal(results.length, 2);
      });
    })
  );

  it('should first() 1 object when there are 2 matches', () =>
    Parse.Promise.when(createItemP(20), createItemP(20)).then((item1) => {
      const query = new Parse.Query(Item);
      query.equalTo('price', 20);
      return query.first().then((result) => {
        assert.equal(result.id, item1.id);
      });
    })
  );

  it('should match a query with 1 objects when 2 objects are present', () =>
    Parse.Promise.when(createItemP(20), createItemP(30)).then(() => {
      const query = new Parse.Query(Item);
      query.equalTo('price', 20);
      return query.find().then((results) => {
        assert.equal(results.length, 1);
      });
    })
  );

  it('should match a date', () => {
    const bornOnDate = new Date();
    const item = new Item({ bornOnDate });

    return item.save().then(() => {
      const query = new Parse.Query(Item);
      query.equalTo('bornOnDate', bornOnDate);
      return query.first().then((result) => {
        assert(result.get('bornOnDate', bornOnDate));
      });
    });
  });

  it('should properly handle date in query operator', () => {
    const bornOnDate = new Date();
    const middleDate = new Date();
    const expireDate = new Date();
    middleDate.setDate(bornOnDate.getDate() + 1);
    expireDate.setDate(bornOnDate.getDate() + 2);

    const item = new Item({
      bornOnDate,
      expireDate,
    });

    return item.save().then(() => {
      const query = new Parse.Query(Item);
      query.lessThan('bornOnDate', middleDate);
      query.greaterThan('expireDate', middleDate);
      return query.first().then((result) => {
        assert(result);
      });
    });
  });

  it('should handle $nin', () =>
    Parse.Promise.when(createItemP(20), createItemP(30)).then(() => {
      const query = new Parse.Query(Item);
      query.notContainedIn('price', [30]);
      return query.find();
    }).then((results) => {
      assert.equal(results.length, 1);
      assert.equal(results[0].get('price'), 20);
    })
  );

  it('should handle $nin on array field', () => {
    const item1 = createItemP(20, 'crap', { languages: ['ruby', 'js', 'python'] });
    const item2 = createItemP(30, 'crap', { languages: ['ruby', 'js'] });
    Parse.Promise.when(item1, item2).then(() => {
      const query = new Parse.Query(Item);
      query.notContainedIn('languages', ['python']);
      return query.find();
    }).then((results) => {
      assert.equal(results.length, 1);
      assert.equal(results[0].get('price'), 30);
    });
  });

  it('should handle $nin on objectId', () =>
    createItemP(30).then((item) => {
      const query = new Parse.Query(Item);
      query.notContainedIn('objectId', [item.id]);
      return query.find();
    }).then((results) => {
      assert.equal(results.length, 0);
    })
  );

  it('should handle $nin with an empty array', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.notContainedIn('objectId', []);
      return query.find();
    }).then((results) => {
      assert.equal(results.length, 1);
    })
  );

  it('should handle $regex queries', () =>
    createBrandP('Acme').then(() => {
      const query = new Parse.Query(Brand);
      query.startsWith('name', 'Ac');
      return query.find();
    }).then((results) => {
      assert.equal(results.length, 1);
    })
  );

  it('should not overwrite included objects after a save', () =>
    createBrandP('Acme').then((brand) =>
      createItemP(30, brand).then((item) =>
        createStoreWithItemP(item).then(() => {
          const query = new Parse.Query(Store);
          query.include('item');
          query.include('item.brand');
          return query.first().then((str) => {
            str.set('lol', 'wut');
            return str.save().then(() => {
              assert.equal(str.get('item').get('brand').get('name'), brand.get('name'));
            });
          });
        })
      )
    )
  );

  it('should update an existing object correctly', () =>
    Parse.Promise.when(createItemP(30), createItemP(20)).then((item1, item2) =>
      createStoreWithItemP(item1).then((store) => {
        item2.set('price', 10);
        store.set('item', item2);
        return store.save().then((returnedStore) => {
          assert(returnedStore.has('item'));
          assert(returnedStore.get('item').get('price') === 10);
        });
      })
    )
  );

  it('should support a nested query', () => {
    const brand0 = new Brand();
    brand0.set('name', 'Acme');
    brand0.set('country', 'US');
    return brand0.save().then((brand) => {
      const item = new Item();
      item.set('price', 30);
      item.set('country_code', 'US');
      item.set('state', 'CA');
      item.set('brand', brand);
      return item.save();
    }).then(() => {
      const store = new Store();
      store.set('state', 'CA');
      return store.save();
    }).then((store) => {
      const brandQuery = new Parse.Query(Brand);
      brandQuery.equalTo('name', 'Acme');

      const itemQuery = new Parse.Query(Item);
      itemQuery.matchesKeyInQuery('country_code', 'country', brandQuery);

      const storeQuery = new Parse.Query(Store);
      storeQuery.matchesKeyInQuery('state', 'state', itemQuery);
      return Parse.Promise.when(storeQuery.find(), Parse.Promise.as(store));
    })
    .then((storeMatches, store) => {
      assert.equal(storeMatches.length, 1);
      assert.equal(storeMatches[0].id, store.id);
    });
  });

  it('should find items not filtered by a notContainedIn', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.equalTo('price', 30);
      query.notContainedIn('objectId', [234]);
      return query.find().then((items) => {
        assert.equal(items.length, 1);
      });
    })
  );

  it('should find not items filtered by a notContainedIn', () =>
    createItemP(30).then((item) => {
      const query = new Parse.Query(Item);
      query.equalTo('price', 30);
      query.notContainedIn('objectId', [item.id]);
      return query.find().then((items) => {
        assert.equal(items.length, 0);
      });
    })
  );

  it('should handle a lessThan query', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.lessThan('createdAt', new Date('2024-01-01T23:28:56.782Z'));
      return query.find().then((items) => {
        assert.equal(items.length, 1);
        const newQuery = new Parse.Query(Item);
        newQuery.greaterThan('createdAt', new Date());
        return newQuery.find().then((moreItems) => {
          assert.equal(moreItems.length, 0);
        });
      });
    })
  );

  it('should handle a lessThanOrEqualTo query', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.lessThanOrEqualTo('price', 30);
      return query.find().then((items) => {
        assert.equal(items.length, 1);
        query.lessThanOrEqualTo('price', 20);
        return query.find().then((moreItems) => {
          assert.equal(moreItems.length, 0);
        });
      });
    })
  );

  it('should handle a greaterThan query', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.greaterThan('price', 20);
      return query.find().then((items) => {
        assert.equal(items.length, 1);
        query.greaterThan('price', 50);
        return query.find().then((moreItems) => {
          assert.equal(moreItems.length, 0);
        });
      });
    })
  );

  it('should handle a greaterThanOrEqualTo query', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.greaterThanOrEqualTo('price', 30);
      return query.find().then((items) => {
        assert.equal(items.length, 1);
        query.greaterThanOrEqualTo('price', 50);
        return query.find().then((moreItems) => {
          assert.equal(moreItems.length, 0);
        });
      });
    })
  );

  it('should handle multiple conditions for a single key', () =>
    createItemP(30).then(() => {
      const query = new Parse.Query(Item);
      query.greaterThan('price', 20);
      query.lessThan('price', 40);
      return query.find().then((items) => {
        assert.equal(items.length, 1);
        query.greaterThan('price', 30);
        return query.find().then((moreItems) => {
          assert.equal(moreItems.length, 0);
        });
      });
    })
  );

  it('should correctly handle matchesQuery', () =>
    createBrandP('Acme').then((brand) =>
      createItemP(30, brand).then((item) =>
        createStoreWithItemP(item).then(() => {
          const brandQuery = new Parse.Query(Brand);
          brandQuery.equalTo('name', 'Acme');

          const itemQuery = new Parse.Query(Item);
          itemQuery.matchesQuery('brand', brandQuery);

          const storeQuery = new Parse.Query(Store);
          storeQuery.matchesQuery('item', itemQuery);

          return storeQuery.find().then((store) => {
            assert(store);
          });
        })
      )
    )
  );

  it('should correctly count items in a matchesQuery', () =>
    createBrandP('Acme').then((brand) =>
      createItemP(30, brand).then((item) =>
        createStoreWithItemP(item).then(() => {
          const itemQuery = new Parse.Query(Item);
          itemQuery.equalTo('price', 30);

          const storeQuery = new Parse.Query(Store);
          storeQuery.matchesQuery('item', itemQuery);
          return storeQuery.count().then((storeCount) => {
            assert.equal(storeCount, 1);
          });
        })
      )
    )
  );

  it('should skip and limit items appropriately', () =>
    createBrandP('Acme').then(() =>
      createBrandP('Acme 2').then(() => {
        const brandQuery = new Parse.Query(Brand);
        brandQuery.limit(1);
        return brandQuery.find().then((brands) => {
          assert.equal(brands.length, 1);
          const brandQuery2 = new Parse.Query(Brand);
          brandQuery2.limit(1);
          brandQuery2.skip(1);
          return brandQuery2.find().then((moreBrands) => {
            assert.equal(moreBrands.length, 1);
            assert.notEqual(moreBrands[0].id, brands[0].id);
          });
        });
      })
    )
  );

  it('should deep save and update nested objects', () => {
    const brand = new Brand();
    brand.set('name', 'Acme');
    brand.set('country', 'US');
    const item = new Item();
    item.set('price', 30);
    item.set('country_code', 'US');
    brand.set('items', [item]);
    return brand.save().then((savedBrand) => {
      assert.equal(savedBrand.get('items')[0].get('price'), item.get('price'));

      const item2 = new Item();
      item2.set('price', 20);
      brand.set('items', [item2]);
      return brand.save().then((updatedBrand) => {
        assert.equal(updatedBrand.get('items')[0].get('price'), 20);
      });
    });
  });


  context('when object has beforeSave hook registered', () => {
    behavesLikeParseObjectOnBeforeSave('Brand', Brand);
  });

  context('when object has beforeDelete hook registered', () => {
    behavesLikeParseObjectOnBeforeDelete('Brand', Brand);
  });

  it('successfully uses containsAll query', () =>
    Parse.Promise.when(createItemP(30), createItemP(20)).then((item1, item2) => {
      const store = new Store({
        items: [item1.toPointer(), item2.toPointer()],
      });
      return store.save().then(() => {
        const query = new Parse.Query(Store);
        query.containsAll('items', [item1.toPointer(), item2.toPointer()]);
        return query.find();
      }).then(stores => {
        assert.equal(stores.length, 1);
        const query = new Parse.Query(Store);
        query.containsAll('items', [item2.toPointer(), 4]);
        return query.find();
      }).then(stores => {
        assert.equal(stores.length, 0);
      });
    })
  );

  it('should handle relations', () => {
    const store = new Store();

    const paperTowels0 = createItemP(20, 'paper towels');
    const toothPaste0 = createItemP(30, 'tooth paste');
    const toothBrush0 = createItemP(50, 'tooth brush');

    return Parse.Promise.when(
      paperTowels0,
      toothPaste0,
      toothBrush0
    ).then((paperTowels, toothPaste) => {
      const relation = store.relation('items');
      relation.add(paperTowels);
      relation.add(toothPaste);
      return store.save();
    })
    .then(() => store.fetch()
    ).then((fetchedStore) => {
      const fetchRelation = fetchedStore.relation('items');
      return fetchRelation.query().count();
    })
    .then((itemCount) => {
      assert.equal(itemCount, 2);
      const relation = store.relation('items');
      const query = relation.query();
      return query.find();
    })
    .then((items) => {
      assert.equal(items.length, 2);
      assert.equal(items[0].className, 'Item');
      const relation = store.relation('items');
      relation.remove(items[1]);
      return store.save();
    })
    .then((store1) => {
      store1.relation('items');
      return store.relation('items').query().find();
    })
    .then((items) => {
      assert.equal(items.length, 1);
    });
  });

  it('should handle a direct query on a relation field', () => {
    const store = new Store({ name: 'store 1' });
    const store2 = new Store({ name: 'store 2' });
    let tpId;

    const paperTowels0 = createItemP(20, 'paper towels');
    const toothPaste0 = createItemP(30, 'tooth paste');
    const toothBrush0 = createItemP(50, 'tooth brush');
    return Parse.Promise.when(
      paperTowels0,
      toothPaste0,
      toothBrush0,
      store,
      store2
    ).then((paperTowels, toothPaste) => {
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
      assert.equal(results[0].get('name'), 'store 2');
    });
  });

  it('should handle the User class', () => {
    const user = new Parse.User({ name: 'Turtle' });
    return user.save().then(() => new Parse.Query(Parse.User).find())
      .then((foundUsers) => {
        assert.equal(foundUsers.length, 1);
        assert.equal(foundUsers[0].get('name'), 'Turtle');
      });
  });

  it('should handle the Role class', () => {
    const roleACL = new Parse.ACL();
    roleACL.setPublicReadAccess(true);
    const role = new Parse.Role('Turtle', roleACL);
    return role.save().then(() => new Parse.Query(Parse.Role).find())
    .then((foundRoles) => {
      assert.equal(foundRoles.length, 1);
      assert.equal(foundRoles[0].get('name'), 'Turtle');
    });
  });

  it('should handle redirectClassNameForKey', () => {
    const user = new Parse.User({ name: 'T Rutlidge' });
    return user.save().then((savedUser) => {
      const roleACL = new Parse.ACL();
      roleACL.setPublicReadAccess(true);

      const role = new Parse.Role('Turtle', roleACL);
      role.getUsers().add(savedUser);
      return role.save();
    }).then(() => new Parse.Query(Parse.Role).equalTo('name', 'Turtle').first())
      .then((foundRole) => foundRole.getUsers().query().find())
      .then((foundUsers) => {
        assert.equal(foundUsers.length, 1);
        assert.equal(foundUsers[0].get('name'), 'T Rutlidge');
      });
  });

  it('should correctly find nested object in a where query', () => {
    const store = new Store({
      name: 'store 1',
      customOptions: {
        isOpenHolidays: true,
        weekendAvailability: {
          sat: true,
          sun: false,
        },
      },
    });
    return store.save().then(() => {
      let storeQuery = new Parse.Query(Store);
      storeQuery.equalTo('customOptions.isOpenHolidays', true);
      return storeQuery.count().then((storeCount) => {
        assert.equal(storeCount, 1);
        storeQuery = new Parse.Query(Store);
        storeQuery.equalTo('customOptions.blah', true);
        return storeQuery.count();
      }).then((count) => {
        assert.equal(count, 0);
        storeQuery = new Parse.Query(Store);
        storeQuery.equalTo('customOptions.weekendAvailability.sun', false);
        return storeQuery.count();
      }).then((count) => {
        assert.equal(count, 1);
        storeQuery = new Parse.Query(Store);
        storeQuery.equalTo('customOptions.weekendAvailability.sun', true);
        return storeQuery.count();
      })
      .then((count) => {
        assert.equal(count, 0);
      });
    });
  });
});
