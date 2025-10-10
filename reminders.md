# Reminders

- why do personas show inactive status when i know they are active ?
- citations repeat the document title in the section part so title is shown twice
- race condition on title creation ?
- why RAG does not find EfficientDepth is published by Leia when many of its authors are affiliated with Leia ?
- need unified metadata editing after single doc extraction and action > edit
- ChatInterface render - selectedPersona: {id: '3dab1253-9ffd-40be-aa46-3b5907312259', slug: 'david', name: 'David', expertise: 'Nanophotonics, 3D Displays and Spatial Intelligence', example_questions: Array(4), …} | logged many times in console why ?

## Fixed Issues

- ✅ **EfficientDepth re-ingestion job stuck** (2025-10-10) - FIXED: Worker wasn't running. Created `./dev-worker.sh` script to manage worker lifecycle. Always start worker with `./dev-worker.sh start` when developing.
