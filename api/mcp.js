import { createLigandMcpHandler } from "../server/ligand-mcp/server.js";

const fetch = createLigandMcpHandler();

export default { fetch };

