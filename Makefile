# Multi-Persona RAG Ingestion Makefile

.PHONY: help setup validate-persona generate-contract validate-contract generate-ingestion-format validate-ingestion-format generate-manifest validate-manifest process-manifest validate-formatted ingest health all clean

# Default target
help:
	@echo "Multi-Persona RAG Ingestion Pipeline"
	@echo ""
	@echo "Pipeline Commands:"
	@echo "  make setup                         # Initialize project structure"
	@echo "  make all-PERSONA                   # Full pipeline for specific persona"
	@echo "  make validate-persona-PERSONA      # Validate persona configuration"
	@echo "  make generate-contract-PERSONA     # Generate persona contract"
	@echo "  make validate-contract-PERSONA     # Validate contract"
	@echo "  make generate-ingestion-format-PERSONA # Generate ingestion format"
	@echo "  make validate-ingestion-format-PERSONA # Validate ingestion format"
	@echo "  make generate-manifest-PERSONA     # Generate ingestion manifest"
	@echo "  make validate-manifest-PERSONA     # Validate manifest"
	@echo "  make process-manifest-PERSONA      # Process documents"
	@echo "  make validate-formatted-PERSONA    # Validate formatted documents"
	@echo ""
	@echo "Database Ingestion Commands:"
	@echo "  make ingest-PERSONA                # Ingest all documents (skip existing)"
	@echo "  make ingest-force-PERSONA          # Ingest all documents (overwrite existing)"
	@echo "  make ingest-dry-PERSONA            # Dry run ingestion (no DB changes)"
	@echo "  make ingest-validate-PERSONA       # Validate documents only"
	@echo "  make ingest-docs-PERSONA DOCS=\"...\" # Ingest specific documents"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make health-PERSONA                # Generate health report"
	@echo "  make clean-PERSONA                 # Clean processing files"
	@echo "  make list-personas                 # List available personas"
	@echo "  make status                        # Status for all personas"
	@echo ""
	@echo "Examples:"
	@echo "  make all-david                     # Process david persona end-to-end"
	@echo "  make ingest-david                  # Ingest all David documents (skip existing)"
	@echo "  make ingest-force-david            # Force ingest all (overwrite existing)"
	@echo "  make ingest-dry-david              # Test ingestion without changes"
	@echo "  make ingest-docs-david DOCS=\"paper1.md,patent2.md\" # Ingest specific docs"
	@echo "  make health-david                  # Health report for david"
	@echo "  make clean-david                   # Clean david processing files"

# Initialize project structure
setup:
	@echo "🚀 Initializing project structure..."
	@mkdir -p config schemas templates bin personas
	@mkdir -p src/{persona,manifest,format,db,utils}
	@mkdir -p src/manifest/processors
	@mkdir -p src/db/migrations
	@echo "✅ Project structure initialized"

# Full pipeline for a persona
all-%:
	@echo "🔄 Running full pipeline for persona: $*"
	@$(MAKE) validate-persona-$*
	@$(MAKE) generate-contract-$*
	@$(MAKE) validate-contract-$*
	@$(MAKE) generate-ingestion-format-$*
	@$(MAKE) validate-ingestion-format-$*
	@$(MAKE) generate-manifest-$*
	@$(MAKE) validate-manifest-$*
	@$(MAKE) process-manifest-$*
	@$(MAKE) validate-formatted-$*
	@$(MAKE) ingest-$*
	@$(MAKE) health-$*
	@echo "✅ Full pipeline completed for persona: $*"

# Validate persona configuration
validate-persona-%:
	@echo "🔍 Validating persona: $*"
	@if [ ! -f "personas/$*/Persona.md" ]; then \
		echo "❌ Persona.md not found for $*"; \
		exit 1; \
	fi
	@if [ ! -f "personas/$*/constraints.yaml" ]; then \
		echo "❌ constraints.yaml not found for $*"; \
		exit 1; \
	fi
	@echo "✅ Persona $* validated"

# Generate persona contract
generate-contract-%:
	@echo "📋 Generating contract for persona: $*"
	@node bin/generate-contract.js personas/$*

# Generate contract with fuzzy augmentation
generate-contract-fuzzy-%:
	@echo "🤖 Generating contract with Gemini augmentation for persona: $*"
	@node bin/generate-contract.js personas/$* --fuzzy

# Validate contract
validate-contract-%:
	@echo "🔍 Validating contract for persona: $*"
	@if [ ! -f "personas/$*/contract.yaml" ]; then \
		echo "❌ Contract not found for $*. Run: make generate-contract-$*"; \
		exit 1; \
	fi
	@echo "✅ Contract for $* is valid"

