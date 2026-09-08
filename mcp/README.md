# Print@ MCP server

Lets an AI agent print to the real world: find a nearby shop, send a document, get a
pickup code. Dependency-free MCP (JSON-RPC over stdio); talks to the Print@ cloud.

## Tools
- `find_print_shops(lat, lon, radius_mi?)` — nearby Print@ Network shops with prices/hours.
- `send_print_job(shop_id, file_path|file_url|file_base64, filename?, copies?, color?, name?, email?)` — returns a 6-digit pickup code.
- `get_job_status(code)` — shop, files, and queued/in-progress/done.

## Use with Claude Code / Claude Desktop
```json
{ "mcpServers": { "print-at": { "command": "node", "args": ["/path/to/print-at/mcp/server.js"] } } }
```
Point at a different backend with `PRINTAT_BASE` (default https://print.earthpilot.ai).

Example: "Find a print shop near 40.87,-124.08 and print ~/resume.pdf, 2 copies, color."
The agent calls find_print_shops → send_print_job → hands you the pickup code.
