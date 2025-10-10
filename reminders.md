# Reminders

- why do personas show inactive status when i know they are active ?
- citations repeat the document title in the section part so title is shown twice
- race condition on title creation ?
- ChatInterface render - selectedPersona: {id: '3dab1253-9ffd-40be-aa46-3b5907312259', slug: 'david', name: 'David', expertise: 'Nanophotonics, 3D Displays and Spatial Intelligence', example_questions: Array(4), …} | logged many times in console why ?
- will workers for ingestion work on Vercel ?

## Fixed Issues

- ✅ **Unified metadata editing UI** (2025-10-10) - FIXED: Created unified `DocumentMetadataModal` component that combines metadata editing, content preview, and ingestion features. Replaced `DocumentMetadataEditor` and `DocumentPreviewModal` with single 3-tab interface (Edit Metadata, Preview, Source). Now used consistently across all document workflows (admin/rag actions, URL extraction, PDF extraction, markdown extraction).
- ✅ **EfficientDepth re-ingestion job stuck** (2025-10-10) - FIXED: Worker wasn't running. Created `./dev-worker.sh` script to manage worker lifecycle. Always start worker with `./dev-worker.sh start` when developing.
