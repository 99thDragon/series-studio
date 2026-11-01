export * from "./schema.ts";
export * from "./episodes.ts";
export * from "./record.ts";
export * from "./prompt.ts";
export * from "./adapters.ts";
export * from "./coverage.ts";

import path from "node:path";
import { Studio } from "./record.ts";

/** Studio root: $STUDIO_ROOT, else ./studio-data in the current directory. */
export function defaultStudio(): Studio {
  return new Studio(path.resolve(process.env.STUDIO_ROOT ?? "studio-data"));
}
