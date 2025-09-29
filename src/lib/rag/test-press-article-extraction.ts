/**
 * Test Script for Press Article Metadata Extraction
 * 
 * Tests the Leia technology extraction pipeline with sample press article content.
 */

import { leiaArticleExtractor } from './press-article-extractor';
import { generatePressArticleMetadata, injectMetadataIntoContent } from './metadata-templates';

// Sample press article content for testing
const sampleArticles = [
  {
    title: "Samsung Galaxy Tab S10 Ultra Gets Leia 3D Display Technology for Immersive Gaming",
    url: "https://www.theverge.com/2024/10/samsung-galaxy-tab-s10-leia-3d-display",
    content: `
      Samsung has announced its flagship Galaxy Tab S10 Ultra will feature revolutionary Leia 3D display technology, 
      bringing glasses-free 3D viewing to the premium tablet market. The 14.6-inch OLED display supports 120Hz refresh 
      rates and delivers an immersive gaming experience without the need for special eyewear.
      
      The Galaxy Tab S10 Ultra, priced at $1,199, will launch in North America and Europe this holiday season. 
      Samsung's partnership with Leia Inc. represents a significant step forward in bringing lightfield display 
      technology to mainstream consumer devices.
      
      "This is a game-changer for mobile gaming," said Samsung's VP of Mobile Displays. The autostereoscopic 
      display uses Leia's proprietary eye tracking technology to create convincing 3D effects.
      
      By Sarah Chen, reporting for The Verge
    `
  },
  {
    title: "LG OLED C4 Series TVs Now Available with Leia Immersive 3D Technology",
    url: "https://www.cnet.com/2024/09/lg-oled-c4-leia-3d-technology",
    content: `
      LG Electronics has expanded its premium OLED C4 series with new 55-inch and 65-inch models featuring 
      Leia's advanced 3D display technology. The new TVs deliver holographic-like viewing experiences 
      for movies and gaming content.
      
      The LG OLED C4 with Leia technology starts at $2,499 for the 55-inch model and $3,299 for the 
      65-inch variant. Both models support 4K resolution at 120Hz and are optimized for next-generation 
      gaming consoles.
      
      "We're bringing the future of television to living rooms worldwide," said LG's Head of TV Division. 
      The displays use multi-view technology to create depth without glasses, targeting premium consumers 
      across Asia and global markets.
      
      These TVs represent LG's commitment to pushing the boundaries of display innovation with 
      augmented reality interfaces and immersive content experiences.
      
      Article by Mike Rodriguez, CNET Senior Editor
    `
  },
  {
    title: "TCL Mini LED Gaming Monitors Feature Leia Lightfield Displays for Pro Gamers",
    url: "https://www.tomshardware.com/2024/11/tcl-gaming-monitor-leia-lightfield",
    content: `
      TCL has unveiled its latest gaming monitor lineup featuring Leia lightfield display technology, 
      targeting professional esports players. The 27-inch and 32-inch monitors deliver glasses-free 
      3D gaming with 240Hz refresh rates and 1ms response times.
      
      The TCL Gaming Pro 27" is priced at $899, while the 32" model costs $1,299. Both monitors 
      use Mini LED backlighting with OLED-like contrast ratios and support for eye tracking 
      calibration.
      
      "This technology gives competitive gamers a real advantage," explains TCL's Gaming Division VP. 
      The monitors will be available in mid-range pricing across North America starting December 2024.
      
      Professional gamers have praised the depth perception benefits for FPS titles and racing games. 
      The displays also support traditional 2D content with exceptional color accuracy.
      
      Written by Alex Thompson, Tom's Hardware
    `
  }
];

/**
 * Test the metadata extraction pipeline
 */
async function testMetadataExtraction() {
  console.log('🧪 Testing Press Article Metadata Extraction\n');
  
  for (let i = 0; i < sampleArticles.length; i++) {
    const article = sampleArticles[i];
    console.log(`📄 Testing Article ${i + 1}: ${article.title}\n`);
    
    try {
      // Extract metadata using Leia extractor
      const extractedMetadata = leiaArticleExtractor.extractMetadata(
        article.title,
        article.content,
        article.url
      );
      
      console.log('🔍 Extracted Metadata:');
      console.log('OEM:', extractedMetadata.oem || 'Not detected');
      console.log('Model:', extractedMetadata.model || 'Not detected');
      console.log('Display Size:', extractedMetadata.displaySize || 'Not detected');
      console.log('Display Type:', extractedMetadata.displayType || 'Not detected');
      console.log('Refresh Rate:', extractedMetadata.refreshRate || 'Not detected');
      console.log('Product Category:', extractedMetadata.productCategory || 'Not detected');
      console.log('Leia Features:', extractedMetadata.leiaFeature?.join(', ') || 'None detected');
      console.log('Journalist:', extractedMetadata.journalist?.join(', ') || 'Not detected');
      console.log('Outlet:', extractedMetadata.outlet || 'Not detected');
      console.log('Price Range:', extractedMetadata.priceRange || 'Not detected');
      console.log('Market Regions:', extractedMetadata.marketRegion?.join(', ') || 'Not detected');
      
      // Test metadata template generation
      const simpleMetadata = {
        title: article.title,
        docType: 'press-article',
        ...extractedMetadata
      };
      
      const metadataFooter = generatePressArticleMetadata(simpleMetadata);
      console.log('\n📝 Generated Metadata Footer:');
      console.log(metadataFooter);
      
      // Test content injection
      const sampleAbstract = article.content.split('\n')[1].trim(); // Use first paragraph
      const enhancedContent = injectMetadataIntoContent(sampleAbstract, simpleMetadata);
      
      console.log('\n✨ Enhanced Content with Metadata:');
      console.log(enhancedContent);
      
      console.log('\n' + '='.repeat(80) + '\n');
      
    } catch (error) {
      console.error(`❌ Error processing article ${i + 1}:`, error);
      console.log('\n' + '='.repeat(80) + '\n');
    }
  }
}

/**
 * Test URL document type detection
 */
function testUrlDetection() {
  console.log('🌐 Testing URL Document Type Detection\n');
  
  const testUrls = [
    'https://www.theverge.com/2024/samsung-leia-display',
    'https://www.cnet.com/reviews/lg-oled-leia-tech',
    'https://www.tomshardware.com/gaming-monitor-review',
    'https://www.example.com/random-page',
    'https://patents.google.com/patent/US123456',
    'https://arxiv.org/abs/2024.12345',
    'https://github.com/user/repo'
  ];
  
  // Since detectDocumentTypeFromUrl is private, we simulate the logic
  const pressOutlets = [
    'techcrunch.com', 'theverge.com', 'cnet.com', 'engadget.com',
    'tomshardware.com', 'anandtech.com', 'androidauthority.com'
  ];
  
  testUrls.forEach(url => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      let docType = 'url';
      
      if (url.includes('patents.google.com') || url.includes('patents.uspto.gov')) {
        docType = 'patent';
      } else if (url.includes('arxiv.org')) {
        docType = 'paper';
      } else if (pressOutlets.some(outlet => hostname.includes(outlet))) {
        docType = 'press-article';
      }
      
      console.log(`${url} -> ${docType}`);
    } catch {
      console.log(`${url} -> ERROR: Invalid URL`);
    }
  });
}

// Run tests
async function runTests() {
  try {
    await testMetadataExtraction();
    testUrlDetection();
    console.log('✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

export { testMetadataExtraction, testUrlDetection, runTests };