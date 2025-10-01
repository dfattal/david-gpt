const fs = require('fs/promises');
const path = require('path');
const pdf = require('pdf-parse');

async function processPdf() {
  const pdfPath = path.resolve(process.cwd(), 'personas/david/RAW-DOCS/LeiaSR-release-notes-1.34.6.pdf');
  const outputPath = path.resolve(process.cwd(), 'personas/david/RAG/leiasr-release-notes-1-34-6.md');

  try {
    const dataBuffer = await fs.readFile(pdfPath);
    const data = await pdf(dataBuffer);
    let text = data.text;

    // Isolate the text for version 1.34.6
    const version1_34_6_start = text.indexOf('LEIASR  1.34.6');
    const version1_34_0_start = text.indexOf('LEIASR  1.34.0');
    if (version1_34_6_start !== -1 && version1_34_0_start !== -1) {
      text = text.substring(version1_34_6_start, version1_34_0_start);
    }

    const markdownLines = [
      '---',
      'id: leiasr-release-notes-1-34-6',
      'title: LeiaSR Release Notes 1.34.6',
      'date: 2025-08-22',
      'type: release_notes',
      'personas: [david]',
      'summary: "This document contains the release notes for LeiaSR version 1.34.6, detailing new features, bug fixes, and known issues.",
      'identifiers:',
      '  version: "1.34.6",
      'dates:',
      '  released: 2025-08-22',
      '---',
      '',
      '**Key Terms**: LeiaSR, SDK, Unity, Unreal Engine, Quad Player, 2D to 3D conversion, weaving, DirectX, OpenGL',
      '**Also Known As**: LeiaSR Release',
      '',
      '## Overview',
      'This document provides the release notes for LeiaSR version 1.34.6, released on 2025-08-22. It includes details on new features, bug fixes, and known issues for the SDKs and related tools.',
      '',
      '## Features',
      '',
      '### Support for dual 2D/3D multi-monitor setups',
      'SR apps sharing a window across a 2D and 3D monitor will see the 3D monitor fraction rendered in 3D and the 2D monitor fraction rendered in 2D.',
      '',
      '### Dynamic Windowed Weaving',
      'SR apps rendered in windowed mode can be dragged across the screen without losing the 3D effect. This requires the latest weaving API.',
      '',
      '### Improved platform shutdown speed',
      'The platform now shuts down significantly faster when an SR app is closed.',
      '',
      '### Consolidated SDK examples',
      'This release contains a more concise set of 5 weaving examples in the SDK for DirectX 9, 10, 11, 12, and OpenGL. Each example demonstrates the same functionality using a different graphics API.',
      '',
      'The following functionality is available at the top of each example\'s main.cpp file:',
      '- Use of the new weaver interface (default) or the old deprecated one.',
      '- Fullscreen or windowed mode (use F11 to toggle at runtime).',
      '- Display of 3D geometry or a stereo image.',
      '- sRGB support that can be enabled, disabled, or performed directly in our shaders.',
      '- Ability to launch on the primary display, secondary display, or automatically onto the attached LeiaSR display.',
      '',
      'Examples can be found in the Leia SDK `examples/*_weaving` folders. Use the `CMakeLists.txt` file in each folder to build.',
      '',
      '## Bug Fixes',
      '',
      '### Content Truncated for deprecated weaving API',
      '- **Symptom**: Content was truncated when using the deprecated non-predictive weaving API (1.34.5).',
      '- **Cause**: Bug in backward compatibility logic.',
      '- **Solution**: The bug has been fixed.',
      '',
      '## Known Issues',
      'There are no known issues for this release.',
    ];

    const markdown = markdownLines.join('\n');

    await fs.writeFile(outputPath, markdown);
    console.log(`Markdown file created successfully at: ${outputPath}`);
  } catch (error) {
    console.error('Error processing PDF:', error);
  }
}

processPdf();