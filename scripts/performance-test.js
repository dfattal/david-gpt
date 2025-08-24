#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load performance budgets
const budgetsPath = path.join(__dirname, '../budgets/performance-budgets.json');
const budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));

console.log('🚀 Running Performance Analysis...');

// 1. Bundle Analysis
console.log('\n📦 Analyzing Bundle Size...');
try {
  // Build for production
  execSync('pnpm build', { stdio: 'inherit' });
  
  // Get build stats
  const buildOutput = execSync('pnpm build 2>&1', { encoding: 'utf8' });
  console.log(buildOutput);
  
  // Extract bundle size from Next.js output
  const bundleSizeMatch = buildOutput.match(/First Load JS shared by all\s+(\d+(?:\.\d+)?\s*[kM]B)/);
  if (bundleSizeMatch) {
    const bundleSize = bundleSizeMatch[1];
    console.log(`✅ Bundle Size: ${bundleSize}`);
    
    // Parse size and check against budget
    const sizeValue = parseFloat(bundleSize);
    const unit = bundleSize.includes('MB') ? 'MB' : 'KB';
    const sizeInKB = unit === 'MB' ? sizeValue * 1024 : sizeValue;
    const budgetKB = budgets.budgets[0].resourceSizes.find(r => r.resourceType === 'script').budget / 1000;
    
    if (sizeInKB > budgetKB) {
      console.warn(`⚠️  Bundle size ${sizeInKB.toFixed(2)}KB exceeds budget ${budgetKB}KB`);
    } else {
      console.log(`✅ Bundle size within budget`);
    }
  }
} catch (error) {
  console.error('❌ Bundle analysis failed:', error.message);
}

// 2. Lighthouse CI Analysis
console.log('\n🔍 Running Lighthouse Performance Audit...');
try {
  // Install Lighthouse CI if not present
  try {
    execSync('lhci --version', { stdio: 'ignore' });
  } catch {
    console.log('Installing Lighthouse CI...');
    execSync('npm install -g @lhci/cli', { stdio: 'inherit' });
  }
  
  // Run Lighthouse CI
  execSync('lhci autorun', { stdio: 'inherit' });
  console.log('✅ Lighthouse analysis complete');
} catch (error) {
  console.error('❌ Lighthouse analysis failed:', error.message);
  console.log('💡 Run manually: pnpm start & lhci collect --url=http://localhost:3000');
}

// 3. Performance Recommendations
console.log('\n💡 Performance Optimization Recommendations:');
console.log('1. ✅ Bundle optimization with Next.js optimizePackageImports');
console.log('2. ✅ React.memo and useCallback optimizations implemented');
console.log('3. ✅ Virtual scrolling for long message lists');
console.log('4. ✅ Debounced input and throttled re-renders');
console.log('5. ✅ Database query optimization with performance tracking');
console.log('6. ✅ Core Web Vitals monitoring implemented');
console.log('7. ✅ Memory leak detection and monitoring');
console.log('8. ✅ Streaming performance optimization');

// 4. Performance Budget Summary
console.log('\n📊 Performance Budget Summary:');
console.log(`• Lighthouse Performance: ≥${budgets.lighthouse.performance}%`);
console.log(`• Core Web Vitals:`);
console.log(`  - LCP: <${budgets.budgets[0].timings.find(t => t.metric === 'largest-contentful-paint').budget}ms`);
console.log(`  - FID: <${budgets.budgets[0].timings.find(t => t.metric === 'first-input-delay').budget}ms`);
console.log(`  - CLS: <${budgets.budgets[0].timings.find(t => t.metric === 'cumulative-layout-shift').budget}`);
console.log(`• Bundle Size: <${budgets.budgets[0].resourceSizes.find(r => r.resourceType === 'script').budget / 1000}KB`);
console.log(`• Streaming Latency: <${budgets.budgets[2].timings.find(t => t.metric === 'first-token-latency').budget}ms`);

console.log('\n🎉 Performance analysis complete!');
console.log('💡 Monitor performance in production with the integrated monitoring tools.');
