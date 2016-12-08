/*eslint-env jasmine*/
'use strict';
const rdb = require('rethinkdbdash');
const Log = require('../lib/index');

const STATUS = require('../lib/status');
const eventTable = 'e';
const contentTable = 'e_content';

let rxUUID = /^([0-9a-f]){8}(-([0-9a-f]){4}){3}-([0-9a-f]){12}$/i;

describe('Jellybeans >', () => {
  let db = rdb({
    db: 'test',
    optionalRun: false
  });

  let log = new Log({ db, eventTable, contentTable });

  beforeAll(done => {
    db.tableCreate(eventTable).run()
      .then(() => db.tableCreate(contentTable).run())
      .then(() => db.table(eventTable).indexCreate('created').run())
      .then(() => db.table(eventTable).indexCreate('received').run())
      .then(() => db.table(eventTable).indexWait('created', 'received').run())
      .then(() => done());
  }, 30000);

  afterAll(done => {
    db.tableDrop(eventTable).run()
      .then(() => db.tableDrop(contentTable).run())
      .then(() => done());
  }, 30000);

  let eid1;
  it('adds event', done => {
    log
      .add({
        uid: 'user1',
        log: 'user1',
        created: Date.now(),
        type: 'node.created',
        content: 'Hello World'
      })
      .then(res => {
        expect(res).toBeDefined();
        expect(res.length).toBe(1);
        expect(res[0]).toMatch(rxUUID);
        eid1 = res[0];
        done();
      });
  });

  it('gets simple event', done => {
    log.getEvent(eid1)
      .then(event => {
        expect(event).toBeDefined();
        expect(event.content).toBe('Hello World');
        done();
      });
  });

  let eid2;
  it('adds event with linked content', done => {
    log
      .add({
        uid: 'user1',
        log: 'user1',
        created: Date.now(),
        type: 'node.created',
        content: {
          type: 'p',
          content: 'Hello World!'
        }
      }, { linkedContent: true })
      .then(res => {
        expect(res).toBeDefined();
        expect(res.length).toBe(1);
        expect(res[0]).toMatch(rxUUID);
        eid2 = res[0];
        done();
      });
  });

  it('adds one event to many logs', done => {
    log
      .addToMany([ 'user10', 'user20' ], {
        created: Date.now(),
        type: 'node.created',
        content: 'Many log one event'
      })
      .then(res => {
        expect(res).toBeDefined();
        expect(res.length).toBe(2);
        done();
      });
  });

  it('adds one event to many logs with linked content', done => {
    log
      .addToMany([ 'user10', 'user20' ], {
        created: Date.now(),
        type: 'node.created',
        content: {
          type: 'p',
          content: 'Many log one event'
        }
      }, { linkedContent: true })
      .then(res => {
        expect(res).toBeDefined();
        expect(res.length).toBe(2);
        done();
      });
  });

  it('gets event with linked content', done => {
    log.getEvent(eid2)
      .then(event => {
        expect(event).toBeDefined();
        expect(event.content).toBeDefined();
        expect(event.content.id).toBeUndefined();
        expect(event.content.content).toBe('Hello World!');
        done();
      });
  });

  //status
  it('sets event status to delivered', done => {
    let timestamp;

    log.setDelivered(eid2)
      .then(ts => {
        expect(typeof ts).toBe('number');
        timestamp = ts;
        return log.getEvent(eid2);
      })
      .then(event => {
        expect(event).toBeDefined();
        expect(event.delivered).toBeDefined();
        expect(event.delivered).toBe(timestamp);
        expect(event.status).toBe(STATUS.DONE);
        done();
      });
  });

  // content
  it('updates event content', done => {
    log.setContent(eid1, 'Hello World!')
      .then(res => {
        expect(res).toBe(eid1);
        done();
      });
  });

  it('updates event with linked content', done => {
    log.setContent(eid2, { content: 'Hello World!!!' })
      .then(res => {
        expect(res).toBeDefined();
        done();
      });
  });

  //feed
  it('gets feed', done => {
    log.getFeed({
      logs: [ 'user1' ],
      types: '*',
      le: Date.now()
    })
    .then(() => {
      done();
    })
  });

  it('gets live feed', done => {
    log.getFeed({
      logs: [ 'user1' ],
      types: '*',
      ge: Date.now() - 24 * 60 * 60 * 1000,
      live: true
    })
    .catch(err => fail(err))
    .then(cursor => {
      let i = 0;
      cursor.each((err, res) => {
        if (err) {
          fail(err);
        }

        i++;

        if (i === 4) {
          cursor.close();
          setTimeout(function() {
            done();
          }, 1000);
        }
      });

      setTimeout(() => {
        log.add({
          uid: 'user1',
          log: 'user1',
          created: Date.now(),
          type: 'live.test',
          content: 'Hello World'
        });
      }, 50);

      setTimeout(() => {
        log.add({
          uid: 'user1',
          log: 'user1',
          created: Date.now(),
          type: 'live.test',
          content: {
            type: 'p',
            content: 'Hello World!'
          }
        }, { linkedContent: true })
      }, 100);

    })
  }, 10 * 1000);

  //log
  it('gets a log', done => {
    log.getLog({
      logs: [ 'user1' ],
      types: '*',
      le: Date.now()
    })
    .then(res => {
      done();
    })
  });
});
