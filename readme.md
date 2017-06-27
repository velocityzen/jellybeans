# Jellybeans

Jellybeans is a streamable event log that uses [rethinkdb](https://www.rethinkdb.com) as storage.

# Installation

1. `npm i jellybeans`
2. Create any table for events with two indexes _created_ and _recieved_
3. Create any table for event data

# Usage

```js
let Log = require('jellybeans');

let log = new Log({
  db,           //your rethinkdbdash connection
  eventTable,   //event table name
  contentTable  //event content table name
});
```

## Methods
### add(event, [opts])
Add a well-formed event to the database

```js
log
  .add({
    log: 'string',         //log id
    type: 'string',        //event type
    created: 'timestamp',  //timestamp when event was created
    content: 'anything'    //event content, can be anything
  }, opts)
  .then(ids => console.log(ids)) //returns array of event ids
```

This example will create a record in the log:
```js
{
  log: 'string',
  type: 'string',
  created: 'timestamp',
  content: 'anything',
  received: 'timestamp',
  status: 0
}
```

* `recieved` — timestamp is a timestamp when record was added to db
* `status` — event status (check event status section bellow)

You can add any other properties to the event, but we recomend to add them to `content` property.

If you add `status` propery to event it will be created with that status (check event status section bellow)

`opts` are:
* `linkedContent` — saves content to the 'contentTable' and adds link to actual event (check Linked Content section bellow)

### addAll(events, [opts])
The same as `add` method but adds array of events

There is additional option `content` where you can put your content object, it will be saved to `contentTable` and link to this content will be added to all events (check Linked Content section bellow)

### addToMany(logs, event, [opts])
The same as `add` method but adds event to many logs at once

There is additional option `content` where you can put your content object, it will be saved to `contentTable` and link to this content will be added to all events (check Linked Content section bellow)

### getEvent(id)
Returns event by id

### setStatus(id, status)
Sets status of event

### setDelivered(id)
Adds delivered timestamp to event. Also if event had an `CREATED` status it will be set to `DONE` status.

### setContent(id, content)
Updates content of event

### getFeed(opts)
Fetch messages ordered by their `created` timestamps. The `created` timestamp is not verified, and may be incorrect.

### getLog(opts)
Fetch messages ordered by their `received` timestamps.

`opts` are the same for both `getFeed` and `getLog` methods

* __live__ — boolean, default `false`. If true returns rethinkdb changes stream
* __logs__ — array. Array of logs ids you want to get
* __types__ — array, default `*`. Array of event types you want to get.
* __status__ — integer, optional. Returns events with `status` only
* __count__ — boolean, default `false`. Returns a number of events for every type
* __gt__, __ge__ — timestamp, optional. Greater than and greater than or equal define the lower bound of the range to be streamed. Only records where the key is greater than (or equal to) this option will be included in the range.
* __lt__, __le__ — timestamp, optional. Less than and less than or equal define the higher bound of the range to be streamed. Only key/value pairs where the key is less than (or equal to) this option will be included in the range.
* __content__ — boolean. deafult `false`
* __limit__ — integer, optional. Limit the number of results collected by this stream. This number represents a maximum number of results and may not be reached if you get to the end of the data first.

`Live`, `limit`, `count` are mutually exclusive options


```js
log.getFeed({
    logs: [ 'user1' ],
    types: '*',
    ge: Date.now(),
    live: true
  })
  .then(cursor => {
    cursor.each((err, res) => console.log(err, res))
  });
```

## Linked Content

When you have several events that should have the same __consistent__ conten you should use `linkedContent` option. Then content of event will be saved to separate table with link to it in the event.

## Event Status

Event statauses defined in log.STATUS property
```js
{
  CREATED: 0,
  NEEDRESPONSE: 1,

  MARKED: 251,
  IGNORED: 252,
  DECLINED: 253,
  ACCEPTED: 254,
  DONE: 255
};

```

You can add any statuses you want in between 1 and 251. All statuses above 200 are considered as delevired.


## To do
* add signature
* encryption

License: MIT


