# David-GPT Content Guide

This guide is the definitive resource for creating and validating all content for the David-GPT system, including documents and personas. Following these guidelines is essential for ensuring high-quality RAG performance, accurate search, and authentic AI interactions.

## 1. Overview: The Content Ecosystem

The David-GPT system relies on a rich ecosystem of structured documents and expert personas to function effectively.

-   **Documents** are the raw knowledge base. They must be meticulously formatted with detailed metadata to be discoverable, searchable, and citable. Proper formatting enables the RAG system to extract entities, understand context, and generate precise, fact-based responses.
-   **Personas** are expert AI personalities that guide both document processing and chat interactions. A well-defined persona ensures that the AI communicates with a consistent, authentic voice and leverages domain-specific expertise to interpret documents and answer questions.

Poorly formatted content leads to undiscoverable documents, inaccurate citations, weak knowledge graph connections, and generic, unhelpful AI responses. High-quality content is the foundation of the entire system.

---

## 2. Document Creation & Formatting

Every document ingested into the system must adhere to a strict structure: a YAML frontmatter block followed by Markdown content.

### Document Structure Requirements

```
---
[YAML Frontmatter with complete metadata]
---

# Document Title

[Content body in properly formatted markdown]
```

### YAML Frontmatter: Core Metadata

The frontmatter provides the essential metadata the system uses to categorize, filter, and search for documents.

#### **Required Fields (All Documents)**

| Field                | Description                                                                 | Example                                        |
| -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| `title`              | The exact title of the document.                                            | `"Deep Learning for Risk Management"`          |
| `docType`            | The type of document. See supported types below.                            | `"paper"`                                      |
| `persona`            | The identifier of the persona associated with this content.                 | `"financial-expert"`                           |
| `url`                | The source URL of the document, if available.                               | `"https://arxiv.org/abs/2301.12345"`           |
| `scraped_at`         | The ISO 8601 timestamp when the document was created.                       | `"2025-01-20T15:30:00.000Z"`                   |
| `word_count`         | The approximate word count of the document's content.                       | `8500`                                         |
| `extraction_quality` | The quality of the extracted content (`high`, `medium`, `low`).             | `"high"`                                       |

#### **Document-Type Specific Metadata**

Beyond the core fields required for all documents, each `docType` has a set of specific metadata fields that are essential for discoverability and proper processing. For example, a `paper` will have fields for `authorsAffiliations` and `doi`, while a `patent` will have a `patentNo` and `filedDate`.

For a complete and detailed technical specification of all supported document types, their required fields, and persona-specific extensions, please refer to the **Document Ingestion Format Specification (`INGESTION-FORMAT.md`)**. That document is the definitive reference for all metadata fields.

### Markdown Content Guidelines

-   **Hierarchy:** Use a clear and logical heading structure (`#` for the title, `##` for main sections, `###` for subsections).
-   **Formatting:** Use standard Markdown for text (`**bold**`, `*italics*`), lists, code blocks, and tables to improve readability and structure.
-   **Clarity:** Write for searchability by including key terms, acronyms, and domain-specific language. Ensure facts are stated clearly and precisely for accurate citation.
-   **Structure:** Include an abstract or summary section after the main title to provide a concise overview of the document's content.

---

## 3. Persona Creation

Personas are the heart of the AI's personality. They define its expertise, communication style, and values. A great persona is authentic, clear, and deep.

### Core Persona Components

A persona is defined in a Markdown file with the following sections:

1.  **Core Identity:** A 3-4 sentence summary of who the persona is, their primary role, key accomplishments, and unique value.
2.  **Personality & Tone:** Describes their communication style, tone of voice, and the impression they give.
3.  **Expertise:** 2-4 detailed domains of expertise, including qualifications, achievements, technical skills, and relevant keywords.
4.  **Balance:** Describes how the persona balances different aspects of their identity (e.g., researcher vs. practitioner).
5.  **Core Values:** A list of 4-5 principles that guide their work and decisions.
6.  **Narrative Arc:** A brief career history showing their professional journey.
7.  **Communication Guidelines:** Specific rules for how a chatbot should speak as this persona.
8.  **Document & Metadata Preferences:** Defines which document types and metadata fields are most relevant to their expertise.

### Step-by-Step Persona Building

1.  **Research & Plan:** Gather materials like a CV, publications, and project lists. Define the target audience.
2.  **Draft Core Identity:** Use the template to create a strong, concise summary of the persona.
3.  **Map Expertise Domains:** Group the persona's knowledge into 2-4 distinct themes and detail each one.
4.  **Define Communication Style:** Go beyond "professional" and specify *how* they communicate (e.g., "Uses market analogies to explain complex models," "Prefers data-driven statements over opinions").
5.  **Specify Document Preferences:** Rank document types and metadata fields by importance to guide the RAG system.
6.  **Refine and Test:** Use the validation tools and test chat interactions to ensure the persona is consistent and authentic.

---

## 4. Validation Tools

The system includes a suite of command-line tools to ensure your content meets all formatting and quality requirements before submission.

### Quick Start

Use the convenient `pnpm` scripts to run validation checks from your terminal.

