import { z as zodV3 } from "zod";
import * as z from "zod/v4";
import { messageFor } from "./errorMap";

// The one zod entry for API schemas: import `z` from here, never from "zod" or "zod/v4".
//
// It is zod's v4 API (the package is 3.25, which ships both): the transaction schemas already
// use it, and its `z.config` takes one global error map. Older schemas still import v3 directly
// until their area is converted, so the same map is installed for v3 too. Importing this file
// installs both, and middleware/errorHandler imports it, so every request is covered.
z.config({ customError: (issue) => messageFor(issue as Parameters<typeof messageFor>[0]) });
zodV3.setErrorMap((issue) => ({ message: messageFor(issue as Parameters<typeof messageFor>[0]) }));

export { z };
