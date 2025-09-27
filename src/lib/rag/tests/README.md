# KG-Assisted RAG Quality Testing Suite

A comprehensive testing framework for evaluating the quality and effectiveness of your three-tier RAG system with knowledge graph enhancements.

## Overview

This testing suite provides thorough evaluation of:

- **Three-Tier Retrieval Performance**: SQL, Vector, and Content search tiers
- **Knowledge Graph Quality**: Entity recognition, relationships, and authority scoring
- **Citation Accuracy**: Validation of citations against source documents
- **A/B Testing**: KG-enabled vs disabled performance comparison
- **Performance Benchmarking**: Speed, accuracy, scalability metrics
- **Load Testing**: Concurrent user capacity and system limits

## Quick Start

### Run All Tests
```bash
npm run test:kg-quality
```

### Run Quick Smoke Test
```bash
npm run test:kg-smoke
```

### Get Help
```bash
npm run test:kg-help
```

## Test Components

### 1. Conversation-Based Tests (`kg-rag-quality-test-suite.ts`)

Tests the three-tier RAG system with realistic conversation scenarios:

- **Tier 1 (SQL)**: Direct identifier/date lookups
- **Tier 2 (Vector)**: Metadata semantic searches
- **Tier 3 (Content)**: Technical explanatory queries
- **Multi-turn**: Context management and follow-up questions

**Example Test Conversations:**
```typescript
// Tier 1 - SQL Tests
"Show me arXiv:2003.11172"
"Documents published in 2020"
"Patent US11281020"

// Tier 2 - Vector Tests
"Who invented lightfield displays?"
"Papers by David Fattal"
"Patents by Leia Inc"

// Tier 3 - Content Tests
"How do lightfield displays work?"
"Compare 3D display technologies"
"Explain depth estimation principles"
```

### 2. Knowledge Graph Quality Evaluation (`kg-quality-evaluator.ts`)

Comprehensive KG quality assessment:

- **Entity Recognition**: Precision, recall, F1 score
- **Relationship Quality**: Edge accuracy, graph connectivity
- **Authority Scoring**: Consistency, predictiveness
- **Retrieval Enhancement**: Query expansion effectiveness

**Key Metrics:**
- Entity Recognition F1 Score: Target >80%
- Relationship Coverage: Target >70%
- Authority Consistency: Target >75%
- Overall KG Score: Target >75/100

### 3. Citation Accuracy Validation (`citation-accuracy-validator.ts`)

Validates citation quality and accuracy:

- **Content Match**: Citation-source alignment
- **Formatting**: Standard citation format compliance
- **Linkage**: Source verification and accessibility
- **Completeness**: Required metadata presence

**Validation Criteria:**
- Minimum accuracy: 85%
- Required fields: Author, title, year, source
- Format compliance: [1], [2] style
- Source accessibility verification

### 4. KG Toggle Controller (`kg-toggle-controller.ts`)

A/B testing framework for measuring KG effectiveness:

- **Feature Toggle**: Selective KG feature enabling/disabling
- **Comparison Testing**: KG-enabled vs disabled results
- **Statistical Analysis**: Significance testing and recommendations

**Features Tested:**
- Entity recognition
- Query expansion
- Authority boosting
- Relationship traversal
- Disambiguation

### 5. Performance Benchmarking (`performance-benchmark-suite.ts`)

System performance and scalability testing:

- **Tier Performance**: Response times by search tier
- **Scalability**: Concurrent user capacity
- **Resource Utilization**: CPU, memory, database load
- **Cost Analysis**: API usage and expenses

**Performance Targets:**
- Tier 1 (SQL): <200ms average
- Tier 2 (Vector): <800ms average
- Tier 3 (Content): <1500ms average
- Concurrent users: >20 users
- Classification accuracy: >90%

## Usage Examples

### Custom Test Configuration

```bash
# Test specific persona
npm run test:kg-quality -- --persona=financial

# Include only specific test types
npm run test:kg-quality -- --include=kg-quality,citations

# Exclude performance-intensive tests
npm run test:kg-quality -- --exclude=load-tests,performance

# Save results to file
npm run test:kg-quality -- --output=results.json
```

### Programmatic Usage