```bash
# Check all documents and personas in the current directory
pnpm validate:all

# Validate a specific document
pnpm validate:docs my-document.md

# Validate a specific persona
pnpm validate:personas my-expert.md

# Validate all content within a directory
pnpm validate:batch RAG-SAMPLES/
```

### What The Tools Check

-   **Document Validation:** Checks for complete YAML frontmatter, valid `docType`, correct metadata fields, and proper Markdown structure.
-   **Persona Validation:** Ensures the persona file complies with the required template structure, all necessary sections are present, and the persona is compatible with the system parser.
-   **Batch Validation:** Automatically detects content type (document or persona) and validates entire directories at once.

Running these tools is a mandatory step before uploading content. They help catch errors early and prevent issues with ingestion and RAG performance.

---

## 5. Templates & Examples

### Persona Template

Use this template to create new persona files. Replace all bracketed placeholders with your persona's specific information.

```markdown
# [Persona Name] Persona Description

## Core Identity
[Provide a comprehensive overview of who this persona is. Include their primary role, key accomplishments, and what makes them unique. This should be 3-4 sentences that capture their essence.]

## Personality & Tone
*   **Tone of Voice:** [Describe their communication style - formal/casual, direct/gentle, etc.]
*   **Style:** [How they balance different aspects - technical vs accessible, authoritative vs collaborative, etc.]
*   **Presence:** [The impression they give - inspiring, authoritative, approachable, etc.]

## Expertise
### 1. [Primary Domain Area]
*   [Key qualification or background]
*   [Major achievement or invention]
*   [Technical skills, methodologies, or tools]
*   [Quantifiable accomplishments]

## Balance: [Primary Identity] vs. [Secondary Identity]
[Describe how this persona balances different aspects of their role.]

## Core Values
*   **[Value 1]:** [Brief description of what drives them]

## Narrative Arc
*   **Early Career:** [Foundational experiences]
*   **Now:** [Current focus]

## How a Chatbot Should Speak "as [Persona Name]"
*   [Communication guideline 1]
*   [Communication guideline 2]

## Document Types and Metadata Preferences
### Primary Document Types
- [doc-type-1]: [Relevance to their work]
### Key Metadata Fields
- [field-1]: [Why this matters for their domain]
```

### Complete Document Example (Academic Paper)

```yaml
---
title: "Deep Learning for Financial Risk Assessment: A Transformer-Based Approach"
docType: "paper"
persona: "financial-expert"
authorsAffiliations:
  - name: "Dr. Sarah Chen"
    affiliation: "MIT Sloan School of Management"
venue: "Journal of Financial Technology"
publicationYear: 2024
doi: "10.1016/j.jft.2024.123456"
abstract: "This paper introduces a novel transformer-based architecture for financial risk assessment..."
keywords: ["deep learning", "financial risk", "transformer"]
url: "https://doi.org/10.1016/j.jft.2024.123456"
scraped_at: "2025-01-20T15:30:00.000Z"
word_count: 9200
extraction_quality: "high"
---

# Deep Learning for Financial Risk Assessment: A Transformer-Based Approach

This paper presents a novel application of transformer neural networks to financial risk assessment...

## Abstract

Financial risk assessment remains a critical challenge... Our experiments on S&P 500 daily returns...

## Introduction

Financial markets exhibit complex temporal dependencies...

[Content continues...]
```

---

## 6. Best Practices

### For Document Creation
-   **Be Specific:** Use precise, searchable terminology. Include full names, acronym definitions, and technical specifications.
-   **Prioritize Metadata:** The quality of your YAML frontmatter is as important as the content itself. Be thorough and accurate.
-   **Structure for Citations:** Use clear, descriptive headings and break down information into logical sections. This helps the AI find and cite information correctly.
-   **Write for Understanding:** Define technical terms, provide context for complex ideas, and use a logical flow.

### For Persona Creation
-   **Go for Depth:** Avoid generic descriptions. Use concrete achievements, specific skills, and real-world examples to build an authentic persona.
-   **Define the Voice:** Provide explicit "do and don't" guidelines for communication. Include characteristic phrases or analogies the persona might use.
-   **Set Boundaries:** Clearly state what the persona knows and, just as importantly, what they *don't* know. This prevents the AI from hallucinating in areas outside its expertise.
-   **Connect to Content:** Ensure the persona's expertise domains and document preferences align with the type of content they will be used for.

---

## 7. Troubleshooting

### Common Validation Errors

-   **"YAML frontmatter validation failed"**: Check your YAML syntax carefully. Look for incorrect indentation, missing quotes, or fields with the wrong data type (e.g., `word_count: "1500"` instead of `word_count: 1500`).
-   **"Missing required field"**: Ensure all required fields listed in this guide are present in your frontmatter for the given `docType`.
-   **"Persona parsing failed"**: Your persona file does not match the required template structure. Check that all required `##` headings are present and in the correct order.
-   **"Unsupported document type"**: The `docType` you've specified is not registered in the system. Use one of the supported types like `paper`, `patent`, `press-article`, etc.

### Getting Help

-   **Use Verbose Mode:** Run the validation tools with the `--verbose` flag to get detailed feedback and suggestions for fixing errors.
-   **Use Preview Mode:** Use `pnpm validate:batch --preview .` to see which files the validation tool will attempt to process, which can help debug path and pattern issues.