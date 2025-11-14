'use strict';

var logger = require('@heys/logger');

var r=(n,e)=>{typeof process<"u"&&process.env?.NODE_ENV!=="production"&&logger.log.debug("Analytics track event",{event:n,data:e});};

exports.trackEvent = r;
//# sourceMappingURL=out.js.map
//# sourceMappingURL=index.cjs.map