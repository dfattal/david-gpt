
import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';

async function processPdf() {
  const pdfPath = path.resolve(process.cwd(), 'personas/david/RAW-DOCS/LeiaSR-release-notes-1.34.6.pdf');
  const outputPath = path.resolve(process.cwd(), 'personas/david/RAG/leiasr-release-notes-1.34.6.md');

  try {
    const dataBuffer = await fs.readFile(pdfPath);
    const data = await pdf(dataBuffer);
    const text = data.text;

    // A more sophisticated approach would use an LLM to analyze and structure the text.
    // This is a best-effort structuring based on the user's request.
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
${text.includes('New Features') ? text.split('New Features')[1].split('Bug Fixes')[0].trim() : 'N/A'}

## Bug Fixes
${text.includes('Bug Fixes') ? text.split('Bug Fixes')[1].split('Known Issues')[0].trim() : 'N/A'}

## Known Issues
${text.includes('Known Issues') ? text.split('Known Issues')[1].trim() : 'N/A'}
`;

    await fs.writeFile(outputPath, markdown);
    console.log(`Markdown file created successfully at: ${outputPath}`);
  } catch (error) {
    console.error('Error processing PDF:', error);
  }
}

processPdf();
