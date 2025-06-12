/**
 * MCP Prompts Implementation - Guided Workflows and Best Practices
 * Combines vibe-coding workflows with memory-driven documentation patterns
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// =============================================================================
// PROMPT DEFINITIONS - Interactive Workflow Guides
// =============================================================================

export const PROMPTS = {
  // Memory-focused prompts from provided specs
  "explore-memory-graph": {
    name: "explore-memory-graph",
    description: "Systematic exploration of memory connections. Guides through graph traversal patterns to discover knowledge relationships and insights.",
    arguments: [
      {
        name: "starting_point",
        description: "Memory name or type to start exploration from",
        required: true
      },
      {
        name: "depth",
        description: "How many relationship levels to explore (1-5)",
        required: false
      }
    ]
  },
  
  "create-project-knowledge": {
    name: "create-project-knowledge", 
    description: "Structured project documentation workflow. Ensures comprehensive memory creation with proper relationships for maintainable knowledge graphs.",
    arguments: [
      {
        name: "project_name",
        description: "Name of the project to document",
        required: true
      },
      {
        name: "domain",
        description: "Project domain (web, mobile, data, infrastructure)",
        required: false
      }
    ]
  },
  
  "debug-orphaned-memories": {
    name: "debug-orphaned-memories",
    description: "Find and fix disconnected memories. Identifies isolation patterns and suggests meaningful connections to improve knowledge graph density.",
    arguments: [
      {
        name: "memory_types",
        description: "Types to check for orphans (comma-separated)",
        required: false
      }
    ]
  },
  
  "document-decision": {
    name: "document-decision",
    description: "Capture architectural/technical decisions with full context. Ensures alternatives and rationale are recorded for future reference.",
    arguments: [
      {
        name: "decision_title",
        description: "Brief title of the decision",
        required: true
      },
      {
        name: "area",
        description: "Technical area (database, api, frontend, infrastructure)",
        required: false
      }
    ]
  },
  
  "analyze-memory-quality": {
    name: "analyze-memory-quality",
    description: "Assess observation quality and relationship density. Identifies improvement opportunities in knowledge capture and organization.",
    arguments: [
      {
        name: "scope",
        description: "Analysis scope: 'recent' (7d), 'all', or specific memory type",
        required: false
      }
    ]
  },
  
  "text-to-knowledge-graph": {
    name: "text-to-knowledge-graph",
    description: "Transform narrative text (books, documents, conversations) into structured knowledge graph with entities and relationships.",
    arguments: [
      {
        name: "text_source",
        description: "Source type: 'book_chapter', 'article', 'transcript', 'documentation'",
        required: true
      },
      {
        name: "domain",
        description: "Domain context for entity extraction (fiction, technical, business, research)",
        required: false
      },
      {
        name: "granularity",
        description: "Detail level: 'high' (every entity), 'medium' (key entities), 'low' (major entities only)",
        required: false
      }
    ]
  },

  // Vibe-coding prompts from specs
  "vibe-code-with-memory": {
    name: "vibe-code-with-memory",
    description: "Memory-assisted vibe coding workflow. Captures design decisions, tracks implementation evolution, and maintains context across sessions.",
    arguments: [
      {
        name: "project_description",
        description: "What you're building in plain language",
        required: true
      },
      {
        name: "session_type",
        description: "Type of session: 'start' (new project), 'continue' (existing), 'debug' (fixing issues)",
        required: false
      },
      {
        name: "vibe_level",
        description: "How much to embrace the vibe: 'cautious' (review everything), 'moderate' (trust but verify), 'full' (accept all)",
        required: false
      }
    ]
  },

  "refactor-with-rationale": {
    name: "refactor-with-rationale",
    description: "Refactor code while documenting every decision. Creates memory trail of what changed and why, perfect for team handoffs.",
    arguments: [
      {
        name: "target_code",
        description: "File/module/function to refactor",
        required: true
      },
      {
        name: "pain_points",
        description: "What problems you're trying to solve",
        required: true
      },
      {
        name: "constraints",
        description: "What must NOT change (APIs, interfaces, behavior)",
        required: false
      }
    ]
  },

  "evolve-architecture": {
    name: "evolve-architecture",
    description: "Gradually evolve system architecture with memory-tracked decisions. Each step documented, relationships mapped, alternatives recorded.",
    arguments: [
      {
        name: "current_state",
        description: "Brief description of current architecture",
        required: true
      },
      {
        name: "desired_outcome",
        description: "Where you want the architecture to go",
        required: true
      },
      {
        name: "iteration_size",
        description: "How big each step should be: 'micro' (tiny changes), 'small' (single component), 'medium' (subsystem)",
        required: false
      }
    ]
  }
};

// =============================================================================
// PROMPT IMPLEMENTATION - Handler Functions
// =============================================================================

export function registerPrompts(server: McpServer) {
  // Memory-focused prompts
  server.prompt(
    "explore-memory-graph",
    {
      starting_point: z.string(),
      depth: z.string().optional()
    },
    async ({ starting_point, depth }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `I need to explore the memory graph starting from "${starting_point}".

Please help me:
1. First, search for memories related to "${starting_point}" using memory_find
2. For each found memory, use memory_find with traverseFrom to explore connections${depth ? ` up to ${depth} levels deep` : ""}
3. Identify key relationship patterns and clusters
4. Highlight any surprising connections or isolated subgraphs
5. Suggest potential missing relationships based on the data

Focus on revealing the knowledge structure and finding insights in the connections.`
        }
      }]
    })
  );

  server.prompt(
    "create-project-knowledge",
    {
      project_name: z.string(),
      domain: z.string().optional()
    },
    async ({ project_name, domain }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text", 
          text: `Let's document the "${project_name}" project systematically.

Please guide me through creating a comprehensive memory structure:

1. First, check if project memories already exist using memory_find
2. Create the main project memory with rich observations about:
   - Project purpose and goals
   - Technical stack and architecture
   - Key decisions and trade-offs
   - Current status and next steps
   
3. Create related memories for:
   - Major components/modules (with CONTAINS relationships)
   - Key decisions (with INFLUENCES relationships)
   - Technical patterns used (with IMPLEMENTS relationships)
   - Known issues (with AFFECTS relationships)
   
4. Ensure each memory has contextual observations following the pattern:
   "During [when], [what happened] because [why]. This resulted in [impact] and means [significance]."

5. Create a rich relationship network - no orphaned nodes

Domain context: ${domain || "general software development"}`
        }
      }]
    })
  );

  server.prompt(
    "debug-orphaned-memories",
    {
      memory_types: z.string().optional()
    },
    async ({ memory_types }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Help me find and fix orphaned memories${memory_types ? ` of types: ${memory_types}` : ""}.

Analysis workflow:
1. Use memory_find with "${memory_types || "*"}" to list all relevant memories
2. For each memory, check its relationships using includeContext: "relations-only"
3. Identify memories with 0 or very few connections
4. For orphaned memories, suggest logical connections based on:
   - Similar names or types
   - Overlapping metadata (project, tags, dates)
   - Semantic similarity of observations
   
5. Create the suggested relationships using memory_modify with meaningful metadata explaining the connection

Goal: Every memory should have at least 2 meaningful relationships.`
        }
      }]
    })
  );

  server.prompt(
    "document-decision",
    {
      decision_title: z.string(),
      area: z.string().optional()
    },
    async ({ decision_title, area }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Document the decision: "${decision_title}"

Please capture this decision comprehensively:

1. Search for related existing decisions and context
2. Create a decision memory with observations covering:
   - Context: What problem were we solving?
   - Constraints: What limitations did we face?
   - Alternatives: What other approaches were considered?
   - Rationale: Why was this approach chosen?
   - Trade-offs: What did we gain/lose?
   - Consequences: What does this mean for the future?
   
3. Link to:
   - Affected components (INFLUENCES)
   - Previous related decisions (EXTENDS or CONFLICTS_WITH)
   - Implementation memories (GUIDES)
   
4. Use rich metadata:
   - decision_date
   - stakeholders
   - reversibility
   - confidence_level
   
Area: ${area || "general architecture"}`
        }
      }]
    })
  );

  server.prompt(
    "analyze-memory-quality",
    {
      scope: z.string().optional()
    },
    async ({ scope }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Analyze memory quality for scope: ${scope || "all memories"}.

Quality assessment steps:

1. Retrieve memories using memory_find with appropriate filters
2. For each memory, evaluate:
   - Observation quality: Are they self-contained context units?
   - Observation count: Multiple perspectives captured?
   - Relationship density: Well-connected or isolated?
   - Metadata completeness: Properly classified?
   - Temporal coverage: Regular updates or stale?

3. Identify patterns:
   - Which memory types have the best/worst quality?
   - Common issues (fragmented observations, missing context)
   - Relationship gaps in the knowledge graph

4. Generate specific recommendations:
   - Memories needing richer observations
   - Missing relationships to create
   - Metadata to standardize

5. Provide quality metrics summary with actionable next steps`
        }
      }]
    })
  );

  server.prompt(
    "text-to-knowledge-graph",
    {
      text_source: z.string(),
      domain: z.string().optional(),
      granularity: z.string().optional()
    },
    async ({ text_source, domain, granularity }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Transform the ${text_source} into a structured knowledge graph.

PHASE 1: Entity Extraction & Classification
- Extract entities: Characters/People, Locations, Objects, Concepts, Events
- For each entity, capture:
  * Name and aliases
  * Type classification
  * First appearance context
  * Key characteristics (metadata)
  * Initial observations (full contextual narrative)

PHASE 2: Search Before Create
For EVERY entity:
1. Search existing memories using memory_find (by name and aliases)
2. If found: prepare update with new observations
3. If not found: prepare for creation
4. Log decisions to prevent duplicates

PHASE 3: Contextual Observation Creation
Each observation must be a self-contained narrative unit answering:
- WHERE did this occur? (location/scene)
- WHEN did this happen? (temporal context)
- WHAT specifically happened? (actions/events)
- WHO was involved? (actors/participants)
- WHY did it happen? (motives/causes)
- HOW was it accomplished? (methods/tools)
- WHAT changed? (consequences/impact)
- WHY does it matter? (significance)

Example: "During the midnight confrontation in the abandoned warehouse (Chapter 3, Scene 2), Detective Morgan discovered the missing evidence hidden inside a false bottom drawer, using ultraviolet light to reveal fingerprints. This discovery, motivated by a cryptic note from the victim, proved the suspect's presence at the scene and shifted suspicion from the partner to the CEO, fundamentally altering the investigation's direction."

PHASE 4: Memory Creation/Updates
- Use memory_store for new entities with localIds for cross-references
- Use memory_modify to add observations to existing entities
- Ensure rich metadata (domain-specific properties)
- Granularity level: ${granularity || "medium"}

PHASE 5: Relationship Network Creation
Create typed relationships between entities:
- Character ↔ Character: INTERACTS_WITH, SUSPECTS, OPPOSES, ALLIES_WITH
- Character → Location: VISITS, LIVES_IN, DISCOVERS, ESCAPES_FROM
- Character → Object: POSSESSES, DISCOVERS, USES, DESTROYS
- Character → Event: PARTICIPATES_IN, WITNESSES, CAUSES
- Object → Location: LOCATED_IN, HIDDEN_IN, MOVED_TO
- Concept → Entity: DRIVES, MANIFESTS_IN, SYMBOLIZED_BY

Each relationship needs:
- Type (semantic meaning)
- Strength (0.1-1.0 based on importance)
- Metadata (context, evidence, chapter/scene reference)

PHASE 6: Structural Hierarchy
If processing book/document chapters:
- Create Chapter/Section memories
- Link entities to their appearance scenes
- Maintain CONTAINS hierarchies
- Track narrative flow with FOLLOWS relationships

PHASE 7: Quality Validation
- Verify no orphaned nodes (minimum 2 relationships each)
- Check observation completeness
- Validate relationship logic
- Ensure temporal consistency

Domain: ${domain || "general narrative"}
Target relationship density: 3-5 connections per entity
Memory type naming convention: Use singular forms (Character, Location, Concept)`
        }
      }]
    })
  );

  // Vibe-coding prompts
  server.prompt(
    "vibe-code-with-memory",
    {
      project_description: z.string(),
      session_type: z.string().optional(),
      vibe_level: z.string().optional()
    },
    async ({ project_description, session_type, vibe_level }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Let's vibe-code ${project_description} with memory tracking.

SESSION TYPE: ${session_type || "continue"} | VIBE LEVEL: ${vibe_level || "moderate"}

WORKFLOW:
1. **Memory Context**: Search existing project memories
2. **Vibe Alignment**: Feel out what needs building next
3. **Implementation**: Code with flow, document decisions as we go
4. **Memory Capture**: Store what we learn, why we chose this path
5. **Relationship Mapping**: Connect new decisions to existing context

MEMORY STRATEGY:
- Capture implementation insights as observations
- Link architectural decisions with INFLUENCES relationships
- Document pain points and solutions
- Track technology choices and their rationale
- Build searchable knowledge for future sessions

Ready to flow with the code while building permanent knowledge?`
        }
      }]
    })
  );

  server.prompt(
    "refactor-with-rationale",
    {
      target_code: z.string(),
      pain_points: z.string(),
      constraints: z.string().optional()
    },
    async ({ target_code, pain_points, constraints }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Refactor ${target_code} while documenting every decision.

PAIN POINTS TO SOLVE:
${pain_points}

CONSTRAINTS (MUST NOT CHANGE):
${constraints || "None specified - proceed with caution"}

REFACTORING WITH MEMORY WORKFLOW:
1. **Before State**: Document current architecture in memory
2. **Analysis**: Capture what's wrong and why
3. **Options**: Record alternative approaches considered
4. **Incremental Changes**: Small steps with rationale
5. **Decision Trail**: Every change gets documented
6. **After State**: Final architecture with improvements
7. **Lessons Learned**: What we'd do differently next time

MEMORY STRUCTURE:
- Original architecture memory
- Refactoring decision memory
- Individual change memories
- Final state memory
- Connected with EVOLVES_FROM, FIXES, IMPROVES relationships

Let's refactor systematically while building institutional memory.`
        }
      }]
    })
  );

  server.prompt(
    "evolve-architecture",
    {
      current_state: z.string(),
      desired_outcome: z.string(),
      iteration_size: z.string().optional()
    },
    async ({ current_state, desired_outcome, iteration_size }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Evolve architecture from current state to desired outcome.

CURRENT STATE:
${current_state}

DESIRED OUTCOME:
${desired_outcome}

ITERATION SIZE: ${iteration_size || "small"}

EVOLUTION STRATEGY:
1. **Gap Analysis**: Document what needs to change
2. **Incremental Path**: Plan small, safe steps
3. **Risk Assessment**: What could go wrong?
4. **Parallel Tracking**: Old and new systems coexist
5. **Memory Trail**: Every architectural decision documented
6. **Validation**: Each step improves without breaking

MEMORY ARCHITECTURE:
- Current state snapshot
- Desired outcome vision
- Migration plan memories
- Individual step memories
- Risk and mitigation memories
- Connected evolution chain with LEADS_TO relationships

Ready to evolve architecture with full memory tracking?`
        }
      }]
    })
  );
}
