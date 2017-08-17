'use strict';
const timestamp = require('monotonic-timestamp')
const errorHandler = require('./errors').handler;

const STATUS = require('./status');
const FILTERS = [ 'lt', 'le', 'gt', 'ge' ];

const Log = function(opts) {
  this.db = opts.db;
  this.eventTable = opts.eventTable;
  this.contentTable = opts.contentTable;
};

Log.STATUS = Log.prototype.STATUS = STATUS;

// for compatibility with sweets
Log.prototype.r = function() {
  return this.db.r || this.db;
};

Log.prototype.rEventTable = function() {
  return this.db.table(this.eventTable);
};

Log.prototype.rContentTable = function() {
  return this.db.table(this.contentTable);
};


//get event by id
Log.prototype.getEvent = function(id, noContent) {
  return this._getEvent(id, noContent).run();
};

Log.prototype._getEvent = function(id, noContent) {
  const r = this.r();
  const q = r.table(this.eventTable).get(id);

  if (noContent) {
    return q;
  }

  return q.do(this.mergeContent());
};

//Fetch events ordered by their claimed timestamps
Log.prototype.getFeed = function(opts) {
  return this.query(opts, 'created').run();
};

//Fetch events ordered by the time received
Log.prototype.getLog = function(opts) {
  return this.query(opts, 'received').run();
};

Log.prototype.query = function(opts = {}, orderBy = 'received') {
  const r = this.r();
  let q = r.table(this.eventTable);

  const filter = FILTERS.find(filter => opts[filter]);
  if (filter) {
    const ts = opts[filter] || Date.now();
    const order = filter === 'ge' || filter === 'gt' ? 'asc' : 'desc';
    q = q
      .orderBy({ index: r[order](orderBy) })
      .filter(row => row(orderBy)[filter](ts));
  } else {
    q = q.orderBy({ index: r.desc(orderBy) });
  }

  if (opts.logs) {
    q = q.filter(row => r.expr(opts.logs).contains( row('log') ));
  }

  if (opts.types && opts.types !== '*') {
    q = q.filter(row => r.expr(opts.types).contains( row('type') ))
  }

  if (opts.status !== undefined) {
    q = q.filter({ status: opts.status });
  }

  if (opts.live) {
    q = q.changes({
      squash: true,
      includeInitial: true,
      includeTypes: true
    });
  } else if (opts.limit) {
    q = q.limit(opts.limit);
  } else if (opts.count) {
    if (opts.squash) {
      return q.count();
    }

    return this.countEvents(q);
  }

  if (opts.content) {
    return q.map(opts.live ? this.mergeContentLive() : this.mergeContent());
  }

  return q;
};

Log.prototype.countEvents = function(q) {
  return q
    .group('type')
      .count()
    .ungroup()
    .map(row => [ row('group'), row('reduction') ])
    .coerceTo('object');
};

Log.prototype.addToMany = function(logs, event, opts = {}) {
  if (opts.content || opts.linkedContent) {
    return this.addToManyLinked(logs, event, opts.content);
  }

  const events = logs.map(log => Object.assign({
    status: STATUS.CREATED
  }, event, {
    log: log,
    received: timestamp()
  }));

  return this._add(events);
};

Log.prototype.addToManyLinked = function(logs, event, content) {
  if (!content) {
    if (!event.content) {
      throw new Error('Content should be defined');
    }

    content = event.content;
    delete event.content;
  }

  return this.db.table(this.contentTable)
    .insert(content)
    .run()
    .then(res => {
      const cid = content.id || res.generated_keys[0];
      const events = logs.map(log => Object.assign({
        status: STATUS.CREATED
      }, event, {
        log,
        cid,
        received: timestamp()
      }));

      return this._add(events);
    });
};

Log.prototype.addAll = function(events, opts = {}) {
  if (opts.content || opts.linkedContent) {
    return this.addAllLinked(events, opts.content);
  }

  events = events.map(event => Object.assign({
    status: STATUS.CREATED
  }, event, {
    received: timestamp()
  }));

  return this._add(events);
};

