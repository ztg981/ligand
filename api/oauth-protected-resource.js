import { createProtectedResourceHandler } from "../server/ligand-mcp/metadata.js";

const fetch = createProtectedResourceHandler();

export default { fetch };

