const fs = require('fs');
try {
  require('./apps/web/heys_storage_layer_v1.js');
} catch (e) {
  console.log("Error at line:", e.lineNumber);
  console.log(e);
}
