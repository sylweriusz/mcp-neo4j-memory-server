/**
 * Enhanced Tool Descriptions - Three-Tier Documentation Strategy
 * Based on MCP documentation analysis and GDD requirements
 */

export const ENHANCED_TOOL_DESCRIPTIONS = {
  memory_store: `Create memories with observations and relationships. **Pattern**: Search→Create→Connect. **Observations**: Self-contained context units (what/when/where/why/impact). **LocalIds**: Cross-references within THIS request only. **Limits**: 50 memories, 200 relations. **Quality**: Each observation = complete detective notes answering setting/action/actors/evidence/impact/significance.`,
  
  memory_find: `Unified search/retrieval. **Query**: text, IDs array, or "*". **Context**: minimal (lists), full (everything), relations-only (graph). **Temporal**: createdAfter "7d"/"2024-01-15". **Graph**: traverseFrom + relations + depth. **Always search before creating**. Updates access timestamps for analytics.`,
  
  memory_modify: `Update/delete memories, manage observations/relations. **Operations**: update (properties), delete (cascade), add-observations (append insights), create-relations (link existing). **Atomic**: All succeed or all fail. **Quality**: One substantial observation per session - complete context stories, not fragments.`,
  
  database_switch: `Switch active database context (creates if missing). ALL subsequent operations use this DB. Call once per session/project. Like 'cd' for memories. **Session-scoped**: Establishes context for entire workflow, not per-operation.`
};

export const ENHANCED_PARAMETER_DESCRIPTIONS = {
  // memory_store parameters
  memories: "Array of memories to create. **Always search first** to avoid duplicates. Each memory = one focused concept.",
  
  "memories.name": "Human-readable identifier. Be specific: 'OAuth2 Implementation' not 'Auth'. Include searchable keywords.",
  
  "memories.memoryType": "Category: knowledge (facts), decision (choices), issue (problems), implementation (code), architecture (structure), pattern (recurring solutions), insight (discoveries).",
  
  "memories.observations": "Context-rich narratives. Each = complete story with setting/action/actors/evidence/impact/significance. **One insight per session** - don't fragment thoughts.",
  
  "memories.metadata": "Static properties (JSON). Use for: project, language, status, tags, dates, version. **Narrative content goes in observations**.",
  
  "memories.localId": "Temporary ID for relations within THIS request. Not reusable across operations. Format: short descriptive names.",
  
  relations: "Connect memories: from/to (localId or memoryId), type (semantic meaning), strength (0.1-1.0 importance).",
  
  // memory_find parameters  
  query: "Search text, array of memory IDs, or '*' for all. **Semantic search**: finds meaning, not just keywords.",
  
  includeContext: "Detail level: **minimal** (id/name/type only - for lists), **full** (everything - default work mode), **relations-only** (graph analysis only).",
  
  limit: "Max results (default: 10). **Increase for comprehensive searches** - use 50+ for full exploration.",
  
  threshold: "Semantic match minimum (0.1-1.0). **Lower = more results**. 0.1 = permissive, 0.8 = strict matching.",
  
  memoryTypes: "Filter by type array. **Leave empty for all types**. Common: ['knowledge', 'decision', 'implementation'].",
  
  createdAfter: "Date filter. **ISO** ('2024-01-15') or **relative** ('7d', '30d', '3m', '1y'). Finds recent additions.",
  
  traverseFrom: "Memory ID to start graph exploration. **Discovers connected knowledge** through relationships.",
  
  traverseRelations: "Relation types to follow. **Empty = all types**. Common: ['INFLUENCES', 'DEPENDS_ON', 'IMPLEMENTS'].",
  
  maxDepth: "Graph traversal depth (1-5, default: 2). **Higher = broader discovery**, but slower performance.",
  
  // memory_modify parameters
  operation: "Action type: **update** (properties), **delete** (cascade), **add-observations** (append), **create-relations** (connect existing).",
  
  target: "Single memory ID to modify. **Use 'targets' for batch operations** to maintain atomicity.",
  
  changes: "For update: new name/type/metadata. **Preserves existing observations** - use add-observations to append.",
  
  observations: "For add-observations: new insights to append. **One substantial observation per session** - complete context stories.",
  
  "observations.contents": "For add: new observation text(s) - **typically one per session**. For delete: observation IDs to remove.",
  
  // database_switch parameters
  databaseName: "Target database name. **Will be created if doesn't exist**. Use project names for isolation."
};
