import { log } from '@heys/logger';

var r=(n,e)=>{typeof process<"u"&&process.env?.NODE_ENV!=="production"&&log.debug("Analytics track event",{event:n,data:e});};

export { r as trackEvent };
//# sourceMappingURL=out.js.map
//# sourceMappingURL=index.js.map