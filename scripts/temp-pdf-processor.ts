
import { extractPdfText } from './src/lib/rag/ingestion/textExtraction';
import fs from 'fs/promises';

async function processPdf() {
  const pdfPath = '/Users/david.fattal/Documents/GitHub/david-gpt/personas/david/RAW-DOCS/LeiaSR-release-notes-1.34.6.pdf';
  const outputPath = '/Users/david.fattal/Documents/GitHub/david-gpt/personas/david/RAG/leiasr-release-notes-1-34-6.md';

  try {
    const text = await extractPdfText(pdfPath);

    // This is a simplified structuring of the document based on common release note formats.
    // A more sophisticated approach would use an LLM to analyze and structure the text.
    const markdown = `---
id: leiasr-release-notes-1-34-6
title: LeiaSR Release Notes 1.34.6
type: release_notes
personas: [david]
summary: "This document contains the release notes for LeiaSR version 1.34.6, detailing new features, bug fixes, and known issues."
identifiers:
  version: "1.34.6"
---

**Key Terms**: LeiaSR, SDK, Unity, Unreal Engine, Quad Player, 2D to 3D conversion
**Also Known As**: LeiaSR Release

## Overview
This document provides the release notes for LeiaSR version 1.34.6. It includes details on new features, bug fixes, and known issues for the SDKs and related tools.

## Features
${text.includes('Features') ? text.split('Features')[1].split('Bug Fixes')[0] : 'N/A'}

## Bug Fixes
${text.includes('Bug Fixes') ? text.split('Bug Fixes')[1].split('Known Issues')[0] : 'N/A'}

## Known Issues
${text.includes('Known Issues') ? text.split('Known Issues')[1] : 'N/A'}
`;

    await fs.writeFile(outputPath, markdown);
    console.log('Markdown file created successfully.');
  } catch (error) {
    console.error('Error processing PDF:', error);
  }
}

processPdf();
