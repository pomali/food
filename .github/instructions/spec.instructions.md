---
applyTo: "spec/**"
---

# Specification Writing Guidelines

This document outlines the process for creating specifications in the `spec/` directory.

## General Rules

- **Specifications should not include code**, unless absolutely necessary to illustrate a concept
- **Do not write anything other than specifications** unless specifically asked to (no implementation, no tests, no scaffolding)

## Brevity and Focus

- **Be concise.** A spec should contain only information that helps decide or build. Cut everything else.
- **Omit empty sections.** If a level or sub-section has nothing meaningful to say, skip it entirely — do not add placeholder text or "N/A".
- **No padding.** Avoid restating obvious facts, defining common terms, or repeating what is already in another section.
- **Prefer bullet points over prose** for lists of requirements; use prose only when reasoning needs to flow.
- **One sentence per point** unless more context is genuinely needed.
- **Omit Cross-Cutting Concerns sub-sections** (Security, Performance, etc.) unless there is a real, non-obvious concern. Do not list a section just to say "standard practices apply".
- **Alternatives Considered** is optional. Only include it when the choice between alternatives is non-obvious or has important long-term implications.

## Directory Structure

- `spec/README.md` - Index of all specifications
- `spec/<feature-name>/` - Directory for each specification
- `spec/<feature-name>/README.md` - Main file for each specification

## Specification Levels

Specifications should be written progressively, starting from high-level concepts and moving to detailed technical design. **Do not skip levels.**

### Level 1: Problem Definition

Before proposing any solution, clearly, but briefly, articulate:

- **What is the problem?** - Describe the current pain point or gap
- **Who is affected?** - Identify stakeholders and users
- **Why does it matter?** - Explain the impact of not solving this problem

### Level 2: Goals and Non-Goals

**Goals** - What this specification aims to achieve:
- List specific, measurable outcomes
- Prioritize goals (P0, P1, P2)

**Non-Goals** - What is explicitly out of scope:
- Prevents scope creep
- Sets clear boundaries
- Can become future goals

### Level 3: Context

Describe the relevant context. Only include sub-points that are non-obvious or have constraints worth calling out:

- **System boundaries** - What parts of the system does this touch?
- **Dependencies** - What does this depend on?
- **Dependents** - What depends on this?
- **Current state** - How does the system work today?

### Level 4: Proposed Solution

High-level description of the solution:

- Overview of the approach
- Key design decisions
- Trade-offs made

### Level 5: Alternatives Considered *(optional)*

Only include when the choice is non-obvious or has lasting implications. For each alternative, state it in one line and explain in one line why it was not chosen.

### Level 6: Cross-Cutting Concerns *(optional)*

Only include sub-sections where there is a **real, non-obvious constraint or risk**. Skip any sub-section where the answer is just "use standard practices".

Potential sub-sections: Security, Performance, Observability, Reliability, Accessibility, Backwards compatibility.

---

## Level 7: Functional Specification

**Only write this after Levels 1-6 are complete.**

Detailed functional requirements:

- User stories or use cases
- Input/output behavior
- State transitions
- Edge cases and error conditions
- Acceptance criteria

---

## Level 8: Technical Specification *(optional)*

**Only write this after the Functional Specification is complete.**

Focus on:

- **Interfaces** - API contracts, method signatures
- **Data Structures** - Schemas, types, models
- **Invariants** - Conditions that must always hold true

**Do NOT go into implementation details.** This section defines *what* and *how it behaves*, not *how it's built*.

---

## Template

When creating a new specification, use the following structure. **Omit any section that has nothing meaningful to add.**

```markdown
# [Feature Name]

## Problem Definition

[One short paragraph: the pain point, who is affected, why it matters.]

## Goals

- [ ] Goal 1 (P0)
- [ ] Goal 2 (P1)

## Non-Goals

- [Only list if genuinely ambiguous and likely to cause scope creep.]

## Context

[Only the non-obvious constraints, dependencies, or current-state facts a reader needs.]

## Proposed Solution

[High-level description. Key design decisions and trade-offs only.]

<!-- Omit the following sections if they add no value -->

## Alternatives Considered

- **[Alternative]** — [why not chosen, one line]

## Cross-Cutting Concerns

[Only sub-sections with real, non-obvious constraints.]

---

## Functional Specification

[Detailed requirements, user stories, edge cases, acceptance criteria.]

---

## Technical Specification

### Interfaces

### Data Structures

### Invariants
```

## Index Management

After creating a specification, add it to `spec/README.md` with:

- Link to the specification
- One-line description
- Status (Draft, Review, Approved, Implemented, Deprecated)
