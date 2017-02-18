'use strict';
let duplicateErrRx = /Duplicate primary key/;

let handler = function(result) {
  if (result && result.errors && result.errors > 0) {
    //db error
    let message = result.first_error;
    let e = new Error(message);

    if (duplicateErrRx.test(message)) {
      e.code = 2;
    }

    e.errors = result.errors;
    throw e;
  }

  return result;
};

module.exports = {
  handler: handler
};