# Generate ingestion format
generate-ingestion-format-%:
	@echo "📝 Generating ingestion format for persona: $*"
	@node bin/generate-ingestion-format.js personas/$*

# Generate ingestion format with force
generate-ingestion-format-force-%:
	@echo "📝 Generating ingestion format (force) for persona: $*"
	@node bin/generate-ingestion-format.js personas/$* --force

# Validate ingestion format
validate-ingestion-format-%:
	@echo "🔍 Validating ingestion format for persona: $*"
	@if [ ! -f "personas/$*/ingestion-format.yaml" ]; then \
		echo "❌ Ingestion format not found for $*. Run: make generate-ingestion-format-$*"; \
		exit 1; \
	fi
	@echo "✅ Ingestion format for $* is valid"

# Generate ingestion manifest
generate-manifest-%:
	@echo "📄 Generating manifest for persona: $*"
	@node bin/generate-manifest.js personas/$*

# Generate manifest with Gemini review
generate-manifest-review-%:
	@echo "🤖 Generating manifest with Gemini review for persona: $*"
	@node bin/generate-manifest.js personas/$* --review

# Validate manifest
validate-manifest-%:
	@echo "🔍 Validating manifest for persona: $*"
	@if [ ! -f "personas/$*/manifests/manifest.yaml" ]; then \
		echo "❌ Manifest not found for $*. Run: make generate-manifest-$*"; \
		exit 1; \
	fi
	@echo "✅ Manifest for $* is valid"

# Process manifest with force flag
process-manifest-force-%:
	@echo "⚙️ Processing documents (force) for persona: $*"
	@node bin/process-manifest.js personas/$*/manifests/manifest.yaml personas/$*/ingestion-format.yaml --force

# Process manifest with verbose logging
process-manifest-verbose-%:
	@echo "⚙️ Processing documents (verbose) for persona: $*"
	@node bin/process-manifest.js personas/$*/manifests/manifest.yaml personas/$*/ingestion-format.yaml --verbose

# Process manifest in parallel
process-manifest-parallel-%:
	@echo "⚙️ Processing documents (parallel) for persona: $*"
	@node bin/process-manifest.js personas/$*/manifests/manifest.yaml personas/$*/ingestion-format.yaml --parallel=3

# Process manifest to formatted documents
process-manifest-%:
	@echo "⚙️ Processing documents for persona: $*"
	@if [ ! -f "personas/$*/manifests/manifest.yaml" ]; then \
		echo "❌ Manifest not found for $*. Run: make generate-manifest-$*"; \
		exit 1; \
	fi
	@if [ ! -f "personas/$*/ingestion-format.yaml" ]; then \
		echo "❌ Ingestion format not found for $*. Run: make generate-ingestion-format-$*"; \
		exit 1; \
	fi
	@node bin/process-manifest.js personas/$*/manifests/manifest.yaml personas/$*/ingestion-format.yaml

# Validate formatted documents
validate-formatted-%:
	@echo "🔍 Validating formatted documents for persona: $*"
	@pnpm validate:docs personas/$*/formatted/ || echo "⚠️ Validation script not found"
	@echo "✅ Formatted documents validated for $*"

# Ingest to database (skip existing documents)
ingest-%:
	@echo "📥 Ingesting documents for persona: $*"
	@if [ -d "personas/$*/formatted" ] && [ "$$(ls -A personas/$*/formatted 2>/dev/null)" ]; then \
		echo "📊 Found formatted documents, proceeding with ingestion"; \
		tsx ingest-persona.ts --persona=$* --all --skip; \
	else \
		echo "⚠️ No formatted documents found. Run: make process-manifest-$*"; \
	fi

# Ingest to database (overwrite existing documents)
ingest-force-%:
	@echo "📥 Force ingesting documents for persona: $* (overwrite existing)"
	@if [ -d "personas/$*/formatted" ] && [ "$$(ls -A personas/$*/formatted 2>/dev/null)" ]; then \
		echo "📊 Found formatted documents, proceeding with force ingestion"; \
		tsx ingest-persona.ts --persona=$* --all --overwrite; \
	else \
		echo "⚠️ No formatted documents found. Run: make process-manifest-$*"; \
	fi

# Dry run ingestion (test without database changes)
ingest-dry-%:
	@echo "🔍 Dry run ingestion for persona: $*"
	@if [ -d "personas/$*/formatted" ] && [ "$$(ls -A personas/$*/formatted 2>/dev/null)" ]; then \
		echo "📊 Found formatted documents, running dry-run ingestion"; \
		tsx ingest-persona.ts --persona=$* --all --dry-run; \
	else \
		echo "⚠️ No formatted documents found. Run: make process-manifest-$*"; \
	fi