```typescript
import { supabaseAdmin } from '@/lib/supabase';
import { runAllQualityTests, runQuickSmokeTest } from './comprehensive-test-runner';

// Run complete test suite
const fullResults = await runAllQualityTests(supabaseAdmin, 'david');

// Run quick smoke test
const smokeResults = await runQuickSmokeTest(supabaseAdmin, 'david');

// Custom configuration
const customConfig = {
  testName: 'Production Readiness Test',
  personaId: 'david',
  includeLoadTests: true,
  testQueries: ['Custom query 1', 'Custom query 2']
};

const customResults = await runCustomQualityTests(supabaseAdmin, customConfig);
```

## Test Output

### Comprehensive Report
```
🧪 COMPREHENSIVE KG-RAG QUALITY TEST REPORT
========================================
Test Run ID: test_run_1234567890_abc123
Persona: david
Overall Quality Score: 85.2/100

📊 TIER PERFORMANCE:
  Tier 1 (SQL): 142ms avg, 95% success rate
  Tier 2 (Vector): 687ms avg, 88% success rate
  Tier 3 (Content): 1247ms avg, 82% success rate

🧠 KNOWLEDGE GRAPH QUALITY:
  Entity Recognition F1: 87.3%
  Relationship Quality: 79.1%
  Authority Consistency: 83.5%

📚 CITATION ACCURACY: 91.7%

⚖️ A/B TEST RESULTS: 5/6 queries recommend using KG

🚀 PERFORMANCE: Max 25 concurrent users, 8.3 QPS

💡 RECOMMENDATIONS:
  1. ⚠️ [HIGH] Optimize content search tier response time
  2. 📝 [MEDIUM] Improve entity recognition precision
```

### Quality Grades
- **A Grade**: 90-100 points - Production ready
- **B Grade**: 80-89 points - Minor optimizations needed
- **C Grade**: 70-79 points - Moderate improvements required
- **D Grade**: 60-69 points - Significant issues to address
- **F Grade**: <60 points - Major overhaul needed

## Environment Setup

Required environment variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
COHERE_API_KEY=your_cohere_key
```

## Interpreting Results

### Red Flags 🚨
- Overall score <70/100
- Citation accuracy <85%
- Any tier response time >2x target
- Critical recommendations present
- A/B tests favor disabling KG

### Green Lights ✅
- Overall score >80/100
- Citation accuracy >90%
- All tiers meet performance targets
- KG shows consistent improvements
- Ready for production: `true`

### Optimization Priorities

1. **Critical Issues**: Address immediately
   - Failed citation validation
   - Severe performance bottlenecks
   - KG consistently degrading results

2. **High Priority**: Address before production
   - Response times exceeding targets
   - Classification accuracy <90%
   - Resource utilization concerns

3. **Medium Priority**: Optimize over time
   - Entity recognition improvements
   - Query expansion refinements
   - Cost optimization

## Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Verify environment variables
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Test connection
npm run validate:all
```

**Timeout Errors**
```bash
# Run lighter smoke test
npm run test:kg-smoke

# Exclude intensive tests
npm run test:kg-quality -- --exclude=load-tests
```

**Memory Issues**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=8192" npm run test:kg-quality
```

### Performance Debugging

Enable verbose logging for detailed insights:
```typescript
// In test configuration
const config = {
  verbose: true,
  // ... other options
};
```

Monitor system resources during testing:
```bash
# Monitor CPU/memory
top -p $(pgrep node)

# Monitor database connections
# (Check Supabase dashboard)
```

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Include both positive and negative test cases
3. Add appropriate timeout handling
4. Document expected outcomes
5. Update this README with new test descriptions

### Test Categories

- **Functional Tests**: Core feature validation
- **Performance Tests**: Speed and scalability
- **Quality Tests**: Accuracy and relevance
- **Integration Tests**: Component interaction
- **Regression Tests**: Prevent quality degradation

## Automation

Integrate with CI/CD:

```yaml
# GitHub Actions example
- name: Run KG Quality Tests
  run: |
    npm run test:kg-smoke
    if [ $? -eq 0 ]; then
      echo "Smoke tests passed"
    else
      echo "Smoke tests failed"
      exit 1
    fi
```

Schedule regular quality assessments:
```bash
# Cron job for daily quality checks
0 2 * * * cd /path/to/project && npm run test:kg-smoke >> /var/log/kg-quality.log 2>&1
```

---

For detailed API documentation, see individual test file headers. For issues or questions, check the project's main documentation or create an issue in the repository.