Log.prototype.addAllLinked = function(events, content) {
  const isSingleContent = !!content;

  if (!isSingleContent) {
    content = [];
    events = events.map(event => {
      content.push(event.content);
      delete event.content;
      return event;
    });
  }

  return this.db.table(this.contentTable)
    .insert(content)
    .run()
    .then(res => {
      const cids = res.generated_keys;

      if (isSingleContent) {
        const cid = cids[0];
        events = events.map(event => {
          return Object.assign({
            status: STATUS.CREATED
          }, event, {
            received: timestamp(),
            cid
          });
        });
      } else {
        events = events.map((event, i) => {
          return Object.assign({
            status: STATUS.CREATED
          }, event, {
            received: timestamp(),
            cid: cids[i]
          });
        });
      }

      return this._add(events);
    });
};

Log.prototype.add = function(event, opts = {}) {
  event = Object.assign({
    status: STATUS.CREATED
  }, event, {
    received: timestamp()
  });

  if (opts.linkedContent && typeof event.content === 'object') {
    return this._addLinked(event);
  }

  return this._add(event);
};

Log.prototype._addLinked = function(event) {
  const content = event.content;
  delete event.content;

  return this.db.table(this.contentTable)
    .insert(content)
    .run()
    .then(res => {
      event.cid = content.id || res.generated_keys[0];
      return this._add(event);
    });
};

Log.prototype._add = function(event) {
  return this.db.table(this.eventTable)
    .insert(event)
    .run()
    .then(errorHandler)
    .then(res => res.generated_keys);
};

Log.prototype.has = function(id, opts = {}) {
  let q = this.db.table(this.eventTable).get(id);

  if (opts.log) {
    q = q.do(row => row('log').eq(opts.log))
  } else {
    q = q.hasFields('id');
  }

  return q.default(false).run();
};

Log.prototype.setStatus = function(id, status) {
  return this.db.table(this.eventTable)
    .get(id)
    .update({ status })
    .run()
    .then(() => id);
};

Log.prototype.setDelivered = function(id) {
  const r = this.r();
  const delivered = Date.now();

  return r.table(this.eventTable)
    .get(id)
    .replace(row => r.branch(
      row('status').eq(STATUS.CREATED),
      row.merge({
        status: STATUS.DONE,
        delivered
      }),
      row.merge({
        delivered
      })
    ))
    .run()
    .then(() => delivered);
};

//Updates event content
Log.prototype.setContent = function(id, content, returnChanges) {
  const r = this.r();

  return r.table(this.eventTable)
    .get(id)
    .replace(row => r.branch(
      row.hasFields('cid'),
      row,
      row.merge({ content })
    ), { returnChanges: 'always' })('changes')
    .nth(0)('old_val')('cid').default(false)
    .run()
    .then(cid => {
      if (cid) {
        const q = r.table(this.contentTable).get(cid);

        if (returnChanges) {
          return q.update(content, { returnChanges })('changes').nth(0)('new_val').run();
        }

        return q.update(content).run();
      }

      return id;
    });
};

Log.prototype.mergeContent = function() {
  const r = this.r();

  return row => r.branch(
    row.hasFields('cid'),
    row.merge({
      content: r.table(this.contentTable)
        .get( row('cid') ).without('id')
    }).without('cid'),
    row
  );
};

Log.prototype.mergeContentLive = function() {
  const r = this.r();

  return row => r.branch(
    row('new_val')
      .eq(null).not()
      .and(
        row('new_val').hasFields('cid')
      ),
    row.merge({
      new_val: {
        content: r.table(this.contentTable)
          .get( row('new_val')('cid') ).without('id')
      }
    }).without({ new_val: { 'cid': true } }),
    row
  );
};

Log.prototype.delete = function(id) {
  return this.db.table(this.eventTable)
    .get(id)
    .delete()
    .run();
};

Log.prototype.deleteAll = function(ids) {
  return this.db.table(this.eventTable)
    .getAll(ids)
    .delete()
    .run();
};


module.exports = Log;