# Validate documents only
ingest-validate-%:
	@echo "✅ Validating documents for persona: $*"
	@if [ -d "personas/$*/formatted" ] && [ "$$(ls -A personas/$*/formatted 2>/dev/null)" ]; then \
		echo "📊 Found formatted documents, running validation"; \
		tsx ingest-persona.ts --persona=$* --all --validate; \
	else \
		echo "⚠️ No formatted documents found. Run: make process-manifest-$*"; \
	fi

# Ingest specific documents
ingest-docs-%:
	@echo "📥 Ingesting specific documents for persona: $*"
	@echo "Usage: make ingest-docs-PERSONA DOCS=\"doc1.md,doc2.md\""
	@if [ -z "$(DOCS)" ]; then \
		echo "❌ Error: DOCS variable not set"; \
		echo "   Example: make ingest-docs-david DOCS=\"paper1.md,patent2.md\""; \
		exit 1; \
	fi
	@if [ -d "personas/$*/formatted" ] && [ "$$(ls -A personas/$*/formatted 2>/dev/null)" ]; then \
		echo "📊 Found formatted documents, proceeding with selective ingestion"; \
		tsx ingest-persona.ts --persona=$* --docs="$(DOCS)" --skip; \
	else \
		echo "⚠️ No formatted documents found. Run: make process-manifest-$*"; \
	fi

# Generate health report
health-%:
	@echo "📊 Generating health report for persona: $*"
	@echo "=== Health Report for Persona: $* ==="
	@echo "📅 Generated: $$(date)"
	@echo ""
	@if [ -f "personas/$*/contract.yaml" ]; then \
		echo "📋 Contract Status: ✅ Found"; \
	else \
		echo "📋 Contract Status: ❌ Missing"; \
	fi
	@if [ -f "personas/$*/ingestion-format.yaml" ]; then \
		echo "📝 Ingestion Format: ✅ Found"; \
	else \
		echo "📝 Ingestion Format: ❌ Missing"; \
	fi
	@if [ -f "personas/$*/manifests/manifest.yaml" ]; then \
		echo "📄 Manifest Status: ✅ Found"; \
		echo "📊 Documents in manifest: $$(grep -c '^  - id:' personas/$*/manifests/manifest.yaml || echo '0')"; \
	else \
		echo "📄 Manifest Status: ❌ Missing"; \
	fi
	@if [ -d "personas/$*/formatted" ]; then \
		echo "📝 Formatted documents: $$(find personas/$*/formatted -name '*.md' 2>/dev/null | wc -l | tr -d ' ') files"; \
		echo "   By type: $$(find personas/$*/formatted -type d -mindepth 1 -maxdepth 1 | xargs -I {} sh -c 'echo "$$(basename {}): $$(ls -1 {}/*.md 2>/dev/null | wc -l | tr -d " ") files"' 2>/dev/null | paste -sd ", " -)"; \
	else \
		echo "📝 Formatted documents: 0 files"; \
	fi
	@if [ -d "personas/$*/RAG-RAW-DOCS" ]; then \
		echo "📁 Raw documents: $$(find personas/$*/RAG-RAW-DOCS -type f 2>/dev/null | wc -l | tr -d ' ') files"; \
	else \
		echo "📁 Raw documents: 0 files"; \
	fi
	@echo ""
	@echo "🎯 Next steps:"
	@echo "  - Missing manifest: make generate-manifest-$*"
	@echo "  - Missing formatted: make process-manifest-$*"
	@echo "  - Ready for ingestion: make ingest-$*"

# Clean processing files for a persona
clean-%:
	@echo "🧹 Cleaning processing files for persona: $*"
	@rm -rf personas/$*/formatted/*
	@rm -rf personas/$*/logs/*
	@echo "✅ Cleaned processing files for persona: $*"

# Clean all generated files
clean-all:
	@echo "🧹 Cleaning all generated files..."
	@find personas/*/formatted -name "*.md" -delete 2>/dev/null || true
	@find personas/*/logs -name "*.log" -delete 2>/dev/null || true
	@echo "✅ All generated files cleaned"

# List available personas
list-personas:
	@echo "📋 Available personas:"
	@find personas -maxdepth 1 -type d -not -name personas | sed 's|personas/||' | sort

# Status check for all personas
status:
	@echo "📊 Status Overview:"
	@for persona in $$(find personas -maxdepth 1 -type d -not -name personas | sed 's|personas/||' | sort); do \
		echo ""; \
		echo "=== $$persona ==="; \
		$(MAKE) health-$$persona 2>/dev/null || echo "❌ Error checking $$persona"; \
	done