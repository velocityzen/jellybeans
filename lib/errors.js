'use strict';
const duplicateErrRx = /Duplicate primary key/;

const handler = function(result) {
  if (result && result.errors && result.errors > 0) {
    //db error
    const message = result.first_error;
    const e = new Error(message);

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
